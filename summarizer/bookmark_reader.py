import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Bookmark:
    tweet_id: str
    author: str
    author_handle: str
    text: str
    url: str
    created_at: str
    likes: int
    retweets: int
    media_urls: list[str]


def read_bookmarks(path: Path) -> list[Bookmark]:
    if not path.exists():
        return []

    with open(path) as f:
        raw = json.load(f)

    bookmarks = []
    for item in raw:
        bookmarks.append(
            Bookmark(
                tweet_id=item["tweet_id"],
                author=item.get("author", ""),
                author_handle=item.get("author_handle", ""),
                text=item.get("text", ""),
                url=item.get("url", ""),
                created_at=item.get("created_at", ""),
                likes=item.get("likes", 0),
                retweets=item.get("retweets", 0),
                media_urls=item.get("media_urls", []),
            )
        )

    return bookmarks
