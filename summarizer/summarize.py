import json

import anthropic

from .bookmark_reader import Bookmark

SYSTEM_PROMPT = """You are a bookmark curator. Given a list of Twitter/X bookmarks, do the following:
1. Rate each bookmark's importance (1-5) based on information density, uniqueness, and actionability.
2. Filter out low-value bookmarks (score < 3).
3. For each remaining bookmark, write a 1-2 sentence summary capturing the key insight.
4. Group them by topic/theme.

Respond ONLY with valid JSON in this format:
{
  "groups": [
    {
      "theme": "Theme Name",
      "bookmarks": [
        {
          "tweet_id": "...",
          "author": "@handle",
          "summary": "1-2 sentence summary",
          "importance": 4,
          "url": "..."
        }
      ]
    }
  ]
}"""


def summarize(bookmarks: list[Bookmark], api_key: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)

    bookmark_data = [
        {
            "tweet_id": b.tweet_id,
            "author": f"@{b.author_handle}",
            "text": b.text,
            "url": b.url,
            "likes": b.likes,
            "retweets": b.retweets,
        }
        for b in bookmarks
    ]

    # Batch into chunks of 50 to stay within token limits
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
                    "content": f"Here are the bookmarks to analyze:\n\n{json.dumps(chunk, indent=2)}",
                }
            ],
        )

        text = response.content[0].text
        parsed = json.loads(text)
        all_groups.extend(parsed.get("groups", []))

    # Merge groups with the same theme
    merged = {}
    for group in all_groups:
        theme = group["theme"]
        if theme not in merged:
            merged[theme] = {"theme": theme, "bookmarks": []}
        merged[theme]["bookmarks"].extend(group["bookmarks"])

    return {"groups": list(merged.values())}
