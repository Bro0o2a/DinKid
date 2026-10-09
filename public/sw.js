// DinKin service worker: shows notifications and opens the right family when tapped.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Unread count for the number on the home screen icon (kept across restarts).
async function badgeCount(change) {
  const cache = await caches.open("dinkin-badge");
  const saved = await cache.match("/count");
  const count = change === 0 ? 0 : (saved ? Number(await saved.text()) : 0) + change;
  await cache.put("/count", new Response(String(count)));
  if (self.navigator.setAppBadge) {
    if (count > 0) await self.navigator.setAppBadge(count);
    else await self.navigator.clearAppBadge();
  }
}

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Skip it when that chat is already open on screen.
      const looking = windows.some(
        (w) => w.visibilityState === "visible" && w.focused && new URL(w.url).pathname === data.url,
      );
      if (looking) return;
      await badgeCount(1).catch(() => {});
      await self.registration.showNotification(data.title || "DinKin", {
        body: data.body,
        tag: data.tag,
        renotify: true,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => "focus" in w);
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
