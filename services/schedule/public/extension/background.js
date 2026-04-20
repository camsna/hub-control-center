// Hub Schedule Auth — background service worker
// Watches for EventTemple login, syncs cookies to the Pi

const PI_ENDPOINTS = [
  'http://tech.thehub/schedule/api/auth',
  'http://100.98.118.40:8090/api/auth',
  'http://10.0.81.231:8090/api/auth'
];

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
let lastSync = 0;

// Watch for completed navigations on eventtemple.com
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.includes('eventtemple.com')) return;
  if (tab.url.includes('/login')) return;

  const now = Date.now();
  if (now - lastSync < COOLDOWN_MS) {
    console.log('[Hub Auth] Skipping — cooldown active');
    return;
  }

  console.log('[Hub Auth] EventTemple page detected:', tab.url);
  syncCookies();
});

async function syncCookies() {
  try {
    // Grab cookies from ALL eventtemple subdomains
    // getAll with domain matches that domain AND all subdomains
    const allCookies = await chrome.cookies.getAll({ domain: 'eventtemple.com' });

    // Also explicitly grab from known subdomains in case the broad query misses them
    const clientCookies = await chrome.cookies.getAll({ domain: 'client.eventtemple.com' });
    const appCookies = await chrome.cookies.getAll({ domain: 'app.eventtemple.com' });

    // Deduplicate by name+domain+path
    const seen = new Set();
    const cookies = [];
    for (const c of [...allCookies, ...clientCookies, ...appCookies]) {
      const key = `${c.name}|${c.domain}|${c.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        cookies.push(c);
      }
    }

    console.log(`[Hub Auth] Found ${cookies.length} cookies (${allCookies.length} base + ${clientCookies.length} client + ${appCookies.length} app, deduped)`);

    if (!cookies.length) {
      setBadge('!', '#ff4444');
      console.warn('[Hub Auth] No cookies found');
      return;
    }

    const payload = {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate || -1,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite
      }))
    };

    let synced = false;
    for (const endpoint of PI_ENDPOINTS) {
      try {
        console.log(`[Hub Auth] Trying ${endpoint}...`);
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          console.log(`[Hub Auth] ${endpoint} returned ${resp.status}`);
          continue;
        }
        const result = await resp.json();
        if (result.ok) {
          synced = true;
          lastSync = Date.now();
          console.log(`[Hub Auth] Synced ${cookies.length} cookies via ${endpoint}`);
          setBadge('\u2713', '#10b981');
          setTimeout(() => setBadge('', ''), 10000);
          break;
        }
      } catch (e) {
        console.log(`[Hub Auth] ${endpoint} failed:`, e.message);
        continue;
      }
    }

    if (!synced) {
      setBadge('!', '#ff4444');
      console.warn('[Hub Auth] Failed to sync to any endpoint');
    }
  } catch (e) {
    setBadge('!', '#ff4444');
    console.error('[Hub Auth] Error:', e);
  }
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
  } catch (e) {
    console.log('[Hub Auth] Badge update failed:', e.message);
  }
}
