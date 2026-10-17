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
  "united.com",
  "ups.com",
  "usps.com",
  "viwoods.com",
  "walmart.com",
  "youtube.com"
]);

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

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // 1. Gather all currently open domains across all tabs and windows
  const openTabs = await chrome.tabs.query({});
  const activeDomains = new Set();
  
  for (const tab of openTabs) {
    if (tab.url) {
      const domain = getDomainFromUrl(tab.url);
      if (domain) activeDomains.add(domain);
    }
  }

  // 2. Fetch all cookies (including partitioned ones)
  const allCookies = await chrome.cookies.getAll({ partitionKey: {} });
  const deadDomains = new Set();

  for (const cookie of allCookies) {
    const cookieDomain = normalizeDomain(cookie.domain);
    
    // Check if the cookie belongs to a partitioned top-level site
    let topLevelSiteDomain = null;
    if (cookie.partitionKey && cookie.partitionKey.topLevelSite) {
      topLevelSiteDomain = getDomainFromUrl(cookie.partitionKey.topLevelSite);
    }

    // If partitioned under a non-whitelisted site that is no longer open, delete it
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

    // Build removal parameters
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

  // 3. Clear lingering site data (LocalStorage, IndexedDB, Cache) for closed origins
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
});