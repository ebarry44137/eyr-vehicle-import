self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data
      ? event.data.json()
      : {};
  } catch (_error) {
    payload = {
      title: "E&R Vehicle Import",
      body: event.data?.text() || "Nueva notificación",
    };
  }

  const title =
    payload.title || "E&R Vehicle Import";

  const options = {
    body:
      payload.body || "Tenés una nueva notificación.",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag:
      payload.tag || "eyr-notification",
    data: {
      url:
        payload.url || "/app",
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const url =
      event.notification?.data?.url ||
      "/app";

    event.waitUntil(
      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((windowClients) => {
          for (const client of windowClients) {
            if (
              client.url.includes("/app") &&
              "focus" in client
            ) {
              client.navigate(url);
              return client.focus();
            }
          }

          if (clients.openWindow) {
            return clients.openWindow(url);
          }
        })
    );
  }
);
