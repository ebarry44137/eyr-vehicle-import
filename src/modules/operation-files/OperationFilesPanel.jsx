import { useEffect, useRef, useState } from "react";
import "./operation-files.css";

const LABELS = {
  PHOTO: "Foto",
  DUCA: "DUCA",
  BL: "BL",
  TITLE: "Título",
  INVOICE: "Factura",
  OTHER: "Otro",
};

const ICONS = {
  PHOTO: "📸",
  DUCA: "🛃",
  BL: "📄",
  TITLE: "📑",
  INVOICE: "🧾",
  OTHER: "📎",
};

export default function OperationFilesPanel({
  supabase,
  sourceType,
  sourceId,
  readOnly = false,
  title = "Fotos y documentos",
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("PHOTO");
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState("");
  const [bulkProgress, setBulkProgress] = useState({
    current: 0,
    total: 0,
    success: 0,
    failed: 0,
  });
  const [bulkResults, setBulkResults] = useState([]);

  // V39.6.3 · PREVIEWS + GALERÍA / CARRUSEL
  const [previewUrls, setPreviewUrls] = useState({});
  const [previewLoading, setPreviewLoading] = useState({});
  const [viewerIndex, setViewerIndex] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const inputRef = useRef(null);
  const touchStartXRef = useRef(null);

  async function invoke(body) {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    const accessToken = sessionData?.session?.access_token || "";

    if (!accessToken) {
      throw new Error("Sesión del Portal no disponible.");
    }

    const { data, error } = await supabase.functions.invoke(
      "operation-file-manager",
      {
        body,
        headers: {
          "x-portal-access-token": accessToken,
        },
      }
    );

    if (error) {
      let errorMessage = error?.message || "Error en archivos.";

      try {
        const response = error?.context;
        if (response?.clone) {
          const payload = await response.clone().json();
          if (payload?.error) errorMessage = payload.error;
        }
      } catch {
        // Mantener el mensaje original si no puede leerse el body.
      }

      throw new Error(errorMessage);
    }

    if (!data?.success) {
      throw new Error(data?.error || "Error en archivos.");
    }

    return data;
  }

  async function load() {
    if (!sourceId) return;

    setLoading(true);
    setMessage("");
    setPreviewUrls({});
    setPreviewLoading({});
    setViewerIndex(null);

    try {
      const data = await invoke({
        action: "list",
        source_type: sourceType,
        source_id: sourceId,
      });

      setRows(Array.isArray(data.files) ? data.files : []);
    } catch (e) {
      setMessage(e?.message || "No fue posible cargar archivos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sourceId, sourceType]);

  async function ensurePreviewUrl(row, { force = false } = {}) {
    if (!row?.id) return null;

    if (!force && previewUrls[row.id]) {
      return previewUrls[row.id];
    }

    setPreviewLoading((current) => ({
      ...current,
      [row.id]: true,
    }));

    try {
      const data = await invoke({
        action: "view_url",
        file_id: row.id,
      });

      const url = data?.url || null;

      if (url) {
        setPreviewUrls((current) => ({
          ...current,
          [row.id]: url,
        }));
      }

      return url;
    } catch (e) {
      console.error("PHOTO PREVIEW ERROR:", row?.original_name, e);
      return null;
    } finally {
      setPreviewLoading((current) => ({
        ...current,
        [row.id]: false,
      }));
    }
  }

  const photos = rows.filter((x) => x.category === "PHOTO");
  const docs = rows.filter((x) => x.category !== "PHOTO");

  // Carga progresiva de miniaturas. Se limita la concurrencia para no
  // saturar la Edge Function cuando un expediente tiene muchas fotos.
  useEffect(() => {
    if (!photos.length) return;

    let cancelled = false;

    async function loadPreviewsInBatches() {
      const pending = photos.filter((row) => !previewUrls[row.id]);
      const batchSize = 4;

      for (let i = 0; i < pending.length; i += batchSize) {
        if (cancelled) return;

        const batch = pending.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map((row) => ensurePreviewUrl(row))
        );
      }
    }

    loadPreviewsInBatches();

    return () => {
      cancelled = true;
    };
    // Intencionalmente depende solo del conjunto de fotos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  async function uploadOneFile(file, { silent = false } = {}) {
    if (!file || !sourceId) {
      return {
        ok: false,
        name: file?.name || "Archivo",
        error: "Archivo inválido",
      };
    }

    try {
      const prep = await invoke({
        action: "upload_url",
        source_type: sourceType,
        source_id: sourceId,
        category,
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      const response = await fetch(prep.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`R2 rechazó la carga (${response.status}).`);
      }

      await invoke({
        action: "register",
        source_type: sourceType,
        source_id: sourceId,
        category,
        original_name: file.name,
        storage_path: prep.storage_path,
        mime_type: file.type,
        size_bytes: file.size,
        visible_to_client: visible,
      });

      if (!silent) {
        setMessage(`${file.name} guardado en Cloudflare R2.`);
      }

      return {
        ok: true,
        name: file.name,
      };
    } catch (e) {
      const error = e?.message || "No fue posible subir el archivo.";

      if (!silent) {
        setMessage(error);
      }

      return {
        ok: false,
        name: file.name,
        error,
      };
    }
  }

  async function uploadFile(file) {
    if (!file || !sourceId) return;

    setUploading(true);
    setMessage("");
    setBulkResults([]);
    setBulkProgress({
      current: 0,
      total: 1,
      success: 0,
      failed: 0,
    });

    const result = await uploadOneFile(file);

    setBulkProgress({
      current: 1,
      total: 1,
      success: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
    });

    if (result.ok) {
      await load();
    }

    setUploading(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);

    if (!files.length || !sourceId) return;

    if (category !== "PHOTO" && files.length > 1) {
      setMessage(
        "La carga múltiple está habilitada para fotografías. Para documentos, subí uno por uno."
      );
      return;
    }

    setUploading(true);
    setMessage("");
    setBulkResults([]);
    setBulkProgress({
      current: 0,
      total: files.length,
      success: 0,
      failed: 0,
    });

    const results = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const result = await uploadOneFile(file, { silent: true });

      results.push(result);

      if (result.ok) success += 1;
      else failed += 1;

      setBulkResults([...results]);
      setBulkProgress({
        current: i + 1,
        total: files.length,
        success,
        failed,
      });
    }

    if (success > 0) {
      await load();
    }

    setMessage(
      failed === 0
        ? `✅ ${success} fotografía(s) subida(s) correctamente a R2.`
        : `Carga finalizada: ${success} correcta(s) y ${failed} con error.`
    );

    setUploading(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function openDocument(row) {
    try {
      const data = await invoke({
        action: "view_url",
        file_id: row.id,
      });

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setMessage(e?.message || "No fue posible abrir el archivo.");
    }
  }

  async function openPhotoViewer(index) {
    const row = photos[index];
    if (!row) return;

    setViewerIndex(index);
    setViewerLoading(true);

    try {
      // Refrescamos la URL al abrir el visor porque R2 la firma solo por 5 min.
      await ensurePreviewUrl(row, { force: true });

      // Pre-cargar anterior y siguiente mejora la sensación de carrusel.
      const neighbours = [
        photos[(index - 1 + photos.length) % photos.length],
        photos[(index + 1) % photos.length],
      ].filter(Boolean);

      await Promise.allSettled(
        neighbours.map((item) => ensurePreviewUrl(item))
      );
    } finally {
      setViewerLoading(false);
    }
  }

  async function goToPhoto(nextIndex) {
    if (!photos.length) return;

    const normalized =
      (nextIndex + photos.length) % photos.length;

    setViewerIndex(normalized);
    setViewerLoading(true);

    try {
      await ensurePreviewUrl(photos[normalized], { force: true });
    } finally {
      setViewerLoading(false);
    }
  }

  function closeViewer() {
    setViewerIndex(null);
    setViewerLoading(false);
  }

  useEffect(() => {
    if (viewerIndex === null) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeViewer();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPhoto(viewerIndex - 1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPhoto(viewerIndex + 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewerIndex, photos.length]);

  function handleViewerTouchStart(event) {
    touchStartXRef.current =
      event.touches?.[0]?.clientX ?? null;
  }

  function handleViewerTouchEnd(event) {
    if (touchStartXRef.current === null || viewerIndex === null) {
      return;
    }

    const endX =
      event.changedTouches?.[0]?.clientX ?? touchStartXRef.current;

    const deltaX = endX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(deltaX) < 45) return;

    if (deltaX > 0) {
      goToPhoto(viewerIndex - 1);
    } else {
      goToPhoto(viewerIndex + 1);
    }
  }

  async function openViewerOriginal() {
    if (viewerIndex === null) return;

    const row = photos[viewerIndex];
    if (!row) return;

    try {
      const data = await invoke({
        action: "view_url",
        file_id: row.id,
      });

      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setMessage(e?.message || "No fue posible abrir la imagen original.");
    }
  }

  async function removeFile(row) {
    if (!window.confirm(`¿Eliminar ${row.original_name}?`)) return;

    try {
      await invoke({
        action: "delete",
        file_id: row.id,
      });

      setMessage("Archivo eliminado.");
      await load();
    } catch (e) {
      setMessage(e?.message || "No fue posible eliminar.");
    }
  }

  const viewerPhoto =
    viewerIndex !== null ? photos[viewerIndex] : null;

  const viewerUrl =
    viewerPhoto?.id ? previewUrls[viewerPhoto.id] : null;

  return (
    <>
      <section className="ofp">
        <div className="ofp-head">
          <div>
            <span>V39.6.3 · CLOUDFLARE R2</span>
            <h3>{title}</h3>
            <p>
              {readOnly
                ? "Archivos publicados por tu oficina."
                : "Fotos y documentos privados almacenados en R2."}
            </p>
          </div>

          <b>{rows.length} archivo(s)</b>
        </div>

        {!readOnly && (
          <div className="ofp-upload">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="PHOTO">📸 Foto del vehículo</option>
              <option value="DUCA">🛃 DUCA</option>
              <option value="BL">📄 BL</option>
              <option value="TITLE">📑 Título</option>
              <option value="INVOICE">🧾 Factura</option>
              <option value="OTHER">📎 Otro</option>
            </select>

            <label className="ofp-visible">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Visible para el cliente
            </label>

            <input
              ref={inputRef}
              type="file"
              accept={
                category === "PHOTO"
                  ? "image/jpeg,image/png,image/webp"
                  : "image/jpeg,image/png,image/webp,application/pdf"
              }
              multiple={category === "PHOTO"}
              onChange={(e) => uploadFiles(e.target.files)}
            />

            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading
                ? bulkProgress.total > 1
                  ? `Subiendo ${bulkProgress.current}/${bulkProgress.total}...`
                  : "Subiendo a R2..."
                : category === "PHOTO"
                ? "＋ Subir fotografías"
                : "＋ Subir archivo"}
            </button>
          </div>
        )}

        {(uploading || bulkProgress.total > 1) && (
          <div className="ofp-bulk-progress">
            <div className="ofp-bulk-progress-head">
              <strong>
                {uploading
                  ? "Subiendo fotografías..."
                  : "Carga finalizada"}
              </strong>

              <span>
                {bulkProgress.current}/{bulkProgress.total}
              </span>
            </div>

            <div className="ofp-bulk-bar">
              <i
                style={{
                  width: `${
                    bulkProgress.total
                      ? Math.round(
                          (bulkProgress.current /
                            bulkProgress.total) *
                            100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>

            <small>
              ✅ {bulkProgress.success} correcta(s)
              {bulkProgress.failed > 0
                ? ` · ❌ ${bulkProgress.failed} con error`
                : ""}
            </small>
          </div>
        )}

        {bulkResults.some((item) => !item.ok) && (
          <div className="ofp-bulk-errors">
            {bulkResults
              .filter((item) => !item.ok)
              .map((item, index) => (
                <div key={`${item.name}-${index}`}>
                  <strong>{item.name}</strong>
                  <span>{item.error}</span>
                </div>
              ))}
          </div>
        )}

        {message && (
          <div className="ofp-message">{message}</div>
        )}

        {loading ? (
          <div className="ofp-empty">Cargando archivos...</div>
        ) : rows.length === 0 ? (
          <div className="ofp-empty">
            Todavía no hay fotos o documentos publicados.
          </div>
        ) : (
          <>
            {photos.length > 0 && (
              <div className="ofp-block">
                <h4>
                  📸 Fotos del vehículo <small>{photos.length}</small>
                </h4>

                <div className="ofp-gallery">
                  {photos.map((row, index) => {
                    const previewUrl = previewUrls[row.id];
                    const isLoading = previewLoading[row.id];

                    return (
                      <button
                        type="button"
                        key={row.id}
                        className="ofp-photo"
                        onClick={() => openPhotoViewer(index)}
                        title={`Ver ${row.original_name}`}
                      >
                        <div className="ofp-photo-preview">
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={row.original_name}
                              loading="lazy"
                              onError={() => {
                                setPreviewUrls((current) => {
                                  const next = { ...current };
                                  delete next[row.id];
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <div className="ofp-photo-placeholder">
                              <span>{isLoading ? "⏳" : "📸"}</span>
                              <small>
                                {isLoading
                                  ? "Cargando vista previa..."
                                  : "Vista previa"}
                              </small>
                            </div>
                          )}

                          <span className="ofp-photo-zoom">
                            ⛶
                          </span>
                        </div>

                        <div className="ofp-photo-meta">
                          <strong>{row.original_name}</strong>

                          {!readOnly && (
                            <em>
                              {row.visible_to_client
                                ? "CLIENTE"
                                : "INTERNO"}
                            </em>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {docs.length > 0 && (
              <div className="ofp-block">
                <h4>
                  📄 Documentos <small>{docs.length}</small>
                </h4>

                <div className="ofp-docs">
                  {docs.map((row) => (
                    <div key={row.id} className="ofp-doc">
                      <span>{ICONS[row.category] || "📎"}</span>

                      <div>
                        <strong>
                          {LABELS[row.category] || row.category}
                        </strong>
                        <small>{row.original_name}</small>
                      </div>

                      {!readOnly && (
                        <b
                          className={
                            row.visible_to_client ? "client" : ""
                          }
                        >
                          {row.visible_to_client
                            ? "VISIBLE"
                            : "INTERNO"}
                        </b>
                      )}

                      <button
                        type="button"
                        onClick={() => openDocument(row)}
                      >
                        Ver
                      </button>

                      {!readOnly && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeFile(row)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {viewerPhoto && (
        <div
          className="ofp-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Galería de fotos. Imagen ${
            viewerIndex + 1
          } de ${photos.length}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeViewer();
            }
          }}
        >
          <div
            className="ofp-lightbox-shell"
            onTouchStart={handleViewerTouchStart}
            onTouchEnd={handleViewerTouchEnd}
          >
            <div className="ofp-lightbox-topbar">
              <div>
                <strong>Fotos del vehículo</strong>
                <span>
                  {viewerIndex + 1} / {photos.length}
                </span>
              </div>

              <button
                type="button"
                className="ofp-lightbox-close"
                onClick={closeViewer}
                aria-label="Cerrar galería"
              >
                ×
              </button>
            </div>

            <div className="ofp-lightbox-stage">
              {photos.length > 1 && (
                <button
                  type="button"
                  className="ofp-lightbox-arrow previous"
                  onClick={() =>
                    goToPhoto(viewerIndex - 1)
                  }
                  aria-label="Foto anterior"
                >
                  ‹
                </button>
              )}

              <div className="ofp-lightbox-image-wrap">
                {viewerLoading && (
                  <div className="ofp-lightbox-loader">
                    <span />
                    <strong>Cargando imagen...</strong>
                  </div>
                )}

                {viewerUrl ? (
                  <img
                    key={viewerPhoto.id}
                    src={viewerUrl}
                    alt={viewerPhoto.original_name}
                  />
                ) : !viewerLoading ? (
                  <div className="ofp-lightbox-error">
                    <span>📷</span>
                    <strong>
                      No fue posible cargar la vista previa.
                    </strong>
                  </div>
                ) : null}
              </div>

              {photos.length > 1 && (
                <button
                  type="button"
                  className="ofp-lightbox-arrow next"
                  onClick={() =>
                    goToPhoto(viewerIndex + 1)
                  }
                  aria-label="Foto siguiente"
                >
                  ›
                </button>
              )}
            </div>

            <div className="ofp-lightbox-footer">
              <div className="ofp-lightbox-caption">
                <strong>{viewerPhoto.original_name}</strong>
                <small>
                  {readOnly
                    ? "Fotografía publicada por tu oficina"
                    : viewerPhoto.visible_to_client
                    ? "Visible para el cliente"
                    : "Uso interno"}
                </small>
              </div>

              <div className="ofp-lightbox-actions">
                <button
                  type="button"
                  onClick={openViewerOriginal}
                >
                  ↗ Abrir original
                </button>
              </div>
            </div>

            {photos.length > 1 && (
              <div className="ofp-lightbox-thumbs">
                {photos.map((row, index) => (
                  <button
                    type="button"
                    key={row.id}
                    className={
                      index === viewerIndex ? "active" : ""
                    }
                    onClick={() => goToPhoto(index)}
                    aria-label={`Ir a foto ${index + 1}`}
                  >
                    {previewUrls[row.id] ? (
                      <img
                        src={previewUrls[row.id]}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span>📸</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
