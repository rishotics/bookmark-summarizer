const countEl = document.getElementById("count");
const lastInfoEl = document.getElementById("lastInfo");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");

function showStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => (statusEl.textContent = ""), 5000);
}

function updateUI() {
  chrome.runtime.sendMessage({ type: "GET_BOOKMARKS" }, (response) => {
    const bookmarks = response?.bookmarks || {};
    countEl.textContent = Object.keys(bookmarks).length;
  });

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    const { lastExport } = response;
    if (lastExport) {
      lastInfoEl.textContent = `Last export: ${new Date(lastExport).toLocaleString()}`;
    } else {
      lastInfoEl.textContent = "Visit x.com/i/bookmarks to start capturing";
    }
  });
}

exportBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "EXPORT_NOW" }, () => {
    showStatus("Exported to Downloads/bookmark-summarizer/");
  });
});

clearBtn.addEventListener("click", () => {
  if (confirm("Clear all captured bookmarks?")) {
    chrome.storage.local.set({ bookmarks: {} }, () => {
      chrome.action.setBadgeText({ text: "" });
      updateUI();
      showStatus("Cleared.");
    });
  }
});

updateUI();
