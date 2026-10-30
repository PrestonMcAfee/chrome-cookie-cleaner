# Tab-Close Cookie Cleaner

A lightweight, automated privacy extension for Google Chrome (Manifest V3) that systematically purges non-whitelisted tracking cookies, origin-bound site storage, and lingering permission entries whenever tabs close or via hourly sweeps.

---

## Features

- **Automated Tab-Close Cleanup:** Immediately wipes non-whitelisted site data as soon as all tabs for a given host are closed.
- **Hourly Sweeps:** Periodically audits active tabs and sweeps dead session remnants.
- **Deep Origin Storage Wipe:** Purges `LocalStorage`, `IndexedDB`, `CacheStorage`, `Service Workers`, and `WebSQL` across untrusted origins.
- **Tombstone & Ghost Entry Removal:** Resets permission and content setting records (`notifications`, `sound`, `protectedContent`, `popups`, etc.) to default, preventing empty 0-byte shells from cluttering `chrome://settings/content/all`.
- **CHIPS & Partition-Aware:** Safely evicts third-party partitioned cookies (e.g., embedded YouTube players on non-whitelisted websites) once the host site closes, while preserving legitimate sessions on whitelisted platforms.
- **WAF & Edge CDN Protection:** Built-in safeguards preserve Akamai and Cloudflare edge bot-defense tokens (`_abck`, `ak_bmsc`, `cf_clearance`, `__cf_bm`) to prevent false-positive access blocks on protected websites.
- **Cloud Whitelist Sync:** Whitelist entries are managed via an Options UI and synchronized across signed-in browsers using `chrome.storage.sync`.

---

## Installation

### From Chrome Web Store
*(Link will be available upon publication review approval)*

### Manual / Developer Mode (Local)
1. Clone this repository:
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/chrome-cookie-cleaner.git ~/.local/share/chrome-cookie-cleaner