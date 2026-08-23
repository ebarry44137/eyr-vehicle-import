export default function QuoteModeTabs({
  mode,
  onChange,
  disabled = false,
}) {
  return (
    <div className="public-quote-mode-tabs" role="tablist" aria-label="Tipo de cotizador">
      <button
        type="button"
        className={mode === "SAT" ? "active" : ""}
        onClick={() => onChange("SAT")}
        disabled={disabled}
      >
        <span className="quote-mode-icon">🇬🇹</span>
        <span>
          <strong>Cotizador Tabla SAT</strong>
          <small>Estimación con valor oficial SAT</small>
        </span>
      </button>

      <button
        type="button"
        className={mode === "IMPORTER" ? "active" : ""}
        onClick={() => onChange("IMPORTER")}
        disabled={disabled}
      >
        <span className="quote-mode-icon">🏷️</span>
        <span>
          <strong>Cotizador para Importadores</strong>
          <small>Usá el valor real de tu factura</small>
        </span>
      </button>
    </div>
  );
}
