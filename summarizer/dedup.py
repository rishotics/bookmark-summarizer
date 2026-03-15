import json
from datetime import datetime, timezone
from pathlib import Path

from .bookmark_reader import Bookmark


def load_state(state_path: Path) -> dict:
    if not state_path.exists():
        return {"processed_ids": [], "last_run": None}
    with open(state_path) as f:
        return json.load(f)


def filter_new(bookmarks: list[Bookmark], state_path: Path) -> list[Bookmark]:
    state = load_state(state_path)
    seen = set(state["processed_ids"])
    return [b for b in bookmarks if b.tweet_id not in seen]


def mark_processed(bookmarks: list[Bookmark], state_path: Path) -> None:
    state = load_state(state_path)
    existing = set(state["processed_ids"])
    for b in bookmarks:
        existing.add(b.tweet_id)
    state["processed_ids"] = list(existing)
    state["last_run"] = datetime.now(timezone.utc).isoformat()

    state_path.parent.mkdir(parents=True, exist_ok=True)
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)
