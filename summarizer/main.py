from .bookmark_reader import read_bookmarks
from .config import load_config
from .dedup import filter_new, mark_processed
from .deliver import send_telegram
from .summarize import summarize


def run():
    config = load_config()

    bookmarks = read_bookmarks(config.bookmarks_path)
    if not bookmarks:
        print("No bookmarks file found. Export from the Chrome extension first.")
        return

    new_bookmarks = filter_new(bookmarks, config.state_path)
    if not new_bookmarks:
        print("No new bookmarks to process.")
        return

    print(f"Processing {len(new_bookmarks)} new bookmarks...")

    digest = summarize(new_bookmarks, config.anthropic_api_key)

    total_important = sum(len(g["bookmarks"]) for g in digest["groups"])
    if total_important == 0:
        print("No bookmarks scored high enough to include in digest.")
        mark_processed(new_bookmarks, config.state_path)
        return

    send_telegram(
        digest=digest,
        total_new=len(new_bookmarks),
        bot_token=config.telegram_bot_token,
        chat_id=config.telegram_chat_id,
    )

    mark_processed(new_bookmarks, config.state_path)
    print(f"Digest sent! {total_important} bookmarks across {len(digest['groups'])} themes.")


if __name__ == "__main__":
    run()
