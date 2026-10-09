// sw.js — iFiNeX service worker (v8.0) — browser/PWA push only; the Android app uses its own native alert checker
// Only job: receive a push message from the browser's push service and
// show it as a notification. Registered by bill-tracker.html on load;
// actual permission + subscription only happens when the user taps
// "Enable notifications" (never auto-prompted — see push section of
// bill-tracker.html for why).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'iFiNeX', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'iFiNeX';
  const options = {
    body: data.body || '',
    icon: data.icon || './assets/notif-large-192.png', // iFiNeX logo served from this site (GitHub Pages) — no third-party CDN
    badge: data.badge || './assets/badge-96.png', // monochrome glyph for the status bar
    data: { url: data.url || './bill-tracker.html' },
    tag: data.tag || 'bill-tracker-notice', // same tag replaces older un-clicked notifications instead of stacking
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification focuses an existing tab if one's open, else opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './bill-tracker.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('bill-tracker.html') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
