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
  "mcafee.cc",
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

// Master cleanup routine
async function cleanDeadCookies() {
  // 1. Gather all domains currently visible across any open tab
  const openTabs = await chrome.tabs.query({});
  const activeDomains = new Set();
  
  for (const tab of openTabs) {
    if (tab.url) {
      const domain = getDomainFromUrl(tab.url);
      if (domain) activeDomains.add(domain);
    }
  }

  // 2. Scan all stored cookies (including partitioned)
  const allCookies = await chrome.cookies.getAll({ partitionKey: {} });
  const deadDomains = new Set();

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
    const path = cookie.path.startsWith("/") ? cookie.path : "/" + cookie.path;
    const url = `${protocol}${cookieDomain}${path}`;

    const removeDetails = {
      url: url,
      name: cookie.name,
      storeId: cookie.storeId
    };

    if (cookie.partitionKey) {
      removeDetails.partitionKey = cookie.partitionKey;
    }

    try {
      await chrome.cookies.remove(removeDetails);
    } catch (err) {
      // Ignore stale handles
    }
  }

  // 3. Sweep LocalStorage/IndexedDB for origins no longer open
  for (const domain of deadDomains) {
    if (isWhitelisted(domain)) continue;

    chrome.browsingData.remove(
      {
        origins: [`https://${domain}`, `http://${domain}`]
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
}

// Ensure the hourly alarm exists
function registerAlarm() {
  chrome.alarms.get(SWEEP_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 });
    }
  });
}

// Trigger points:
// 1. On tab close
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  cleanDeadCookies();
});

// 2. On browser startup
chrome.runtime.onStartup.addListener(() => {
  registerAlarm();
  cleanDeadCookies();
});

// 3. On install or extension reload
chrome.runtime.onInstalled.addListener(() => {
  registerAlarm();
  cleanDeadCookies();
});

// 4. On recurring alarm tick
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) {
    cleanDeadCookies();
  }
});
