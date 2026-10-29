import { useEffect } from "react";
import { supabase } from "../../supabaseClient";
import "./appearance-global-v4.css";
import "./appearance-v5-real.css"; // EYR_PRO30_APPEARANCE_V5_REAL
import "./appearance-v7-integral.css"; // EYR_PRO30_APPEARANCE_V7
import "./appearance-v8-contrast.css"; // EYR_V8_CONTRAST
import "./appearance-v9-usa-yard.css"; // EYR_V9_USA_YARD

const KEY = "eyr:appearance:v1:";
const VALID = new Set(["light", "dark", "system"]);
const normalize = value => VALID.has(value) ? value : "light";

export default function useEyrAppearanceGlobal() {
  useEffect(() => {
    let alive = true;
    let currentUserId = null;
    let currentMode = "light";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = currentMode === "system" ? (media.matches ? "dark" : "light") : currentMode;
      document.documentElement.dataset.eyrTheme = resolved;
      document.documentElement.dataset.eyrThemePreference = currentMode;
    };
    const sync = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        const nextId = data?.user?.id || null;
        if (nextId !== currentUserId) {
          currentUserId = nextId;
          currentMode = normalize(nextId ? localStorage.getItem(KEY + nextId) : "light");
          apply();
        }
      } catch { if (alive) { currentUserId = null; currentMode = "light"; apply(); } }
    };
    const onPreference = event => {
      if (!currentUserId) return;
      if (event.detail?.userId !== currentUserId) return;
      currentMode = normalize(event.detail?.mode);
      apply();
    };
    const onStorage = event => {
      if (currentUserId && event.key === KEY + currentUserId) {
        currentMode = normalize(event.newValue);
        apply();
      }
    };
    apply();
    sync();
    const { data: auth } = supabase.auth.onAuthStateChange(() => { queueMicrotask(sync); });
    media.addEventListener?.("change", apply);
    window.addEventListener("eyr:appearance-change", onPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      auth?.subscription?.unsubscribe();
      media.removeEventListener?.("change", apply);
      window.removeEventListener("eyr:appearance-change", onPreference);
      window.removeEventListener("storage", onStorage);
      document.documentElement.removeAttribute("data-eyr-theme");
      document.documentElement.removeAttribute("data-eyr-theme-preference");
    };
  }, []);
}
