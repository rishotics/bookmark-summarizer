# Bookmark Summarizer

Chrome extension that captures X/Twitter bookmarks and sends daily AI-powered digests via Telegram.

## Architecture

Everything runs inside the Chrome extension — no backend server needed.

```
User leaves x.com/i/bookmarks tab open
  → Extension intercepts GraphQL responses (XHR monkey-patching via MAIN world content script)
  → Stores bookmarks in chrome.storage.local
  → Every 6 hours: auto-refreshes bookmarks tab to capture new ones
  → Every 24 hours: sends digest to Telegram
    → Filters to last 48 hours, unprocessed only
    → Calls Claude API (Sonnet) to rank, filter, group, and summarize
    → Sends formatted Markdown to Telegram Bot
```

## Key Files

- `extension/intercept.js` — Runs in MAIN world, monkey-patches `fetch` and `XMLHttpRequest` to intercept X's GraphQL bookmark responses
- `extension/content.js` — Runs in extension world, receives intercepted data via `postMessage`, extracts tweet data, relays to background
- `extension/background.js` — Service worker: stores bookmarks, runs digest pipeline (Claude API → Telegram), manages alarms for auto-refresh and daily digest
- `extension/popup.html/js` — UI: shows bookmark count, Send Digest Now button, settings for API keys

## Configuration

API keys are stored in `chrome.storage.local` via the extension popup Settings panel:
- Anthropic API Key
- Telegram Bot Token
- Telegram Chat ID

## Development

Load as unpacked extension: `chrome://extensions` → Developer mode → Load unpacked → select `extension/` folder.

The `summarizer/` directory contains an optional Python backend (not needed for normal operation — the extension handles everything).

## Sensitive Files

- `.env` — local secrets (gitignored)
- `data/` — bookmark data and state (gitignored)
- API keys in extension storage are not committed
