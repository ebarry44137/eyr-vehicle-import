import { useEffect, useMemo, useState } from "react";
import "./performance-check-in.css";

const DEVICE_KEY = "eyr-performance-device-v3985";

function getDeviceToken() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("es-GT", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PerformanceCheckIn({ supabase, userId }) {
  const [row, setRow] = useState(null);
  const [request, setRequest] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const deviceToken = useMemo(() => getDeviceToken(), []);

  async function loadToday() {
    if (!userId) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });

    const [{ data: attendance }, { data: requests }] = await Promise.all([
      supabase
        .from("performance_attendance")
        .select("*")
        .eq("user_id", userId)
        .eq("work_date", today)
        .maybeSingle(),
      supabase
        .from("performance_device_requests")
        .select("*")
        .eq("user_id", userId)
        .eq("device_token", deviceToken)
        .order("requested_at", { ascending: false })
        .limit(1),
    ]);

    setRow(attendance || null);
    setRequest(requests?.[0] || null);
  }

  useEffect(() => { loadToday(); }, [userId]);

  async function requestDevice() {
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("performance_request_device_v3986", {
        p_device_token: deviceToken,
        p_device_name: `PC · ${navigator.platform || "E&R"}`,
      });
      if (error) throw error;
      setRequest(data || { status: "PENDING" });
      setMessage(
        data?.status === "APPROVED"
          ? "✅ Esta computadora ya está autorizada."
          : "🕒 Solicitud enviada. Dirección debe autorizar esta computadora."
      );
    } catch (e) {
      setMessage(e?.message || "No fue posible solicitar autorización.");
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("performance_check_in_v3985", {
        p_device_token: deviceToken,
      });
      if (error) {
        if (String(error.message || "").includes("DEVICE_NOT_AUTHORIZED")) {
          await requestDevice();
          return;
        }
        throw error;
      }
      setRow(data);
      setMessage(data?.punctual ? "✅ Llegada registrada · Puntual" : "🕒 Llegada registrada.");
      await loadToday();
    } catch (e) {
      setMessage(e?.message || "No fue posible registrar la llegada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pci-card">
      <div className="pci-copy">
        <small>ASISTENCIA · E&R SOLUTIONS</small>
        <h3>{row ? "Llegada registrada" : "Registrar mi llegada"}</h3>
        <p>
          La marcación solo es válida desde una computadora autorizada por Dirección.
        </p>
        {request?.status === "PENDING" && !row && (
          <span className="pci-pending">🕒 PC pendiente de autorización</span>
        )}
        {message && <span className="pci-message">{message}</span>}
      </div>

      <div className="pci-action">
        {row ? (
          <>
            <strong className={row.punctual ? "ok" : "late"}>
              {row.punctual ? "✅ PUNTUAL" : "🕒 REGISTRADO"}
            </strong>
            <span>{formatTime(row.checked_in_at)}</span>
            {!row.punctual && Number(row.minutes_late || 0) > 0 && (
              <small>{row.minutes_late} min tarde</small>
            )}
          </>
        ) : (
          <button type="button" disabled={busy} onClick={checkIn}>
            {busy ? "Procesando..." : "🖥️ Registrar llegada"}
          </button>
        )}
      </div>
    </section>
  );
}
