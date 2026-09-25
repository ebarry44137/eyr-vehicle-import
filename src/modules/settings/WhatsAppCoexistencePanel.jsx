import { useEffect, useRef, useState } from "react";
import "./WhatsAppCoexistencePanel.css";

const META_APP_ID = "1089521176898352";
const EMBEDDED_SIGNUP_CONFIG_ID = "1352867536919004";

function safeParse(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

export default function WhatsAppCoexistencePanel() {
  const [sdkReady, setSdkReady] = useState(Boolean(window.FB));
  const [launching, setLaunching] = useState(false);
  const [status, setStatus] = useState("READY");
  const [detail, setDetail] = useState("Listo para iniciar una prueba segura de WhatsApp Business App Coexistence.");
  const [session, setSession] = useState(null);
  const receivedFinish = useRef(false);

  useEffect(() => {
    let active = true;

    const initFacebook = () => {
      if (!active || !window.FB) return;
      window.FB.init({
        appId: META_APP_ID,
        autoLogAppEvents: true,
        xfbml: false,
        version: "v26.0",
      });
      setSdkReady(true);
    };

    if (window.FB) {
      initFacebook();
    } else {
      window.fbAsyncInit = initFacebook;
      if (!document.getElementById("facebook-jssdk")) {
        const script = document.createElement("script");
        script.id = "facebook-jssdk";
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.src = "https://connect.facebook.net/es_LA/sdk.js";
        document.body.appendChild(script);
      }
    }

    const onMessage = (event) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/i.test(event.origin)) return;
      const payload = safeParse(event.data);
      if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") return;

      const data = payload.data || {};
      const eventName = String(payload.event || data.event || "").toUpperCase();

      if (eventName.includes("FINISH")) {
        receivedFinish.current = true;
        const next = {
          event: eventName,
          wabaId: data.waba_id || data.wabaId || null,
          phoneNumberId: data.phone_number_id || data.phoneNumberId || null,
          businessId: data.business_id || data.businessId || null,
        };
        setSession(next);
        setStatus("FINISHED");
        setDetail("Meta completó el onboarding. Todavía no se ha guardado ningún canal en E&R.");
      } else if (eventName.includes("CANCEL")) {
        setStatus("CANCELLED");
        setDetail("El onboarding fue cancelado. No se hizo ningún cambio en E&R.");
      } else if (eventName.includes("ERROR")) {
        setStatus("ERROR");
        setDetail(data.error_message || data.message || "Meta reportó un error durante el onboarding.");
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, []);

  function launchCoexistence() {
    if (!window.FB || !sdkReady) {
      setStatus("ERROR");
      setDetail("El SDK de Meta todavía no está listo. Esperá unos segundos e intentá nuevamente.");
      return;
    }

    receivedFinish.current = false;
    setLaunching(true);
    setSession(null);
    setStatus("OPENING");
    setDetail("Abriendo el registro insertado de Meta…");

    window.FB.login(
      (response) => {
        setLaunching(false);

        if (receivedFinish.current) return;

        if (response?.authResponse?.code) {
          setStatus("CODE_RECEIVED");
          setDetail("Meta devolvió autorización, pero no confirmó un onboarding de Coexistence. No se guardó ni migró ningún número.");
          return;
        }

        setStatus("CANCELLED");
        setDetail("La ventana se cerró o Meta no completó el flujo. No se hizo ningún cambio.");
      },
      {
        config_id: EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  const badge = {
    READY: "Listo",
    OPENING: "Abriendo…",
    FINISHED: "Onboarding detectado",
    CODE_RECEIVED: "Revisión necesaria",
    CANCELLED: "Cancelado",
    ERROR: "Error",
  }[status] || status;

  return (
    <section className="wa-coexist-card">
      <div className="wa-coexist-head">
        <div className="wa-coexist-icon">📲</div>
        <div>
          <span className="section-label">WHATSAPP CLOUD API</span>
          <h2>WhatsApp Business corporativo</h2>
          <p>Prueba controlada para vincular la app de WhatsApp Business existente mediante Embedded Signup.</p>
        </div>
        <span className={`wa-coexist-badge ${status.toLowerCase()}`}>{badge}</span>
      </div>

      <div className="wa-coexist-safety">
        <strong>🛡️ Modo seguro V39.9.18</strong>
        <span>Esta fase no cambia el canal activo, no guarda tokens y no reemplaza el número de prueba.</span>
      </div>

      <div className="wa-coexist-status">
        <span>Estado</span>
        <strong>{detail}</strong>
      </div>

      {session && (
        <div className="wa-coexist-result">
          <div><span>WABA ID</span><code>{session.wabaId || "No informado"}</code></div>
          <div><span>Phone Number ID</span><code>{session.phoneNumberId || "No informado"}</code></div>
          <div><span>Evento Meta</span><code>{session.event || "FINISH"}</code></div>
        </div>
      )}

      <div className="wa-coexist-actions">
        <button type="button" className="primary-button" disabled={!sdkReady || launching} onClick={launchCoexistence}>
          {launching ? "Abriendo Meta…" : "Conectar WhatsApp Business"}
          <span>→</span>
        </button>
        <small>Configuration ID: {EMBEDDED_SIGNUP_CONFIG_ID}</small>
      </div>
    </section>
  );
}
