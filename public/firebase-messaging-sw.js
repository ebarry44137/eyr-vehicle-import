/* E&R Vehicle Import · V39.7.0 · Firebase Cloud Messaging */
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyCiiIWhj8Hfh8vau0Qc_KQZTwiIFiRQ0ow",
  authDomain: "eyr-vehicle-import.firebaseapp.com",
  projectId: "eyr-vehicle-import",
  storageBucket: "eyr-vehicle-import.firebasestorage.app",
  messagingSenderId: "935877997082",
  appId: "1:935877997082:web:e15c7d108fa27189a7d7a3",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  const title = data.title || "E&R Vehicle Import";

  self.registration.showNotification(title, {
    body: data.body || "Tenés una nueva notificación.",
    icon: "/branding/icon-192.png",
    badge: "/branding/icon-192.png",
    tag: data.tag || "eyr-fcm",
    renotify: data.renotify === "true",
    data: {
      url: data.url || "/app",
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/app";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            if ("navigate" in client) await client.navigate(targetUrl);
            return client.focus();
          }
        }

        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
