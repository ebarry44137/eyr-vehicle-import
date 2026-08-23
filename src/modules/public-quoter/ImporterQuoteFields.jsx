export default function ImporterQuoteFields({
  invoiceValue,
  onInvoiceChange,
  disabled = false,
}) {
  return (
    <div className="importer-quote-fields">
      <div className="importer-quote-heading">
        <span>FACTURA DE SUBASTA</span>
        <strong>¿Cuánto pagaste por el vehículo?</strong>
        <p>
          Ingresá el valor que aparece en tu factura. El sistema utilizará
          este monto como base de cálculo en lugar del valor de la Tabla SAT.
        </p>
      </div>

      <label className="importer-invoice-input">
        <span>VALOR DE FACTURA</span>
        <div>
          <b>USD</b>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={invoiceValue}
            onChange={(event) => onInvoiceChange(event.target.value)}
            placeholder="Ej. 8500.00"
            disabled={disabled}
          />
        </div>
        <small>
          El flete marítimo se calcula automáticamente según el tamaño del vehículo.
        </small>
      </label>
    </div>
  );
}
