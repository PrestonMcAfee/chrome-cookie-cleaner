// Expanded content setting permission types that leave rows in chrome://settings/content/all
const CONTENT_SETTING_TYPES = [
  "cookies",
  "images",
  "javascript",
  "popups",
  "location",
  "notifications",
  "microphone",
  "camera",
  "automaticDownloads",
  "midiSysex",
  "clipboard",
  "sound",
  "protectedContent",
  "sensors",
  "storageAccess",
  "localFonts",
  "idleDetection",
  "windowManagement"
];

const DEFAULT_WHITELIST = [
  "aa.com",
  "amazon.com",
  "arstechnica.com",
  "github.com",
  "gmail.com",
  "google.com",
  "googleapis.com",
  "microsoft.com",
  "nytimes.com",
  "phys.org",
  "reddit.com",
  "walmart.com",
  "youtube.com"
];

// Common second-level TLD extensions
const SPECIAL_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au",
  "co.jp", "ne.jp",
  "co.nz", "org.nz",
  "com.br",
  "gc.ca"
]);

// Extract base root domain (e.g. sub.amazon.com -> amazon.com, www.bbc.co.uk -> bbc.co.uk)
function getBaseDomain(hostname) {
  if (!hostname) return "";
  let clean = hostname.replace(/^\./, "").toLowerCase().trim();

  // Strip protocols, ports, and wildcards
  clean = clean.replace(/^(?:https?|\*):\/\//, "");
  clean = clean.replace(/^\[\*\.\]/, "").replace(/^\*\./, "");
  clean = clean.split("/")[0].split(":")[0];

  // Discard wildcards, empty strings, and internal schemes
  if (!clean || clean === "*" || clean === "<all_urls>" || clean.includes("chrome")) {
    return "";
  }

  const parts = clean.split(".");
  if (parts.length <= 1) return "";
  if (parts.length <= 2) return clean;

  const lastTwo = parts.slice(-2).join(".");
  if (SPECIAL_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

// -------------------------------------------------------------
// Tab Tracking (Maintains tabId -> baseDomain mapping while open)
// -------------------------------------------------------------
const tabDomainMap = new Map();

function trackTab(tabId, url) {
  if (!url) return;
  try {
    const u = new URL(url);
    if (["http:", "https:"].includes(u.protocol)) {
      const base = getBaseDomain(u.hostname);
      if (base) {
        tabDomainMap.set(tabId, base);
      }
    }
  } catch {}
}

// Initialize tracking for all existing tabs on worker startup
async function initTabTracker() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      trackTab(tab.id, tab.url);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    trackTab(tabId, changeInfo.url);
  } else if (tab.url) {
    trackTab(tabId, tab.url);
  }
});

// -------------------------------------------------------------
// LIST 1: Whitelist (Strictly user-defined via chrome.storage.sync)
// -------------------------------------------------------------
async function getList1_Whitelist() {
  const list1 = new Set();
  try {
    const data = await chrome.storage.sync.get("userWhitelist");
    if (data.userWhitelist && Array.isArray(data.userWhitelist) && data.userWhitelist.length > 0) {
      for (const d of data.userWhitelist) {
        const base = getBaseDomain(d);
        if (base) list1.add(base);
      }
    } else {
      for (const d of DEFAULT_WHITELIST) {
        const base = getBaseDomain(d);
        if (base) list1.add(base);
      }
      await chrome.storage.sync.set({ userWhitelist: DEFAULT_WHITELIST });
    }
  } catch (err) {
    for (const d of DEFAULT_WHITELIST) {
      const base = getBaseDomain(d);
      if (base) list1.add(base);
    }
  }
  return list1;
}

// -------------------------------------------------------------
// LIST 2: Stored Root Domains (Mirroring chrome://settings/content/all)
// -------------------------------------------------------------
async function getList2_StoredDomains() {
  const list2 = new Set();

  // 1. Scan unpartitioned cookies
  const cookies = await chrome.cookies.getAll({});
  for (const c of cookies) {
    const base = getBaseDomain(c.domain);
    if (base) list2.add(base);
  }

  // 2. Scan partitioned cookies (CHIPS)
  try {
    const partitioned = await chrome.cookies.getAll({ partitionKey: {} });
    for (const c of partitioned) {
      const base = getBaseDomain(c.domain);
      if (base) list2.add(base);
      if (c.partitionKey?.topLevelSite) {
        try {
          const u = new URL(c.partitionKey.topLevelSite);
          const topBase = getBaseDomain(u.hostname);
          if (topBase) list2.add(topBase);
        } catch {}
      }
    }
  } catch (e) {}

  // 3. Scan Content Settings permission overrides (catches 0-byte ghost entries)
  for (const type of CONTENT_SETTING_TYPES) {
    if (!chrome.contentSettings?.[type]) continue;
    try {
      const rules = await chrome.contentSettings[type].getAll({});
      for (const rule of rules) {
        const base = getBaseDomain(rule.primaryPattern);
        if (base) list2.add(base);
      }
    } catch (e) {}
  }

  return list2;
}

// -------------------------------------------------------------
// LIST 3: Open Tab Base Domains
// -------------------------------------------------------------
async function getList3_OpenTabDomains() {
  const list3 = new Set();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url) {
      try {
        const u = new URL(tab.url);
        if (["http:", "https:"].includes(u.protocol)) {
          const base = getBaseDomain(u.hostname);
          if (base) {
            list3.add(base);
            if (tab.id) tabDomainMap.set(tab.id, base); // Keep map synchronized
          }
        }
      } catch {}
    }
  }
  return list3;
}

// -------------------------------------------------------------
// Permission Reset Routine (Iterates all content setting types)
// -------------------------------------------------------------
async function resetPermissionsForDomain(baseDomain) {
  for (const type of CONTENT_SETTING_TYPES) {
    if (!chrome.contentSettings?.[type]) continue;
    try {
      const rules = await chrome.contentSettings[type].getAll({});
      for (const rule of rules) {
        const ruleBase = getBaseDomain(rule.primaryPattern);
        if (ruleBase === baseDomain) {
          try {
            const setDetails = {
              primaryPattern: rule.primaryPattern,
              setting: "default",
              scope: rule.scope || "regular"
            };
            if (rule.secondaryPattern) {
              setDetails.secondaryPattern = rule.secondaryPattern;
            }
            await chrome.contentSettings[type].set(setDetails);
          } catch (err) {
            console.warn(`[Cleaner] Failed resetting permission ${type} for ${rule.primaryPattern}:`, err);
          }
        }
      }
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// The "Trash Can" Action: Equivalent to chrome://settings/content/all trash can
// -------------------------------------------------------------
async function executeTrashCanForDomain(baseDomain) {
  let cookieCountForDomain = 0;

  // Count cookies belonging to this base domain before wiping
  try {
    const allCookies = await chrome.cookies.getAll({});
    for (const c of allCookies) {
      if (getBaseDomain(c.domain) === baseDomain) {
        cookieCountForDomain++;
      }
    }
  } catch (e) {}

  const targetOrigins = [
    `https://${baseDomain}`,
    `http://${baseDomain}`,
    `https://www.${baseDomain}`,
    `http://${baseDomain}`
  ];

  // 1. Purge all cookies and web storage for the entire root domain
  try {
    await chrome.browsingData.remove(
      { origins: targetOrigins },
      {
        cache: true,
        cacheStorage: true,
        cookies: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true
      }
    );
  } catch (e) {}

  // 2. Clear all custom permission overrides and 0-byte tombstone records immediately
  await resetPermissionsForDomain(baseDomain);

  // 3. Follow-up permission pass after 5000ms to clean late service worker or sensor flushes
  setTimeout(async () => {
    const [list1, list3] = await Promise.all([
      getList1_Whitelist(),
      getList3_OpenTabDomains()
    ]);
    if (!list1.has(baseDomain) && !list3.has(baseDomain)) {
      await resetPermissionsForDomain(baseDomain);
    }
  }, 5000);

  return cookieCountForDomain;
}

// -------------------------------------------------------------
// Tab Closure Event: Targeted 1000ms Debounced Purge
// -------------------------------------------------------------
chrome.tabs.onRemoved.addListener((tabId) => {
  const closedDomain = tabDomainMap.get(tabId);
  tabDomainMap.delete(tabId);

  if (!closedDomain) return;

  // Wait 1000ms to allow tab states to settle and page teardown to finish
  setTimeout(async () => {
    const [list1, list3] = await Promise.all([
      getList1_Whitelist(),
      getList3_OpenTabDomains()
    ]);

    // Only clean if it is NOT on the whitelist and NO OTHER open tab has this domain
    if (!list1.has(closedDomain) && !list3.has(closedDomain)) {
      console.log(`[Cleaner] Tab closed: Purging targeted domain: ${closedDomain}`);
      await executeTrashCanForDomain(closedDomain);
    }
  }, 1000);
});

// -------------------------------------------------------------
// Manual Event Sweep (Run Sweep Button)
// -------------------------------------------------------------
async function runEventSweep() {
  console.log("[Cleaner] Running targeted sweep...");
  const [list1, list2, list3] = await Promise.all([
    getList1_Whitelist(),
    getList2_StoredDomains(),
    getList3_OpenTabDomains()
  ]);

  let removedSites = 0;
  let removedCookies = 0;

  for (const baseDomain of list2) {
    if (!baseDomain) continue;

    const isWhitelisted = list1.has(baseDomain);
    const isOpenInTab = list3.has(baseDomain);

    if (!isWhitelisted && !isOpenInTab) {
      const cookiesOnDomain = await executeTrashCanForDomain(baseDomain);
      removedCookies += cookiesOnDomain;
      removedSites++;
    }
  }

  console.log(`[Cleaner] Sweep finished. Processed ${list2.size} total sites, purged ${removedSites} dead sites (${removedCookies} cookies).`);
  return { 
    processed: list2.size, 
    deletedSites: removedSites, 
    deletedCookies: removedCookies 
  };
}

// Listen for popup trigger (Run Sweep button) & Whitelist queries
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "trigger_sweep") {
    runEventSweep().then(res => {
      sendResponse({ 
        status: "complete", 
        deletedSites: res.deletedSites, 
        deletedCookies: res.deletedCookies 
      });
    });
    return true;
  } else if (message.action === "whitelist_updated") {
    sendResponse({ status: "updated" });
  } else if (message.action === "get_active_whitelist") {
    getList1_Whitelist().then(whitelistSet => {
      sendResponse({ whitelist: Array.from(whitelistSet) });
    });
    return true;
  }
});

initTabTracker();
