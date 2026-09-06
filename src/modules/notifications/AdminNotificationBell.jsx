import { useEffect, useMemo, useState } from "react";
import {
  getFirebasePushStatus,
  listenForegroundMessages,
  registerFirebaseDevice,
} from "./firebaseMessagingCompat";

export default function AdminNotificationBell({
  supabase,
  userId,
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState("UNKNOWN");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  const unread = useMemo(
    () => items.filter((item) => !item.is_read).length,
    [items]
  );

  async function refreshPushState() {
    const status = await getFirebasePushStatus({ supabase });
    setPushState(status?.state || "UNKNOWN");
    return status;
  }

  async function loadNotifications() {
    if (!userId) return;

    const { data, error } = await supabase.rpc(
      "admin_list_internal_notifications",
      { p_limit: 25 }
    );

    if (!error) setItems(data || []);
  }

  useEffect(() => {
    if (!userId) return;

    let alive = true;
    let stopForeground = null;

    loadNotifications();

    const timer = window.setInterval(loadNotifications, 30000);

    refreshPushState().catch((error) => {
      console.warn("FCM status refresh pending:", error?.message);
    });

    const handleDeviceRegistered = () => {
      refreshPushState().catch((error) => {
        console.warn("FCM status refresh pending:", error?.message);
      });
    };

    window.addEventListener("eyr:fcm-device-registered", handleDeviceRegistered);

    listenForegroundMessages(async () => {
      await loadNotifications();
    })
      .then((stop) => {
        stopForeground = stop;
      })
      .catch((error) => {
        console.warn("FCM foreground listener pending:", error?.message);
      });

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("eyr:fcm-device-registered", handleDeviceRegistered);
      stopForeground?.();
    };
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
    setPushLoading(true);
    setPushMessage("");

    try {
      const result = await registerFirebaseDevice({ supabase });
      if (result.permission === "granted") {
        const status = await getFirebasePushStatus({ supabase });
        setPushState(status?.state || "UNKNOWN");

        if (!status?.registered) {
          throw new Error(
            "El navegador dio permiso, pero el dispositivo no quedó registrado en notification_devices."
          );
        }

        setPushMessage("✅ Este dispositivo ya quedó conectado con Firebase.");
      } else if (result.permission === "denied") {
        setPushMessage(
          "El navegador bloqueó las notificaciones. Podés habilitarlas desde los permisos del sitio."
        );
      }
    } catch (error) {
      console.error("FCM DEVICE REGISTRATION ERROR:", error);
      setPushState("ERROR");
      setPushMessage(error?.message || "No fue posible activar Firebase Push.");
    } finally {
      setPushLoading(false);
    }
  }

  async function sendTestPush() {
    setTestLoading(true);
    setPushMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error("Sesión requerida.");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-fcm-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "test_self" }),
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No fue posible enviar la prueba.");
      }

      setPushMessage(
        `✅ Push enviado a ${payload.sent || 0} dispositivo(s).`
      );
    } catch (error) {
      console.error("FCM TEST ERROR:", error);
      setPushMessage(error?.message || "Falló la prueba de Firebase Push.");
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="admin-notification-center">
      <button
        type="button"
        className="admin-notification-trigger"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            loadNotifications();
            refreshPushState().catch((error) => {
              console.warn("FCM status refresh pending:", error?.message);
            });
          }
        }}
        aria-label="Notificaciones"
      >
        🔔
        {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
      </button>

      {open && (
        <div className="admin-notification-panel">
          <header>
            <div>
              <span>CENTRO DE ALERTAS</span>
              <h3>Notificaciones</h3>
            </div>

            <button type="button" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          {pushState !== "REGISTERED" ? (
            <div className="push-enable-card">
              <div>
                <strong>🔥 Activá Firebase Push</strong>
                <p>
                  Recibí alertas de E&R aunque la plataforma esté cerrada.
                </p>
                {pushState === "PERMISSION_ONLY" && (
                  <small>
                    El permiso existe, pero este dispositivo todavía no está registrado en Firebase.
                  </small>
                )}
              </div>

              <button
                type="button"
                onClick={enablePush}
                disabled={pushLoading}
              >
                {pushLoading ? "Conectando..." : "Activar"}
              </button>
            </div>
          ) : (
            <div className="push-enable-card push-enabled-card">
              <div>
                <strong>✅ Firebase Push activo</strong>
                <p>Este navegador ya puede recibir notificaciones.</p>
              </div>

              <button
                type="button"
                onClick={sendTestPush}
                disabled={testLoading}
              >
                {testLoading ? "Enviando..." : "Probar push"}
              </button>
            </div>
          )}

          {pushMessage && (
            <div className="notification-push-message">{pushMessage}</div>
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
                      ? new Date(item.created_at).toLocaleString("es-GT")
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
