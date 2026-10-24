I looked at the list of cookies I had in chrome, and there were 2500+ sites that had placed cookies.

I want to stay signed in to about 30 sites.  No one else should leave a cookie on my PC indefinitely.  There used to be several great chrome extensions to preserve a user created list of cookies to preserve and delete everything else.  These have broken.  So this little script accomplishes the same thing.

The easiest way to deploy: clone the git, rename list.example.js to list.js, edit it to add the sites whose cookies you want to preserve, and then in chrome, go to manage extensions, load unpacked, navigate to your cloned copy of chrome-cookie-cleaner and add it.

Here is what it does.  When you close a tab, it deletes the cookies of that URL unless the URL is in list.js.  Hourly, it goes through and deletes cookies and any other site data, always exempting URLs on list.js.  It only looks at TLDs, so sld.example.com cookies are cleared if example.com is not on list.js.

There are six other sites:

  "akamai.com",
  "akamaized.net",
  "cloudflare.com",
  "edgekey.net",
  "edgesuite.net",
  "fastly.net"

whose cookies are preserved.  Without these, CDNs flag the user as a bot.  For the same reason, some additional cookies with particular token prefixes

  "_abck",
  "ak_bmsc",
  "bm_sz",
  "bm_sv",
  "cf_clearance",
  "__cf_bm"

  are also preserved.  You can edit this in background.js if you want to change it, at the risk of being flagged as a bot.

  This is vibe-coded but tested on my Ubuntu system.
