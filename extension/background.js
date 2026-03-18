// Service worker: captures bookmarks from X, auto-exports to JSON file.
// Digest is handled by the Python cron job (6 AM IST daily).

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
    chrome.storage.local.get(["config", "lastExport"], (result) => {
      sendResponse({
        config: result.config || {},
        lastExport: result.lastExport || null,
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

  if (message.type === "EXPORT_NOW") {
    exportBookmarks().then(() => sendResponse({ status: "exported" }));
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
    console.log(`XBS: Stored ${addedCount} new bookmarks (total: ${total})`);

    // Auto-export whenever new bookmarks are captured
    exportBookmarks();
  }
}

// --- Auto-export bookmarks to JSON file ---

async function exportBookmarks() {
  const result = await chrome.storage.local.get("bookmarks");
  const bookmarks = result.bookmarks || {};
  const bookmarkList = Object.values(bookmarks);

  if (bookmarkList.length === 0) return;

  const json = JSON.stringify(bookmarkList, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: url,
    filename: "bookmark-summarizer/bookmarks_raw.json",
    saveAs: false,
    conflictAction: "overwrite",
  });

  await chrome.storage.local.set({ lastExport: new Date().toISOString() });
  console.log(`XBS: Exported ${bookmarkList.length} bookmarks to file`);
}

// --- Alarms: refresh pinned tab + periodic export ---

chrome.runtime.onInstalled.addListener(setupAlarms);
chrome.runtime.onStartup.addListener(setupAlarms);

function setupAlarms() {
  // Refresh bookmarks tab every 6 hours to capture new bookmarks
  chrome.alarms.create("refreshBookmarks", {
    periodInMinutes: 6 * 60,
    delayInMinutes: 5,
  });

  // Re-export bookmarks every 2 hours as backup
  chrome.alarms.create("autoExport", {
    periodInMinutes: 2 * 60,
    delayInMinutes: 10,
  });

  console.log("XBS: Alarms set up — refresh every 6h, export every 2h");
}

setupAlarms();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log(`XBS: Alarm fired: ${alarm.name}`);
  if (alarm.name === "refreshBookmarks") {
    await refreshBookmarksTab();
  }
  if (alarm.name === "autoExport") {
    await exportBookmarks();
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
