const countEl = document.getElementById("count");
const lastInfoEl = document.getElementById("lastInfo");
const sendBtn = document.getElementById("sendBtn");
const configToggle = document.getElementById("configToggle");
const configSection = document.getElementById("configSection");
const saveConfigBtn = document.getElementById("saveConfig");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");

const apiKeyInput = document.getElementById("apiKey");
const botTokenInput = document.getElementById("botToken");
const chatIdInput = document.getElementById("chatId");

function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = isError ? "status error" : "status";
  if (!isError) setTimeout(() => (statusEl.textContent = ""), 5000);
}

function updateUI() {
  chrome.runtime.sendMessage({ type: "GET_BOOKMARKS" }, (response) => {
    const bookmarks = response?.bookmarks || {};
    const list = Object.values(bookmarks);
    countEl.textContent = list.length;
  });

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    const { config, lastDigest, processedIds } = response;

    if (lastDigest) {
      lastInfoEl.textContent = `Last digest: ${new Date(lastDigest).toLocaleString()}`;
    } else {
      lastInfoEl.textContent = "Visit x.com/i/bookmarks to start capturing";
    }

    // Pre-fill config inputs
    if (config.anthropic_api_key) apiKeyInput.value = config.anthropic_api_key;
    if (config.telegram_bot_token) botTokenInput.value = config.telegram_bot_token;
    if (config.telegram_chat_id) chatIdInput.value = config.telegram_chat_id;

    // Disable send if no config
    if (!config.anthropic_api_key || !config.telegram_bot_token || !config.telegram_chat_id) {
      sendBtn.disabled = true;
      sendBtn.textContent = "Configure Settings First";
      configSection.classList.add("visible");
    }
  });
}

// Send digest now
sendBtn.addEventListener("click", () => {
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";
  statusEl.textContent = "";

  chrome.runtime.sendMessage({ type: "SEND_DIGEST_NOW" }, (response) => {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Digest Now";

    if (response?.status === "ok") {
      showStatus(response.message);
      updateUI();
    } else {
      showStatus(response?.message || "Unknown error", true);
    }
  });
});

// Toggle settings
configToggle.addEventListener("click", () => {
  configSection.classList.toggle("visible");
  configToggle.textContent = configSection.classList.contains("visible")
    ? "Hide Settings"
    : "Settings";
});

// Save config
saveConfigBtn.addEventListener("click", () => {
  const config = {
    anthropic_api_key: apiKeyInput.value.trim(),
    telegram_bot_token: botTokenInput.value.trim(),
    telegram_chat_id: chatIdInput.value.trim(),
  };

  if (!config.anthropic_api_key || !config.telegram_bot_token || !config.telegram_chat_id) {
    showStatus("All fields are required.", true);
    return;
  }

  chrome.runtime.sendMessage({ type: "SAVE_CONFIG", config }, () => {
    showStatus("Settings saved!");
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Digest Now";
  });
});

// Clear bookmarks
clearBtn.addEventListener("click", () => {
  if (confirm("Clear all captured bookmarks and processed history?")) {
    chrome.storage.local.set({ bookmarks: {}, processedIds: [] }, () => {
      chrome.action.setBadgeText({ text: "" });
      updateUI();
      showStatus("Cleared.");
    });
  }
});

updateUI();
