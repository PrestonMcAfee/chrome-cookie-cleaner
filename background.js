// Baseline infrastructure domains essential for CDN edge routing & bot verification
const ESSENTIAL_INFRASTRUCTURE_DOMAINS = [
  "akamai.com",
  "akamaized.net",
  "cloudflare.com",
  "edgekey.net",
  "edgesuite.net",
  "fastly.net"
];

// Common WAF / Anti-bot edge verification token prefixes (Akamai, Cloudflare, etc.)
const SECURITY_COOKIE_PREFIXES = [
  "_abck",
  "ak_bmsc",
  "bm_sz",
  "bm_sv",
  "cf_clearance",
  "__cf_bm"
];

// Full suite of permissions that leave 0-byte shells in chrome://settings/content/all
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
  "ambientweather.net",
  "arstechnica.com",
  "cvs.com",
  "delta.com",
  "enphaseenergy.com",
  "fedex.com",
  "github.com",
  "gmail.com",
  "google.com",
  "googleapis.com",
  "homeassistant.local",
  "imdb.com",
  "la28.org",
  "linkedin.com",
  "mc4f.ee",
  "mcafeefamily.net",
  "microsoft.com",
  "nytimes.com",
  "phys.org",
  "reddit.com",
  "sfbaycoffee.com",
  "starlink.com",
  "tripit.com",
  "ui.com",
  "united.com",
  "ups.com",
  "usps.com",
  "viwoods.com",
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

// Synchronize whitelist from chrome.storage.sync
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

const SWEEP_ALARM = "hourly_cookie_sweep";

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
  return SECURITY_COOKIE_PREFIXES.some(prefix => cookieName.startsWith(prefix));
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

// Eradicate custom permission rules and tombstone shells
async function clearNonWhitelistedPermissions(activeDomains) {
  for (const type of CONTENT_SETTING_TYPES) {
    if (!chrome.contentSettings || !chrome.contentSettings[type]) continue;

    try {
      const rules = await chrome.contentSettings[type].getAll({});
      for (const rule of rules) {
        const pattern = rule.primaryPattern || "";
        const domainMatch = pattern.match(/https?:\/\/(?:\[\*\.\])?([^\/:]+)/i);
        if (!domainMatch) continue;

        const domain = normalizeDomain(domainMatch[1]);
        if (!domain || isWhitelisted(domain)) continue;

        const isOpen = [...activeDomains].some(
          active => matchesDomainOrSubdomain(active, domain) || matchesDomainOrSubdomain(domain, active)
        );
        if (isOpen) continue;

        // Reset rule to default to remove the explicit grant/block
        try {
          const details = {
            primaryPattern: rule.primaryPattern,
            setting: "default",
            scope: rule.scope || "regular"
          };
          if (rule.secondaryPattern) {
            details.secondaryPattern = rule.secondaryPattern;
          }
          await chrome.contentSettings[type].set(details);
        } catch (setErr) {}

        // Also issue clear() on this setting type to prune unlinked tombstones
        try {
          await chrome.contentSettings[type].clear({ scope: rule.scope || "regular" });
        } catch (clrErr) {}
      }
    } catch (e) {}
  }
}

// Master cleanup routine
async function cleanDeadCookiesAndStorage() {
  await refreshWhitelist();
  console.log("[Cleaner] Starting sweep cycle...");

  const openTabs = await chrome.tabs.query({});
  const activeDomains = new Set();
  const safeOrigins = new Set();
  
  for (const tab of openTabs) {
    if (tab.url) {
      const domain = getDomainFromUrl(tab.url);
      if (domain) {
        activeDomains.add(domain);
        try {
          const u = new URL(tab.url);
          safeOrigins.add(u.origin);
        } catch {}
      }
    }
  }

  for (const domain of ACTIVE_WHITELIST) {
    safeOrigins.add(`https://${domain}`);
    safeOrigins.add(`http://${domain}`);
    safeOrigins.add(`https://www.${domain}`);
    safeOrigins.add(`http://${domain}`);
  }

  // Fetch standard and partitioned cookies
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

  const allCookies = Array.from(cookieMap.values());
  const deadDomains = new Set();
  let cookieDeleteCount = 0;

  for (const cookie of allCookies) {
    if (isSecurityCookie(cookie.name)) {
      continue;
    }

    const cookieDomain = normalizeDomain(cookie.domain);
    let topLevelSiteDomain = null;
    if (cookie.partitionKey && cookie.partitionKey.topLevelSite) {
      topLevelSiteDomain = getDomainFromUrl(cookie.partitionKey.topLevelSite);
    }

    let shouldKeep = false;
    if (topLevelSiteDomain) {
      const isTopLevelActive = [...activeDomains].some(
        active => matchesDomainOrSubdomain(active, topLevelSiteDomain) || matchesDomainOrSubdomain(topLevelSiteDomain, active)
      );
      const isTopLevelWhitelisted = isWhitelisted(topLevelSiteDomain);
      shouldKeep = isTopLevelActive || isTopLevelWhitelisted;
    } else {
      const isDomainActive = [...activeDomains].some(
        active => matchesDomainOrSubdomain(active, cookieDomain) || matchesDomainOrSubdomain(cookieDomain, active)
      );
      const isWhitelistedDomain = isWhitelisted(cookieDomain);
      shouldKeep = isDomainActive || isWhitelistedDomain;
    }

    if (shouldKeep) {
      continue;
    }

    deadDomains.add(cookieDomain);
    if (topLevelSiteDomain) deadDomains.add(topLevelSiteDomain);

    const protocol = cookie.secure ? "https://" : "http://";
    const rawDomain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    const cleanPath = cookie.path.startsWith("/") ? cookie.path : "/" + cookie.path;
    const url = `${protocol}${rawDomain}${cleanPath}`;

    const removeDetails = {
      url: url,
      name: cookie.name,
      storeId: cookie.storeId
    };

    if (cookie.partitionKey) {
      removeDetails.partitionKey = cookie.partitionKey;
    }

    try {
      const res = await chrome.cookies.remove(removeDetails);
      if (res) {
        cookieDeleteCount++;
      } else {
        removeDetails.url = `http://${rawDomain}${cleanPath}`;
        await chrome.cookies.remove(removeDetails);
      }
    } catch (e) {}
  }

  // 1. Explicit targeted browsingData purge for all discovered dead domains
  for (const domain of deadDomains) {
    if (isWhitelisted(domain)) continue;
    const baseDomain = domain.startsWith("www.") ? domain.slice(4) : domain;
    const purgeTargets = [
      `https://${baseDomain}`,
      `http://${baseDomain}`,
      `https://www.${baseDomain}`,
      `http://www.${baseDomain}`
    ];
    if (domain !== baseDomain && domain !== `www.${baseDomain}`) {
      purgeTargets.push(`https://${domain}`, `http://${domain}`);
    }

    try {
      await chrome.browsingData.remove(
        { origins: purgeTargets },
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
  }

  // 2. Global fallback purge with safe origin shielding
  try {
    await chrome.browsingData.remove(
      {
        excludeOrigins: Array.from(safeOrigins),
        originTypes: {
          unprotectedWeb: true,
          protectedWeb: true
        }
      },
      {
        appcache: true,
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
  } catch (err) {
    console.error("[Cleaner] Global storage purge error:", err);
  }

  // 3. Purge custom permission entries and 0-byte shells
  await clearNonWhitelistedPermissions(activeDomains);

  console.log(`[Cleaner] Cycle complete: evaluated ${allCookies.length} total cookies, deleted ${cookieDeleteCount} non-whitelisted cookies. Purged storage for ${deadDomains.size} dead domains and reset permissions.`);
  return { deleted: cookieDeleteCount, deadDomains: deadDomains.size };
}

function ensureAlarm() {
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
}

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
    cleanDeadCookiesAndStorage().then((res) => {
      sendResponse({ status: "complete", ...res });
    });
    return true;
  }
});

if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
  });
}

chrome.tabs.onRemoved.addListener(() => cleanDeadCookiesAndStorage());
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); cleanDeadCookiesAndStorage(); });
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); cleanDeadCookiesAndStorage(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) cleanDeadCookiesAndStorage();
});

ensureAlarm();
refreshWhitelist();