import { useEffect, useState } from "react";

async function manageShare(supabase, caseId, action, payload) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error("Iniciá sesión para gestionar enlaces.");
  }
  const { data, error } = await supabase.functions.invoke("dispatch-photo-share", {
    body: { case_id: caseId, action, ...payload },
    headers: { "x-portal-access-token": sessionData.session.access_token },
  });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(payload?.error || "No pudimos gestionar el enlace. Volvé a intentar.");
  }
  return data.share;
}

export default function DispatchPhotoShare({ supabase, caseId, selectedIds }) {
  const [share, setShare] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [copyCount, setCopyCount] = useState(0);

  useEffect(() => {
    let current = true;
    manageShare(supabase, caseId, "status").then(
      (data) => { if (current) setShare(data); },
      (error) => { if (current) setNotice(error.message); },
    );
    return () => { current = false; };
  }, [supabase, caseId]);

  async function update(action, payload, successMessage) {
    setBusy(true);
    setNotice("");
    try {
      const updatedShare = await manageShare(supabase, caseId, action, payload);
      setShare(updatedShare);
      setCopyCount(0);
      setNotice(successMessage);
      if (action === "create") await copy(updatedShare.token);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(token) {
    const url = new URL("/fotos-despacho", window.location.origin);
    url.hash = token;
    try {
      await navigator.clipboard.writeText(url.href);
      setCopyCount((value) => value + 1);
      setNotice("Enlace copiado. Ya lo podés enviar por WhatsApp.");
    } catch {
      window.prompt("Copiá el enlace de fotos:", url.href);
    }
  }

  return (
    <div className="ofp-dispatch-share">
      <h4>Enlace público de fotos de despacho</h4>
      <p>Quien tenga el enlace podrá ver las fotos seleccionadas durante 30 días sin iniciar sesión.</p>
      {share ? (
        <>
          <p>Fotos seleccionadas: {share.photo_ids.length} · Vence {new Intl.DateTimeFormat("es-GT", {
            dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala",
          }).format(new Date(share.expires_at))}</p>
          <p>Para cambiar las fotos del enlace activo, desactivalo y generá uno nuevo.</p>
          <div className="ofp-dispatch-actions">
            <button type="button" className="prospect-open-button" disabled={busy} onClick={() => copy(share.token)}>Copiar enlace público</button>
            <button type="button" className="prospect-open-button" disabled={busy}
              onClick={() => update("revoke", { token: share.token }, "Enlace desactivado.")}>Desactivar enlace</button>
          </div>
        </>
      ) : share === null ? (
        <>
          <p>Las fotos visibles vienen marcadas. Desmarcá las que querás excluir.</p>
          <p>{selectedIds.length} seleccionada(s){selectedIds.length > 100 && " · El enlace admite hasta 100 fotos."}</p>
          <button type="button" className="prospect-open-button"
            disabled={busy || !selectedIds.length || selectedIds.length > 100}
            onClick={() => update("create", { photo_ids: selectedIds }, "Enlace listo para copiar.")}>Generar y copiar enlace</button>
        </>
      ) : notice ? (
        <button type="button" className="prospect-open-button" disabled={busy}
          onClick={() => update("status", {}, "")}>Reintentar</button>
      ) : <p>Cargando enlace…</p>}
      <p role="status"><span key={copyCount}>{notice}</span></p>
    </div>
  );
}
