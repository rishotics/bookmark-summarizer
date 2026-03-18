# Bookmark Summarizer

Chrome extension that captures X/Twitter bookmarks and sends daily AI-powered digests via Telegram.

## Architecture

```
User leaves x.com/i/bookmarks tab pinned in Arc
  → Extension intercepts GraphQL responses (XHR monkey-patching via MAIN world content script)
  → Stores bookmarks in chrome.storage.local
  → Auto-exports to ~/Downloads/bookmark-summarizer/bookmarks_raw.json
  → Every 6 hours: auto-refreshes bookmarks tab to capture new ones
  → Daily at 6 AM IST: Python cron runs the digest pipeline
    → Reads exported JSON, upserts ALL bookmarks into MongoDB
    → Filters to last 24 hours, unprocessed only
    → Calls Claude API (Sonnet) to rank, filter, group, and summarize
    → Stores summaries in MongoDB for search
    → Finds 1 related past bookmark from MongoDB
    → Sends formatted Markdown digest to Telegram Bot
```

## Key Files

- `extension/intercept.js` — Runs in MAIN world, monkey-patches `fetch` and `XMLHttpRequest` to intercept X's GraphQL bookmark responses
- `extension/content.js` — Runs in extension world, receives intercepted data via `postMessage`, extracts tweet data, relays to background
- `extension/background.js` — Service worker: stores bookmarks, auto-exports to JSON, manages alarms for tab refresh
- `extension/popup.html/js` — UI: shows bookmark count, Export Now button
- `summarizer/main.py` — Pipeline orchestrator: read JSON → MongoDB → summarize → find related → Telegram
- `summarizer/mongo_store.py` — MongoDB operations: upsert, query last 24h, text search for related past bookmarks
- `summarizer/summarize.py` — Claude API calls for summarization and related bookmark selection
- `summarizer/deliver.py` — Telegram delivery with Markdown formatting

## Configuration

Extension popup: no config needed (capture only).

Python `.env` file:
- `ANTHROPIC_API_KEY` — Claude API key
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `TELEGRAM_CHAT_ID` — Your personal Telegram chat ID
- `MONGODB_URI` — MongoDB Atlas connection string
- `BOOKMARKS_PATH` — Path to exported bookmarks JSON

## MongoDB Schema

Database: `bookmark_summarizer`, Collection: `bookmarks`

Fields: `tweet_id` (unique), `author`, `author_handle`, `text`, `url`, `created_at`, `likes`, `retweets`, `media_urls`, `bookmarked_at`, `summary`, `themes`, `importance`, `processed`, `processed_at`

Indexes: unique on `tweet_id`, text index on `summary + text + themes`

## Development

Extension: `chrome://extensions` → Developer mode → Load unpacked → select `extension/` folder.

Python: `pip install -r requirements.txt` then `python3 -m summarizer` to test.

Cron: `bash scripts/install_cron.sh` to set up 6 AM IST daily digest.

## Sensitive Files

- `.env` — local secrets (gitignored)
- `data/` — logs (gitignored)
- API keys in extension storage are not committed
