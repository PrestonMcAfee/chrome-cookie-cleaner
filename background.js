// Baseline infrastructure domains essential for CDN edge routing & bot verification
const ESSENTIAL_INFRASTRUCTURE_DOMAINS = [
  "akamai.com",
  "akamaized.net",
  "cloudflare.com",
  "edgekey.net",
  "edgesuite.net",
  "fastly.net",
  "cloudfront.net",
  "aws.amazon.com",
  "amazon.com"
];

// Common WAF / Anti-bot verification token prefixes
const SECURITY_COOKIE_PREFIXES = [
  "_abck",
  "ak_bmsc",
  "bm_sz",
  "bm_sv",
  "bm_mi",
  "cf_clearance",
  "__cf_bm",
  "cf_chl",
  "aws-waf-token",
  "csm-hit",
  "sp-cdn",
  "_px",
  "_pxhd",
  "datadome"
];

// Content setting categories that leave 0-byte tombstone rows in settings
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
  "protectedContent"
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

let ACTIVE_WHITELIST = new Set();

function normalizeDomain(domain) {
  if (!domain) return "";
  return domain.replace(/^\./, "").toLowerCase().trim();
}

function matchesDomainOrSubdomain(targetDomain, baseDomain) {
  return targetDomain === baseDomain || targetDomain.endsWith("." + baseDomain);
}

async function refreshWhitelist() {
  const nextSet = new Set();
  try {
    const data = await chrome.storage.sync.get("userWhitelist");
    if (data.userWhitelist && Array.isArray(data.userWhitelist) && data.userWhitelist.length > 0) {
      for (const d of data.userWhitelist) nextSet.add(normalizeDomain(d));
    } else {
      for (const d of DEFAULT_WHITELIST) nextSet.add(normalizeDomain(d));
      await chrome.storage.sync.set({ userWhitelist: DEFAULT_WHITELIST });
    }
  } catch (err) {
    for (const d of DEFAULT_WHITELIST) nextSet.add(normalizeDomain(d));
  }

  for (const d of ESSENTIAL_INFRASTRUCTURE_DOMAINS) {
    nextSet.add(d);
  }
  ACTIVE_WHITELIST = nextSet;
}

function isWhitelisted(domain) {
  const clean = normalizeDomain(domain);
  for (const allowed of ACTIVE_WHITELIST) {
    if (matchesDomainOrSubdomain(clean, allowed)) {
      return true;
    }
  }
  return false;
}

function isSecurityCookie(cookieName) {
  const lower = cookieName.toLowerCase();
  return SECURITY_COOKIE_PREFIXES.some(prefix => lower.startsWith(prefix.toLowerCase()));
}

function getDomainFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

// Tier 1: Targeted Cookie Eviction (Runs safely on tab close)
async function cleanDeadCookiesOnly() {
  await refreshWhitelist();
  const openTabs = await chrome.tabs.query({});
  const activeDomains = new Set();

  for (const tab of openTabs) {
    if (tab.url) {
      const d = getDomainFromUrl(tab.url);
      if (d) activeDomains.add(d);
    }
  }

  const standardCookies = await chrome.cookies.getAll({});
  let partitionedCookies = [];
  try {
    partitionedCookies = await chrome.cookies.getAll({ partitionKey: {} });
  } catch (e) {}

  const cookieMap = new Map();
  for (const c of standardCookies) {
    cookieMap.set(`${c.name}|${c.domain}|${c.path}|${c.storeId}`, c);
  }
  for (const c of partitionedCookies) {
    const pKey = c.partitionKey?.topLevelSite || "";
    cookieMap.set(`${c.name}|${c.domain}|${c.path}|${c.storeId}|${pKey}`, c);
  }

  let deleted = 0;
  for (const cookie of cookieMap.values()) {
    if (isSecurityCookie(cookie.name)) continue;

    const cookieDomain = normalizeDomain(cookie.domain);
    let topLevelSiteDomain = null;
    if (cookie.partitionKey?.topLevelSite) {
      topLevelSiteDomain = getDomainFromUrl(cookie.partitionKey.topLevelSite);
    }

    let shouldKeep = false;
    if (topLevelSiteDomain) {
      const isTopLevelActive = [...activeDomains].some(
        active => matchesDomainOrSubdomain(active, topLevelSiteDomain) || matchesDomainOrSubdomain(topLevelSiteDomain, active)
      );
      shouldKeep = isTopLevelActive || isWhitelisted(topLevelSiteDomain);
    } else {
      const isDomainActive = [...activeDomains].some(
        active => matchesDomainOrSubdomain(active, cookieDomain) || matchesDomainOrSubdomain(cookieDomain, active)
      );
      shouldKeep = isDomainActive || isWhitelisted(cookieDomain);
    }

    if (shouldKeep) continue;

    const protocol = cookie.secure ? "https://" : "http://";
    const rawDomain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    const cleanPath = cookie.path.startsWith("/") ? cookie.path : "/" + cookie.path;
    const url = `${protocol}${rawDomain}${cleanPath}`;

    const removeDetails = {
      url: url,
      name: cookie.name,
      storeId: cookie.storeId
    };
    if (cookie.partitionKey) removeDetails.partitionKey = cookie.partitionKey;

    try {
      await chrome.cookies.remove(removeDetails);
      deleted++;
    } catch (e) {}
  }

  return deleted;
}

// Tier 2: Deep Storage & Tombstone Purge (Runs ONLY when machine/browser is IDLE)
async function cleanDeepStorageAndTombstones() {
  await refreshWhitelist();
  console.log("[Cleaner] Executing idle deep storage sweep...");

  const openTabs = await chrome.tabs.query({});
  const safeOrigins = new Set();

  for (const tab of openTabs) {
    if (tab.url) {
      try {
        const u = new URL(tab.url);
        safeOrigins.add(u.origin);
      } catch {}
    }
  }

  for (const domain of ACTIVE_WHITELIST) {
    safeOrigins.add(`https://${domain}`);
    safeOrigins.add(`http://${domain}`);
    safeOrigins.add(`https://www.${domain}`);
    safeOrigins.add(`http://${domain}`);
  }

  // Purge dead origin storage (NEVER include cookies here)
  try {
    await chrome.browsingData.remove(
      {
        excludeOrigins: Array.from(safeOrigins),
        originTypes: { unprotectedWeb: true, protectedWeb: true }
      },
      {
        appcache: true,
        cache: true,
        cacheStorage: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true
      }
    );
  } catch (e) {}

  // Reset lingering 0-byte permission shells
  for (const type of CONTENT_SETTING_TYPES) {
    if (!chrome.contentSettings?.[type]) continue;
    try {
      const rules = await chrome.contentSettings[type].getAll({});
      for (const rule of rules) {
        const match = (rule.primaryPattern || "").match(/https?:\/\/(?:\[\*\.\])?([^\/:]+)/i);
        if (!match) continue;
        const d = normalizeDomain(match[1]);
        if (!d || isWhitelisted(d)) continue;

        try {
          await chrome.contentSettings[type].set({
            primaryPattern: rule.primaryPattern,
            setting: "default",
            scope: rule.scope || "regular"
          });
          await chrome.contentSettings[type].clear({ scope: rule.scope || "regular" });
        } catch {}
      }
    } catch {}
  }
}

// Hourly maintenance alarm - triggers deep clean only if idle
const SWEEP_ALARM = "hourly_cookie_sweep";
function ensureAlarm() {
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SWEEP_ALARM) {
    await cleanDeadCookiesOnly();
    
    // Only perform deep storage wipe if the user has been inactive for >= 15 min (900 seconds)
    chrome.idle.queryState(900, async (state) => {
      if (state === "idle" || state === "locked") {
        await cleanDeepStorageAndTombstones();
      }
    });
  }
});

// Tab close trigger: quick, lightweight cookie check only
chrome.tabs.onRemoved.addListener(() => {
  cleanDeadCookiesOnly();
});

// Manual on-demand sweep via toolbar popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "whitelist_updated") {
    refreshWhitelist();
    sendResponse({ status: "updated" });
  } else if (message.action === "get_active_whitelist") {
    refreshWhitelist().then(() => {
      const userList = Array.from(ACTIVE_WHITELIST).filter(
        d => !ESSENTIAL_INFRASTRUCTURE_DOMAINS.includes(d)
      );
      sendResponse({ whitelist: userList });
    });
    return true;
  } else if (message.action === "trigger_sweep") {
    (async () => {
      const deleted = await cleanDeadCookiesOnly();
      await cleanDeepStorageAndTombstones();
      sendResponse({ status: "complete", deleted });
    })();
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => { ensureAlarm(); refreshWhitelist(); });
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); refreshWhitelist(); });

ensureAlarm();
refreshWhitelist();
