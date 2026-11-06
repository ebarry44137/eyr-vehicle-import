import { useEffect, useRef, useState } from "react";

export default function CopyCustomsPhotoLink({ caseId, portalClientId, officeSlug }) {
  const [confirmation, setConfirmation] = useState(0);
  const copyCount = useRef(0);
  const resetTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copyLink() {
    const path = officeSlug ? `/portal/${encodeURIComponent(officeSlug)}` : "/portal";
    const url = new URL(path, window.location.origin);
    url.searchParams.set("fotos", caseId);

    try {
      await navigator.clipboard.writeText(url.href);
      window.clearTimeout(resetTimer.current);
      setConfirmation(++copyCount.current);
      resetTimer.current = window.setTimeout(() => setConfirmation(0), 2200);
    } catch {
      window.clearTimeout(resetTimer.current);
      setConfirmation(0);
      window.prompt("Copiá este enlace para compartir las fotos por WhatsApp:", url.href);
    }
  }

  return (
    <button
      type="button"
      className="prospect-open-button customs-photo-copy"
      aria-label="Copiar enlace de fotos"
      disabled={!portalClientId}
      title={portalClientId
        ? "Copiar el enlace a las fotos en el portal del cliente"
        : "Vinculá la gestión a un cliente del portal para compartir sus fotos"}
      onClick={copyLink}
    >
      <span aria-live="polite">
        {confirmation
          ? <span key={confirmation} className="customs-photo-copy-confirmed">✓ Copiado</span>
          : "Copiar enlace"}
      </span>
    </button>
  );
}
