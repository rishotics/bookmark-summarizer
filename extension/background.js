// Service worker: captures bookmarks, summarizes via Claude, sends to Telegram.
// Everything runs inside the extension — no external backend needed.

// --- Keep-alive for long operations ---
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  // Ping storage every 20s to prevent service worker from being killed
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.get("keepAlive");
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// --- Config ---

async function getConfig() {
  const result = await chrome.storage.local.get("config");
  return result.config || {};
}

// --- Bookmark Storage ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "BOOKMARKS_CAPTURED") {
    storeBookmarks(message.bookmarks);
    sendResponse({ status: "ok" });
  }

  if (message.type === "GET_BOOKMARKS") {
    chrome.storage.local.get("bookmarks", (result) => {
      sendResponse({ bookmarks: result.bookmarks || {} });
    });
    return true;
  }

  if (message.type === "GET_STATE") {
    chrome.storage.local.get(["config", "lastDigest", "processedIds"], (result) => {
      sendResponse({
        config: result.config || {},
        lastDigest: result.lastDigest || null,
        processedIds: result.processedIds || [],
      });
    });
    return true;
  }

  if (message.type === "SAVE_CONFIG") {
    chrome.storage.local.set({ config: message.config }, () => {
      sendResponse({ status: "saved" });
    });
    return true;
  }

  if (message.type === "CLEAR_BOOKMARKS") {
    chrome.storage.local.set({ bookmarks: {} }, () => {
      sendResponse({ status: "cleared" });
    });
    return true;
  }

  if (message.type === "SEND_DIGEST_NOW") {
    runDigestPipeline()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ status: "error", message: err.message }));
    return true;
  }
});

async function storeBookmarks(newBookmarks) {
  const result = await chrome.storage.local.get("bookmarks");
  const existing = result.bookmarks || {};

  let addedCount = 0;
  for (const bookmark of newBookmarks) {
    if (!existing[bookmark.tweet_id]) {
      existing[bookmark.tweet_id] = bookmark;
      addedCount++;
    }
  }

  await chrome.storage.local.set({ bookmarks: existing });

  if (addedCount > 0) {
    const total = Object.keys(existing).length;
    chrome.action.setBadgeText({ text: String(total) });
    chrome.action.setBadgeBackgroundColor({ color: "#1D9BF0" });
  }
}

// --- Alarms ---

// Set up alarms on install and on Chrome startup
chrome.runtime.onInstalled.addListener(setupAlarms);
chrome.runtime.onStartup.addListener(setupAlarms);

function setupAlarms() {
  chrome.alarms.create("dailyDigest", {
    periodInMinutes: 24 * 60,
    delayInMinutes: 1,
  });

  // Auto-refresh bookmarks tab every 24 hours to capture new bookmarks
  chrome.alarms.create("refreshBookmarks", {
    periodInMinutes: 24 * 60,
    delayInMinutes: 5,
  });

  console.log("XBS: Alarms set up — digest every 24h, refresh every 24h");
}

// Also set them up immediately in case service worker restarts
setupAlarms();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log(`XBS: Alarm fired: ${alarm.name}`);
  if (alarm.name === "dailyDigest") {
    // Refresh bookmarks tab first, wait for it to load, then send digest
    const refreshed = await refreshBookmarksTab();
    if (refreshed) {
      // Wait 30 seconds for the page to load and bookmarks to be captured
      console.log("XBS: Waiting 30s for bookmarks to load after refresh...");
      await new Promise((r) => setTimeout(r, 30000));
    }
    runDigestPipeline();
  }
  if (alarm.name === "refreshBookmarks") {
    refreshBookmarksTab();
  }
});

async function refreshBookmarksTab() {
  const tabs = await chrome.tabs.query({ url: "*://x.com/i/bookmarks*" });
  if (tabs.length > 0) {
    console.log(`XBS: Auto-refreshing bookmarks tab (pinned: ${tabs[0].pinned})`);
    chrome.tabs.reload(tabs[0].id);
    return true;
  } else {
    console.log("XBS: No bookmarks tab open to refresh");
    return false;
  }
}

// --- Digest Pipeline ---

async function runDigestPipeline() {
  startKeepAlive();

  try {
    const config = await getConfig();
    if (!config.anthropic_api_key || !config.telegram_bot_token || !config.telegram_chat_id) {
      console.log("XBS: Missing config. Open extension popup to set API keys.");
      return { status: "error", message: "Missing API keys. Open extension popup to configure." };
    }

    const bResult = await chrome.storage.local.get(["bookmarks", "processedIds"]);
    const allBookmarks = Object.values(bResult.bookmarks || {});
    const processedIds = new Set(bResult.processedIds || []);

    // Only include bookmarks captured in the last 48 hours
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const newBookmarks = allBookmarks.filter(
      (b) => !processedIds.has(b.tweet_id) && new Date(b.bookmarked_at).getTime() > cutoff
    );

    if (newBookmarks.length === 0) {
      console.log("XBS: No new bookmarks to process.");
      return { status: "ok", message: "No new bookmarks to process." };
    }

    console.log(`XBS: Processing ${newBookmarks.length} new bookmarks...`);

    // Summarize via Claude
    const digest = await summarizeWithClaude(newBookmarks, config.anthropic_api_key);

    const totalImportant = digest.groups.reduce((sum, g) => sum + g.bookmarks.length, 0);
    if (totalImportant === 0) {
      console.log("XBS: No high-value bookmarks found.");
      const allProcessed = [...processedIds, ...newBookmarks.map((b) => b.tweet_id)];
      await chrome.storage.local.set({ processedIds: allProcessed });
      return { status: "ok", message: "No bookmarks scored high enough for digest." };
    }

    // Format and send to Telegram
    const message = formatDigest(digest, newBookmarks.length);
    await sendToTelegram(message, config.telegram_bot_token, config.telegram_chat_id);

    // Mark as processed
    const allProcessed = [...processedIds, ...newBookmarks.map((b) => b.tweet_id)];
    await chrome.storage.local.set({
      processedIds: allProcessed,
      lastDigest: new Date().toISOString(),
    });

    console.log("XBS: Digest sent successfully!");
    return { status: "ok", message: `Digest sent! ${totalImportant} important bookmarks from ${newBookmarks.length} total.` };
  } catch (err) {
    console.error("XBS: Pipeline error:", err);
    return { status: "error", message: err.message };
  } finally {
    stopKeepAlive();
  }
}

// --- Claude API ---

async function summarizeWithClaude(bookmarks, apiKey) {
  const bookmarkData = bookmarks.map((b) => ({
    tweet_id: b.tweet_id,
    author: `@${b.author_handle}`,
    text: b.text,
    url: b.url,
    likes: b.likes,
    retweets: b.retweets,
  }));

  const systemPrompt = `You are a bookmark curator. Given a list of Twitter/X bookmarks:
1. Rate each bookmark's importance (1-5) based on information density, uniqueness, and actionability.
2. Filter out low-value bookmarks (score < 3).
3. For each remaining bookmark, write a 1-2 sentence summary capturing the key insight.
4. Group them by topic/theme.

Respond ONLY with a raw JSON object (no markdown, no code fences, no extra text):
{"groups":[{"theme":"Theme Name","bookmarks":[{"tweet_id":"...","author":"@handle","summary":"...","importance":4,"url":"..."}]}]}`;

  // Process in batches of 50
  const allGroups = [];
  for (let i = 0; i < bookmarkData.length; i += 50) {
    const chunk = bookmarkData.slice(i, i + 50);
    console.log(`XBS: Sending batch ${Math.floor(i / 50) + 1} (${chunk.length} bookmarks) to Claude...`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Analyze these bookmarks and respond with ONLY valid JSON, no other text:\n\n${JSON.stringify(chunk)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const text = data.content[0].text;
    console.log(`XBS: Claude response (first 200 chars): ${text.substring(0, 200)}`);

    // Extract JSON — handle code fences, extra text, etc.
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    } else if (!jsonStr.startsWith("{")) {
      const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (braceMatch) jsonStr = braceMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    allGroups.push(...(parsed.groups || []));
    console.log(`XBS: Batch ${Math.floor(i / 50) + 1} done. Got ${parsed.groups?.length || 0} groups.`);
  }

  // Merge groups with same theme
  const merged = {};
  for (const group of allGroups) {
    const theme = group.theme;
    if (!merged[theme]) merged[theme] = { theme, bookmarks: [] };
    merged[theme].bookmarks.push(...group.bookmarks);
  }

  return { groups: Object.values(merged) };
}

// --- Telegram ---

function formatDigest(digest, totalNew) {
  const totalImportant = digest.groups.reduce((sum, g) => sum + g.bookmarks.length, 0);
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let msg = `📚 *Daily Bookmark Digest* — ${date}\n`;
  msg += `${totalNew} new bookmarks, ${totalImportant} worth reading.\n`;

  for (const group of digest.groups) {
    msg += `\n📌 *${escapeMarkdown(group.theme)}*\n`;
    for (const b of group.bookmarks) {
      const summary = escapeMarkdown(b.summary);
      msg += `• ${escapeMarkdown(b.author)}: ${summary}\n  → ${b.url}\n`;
    }
  }

  return msg;
}

function escapeMarkdown(text) {
  // Only escape characters that break Telegram Markdown v1
  return text.replace(/([_*`\[])/g, "\\$1");
}

async function sendToTelegram(message, botToken, chatId) {
  // Telegram has 4096 char limit per message
  const chunks = [];
  if (message.length <= 4096) {
    chunks.push(message);
  } else {
    let current = "";
    for (const line of message.split("\n")) {
      if (current.length + line.length + 1 > 4000) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current) chunks.push(current);
  }

  for (const chunk of chunks) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Telegram API error (${response.status}): ${errText}`);
    }
  }
}
