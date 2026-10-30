# Tab-Close Cookie Cleaner

A lightweight, automated privacy extension for Google Chrome (Manifest V3) that systematically purges non-whitelisted tracking cookies, origin-bound site storage, and lingering permission entries whenever tabs close or via periodic maintenance sweeps.

---

## Features

- **Automated Tab-Close Cleanup:** Immediately wipes non-whitelisted site data as soon as all open tabs for a given host are closed.
- **Hourly Sweeps:** Periodically audits active tabs and sweeps dead session remnants in the background.
- **Deep Origin Storage Purge:** Expunges `LocalStorage`, `IndexedDB`, `CacheStorage`, `Service Workers`, and `WebSQL` across untrusted origins.
- **Tombstone & Ghost Entry Removal:** Resets custom content settings (`notifications`, `sound`, `protectedContent`, `popups`, etc.) to default, preventing empty 0-byte shells from cluttering `chrome://settings/content/all`.
- **CHIPS & Partition-Aware:** Safely evicts third-party partitioned cookies (e.g., embedded YouTube players on non-whitelisted websites) once the host site closes, while preserving legitimate sessions on whitelisted platforms.
- **WAF & Edge CDN Protection:** Built-in safeguards preserve Akamai and Cloudflare edge bot-defense tokens (`_abck`, `ak_bmsc`, `cf_clearance`, `__cf_bm`) to prevent false-positive access blocks on protected websites.
- **Cloud Whitelist Sync:** Whitelist entries are managed via an Options UI and synchronized across signed-in browsers using `chrome.storage.sync`.

---

## Manual Implementation & Local Setup

If you prefer to run or build the extension locally from source without using the Chrome Web Store:

### 1. File Structure
Ensure your local project directory contains the following files:

```text
chrome-cookie-cleaner/
├── manifest.json
├── background.js
├── options.html
├── options.js
├── popup.html
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### 2. Clone the Repository
Clone the repository to your local system:

```bash
git clone https://github.com/rpmcafee/chrome-cookie-cleaner.git ~/.local/share/chrome-cookie-cleaner
cd ~/.local/share/chrome-cookie-cleaner
```

### 3. Load into Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Turn on the **Developer mode** toggle located in the upper-right corner.
3. Click the **Load unpacked** button in the upper-left corner.
4. Select the `chrome-cookie-cleaner` directory (`~/.local/share/chrome-cookie-cleaner`).
5. The extension will appear in your installed extensions list and register its background service worker immediately.

### 4. Updating Local Code
Whenever you pull updates or edit files locally:
1. Open `chrome://extensions/`.
2. Locate **Tab-Close Cookie Cleaner**.
3. Click the circular **Reload** icon on the extension's card to re-initialize the service worker.

---

## Usage

### Toolbar Popup
Click the extension icon in the Chrome toolbar:
- **⚙️ Edit Whitelist:** Opens the dedicated settings page in a new browser tab.
- **🧹 Run Sweep Now:** Triggers an immediate audit and cleanup cycle across all cookies and site storage.

### Options Page & Whitelist Configuration
In the Options page, list the base domains you wish to stay logged into (one per line, e.g., `google.com`, `github.com`):
- **Automatic Subdomain Shielding:** Entering `google.com` shields `mail.google.com`, `docs.google.com`, and all other subdomains.
- **Edge Routing Infrastructure:** Essential CDN verification domains (`cloudflare.com`, `akamai.com`, `fastly.net`, etc.) are protected automatically to prevent site verification loops.
- **Automatic Sync:** Click **Save Settings** to synchronize your whitelist across all Chrome browsers signed into your profile via `chrome.storage.sync`.

---

## Permissions & Scope

| Permission | Purpose |
| :--- | :--- |
| `cookies` & `<all_urls>` | Allows reading and deleting non-whitelisted standard and partitioned cookies across visited websites once tabs close. |
| `browsingData` | Allows clearing origin-bound storage (`LocalStorage`, `IndexedDB`, `CacheStorage`, `Service Workers`) for non-whitelisted hosts. |
| `contentSettings` | Allows clearing custom site permission overrides to prevent empty 0-byte shell rows in Chrome settings. |
| `storage` | Allows saving and synchronizing the user's whitelist across devices using `chrome.storage.sync`. |
| `tabs` | Allows detecting active domains in open tabs so active browsing sessions are never interrupted. |
| `alarms` | Allows scheduling periodic hourly sweeps to clean abandoned background storage. |

---

## Privacy Policy

**Effective Date:** October 30, 2026

Tab-Close Cookie Cleaner operates under strict privacy-by-design standards:

1. **Local Processing Only:** All evaluation and cleanup routines run entirely offline on your local machine. The extension never collects, records, monitors, or logs your browsing history, credentials, cookies, or personal data.
2. **Zero Remote Telemetry:** The extension contains no tracking code, analytics libraries, or external network requests.
3. **Storage Usage:** The `chrome.storage` API is used exclusively to store user-defined whitelisted domains and synchronizes solely via Google Chrome's native account sync engine.
4. **No Data Monetization or Transfer:** No user data is ever sold, transferred, monetized, or shared with third parties.

---

## License

MIT License

Copyright (c) 2026 R. Preston McAfee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.