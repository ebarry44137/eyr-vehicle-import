import { useEffect, useState } from "react";
import OperationFilesPanel from "../operation-files/OperationFilesPanel.jsx";

const CASE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default function PortalCustomsPhotoLink({ caseId, supabase }) {
  const [operation, setOperation] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CASE_ID.test(caseId)) return;

    let cancelled = false;

    async function loadOperation() {
      try {
        const { data, error } = await supabase.rpc("portal_operation_detail_v3957", {
          p_source_type: "CUSTOMS_CASE",
          p_operation_id: caseId,
        });

        if (error || !data) throw new Error("Expediente no disponible");
        if (!cancelled) setOperation(data);
      } catch {
        if (!cancelled) setError("Este enlace no está disponible para tu cuenta.");
      }
    }

    loadOperation();
    return () => { cancelled = true; };
  }, [caseId, supabase]);

  const errorMessage = CASE_ID.test(caseId) ? error : "El enlace de fotos no es válido.";

  return (
    <main className="ip-main ip-photo-link">
      <header className="ip-topbar">
        <div>
          <small>PORTAL DE CLIENTES</small>
          <h1>Fotos del vehículo</h1>
          {operation?.reference_code && <p>Gestión {operation.reference_code}</p>}
        </div>
        <a href={window.location.pathname}>Volver al portal</a>
      </header>
      {errorMessage ? (
        <p className="ip-message error" role="alert">{errorMessage}</p>
      ) : operation ? (
        <OperationFilesPanel
          supabase={supabase}
          sourceType="CUSTOMS_CASE"
          sourceId={caseId}
          readOnly
          photosOnly
          title="Fotos publicadas de tu gestión"
        />
      ) : (
        <p role="status">Cargando las fotos de tu gestión…</p>
      )}
    </main>
  );
}
