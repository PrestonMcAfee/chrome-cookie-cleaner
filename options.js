const DEFAULT_DOMAINS = [
  "google.com",
  "github.com",
  "amazon.com",
  "nytimes.com"
];

const whitelistInput = document.getElementById("whitelist");
const saveBtn = document.getElementById("saveBtn");
const sweepBtn = document.getElementById("manualSweepBtn");
const statusDiv = document.getElementById("status");

function showStatus(text, duration = 3000) {
  statusDiv.textContent = text;
  if (duration > 0) {
    setTimeout(() => {
      statusDiv.textContent = "";
    }, duration);
  }
}

// Load saved list
async function loadWhitelist() {
  const data = await chrome.storage.sync.get("userWhitelist");
  if (data.userWhitelist && Array.isArray(data.userWhitelist) && data.userWhitelist.length > 0) {
    whitelistInput.value = data.userWhitelist.join("\n");
  } else {
    // If sync storage is empty, query background service worker for active fallback
    chrome.runtime.sendMessage({ action: "get_active_whitelist" }, (res) => {
      if (res && res.whitelist) {
        whitelistInput.value = res.whitelist.join("\n");
      } else {
        whitelistInput.value = DEFAULT_DOMAINS.join("\n");
      }
    });
  }
}

// Save list to chrome.storage.sync
async function saveWhitelist() {
  const lines = whitelistInput.value
    .split("\n")
    .map(line => line.trim().toLowerCase().replace(/^\./, ""))
    .filter(line => line.length > 0 && !line.startsWith("#"));

  const unique = Array.from(new Set(lines));
  await chrome.storage.sync.set({ userWhitelist: unique });
  showStatus("Settings saved successfully.");

  // Notify background worker to refresh immediately
  chrome.runtime.sendMessage({ action: "whitelist_updated" });
}

// Run an on-demand sweep
sweepBtn.addEventListener("click", () => {
  showStatus("Running cleanup sweep...");
  chrome.runtime.sendMessage({ action: "trigger_sweep" }, (response) => {
    if (response && response.status === "complete") {
      showStatus(`Sweep complete: removed ${response.deleted} cookies.`);
    } else {
      showStatus("Sweep cycle triggered.");
    }
  });
});

saveBtn.addEventListener("click", saveWhitelist);
document.addEventListener("DOMContentLoaded", loadWhitelist);