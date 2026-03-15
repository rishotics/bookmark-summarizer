import asyncio
from datetime import date
from pathlib import Path

from jinja2 import Template
from telegram import Bot


TEMPLATE_PATH = Path(__file__).parent / "templates" / "digest.md"


def send_telegram(digest: dict, total_new: int, bot_token: str, chat_id: str) -> None:
    template = Template(TEMPLATE_PATH.read_text())

    total_important = sum(len(g["bookmarks"]) for g in digest["groups"])

    message = template.render(
        date=date.today().strftime("%B %d, %Y"),
        total_new=total_new,
        total_important=total_important,
        groups=digest["groups"],
    )

    asyncio.run(_send(bot_token, chat_id, message))


async def _send(bot_token: str, chat_id: str, message: str) -> None:
    bot = Bot(token=bot_token)

    # Telegram has a 4096 char limit per message
    if len(message) <= 4096:
        await bot.send_message(
            chat_id=chat_id, text=message, parse_mode="Markdown"
        )
    else:
        # Split into chunks at line boundaries
        chunks = []
        current = ""
        for line in message.split("\n"):
            if len(current) + len(line) + 1 > 4000:
                chunks.append(current)
                current = line
            else:
                current += "\n" + line if current else line
        if current:
            chunks.append(current)

        for chunk in chunks:
            await bot.send_message(
                chat_id=chat_id, text=chunk, parse_mode="Markdown"
            )
