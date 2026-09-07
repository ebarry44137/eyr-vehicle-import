import { useEffect, useState } from "react";
import {
  getFirebasePushStatus,
  registerFirebaseDevice,
} from "./firebaseMessagingCompat";

export default function FirebasePushActivation({
  supabase,
  compact = false,
  title = "Activá las notificaciones",
  description = "Recibí alertas importantes aunque E&R esté cerrado.",
  onRegistered,
}) {
  const [status, setStatus] = useState({
    state: "CHECKING",
    permission: "default",
    registered: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshStatus() {
    const next = await getFirebasePushStatus({ supabase });
    setStatus(next);
    return next;
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  async function enable() {
    setLoading(true);
    setMessage("");

    try {
      const result = await registerFirebaseDevice({ supabase });

      if (result.permission === "granted") {
        const next = await refreshStatus();

        if (next.registered) {
          setMessage("✅ Dispositivo registrado correctamente.");
          window.dispatchEvent(
            new CustomEvent("eyr:fcm-device-registered")
          );
          onRegistered?.(next);
        } else {
          setMessage(
            "El permiso está activo, pero el dispositivo todavía no quedó registrado en E&R."
          );
        }
      } else if (result.permission === "denied") {
        setMessage(
          "Las notificaciones están bloqueadas en este navegador. Habilitalas desde los permisos del sitio."
        );
      }
    } catch (error) {
      console.error("FCM ACTIVATION ERROR:", error);
      setMessage(
        error?.message || "No fue posible registrar este dispositivo."
      );
    } finally {
      setLoading(false);
    }
  }

  // V39.7.3.3 · Ocultar tarjeta si Push no es compatible
  if (status.state === "UNSUPPORTED") {
    return null;
  }

  // Si el dispositivo ya está registrado, no ocupar espacio innecesario
  if (status.registered) {
    return null;
  }

  return (
    <div className={`fcm-activation-card ${compact ? "compact" : ""}`}>
      <div className="fcm-activation-icon">🔔</div>

      <div className="fcm-activation-copy">
        <strong>{title}</strong>
        <p>{description}</p>

        {status.state === "PERMISSION_ONLY" && (
          <small className="fcm-warning">
            El navegador ya tiene permiso, pero todavía falta registrar este
            dispositivo con Firebase.
          </small>
        )}

        {message && (
          <small className="fcm-message">
            {message}
          </small>
        )}
      </div>

      <button
        type="button"
        onClick={enable}
        disabled={loading}
      >
        {loading ? "Conectando..." : "Activar"}
      </button>
    </div>
  );
}