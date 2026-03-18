import json

import anthropic


SYSTEM_PROMPT = """You are a bookmark curator. Given a list of Twitter/X bookmarks:
1. Rate each bookmark's importance (1-5) based on information density, uniqueness, and actionability.
2. Filter out low-value bookmarks (score < 3).
3. For each remaining bookmark, write a 1-2 sentence summary capturing the key insight.
4. Assign 1-3 topic themes to each bookmark.
5. Group them by topic/theme.

Respond ONLY with a raw JSON object (no markdown, no code fences, no extra text):
{"groups":[{"theme":"Theme Name","bookmarks":[{"tweet_id":"...","author":"@handle","summary":"...","importance":4,"themes":["theme1","theme2"],"url":"..."}]}]}"""


RELATED_PROMPT = """Given these new bookmark summaries and a list of past bookmarks, pick the single most interesting past bookmark that relates to today's themes. Explain briefly why it's relevant.

Respond ONLY with a raw JSON object:
{"tweet_id":"...","author":"@handle","summary":"...","reason":"Why this is relevant to today's bookmarks","url":"..."}

If none are relevant, respond with: {"tweet_id":null}"""


def summarize(bookmarks: list[dict], api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)

    bookmark_data = [
        {
            "tweet_id": b["tweet_id"],
            "author": f"@{b.get('author_handle', 'unknown')}",
            "text": b.get("text", ""),
            "url": b.get("url", ""),
            "likes": b.get("likes", 0),
            "retweets": b.get("retweets", 0),
        }
        for b in bookmarks
    ]

    all_groups = []
    for i in range(0, len(bookmark_data), 50):
        chunk = bookmark_data[i : i + 50]

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Analyze these bookmarks and respond with ONLY valid JSON:\n\n{json.dumps(chunk)}",
                }
            ],
        )

        text = response.content[0].text.strip()
        json_str = _extract_json(text)
        parsed = json.loads(json_str)
        all_groups.extend(parsed.get("groups", []))

    # Merge groups with same theme
    merged = {}
    for group in all_groups:
        theme = group["theme"]
        if theme not in merged:
            merged[theme] = {"theme": theme, "bookmarks": []}
        merged[theme]["bookmarks"].extend(group["bookmarks"])

    return {"groups": list(merged.values())}


def pick_related_bookmark(
    new_summaries: list[dict],
    past_candidates: list[dict],
    api_key: str,
) -> dict | None:
    """Ask Claude to pick the best related past bookmark."""
    if not past_candidates:
        return None

    client = anthropic.Anthropic(api_key=api_key)

    new_text = json.dumps([
        {"author": s.get("author", ""), "summary": s.get("summary", ""), "themes": s.get("themes", [])}
        for s in new_summaries
    ])

    past_text = json.dumps([
        {
            "tweet_id": p["tweet_id"],
            "author": f"@{p.get('author_handle', 'unknown')}",
            "summary": p.get("summary", ""),
            "url": p.get("url", ""),
        }
        for p in past_candidates
    ])

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=RELATED_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Today's bookmarks:\n{new_text}\n\nPast bookmarks to choose from:\n{past_text}",
            }
        ],
    )

    text = response.content[0].text.strip()
    json_str = _extract_json(text)
    result = json.loads(json_str)

    if not result.get("tweet_id"):
        return None
    return result


def _extract_json(text: str) -> str:
    """Extract JSON from Claude's response, handling code fences."""
    fence_match = __import__("re").search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence_match:
        return fence_match.group(1).strip()
    if not text.startswith("{"):
        brace_match = __import__("re").search(r"\{[\s\S]*\}", text)
        if brace_match:
            return brace_match.group(0)
    return text
