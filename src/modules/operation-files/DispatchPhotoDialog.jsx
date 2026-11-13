import { useEffect, useRef } from "react";
import OperationFilesPanel from "./OperationFilesPanel.jsx";

export default function DispatchPhotoDialog({ supabase, customsCase, onClose }) {
  const dialog = useRef(null);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="ofp-dispatch-dialog" aria-labelledby="dispatch-photo-dialog-title" onClose={onClose}>
      <div className="quote-modal-head">
        <div>
          <h2 id="dispatch-photo-dialog-title">Fotos de despacho</h2>
          <p>{customsCase.case_code}</p>
        </div>
        <form method="dialog">
          <button className="quote-close" aria-label="Cerrar fotos de despacho">×</button>
        </form>
      </div>
      <OperationFilesPanel
        supabase={supabase}
        sourceType="CUSTOMS_CASE"
        sourceId={customsCase.id}
        title="Fotos para compartir"
        dispatchShareOnly
      />
    </dialog>
  );
}
