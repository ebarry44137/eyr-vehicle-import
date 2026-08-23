import { useEffect, useMemo, useState } from "react";

function urlBase64ToUint8Array(base64String) {
  const padding =
    "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((char) => char.charCodeAt(0))
  );
}

export default function AdminNotificationBell({
  supabase,
  userId,
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState("UNKNOWN");
  const [pushLoading, setPushLoading] = useState(false);

  const unread = useMemo(
    () => items.filter((item) => !item.is_read).length,
    [items]
  );

  async function loadNotifications() {
    if (!userId) return;

    const { data, error } = await supabase.rpc(
      "admin_list_internal_notifications",
      { p_limit: 25 }
    );

    if (!error) {
      setItems(data || []);
    }
  }

  useEffect(() => {
    if (!userId) return;

    loadNotifications();

    const timer = window.setInterval(
      loadNotifications,
      30000
    );

    if ("Notification" in window) {
      setPushState(Notification.permission);
    }

    return () => window.clearInterval(timer);
  }, [userId]);

  async function markRead(notificationId) {
    const { error } = await supabase.rpc(
      "admin_mark_notification_read",
      { p_notification_id: notificationId }
    );

    if (!error) {
      setItems((previous) =>
        previous.map((item) =>
          item.id === notificationId
            ? { ...item, is_read: true }
            : item
        )
      );
    }
  }

  async function enablePush() {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setPushState("UNSUPPORTED");
      return;
    }

    const publicKey =
      import.meta.env.VITE_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setPushState("MISSING_KEY");
      return;
    }

    setPushLoading(true);

    try {
      const permission =
        await Notification.requestPermission();

      setPushState(permission);

      if (permission !== "granted") return;

      const registration =
        await navigator.serviceWorker.register(
          "/push-sw.js"
        );

      await navigator.serviceWorker.ready;

      let subscription =
        await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription =
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey:
              urlBase64ToUint8Array(publicKey),
          });
      }

      const json = subscription.toJSON();

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: json?.keys?.p256dh || null,
            auth: json?.keys?.auth || null,
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" }
        );

      if (error) throw error;

      setPushState("granted");
    } catch (err) {
      console.error("PUSH REGISTRATION ERROR:", err);
      setPushState("ERROR");
    } finally {
      setPushLoading(false);
    }
  }

  return (
    <div className="admin-notification-center">
      <button
        type="button"
        className="admin-notification-trigger"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) loadNotifications();
        }}
        aria-label="Notificaciones"
      >
        🔔
        {unread > 0 && (
          <b>{unread > 9 ? "9+" : unread}</b>
        )}
      </button>

      {open && (
        <div className="admin-notification-panel">
          <header>
            <div>
              <span>CENTRO DE ALERTAS</span>
              <h3>Notificaciones</h3>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          {pushState !== "granted" && (
            <div className="push-enable-card">
              <div>
                <strong>🔔 Activá notificaciones push</strong>
                <p>
                  Recibí nuevas solicitudes aduanales
                  aunque estés trabajando en otra pestaña.
                </p>
              </div>

              <button
                type="button"
                onClick={enablePush}
                disabled={pushLoading}
              >
                {pushLoading ? "Activando..." : "Activar"}
              </button>
            </div>
          )}

          <div className="admin-notification-list">
            {items.length === 0 && (
              <div className="notification-empty">
                No hay notificaciones todavía.
              </div>
            )}

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-notification-item ${
                  item.is_read ? "" : "unread"
                }`}
                onClick={() => markRead(item.id)}
              >
                <span className="notification-dot"></span>

                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>
                    {item.created_at
                      ? new Date(
                          item.created_at
                        ).toLocaleString("es-GT")
                      : ""}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
