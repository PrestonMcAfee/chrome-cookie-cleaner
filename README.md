# Tab-Close Cookie Cleaner

A fast, deterministic, absolutely private, extension for Google Chrome (Manifest V3) that systematically cleans non-whitelisted cookies, origin-bound site storage, and lingering permissions whenever unwhitelisted tabs close or on manual sweep.

Its architecture simulates the behavior of clicking the trash can icon on Chrome's native `chrome://settings/content/all` page for closed, non-whitelisted sites.

As a practical matter, there are 32 sites I want to stay logged into.  Two months of browsing and Chrome will report 2500 sites have placed cookies on my PC, using nearly 2GB of storage (most of which was the New York Times, which seems to store entire issues as cookies).  Under Manifest V2, there were several extensions supporting the automatic elimination of undesired cookies, most or all of which were broken by V3.  So this little extension fixes that -- it takes your list of cookies that are permitted for long-term storage and eliminates the rest, either when you press the sweep button, or when the tabs that displayed the site close.  

It is 100% private to you: it doesn't record your behavior and sends nothing to the internet.  All it does is shut down undesired storage.  

Application for the chrome web store is currently pending.

---

## How It Works: The Three-List Model

The extension operates on a clean, deterministic three-list comparison:

1. **List 1 (Whitelist):** User-defined allowed domains configured in the Options page and synced via `chrome.storage.sync`.
2. **List 2 (Stored Domains):** Registrable root domains actively stored in Chrome, discovered dynamically by scanning all standard cookies, partitioned cookies (CHIPS), and permission overrides.
3. **List 3 (Open Tab Domains):** Registrable root domains of all currently open browser tabs.

### Event Triggers

- **Tab Closure (`chrome.tabs.onRemoved`):**
  - When an unwhitelisted tab closes, the extension waits **1000ms** to allow redirects, session handshakes, and tab states to settle.
  - If no other open tab shares that registrable domain (List 3) and it is not on the user's whitelist (List 1), the extension performs a targeted purge on that domain.
  - A secondary follow-up permission sweep runs at **5000ms** to clean late flushes from service workers, store locators, or sensors.
- **Manual Sweep ("Run Sweep Now"):**
  - Evaluates all stored domains in List 2.
  - Any domain not present in List 1 (Whitelist) or List 3 (Active Open Tabs) is purged.
  - Accurately reports the exact number of cookies and sites eliminated.

---

## What Happens During a Purge?

Purging a domain executes the exact programmatic equivalent of clicking the trash can in `chrome://settings/content/all`:

1. **Complete Storage and Cookie Purge:**
   - Issues a scoped `chrome.browsingData.remove` across the target domain and origin variants (`https://`, `http://`, `https://www.`, `http://www.`).
   - Evicts cookies, `LocalStorage`, `IndexedDB`, `CacheStorage`, `Service Workers`, `FileSystems`, and `WebSQL`.
2. **Permission Reset & Ghost Row Cleanup:**
   - Resets all custom permission overrides back to `default` across standard and modern content setting categories (`location`, `notifications`, `sensors`, `storageAccess`, `localFonts`, `idleDetection`, `windowManagement`, `camera`, `microphone`, `popups`, `sound`, etc.).
   - Eliminates 0-byte ghost entries from cluttering Chrome's site settings.

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

## Manual Installation & Setup

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
- **🧹 Run Sweep Now:** Evaluates stored domains against open tabs and the whitelist, clearing all dead site storage and displaying the exact count of cleaned cookies and sites.

### Options Page
- Enter base domains (e.g. amazon.com) you wish to stay logged into (one per line, e.g., `google.com`, `amazon.com`, `github.com`).  There are few there to get you started but you may delete any whose cookies you don't want to persist.
- **Subdomain Protection:** Whitelisting `google.com` automatically protects `mail.google.com`, `docs.google.com`, etc. but not gmail.com
- **Cross-Device Sync:** Settings synchronize automatically across signed-in Chrome browsers using `chrome.storage.sync`.

---

## Permissions

| Permission | Purpose |
| :--- | :--- |
| `cookies` & `<all_urls>` | Discovers stored domains and deletes non-whitelisted cookies. |
| `browsingData` | Purges origin storage (`LocalStorage`, `IndexedDB`, `CacheStorage`, service workers) for unwhitelisted closed domains. |
| `contentSettings` | Resets permissions to default to prevent 0-byte ghost entries in `chrome://settings/content/all`. |
| `storage` | Persists and syncs the user's whitelist via `chrome.storage.sync`. |
| `tabs` | Tracks domain presence across open tabs so active sessions are never interrupted. |

---

## Privacy Policy

**Effective Date:** October 31, 2026

1. **100% Local Execution:** All evaluation and cleanup operations run locally in your browser. The extension never collects, monitors, transmits, or logs browsing history, cookies, or personal data.
2. **No Analytics or Network Calls:** The extension makes zero remote network requests and contains no tracking libraries.
3. **Storage Usage:** Chrome sync storage is used exclusively to store the user-defined whitelist.
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
