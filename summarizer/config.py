import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    anthropic_api_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    mongodb_uri: str
    bookmarks_path: Path


def load_config() -> Config:
    return Config(
        anthropic_api_key=os.environ["ANTHROPIC_API_KEY"],
        telegram_bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
        telegram_chat_id=os.environ["TELEGRAM_CHAT_ID"],
        mongodb_uri=os.environ["MONGODB_URI"],
        bookmarks_path=Path(os.getenv("BOOKMARKS_PATH", "~/Downloads/bookmark-summarizer/bookmarks_raw.json")).expanduser(),
    )
