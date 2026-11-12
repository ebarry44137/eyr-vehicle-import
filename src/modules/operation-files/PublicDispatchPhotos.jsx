import { useEffect, useState } from "react";
import logo from "../../assets/eyr-solutions-logo.png";
import "./dispatch-photos.css";

export default function PublicDispatchPhotos() {
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    document.title = "Fotos de despacho | EyR Solutions";
    function handleHashChange() {
      setResult(null);
      setImageFailed(false);
      setToken(window.location.hash.slice(1));
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!token) {
      setResult({ error: "Este enlace ya no está disponible." });
      return;
    }

    async function load() {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dispatch-photo-share`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ action: "view", token }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setResult({ error: "Este enlace ya no está disponible. Pedile uno nuevo a EyR Solutions." });
          return;
        }
        if (!response.ok) throw new Error("No se pudo cargar la galería.");
        const payload = await response.json();
        if (!controller.signal.aborted) setResult(payload);
      } catch {
        if (!controller.signal.aborted) setResult({ error: "No pudimos cargar las fotos.", retry: true });
      }
    }
    load();
    return () => controller.abort();
  }, [attempt, token]);

  function refresh() {
    setResult(null);
    setImageFailed(false);
    setAttempt((value) => value + 1);
  }

  return (
    <main className="dispatch-gallery-page">
      <header>
        <img src={logo} alt="EyR Solutions" width="180" />
        <h1>Fotos de despacho</h1>
      </header>
      {!result && <p role="status">Cargando fotos…</p>}
      {result?.error && <p role="status">{result.error}</p>}
      {result?.images?.length === 0 && <p>No hay fotos disponibles en este enlace.</p>}
      {result?.images?.length > 0 && (
        <div className="dispatch-gallery-grid">
          {result.images.map(({ url }, index) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer"
              aria-label={`Abrir foto de despacho ${index + 1} en tamaño completo`}>
              <img src={url} alt={`Foto de despacho ${index + 1}`} loading="lazy"
                referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
            </a>
          ))}
        </div>
      )}
      {(result?.retry || imageFailed) && <button type="button" onClick={refresh}>Volver a cargar las fotos</button>}
    </main>
  );
}
