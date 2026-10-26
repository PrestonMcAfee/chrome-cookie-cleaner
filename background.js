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

// Content setting permission categories that leave 0-byte shells in Chrome
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
  "clipboard"
];

// Load external whitelist
try {
  importScripts("list.js");
} catch (e) {
  try {
    importScripts("list.example.js");
  } catch (err) {
    console.warn("Neither list.js nor list.example.js could be loaded.", err);
  }
}

if (typeof WHITELIST === "undefined") {
  globalThis.WHITELIST = new Set(["google.com", "github.com"]);
}

for (const domain of ESSENTIAL_INFRASTRUCTURE_DOMAINS) {
  WHITELIST.add(domain);
}

const SWEEP_ALARM = "hourly_cookie_sweep";

function normalizeDomain(domain) {
  if (!domain) return "";
  return domain.replace(/^\./, "").toLowerCase().trim();
}

function matchesDomainOrSubdomain(targetDomain, baseDomain) {
  return targetDomain === baseDomain || targetDomain.endsWith("." + baseDomain);
}

function isWhitelisted(domain) {
  const clean = normalizeDomain(domain);
  for (const allowed of WHITELIST) {
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

// Reset permission overrides that leave 0-byte tombstone rows
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
      }
    } catch (e) {}
  }
}

// Master cleanup routine
async function cleanDeadCookiesAndStorage() {
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

  for (const domain of WHITELIST) {
    safeOrigins.add(`https://${domain}`);
    safeOrigins.add(`http://${domain}`);
    safeOrigins.add(`https://www.${domain}`);
    safeOrigins.add(`http://www.${domain}`);
  }

  const allCookies = await chrome.cookies.getAll({ partitionKey: {} });
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

    const isDomainActive = [...activeDomains].some(
      active => matchesDomainOrSubdomain(active, cookieDomain) || matchesDomainOrSubdomain(cookieDomain, active)
    );
    const isWhitelistedDomain = isWhitelisted(cookieDomain);

    if (isWhitelistedDomain || isDomainActive) {
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

  // 1. Explicit targeted browsingData purge for all discovered dead cookie domains
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

  // 3. Purge custom permission entries
  await clearNonWhitelistedPermissions(activeDomains);

  console.log(`[Cleaner] Cycle complete: removed ${cookieDeleteCount} cookies. Purged storage for ${deadDomains.size} dead domains and reset permissions.`);
}

function ensureAlarm() {
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
}

chrome.tabs.onRemoved.addListener(() => cleanDeadCookiesAndStorage());
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); cleanDeadCookiesAndStorage(); });
chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); cleanDeadCookiesAndStorage(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) cleanDeadCookiesAndStorage();
});

ensureAlarm();