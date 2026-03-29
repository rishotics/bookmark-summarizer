import json
from pathlib import Path

from .config import load_config
from .deliver import format_digest, send_telegram
from .mongo_store import (
    find_related_past_candidates,
    get_collection,
    get_unprocessed_last_24h,
    mark_processed,
    store_summaries,
    upsert_bookmarks,
)
from .summarize import pick_related_bookmark, summarize


def run():
    config = load_config()
    col = get_collection(config.mongodb_uri)

    # 1. If local JSON exists, upsert into MongoDB (local dev mode)
    bookmarks_path = config.bookmarks_path
    if bookmarks_path and bookmarks_path.exists():
        with open(bookmarks_path) as f:
            raw_bookmarks = json.load(f)
        print(f"Read {len(raw_bookmarks)} bookmarks from {bookmarks_path}")
        new_count = upsert_bookmarks(col, raw_bookmarks)
        print(f"Upserted into MongoDB: {new_count} new, {len(raw_bookmarks) - new_count} existing")
    else:
        print("No local JSON file — reading directly from MongoDB (EC2 mode)")

    # 3. Get unprocessed bookmarks from last 24 hours
    recent = get_unprocessed_last_24h(col)
    if not recent:
        print("No new bookmarks from the last 24 hours to process.")
        return

    print(f"Processing {len(recent)} bookmarks from the last 24 hours...")

    # 4. Summarize with Claude
    digest = summarize(recent, config.anthropic_api_key)

    # 5. Store summaries in MongoDB
    all_summaries = []
    for group in digest["groups"]:
        for b in group["bookmarks"]:
            all_summaries.append({
                "tweet_id": b["tweet_id"],
                "summary": b["summary"],
                "themes": b.get("themes", [group["theme"]]),
                "importance": b.get("importance", 0),
            })

    store_summaries(col, all_summaries)

    # Mark low-scoring bookmarks as processed too
    digest_ids = {s["tweet_id"] for s in all_summaries}
    low_score_ids = [b["tweet_id"] for b in recent if b["tweet_id"] not in digest_ids]
    mark_processed(col, low_score_ids)

    total_important = sum(len(g["bookmarks"]) for g in digest["groups"])
    if total_important == 0:
        print("No bookmarks scored high enough for the digest.")
        return

    print(f"Digest ready: {total_important} important bookmarks across {len(digest['groups'])} themes")

    # 6. Find 1 related past bookmark
    all_themes = []
    for s in all_summaries:
        all_themes.extend(s.get("themes", []))
    all_themes = list(set(all_themes))

    current_ids = [b["tweet_id"] for b in recent]
    candidates = find_related_past_candidates(col, all_themes, current_ids)

    related = None
    if candidates:
        related = pick_related_bookmark(all_summaries, candidates, config.anthropic_api_key)
        if related:
            print(f"Related past bookmark: {related.get('url', 'N/A')}")

    # 7. Format and send to Telegram
    message = format_digest(digest, len(recent), related)
    send_telegram(message, config.telegram_bot_token, config.telegram_chat_id)

    print("Digest sent to Telegram!")


if __name__ == "__main__":
    run()
