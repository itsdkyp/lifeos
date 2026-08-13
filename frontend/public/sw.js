// ponytail: network-first passthrough SW — satisfies Chrome's PWA install
// criterion (requires a registered SW) with zero caching risk. LifeOS is a
// personal data app; stale cached data is worse than a network error.
// Upgrade to a caching strategy if offline support is ever explicitly wanted.
self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
self.addEventListener("fetch",    (e) => e.respondWith(fetch(e.request)));
