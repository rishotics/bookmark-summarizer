import asyncio
from datetime import date

from telegram import Bot


def send_telegram(message: str, bot_token: str, chat_id: str) -> None:
    asyncio.run(_send(bot_token, chat_id, message))


async def _send(bot_token: str, chat_id: str, message: str) -> None:
    bot = Bot(token=bot_token)

    # Telegram has a 4096 char limit per message
    if len(message) <= 4096:
        await bot.send_message(chat_id=chat_id, text=message, parse_mode="Markdown")
    else:
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
            await bot.send_message(chat_id=chat_id, text=chunk, parse_mode="Markdown")


def format_digest(digest: dict, total_new: int, related: dict | None = None) -> str:
    total_important = sum(len(g["bookmarks"]) for g in digest["groups"])
    today = date.today().strftime("%B %d, %Y")

    msg = f"📚 *Daily Bookmark Digest* — {today}\n"
    msg += f"{total_new} new bookmarks, {total_important} worth reading.\n"

    for group in digest["groups"]:
        theme = _esc(group["theme"])
        msg += f"\n📌 *{theme}*\n"
        for b in group["bookmarks"]:
            summary = _esc(b["summary"])
            author = _esc(b.get("author", "@unknown"))
            msg += f"• {author}: {summary}\n  → {b['url']}\n"

    if related:
        msg += "\n🔮 *From Your Past Bookmarks*\n"
        author = _esc(related.get("author", "@unknown"))
        summary = _esc(related.get("summary", ""))
        reason = _esc(related.get("reason", ""))
        msg += f"• {author}: {summary}\n"
        if reason:
            msg += f"  _{reason}_\n"
        msg += f"  → {related.get('url', '')}\n"

    return msg


def _esc(text: str) -> str:
    """Escape Telegram Markdown v1 special chars."""
    return text.replace("_", "\\_").replace("*", "\\*").replace("`", "\\`").replace("[", "\\[")
