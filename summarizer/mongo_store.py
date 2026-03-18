from datetime import datetime, timezone, timedelta

import certifi

from pymongo import MongoClient, UpdateOne


DB_NAME = "bookmark_summarizer"
COLLECTION = "bookmarks"


def get_collection(mongodb_uri: str):
    client = MongoClient(mongodb_uri, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    col = db[COLLECTION]

    # Ensure indexes
    col.create_index("tweet_id", unique=True)
    col.create_index([("summary", "text"), ("text", "text"), ("themes", "text")])

    return col


def upsert_bookmarks(col, bookmarks: list[dict]) -> int:
    """Upsert raw bookmarks into MongoDB. Returns count of new inserts."""
    if not bookmarks:
        return 0

    ops = []
    for b in bookmarks:
        ops.append(
            UpdateOne(
                {"tweet_id": b["tweet_id"]},
                {"$setOnInsert": {
                    "tweet_id": b["tweet_id"],
                    "author": b.get("author", ""),
                    "author_handle": b.get("author_handle", ""),
                    "text": b.get("text", ""),
                    "url": b.get("url", ""),
                    "created_at": b.get("created_at", ""),
                    "likes": b.get("likes", 0),
                    "retweets": b.get("retweets", 0),
                    "media_urls": b.get("media_urls", []),
                    "bookmarked_at": b.get("bookmarked_at", ""),
                    "processed": False,
                    "summary": None,
                    "themes": [],
                    "importance": None,
                    "inserted_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
        )

    result = col.bulk_write(ops)
    return result.upserted_count


def get_unprocessed_last_24h(col) -> list[dict]:
    """Get bookmarks from the last 24 hours that haven't been processed."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    return list(col.find({
        "processed": False,
        "bookmarked_at": {"$gte": cutoff},
    }))


def store_summaries(col, summaries: list[dict]) -> None:
    """Update bookmarks with their AI-generated summaries."""
    ops = []
    for s in summaries:
        ops.append(
            UpdateOne(
                {"tweet_id": s["tweet_id"]},
                {"$set": {
                    "summary": s["summary"],
                    "themes": s.get("themes", []),
                    "importance": s.get("importance", 0),
                    "processed": True,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
        )
    if ops:
        col.bulk_write(ops)


def mark_processed(col, tweet_ids: list[str]) -> None:
    """Mark bookmarks as processed even if they scored too low for the digest."""
    if tweet_ids:
        col.update_many(
            {"tweet_id": {"$in": tweet_ids}},
            {"$set": {
                "processed": True,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )


def find_related_past_candidates(col, themes: list[str], exclude_ids: list[str]) -> list[dict]:
    """Find up to 10 past bookmarks related to the given themes for Claude to pick from."""
    if not themes:
        return []

    # Text search across summary, text, and themes
    query = " ".join(themes[:5])
    try:
        results = list(col.find(
            {
                "$text": {"$search": query},
                "tweet_id": {"$nin": exclude_ids},
                "processed": True,
                "summary": {"$ne": None},
            },
            {"score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(10))
    except Exception:
        # Fallback: simple theme match if text search fails
        results = list(col.find({
            "themes": {"$in": themes[:5]},
            "tweet_id": {"$nin": exclude_ids},
            "processed": True,
            "summary": {"$ne": None},
        }).sort("importance", -1).limit(10))

    return results
