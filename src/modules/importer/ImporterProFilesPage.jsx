import { useEffect, useMemo, useState } from "react";
import OperationFilesPanel from "../operation-files/OperationFilesPanel.jsx";
import "./importer-pro-files.css";

function recordLabel(row) {
  return [row?.vehicle, row?.vin ? `VIN ${row.vin}` : "", row?.office_name]
    .filter(Boolean)
    .join(" · ");
}

export default function ImporterProFilesPage({
  supabase,
  organizationId,
}) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadRecords() {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    try {
      const { data, error: loadError } = await supabase
        .from("importer_customs_records")
        .select("id,vehicle,vin,office_name,manager_name,customs_office,status,opened_at")
        .eq("organization_id", organizationId)
        .order("opened_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (loadError) throw loadError;

      const rows = Array.isArray(data) ? data : [];
      setRecords(rows);

      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id || "";
      });
    } catch (err) {
      console.error("V39.7.5.1 IMPORTER PRO FILES LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar tus gestiones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
  }, [organizationId]);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return records;

    return records.filter((row) =>
      [row.vehicle, row.vin, row.office_name, row.manager_name, row.customs_office]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [records, search]);

  const selected = records.find((row) => row.id === selectedId) || null;

  return (
    <section className="importer-pro-files-v39751">
      <header className="importer-pro-files-hero">
        <div>
          <span>IMPORTADOR PRO · CLOUDFLARE R2</span>
          <h1>Documentos &amp; Fotografías</h1>
          <p>
            Centralizá archivos, comprobantes y fotografías de cada una de tus
            gestiones aduanales.
          </p>
        </div>
        <div className="importer-pro-files-badge">
          <small>ALMACENAMIENTO</small>
          <strong>R2 Seguro</strong>
          <em>Hasta 25 MB por archivo</em>
        </div>
      </header>

      <div className="importer-pro-files-info">
        <span>🔐</span>
        <div>
          <strong>Archivos privados de tu cuenta PRO</strong>
          <p>
            Solamente miembros activos de tu organización Importador PRO pueden
            administrar estos archivos.
          </p>
        </div>
      </div>

      {error && <div className="importer-pro-files-error">{error}</div>}

      <section className="importer-pro-files-layout">
        <aside className="importer-pro-records">
          <div className="importer-pro-records-head">
            <div>
              <small>MIS GESTIONES</small>
              <h2>{records.length}</h2>
            </div>
            <button type="button" onClick={loadRecords} disabled={loading}>
              ↻
            </button>
          </div>

          <input
            className="importer-pro-files-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar vehículo, VIN u oficina..."
          />

          <div className="importer-pro-record-list">
            {loading ? (
              <div className="importer-pro-files-empty">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="importer-pro-files-empty">
                No hay gestiones que coincidan.
              </div>
            ) : (
              filtered.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={selectedId === row.id ? "active" : ""}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span>🛃</span>
                  <div>
                    <strong>{row.vehicle || "Gestión aduanal"}</strong>
                    <small>{row.vin || row.office_name || "Sin referencia"}</small>
                  </div>
                  <b>→</b>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="importer-pro-file-panel">
          {!selected ? (
            <div className="importer-pro-file-placeholder">
              <span>📁</span>
              <strong>Seleccioná una gestión aduanal</strong>
              <p>
                Primero registrá una gestión en “Mis Gestiones Aduanales” y
                luego podrás cargar documentos y fotografías aquí.
              </p>
            </div>
          ) : (
            <>
              <div className="importer-pro-selected-record">
                <div>
                  <small>GESTIÓN SELECCIONADA</small>
                  <h2>{selected.vehicle || "Gestión aduanal"}</h2>
                  <p>{recordLabel(selected)}</p>
                </div>
                <span>{String(selected.status || "").replaceAll("_", " ")}</span>
              </div>

              <OperationFilesPanel
                supabase={supabase}
                sourceType="IMPORTER_CUSTOMS_RECORD"
                sourceId={selected.id}
                organizationId={organizationId}
                title={`Documentos y fotografías · ${selected.vehicle || "Gestión"}`}
              />
            </>
          )}
        </main>
      </section>
    </section>
  );
}
