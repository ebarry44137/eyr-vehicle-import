import { useState } from "react";

export default function CopyCustomsPhotoLink({ caseId, portalClientId, officeSlug }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const path = officeSlug ? `/portal/${encodeURIComponent(officeSlug)}` : "/portal";
    const url = new URL(path, window.location.origin);
    url.searchParams.set("fotos", caseId);

    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
    } catch {
      window.prompt("Copiá este enlace para compartir las fotos por WhatsApp:", url.href);
    }
  }

  return (
    <button
      type="button"
      className="prospect-open-button"
      disabled={!portalClientId}
      title={portalClientId
        ? "Copiar el enlace a las fotos en el portal del cliente"
        : "Vinculá la gestión a un cliente del portal para compartir sus fotos"}
      onClick={copyLink}
    >
      <span aria-live="polite">{copied ? "✓ Enlace copiado" : "Copiar enlace de fotos"}</span>
    </button>
  );
}
