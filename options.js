const DEFAULT_DOMAINS = [
  "google.com",
  "github.com",
  "amazon.com",
  "nytimes.com"
];

const whitelistInput = document.getElementById("whitelist");
const trimCacheCheckbox = document.getElementById("trimWhitelistedCache");
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

// Load saved list and settings
async function loadSettings() {
  const data = await chrome.storage.sync.get(["userWhitelist", "trimWhitelistedCache"]);
  
  if (data.userWhitelist && Array.isArray(data.userWhitelist) && data.userWhitelist.length > 0) {
    whitelistInput.value = data.userWhitelist.join("\n");
  } else {
    chrome.runtime.sendMessage({ action: "get_active_whitelist" }, (res) => {
      if (res && res.whitelist) {
        whitelistInput.value = res.whitelist.join("\n");
      } else {
        whitelistInput.value = DEFAULT_DOMAINS.join("\n");
      }
    });
  }

  // Default to true if not explicitly set
  trimCacheCheckbox.checked = data.trimWhitelistedCache !== false;
}

// Save settings to chrome.storage.sync
async function saveSettings() {
  const lines = whitelistInput.value
    .split("\n")
    .map(line => line.trim().toLowerCase().replace(/^\./, ""))
    .filter(line => line.length > 0 && !line.startsWith("#"));

  const unique = Array.from(new Set(lines));
  const trimCache = trimCacheCheckbox.checked;

  await chrome.storage.sync.set({ 
    userWhitelist: unique,
    trimWhitelistedCache: trimCache
  });
  showStatus("Settings saved successfully.");

  // Notify background worker to refresh immediately
  chrome.runtime.sendMessage({ action: "whitelist_updated" });
}

// Run an on-demand sweep
sweepBtn.addEventListener("click", () => {
  showStatus("Running cleanup sweep...");
  sweepBtn.disabled = true;

  chrome.runtime.sendMessage({ action: "trigger_sweep" }, (response) => {
    sweepBtn.disabled = false;
    if (response && response.status === "complete") {
      let msg = `Cleaned ${response.deletedCookies} cookies across ${response.deletedSites} sites.`;
      if (response.trimmedCaches > 0) {
        msg += ` Trimmed cache on ${response.trimmedCaches} whitelisted sites.`;
      }
      showStatus(msg, 4000);
    } else {
      showStatus("Sweep cycle complete.");
    }
  });
});

saveBtn.addEventListener("click", saveSettings);
document.addEventListener("DOMContentLoaded", loadSettings);