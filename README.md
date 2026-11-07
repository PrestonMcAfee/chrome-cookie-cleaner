# Tab-Close Cookie Cleaner

A fast, deterministic, absolutely private extension for Google Chrome (Manifest V3) that systematically cleans non-whitelisted cookies, origin-bound site storage, and lingering permissions whenever unwhitelisted tabs close or on manual sweep.

Its architecture simulates the behavior of clicking the trash can icon on Chrome's native `chrome://settings/content/all` page for closed, non-whitelisted sites, while intelligently trimming multi-gigabyte media and service worker asset caches on whitelisted platforms without logging you out.

As a practical matter, there are several dozen sites users want to stay logged into. Over months of routine browsing, Chrome will report thousands of sites have placed cookies on your machine, consuming multiple gigabytes of storage (much of which is cached media and offline issue bundles from news outlets like *The New York Times*). Under Manifest V2, several extensions supported automatic cookie elimination, but most were broken by Manifest V3. This extension restores that capability: it permits cookies for long-term storage strictly on your whitelist and eliminates the rest when you press the sweep button or when the tabs that displayed the site close.

It is 100% private: it does not record browsing behavior and transmits nothing over the internet.

---

## How It Works: The Three-List Model

The extension operates on a clean, deterministic three-list comparison:

1. **List 1 (Whitelist):** User-defined allowed domains configured in the Options page and synced via `chrome.storage.sync`.
2. **List 2 (Stored Domains):** Registrable root domains actively stored in Chrome, discovered dynamically by scanning all standard cookies, partitioned cookies (CHIPS), and permission overrides.
3. **List 3 (Open Tab Domains):** Registrable root domains of all currently open browser tabs.

### Event Triggers

- **Tab Closure (`chrome.tabs.onRemoved`):**
  - When a tab closes, the extension waits **1000ms** to allow redirects, session handshakes, and tab states to settle.
  - **Unwhitelisted Sites:** If no other open tab shares that registrable domain (List 3) and it is not on the user's whitelist (List 1), the extension performs a targeted purge on that domain.
  - **Whitelisted Sites (Cache Trim):** If a closed tab belongs to a whitelisted domain and no other tabs for that domain remain open, it purges bloated `CacheStorage` and media assets while preserving authentication cookies, `LocalStorage`, and active worker registrations.
  - A secondary follow-up permission sweep runs at **5000ms** to clean late flushes from service workers, store locators, or sensors.
- **Manual Sweep ("Run Sweep Now"):**
  - Evaluates all stored domains in List 2.
  - Any domain not present in List 1 (Whitelist) or List 3 (Active Open Tabs) is purged.
  - Whitelisted domains without open tabs have their bloated asset and offline service worker caches trimmed.
  - Accurately reports the exact number of cookies removed, sites purged, and whitelisted caches trimmed.

---

## What Happens During a Purge?

### 1. Unwhitelisted Domains (Full Trash Can Execution)
Executing a purge on an unwhitelisted domain performs the exact programmatic equivalent of clicking the trash can in `chrome://settings/content/all`:
- **Complete Storage and Cookie Purge:** Issues a scoped `chrome.browsingData.remove` across the target domain and origin variants (`https://`, `http://`, `https://www.`, `http://www.`), evicting cookies, `LocalStorage`, `IndexedDB`, `CacheStorage`, `Service Workers`, `FileSystems`, and `WebSQL`.
- **Permission Reset & Ghost Row Cleanup:** Resets all custom permission overrides back to `default` across standard and modern content setting categories (`location`, `notifications`, `sensors`, `storageAccess`, `localFonts`, `idleDetection`, `windowManagement`, `camera`, `microphone`, `popups`, `sound`, etc.) to eliminate 0-byte ghost rows from site settings.

### 2. Whitelisted Domains (Asset Cache Trimming)
- When enabled in Options, whitelisted domains that are fully closed have their `cache`, `cacheStorage`, and virtual `fileSystems` cleared.
- `cookies`, `localStorage`, and `serviceWorkers` are strictly preserved, freeing gigabytes of cached media without forcing you to log in again.

---

## File Structure

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

---

## Manual Installation & Local Setup

1. **Clone or Download:**
   ```bash
   git clone https://github.com/rpmcafee/chrome-cookie-cleaner.git ~/.local/share/chrome-cookie-cleaner
   cd ~/.local/share/chrome-cookie-cleaner
   ```
2. **Load in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** in the top-right corner.
   - Click **Load unpacked** in the top-left corner.
   - Select the `~/.local/share/chrome-cookie-cleaner` folder.
3. **Applying Updates:**
   - After editing or pulling changes, click the circular **Reload** icon on the extension's card in `chrome://extensions/`.

---

## Usage

### Toolbar Popup
Click the extension cookie icon in your toolbar:
- **⚙️ Edit Whitelist:** Opens the Options page in a new browser tab.
- **🧹 Run Sweep Now:** Evaluates stored domains against open tabs and the whitelist, clearing all dead site storage, trimming closed whitelisted caches, and displaying an itemized summary.

### Options Page
- **Whitelist Configuration:** Enter base domains (e.g., `amazon.com`, `github.com`) you wish to stay logged into (one per line). Subdomains (such as `docs.google.com` under `google.com`) are shielded automatically.
- **Cache Trimming Toggle:** Check or uncheck *Purge bloated media and service worker caches on whitelisted sites* to control whether closed whitelisted origins have their heavy offline caches reclaimed.
- **Cross-Device Sync:** Settings synchronize automatically across signed-in Chrome browsers using `chrome.storage.sync`.

---

## Permissions

| Permission | Purpose |
| :--- | :--- |
| `cookies` & `<all_urls>` | Discovers stored domains and deletes non-whitelisted cookies. |
| `browsingData` | Purges origin storage (`LocalStorage`, `IndexedDB`, `CacheStorage`, service workers) for unwhitelisted closed domains, and trims asset caches on closed whitelisted domains. |
| `contentSettings` | Resets permissions to default to prevent 0-byte ghost entries in `chrome://settings/content/all`. |
| `storage` | Persists and syncs the user's whitelist and options via `chrome.storage.sync`. |
| `tabs` | Tracks domain presence across open tabs so active sessions are never interrupted. |

---

## Privacy Policy

**Effective Date:** October 31, 2026

1. **100% Local Execution:** All evaluation and cleanup operations run locally in your browser. The extension never collects, monitors, transmits, or logs browsing history, cookies, or personal data.
2. **No Analytics or Network Calls:** The extension makes zero remote network requests and contains no tracking libraries.
3. **Storage Usage:** Chrome sync storage is used exclusively to store the user-defined whitelist and preferences.
4. **No Data Monetization:** No user data is ever collected, sold, or shared.

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