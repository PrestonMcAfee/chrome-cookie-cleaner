# Tab-Close Cookie & Site Data Cleaner

A lightweight, zero-telemetry Manifest V3 Chrome extension that automatically purges non-whitelisted cookies, LocalStorage, IndexedDB, and browser cache when tabs close and during a recurring sweep.

---

## Why This Exists

After inspecting Chrome's stored site settings and finding **2,500+ sites** persistently storing cookies and local data, I built this extension. 

Most people only need to remain logged in to 20–30 core services. No other website has a legitimate reason to leave persistent identifiers or site data on your machine indefinitely. Previous Manifest V2 extensions that handled this well have largely broken or introduced telemetry and paywalls. 

This extension restores that exact functionality with a clean, fully auditable script.

---

## How It Works

* **Immediate Tab-Close Cleanup:** When you close a tab, the extension removes cookies and site storage for that domain unless it matches your whitelist or remains active in another open tab.
* **Hourly Storage & CHIPS Sweep:** An automated hourly alarm inspects all stored cookies (including CHIPS partitioned cookies) and non-whitelisted client-side storage (HTML5 `localStorage`, `indexedDB`, and cache). Any orphan data left by background fetches or closed windows is pruned.
* **Apex Domain Matching:** Safe entries match recursively. Adding `example.com` automatically protects `subdomain.example.com`, `auth.example.com`, and `www.example.com`.

---

## Built-In Anti-Bot / CDN Safeguards

Modern websites heavily rely on edge networks and Web Application Firewalls (WAFs). Wiping edge verification tokens mid-session causes Cloudflare and Akamai to trigger continuous CAPTCHAs or HTTP 403 access blocks.

To prevent broken browsing, `background.js` automatically shields:

1. **Edge Infrastructure Domains:**
   * `akamai.com`, `akamaized.net`, `cloudflare.com`, `edgekey.net`, `edgesuite.net`, `fastly.net`
2. **WAF & Verification Cookie Tokens:**
   * Tokens prefixed with `_abck`, `ak_bmsc`, `bm_sz`, `bm_sv`, `cf_clearance`, and `__cf_bm`.

---

## Installation & Setup

### 1. Clone and Configure Your Whitelist

```bash
git clone [https://github.com/PrestonMcAfee/chrome-cookie-cleaner.git](https://github.com/PrestonMcAfee/chrome-cookie-cleaner.git) ~/.local/share/chrome-cookie-cleaner
cd ~/.local/share/chrome-cookie-cleaner

# Create your private whitelist from the template
cp list.example.js list.js
