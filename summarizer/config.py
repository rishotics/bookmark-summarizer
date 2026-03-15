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
    bookmarks_path: Path
    state_path: Path


def load_config() -> Config:
    return Config(
        anthropic_api_key=os.environ["ANTHROPIC_API_KEY"],
        telegram_bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
        telegram_chat_id=os.environ["TELEGRAM_CHAT_ID"],
        bookmarks_path=Path(os.getenv("BOOKMARKS_PATH", "./data/bookmarks_raw.json")),
        state_path=Path(os.getenv("STATE_PATH", "./data/state.json")),
    )
