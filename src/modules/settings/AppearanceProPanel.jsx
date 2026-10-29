import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./appearance-pro.css";

const allowed = ["light", "dark", "system"];
const prefix = "eyr:appearance:v1:";
function safeMode(value) { return allowed.includes(value) ? value : "light"; }
function effective(mode) { return mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode; }
export default function AppearanceProPanel() {
  const [mode, setMode] = useState("light");
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    let active = true;
    const syncUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data?.user?.id || null;
      setUserId(id);
      const next = safeMode(id ? localStorage.getItem(prefix + id) : "light");
      setMode(next);
    };
    syncUser();
    const { data: auth } = supabase.auth.onAuthStateChange(() => { syncUser(); });
    return () => { active = false; auth?.subscription?.unsubscribe(); /* V4: el tema global se conserva al salir de Configuración */ };
  }, []);
  function change(next) {
    if (!allowed.includes(next)) return;
    setMode(next);
    if (userId) localStorage.setItem(prefix + userId, next);
    window.dispatchEvent(new CustomEvent("eyr:appearance-change", { detail: { userId, mode: next } }));
  }
  return (
    <section className="eyr-appearance-card" aria-label="Apariencia del sistema">
      <div className="eyr-appearance-head"><span className="eyr-appearance-icon">🎨</span><div><span className="eyr-appearance-kicker">PREFERENCIA PERSONAL</span><h2>Apariencia del sistema</h2><p>Elegí cómo querés ver E&R en este dispositivo.</p></div></div>
      <div className="eyr-appearance-options" role="group" aria-label="Seleccionar apariencia">
        {[{id:"light",label:"☀️ Claro"},{id:"dark",label:"🌙 Oscuro"},{id:"system",label:"💻 Automático"}].map(item => <button type="button" key={item.id} className={"eyr-appearance-option"+(mode===item.id?" selected":"")} aria-pressed={mode===item.id} onClick={()=>change(item.id)}>{item.label}</button>)}
      </div>
      <p className="eyr-appearance-note">Preferencia personal en este navegador. Se conserva al navegar entre módulos. Los documentos PDF/PNG mantienen su diseño original.</p>
    </section>
  );
}
