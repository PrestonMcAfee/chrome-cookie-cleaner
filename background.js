const WHITELIST = new Set([
  "aa.com",
  "amazon.com",
  "ambientweather.net",
  "arstechnica.com",
  "cvs.com",
  "cloudflare.com",
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
]);

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

function getDomainFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return normalizeDomain(url.hostname);
  } catch {
    return null;
  }
}

// Record domains when visited to ensure site storage is cleaned even if zero cookies are written
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url) {
    const domain = getDomainFromUrl(tab.url);
    if (domain && !isWhitelisted(domain)) {
      const data = await chrome.storage.local.get("trackedOrigins");
      const trackedOrigins = new Set(data.trackedOrigins || []);
      if (!trackedOrigins.has(domain)) {
        trackedOrigins.add(domain);
        await chrome.storage.local.set({ trackedOrigins: [...trackedOrigins] });
      }
    }
  }
});

// Main cleanup execution
async function cleanDeadCookiesAndStorage() {
  // 1. Gather all currently open web domains across all browser windows
  const openTabs = await chrome.tabs.query({});
  const activeDomains = new Set();
  
  for (const tab of openTabs) {
    if (tab.url) {
      const domain = getDomainFromUrl(tab.url);
      if (domain) activeDomains.add(domain);
    }
  }

  // 2. Fetch all cookies (including partitioned)
  const allCookies = await chrome.cookies.getAll({ partitionKey: {} });
  const deadDomains = new Set();
  let cookieDeleteCount = 0;

  for (const cookie of allCookies) {
    const cookieDomain = normalizeDomain(cookie.domain);
    
    let topLevelSiteDomain = null;
    if (cookie.partitionKey && cookie.partitionKey.topLevelSite) {
      topLevelSiteDomain = getDomainFromUrl(cookie.partitionKey.topLevelSite);
    }

    const isPartitionDead = topLevelSiteDomain && 
                            !isWhitelisted(topLevelSiteDomain) && 
                            ![...activeDomains].some(active => matchesDomainOrSubdomain(active, topLevelSiteDomain));

    if (!isPartitionDead) {
      if (isWhitelisted(cookieDomain)) continue;

      let domainInUse = false;
      for (const active of activeDomains) {
        if (matchesDomainOrSubdomain(active, cookieDomain) || matchesDomainOrSubdomain(cookieDomain, active)) {
          domainInUse = true;
          break;
        }
      }
      if (domainInUse) continue;
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
      } else if (!cookie.secure) {
        removeDetails.url = `http://${rawDomain}${cleanPath}`;
        await chrome.cookies.remove(removeDetails);
      }
    } catch (e) {}
  }

  // 3. Merge dead cookie domains with tracked visited domains
  const storedData = await chrome.storage.local.get("trackedOrigins");
  const trackedOrigins = new Set(storedData.trackedOrigins || []);
  const allTargets = new Set([...deadDomains, ...trackedOrigins]);
  const survivingTracked = [];

  for (const domain of allTargets) {
    if (isWhitelisted(domain)) continue;

    // Check if domain is still active in any open tab
    const isOpen = [...activeDomains].some(
      active => matchesDomainOrSubdomain(active, domain) || matchesDomainOrSubdomain(domain, active)
    );

    if (isOpen) {
      survivingTracked.push(domain);
      continue;
    }

    // Purge site storage (LocalStorage, IndexedDB, Service Workers, Cache)
    chrome.browsingData.remove(
      {
        origins: [
          `https://${domain}`,
          `http://${domain}`,
          `https://www.${domain}`,
          `http://www.${domain}`
        ]
      },
      {
        cache: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true
      }
    );
  }

  // Persist only the origins that remain active
  await chrome.storage.local.set({ trackedOrigins: survivingTracked });

  console.log(`[Cleaner] Cycle complete: removed ${cookieDeleteCount} cookies. Purged storage for non-whitelisted closed origins.`);
}

function registerAlarm() {
  chrome.alarms.get(SWEEP_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
    }
  });
}

// Listeners
chrome.tabs.onRemoved.addListener(() => cleanDeadCookiesAndStorage());
chrome.runtime.onStartup.addListener(() => { registerAlarm(); cleanDeadCookiesAndStorage(); });
chrome.runtime.onInstalled.addListener(() => { registerAlarm(); cleanDeadCookiesAndStorage(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) cleanDeadCookiesAndStorage();
});
