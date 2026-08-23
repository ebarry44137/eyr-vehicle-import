import { useState } from "react";

export default function ImporterCustomsServiceRequest({
  result,
  invokeFunction,
  onCreated,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const existingCase =
    result?.customs_service_request ||
    result?.customs_case ||
    null;

  async function requestService() {
    const queryId = result?.customer_query_id;

    if (!queryId || loading) return;

    setLoading(true);
    setError("");

    try {
      const { data, error: functionError } =
        await invokeFunction("request-customs-service", {
          body: {
            customer_query_id: Number(queryId),
          },
        });

      if (functionError) throw functionError;

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "No fue posible crear la gestión aduanal."
        );
      }

      onCreated?.(data.customs_case);
    } catch (err) {
      console.error("IMPORTER CUSTOMS REQUEST ERROR:", err);
      setError(
        err?.message ||
          "No fue posible solicitar el servicio aduanal."
      );
    } finally {
      setLoading(false);
    }
  }

  if (existingCase?.case_code) {
    return (
      <section className="importer-service-request success">
        <div className="importer-service-request-icon">✓</div>

        <div>
          <span>SERVICIO ADUANAL SOLICITADO</span>
          <h3>{existingCase.case_code}</h3>
          <p>
            E&amp;R ya recibió tu solicitud y creó el expediente
            aduanal. Nuestro equipo continuará el seguimiento desde
            este código.
          </p>
        </div>

        <div className="importer-service-status">
          <small>ESTADO</small>
          <strong>
            {existingCase.current_status ||
              "Nueva solicitud"}
          </strong>
        </div>
      </section>
    );
  }

  return (
    <section className="importer-service-request">
      <div className="importer-service-request-icon">🇬🇹</div>

      <div>
        <span>¿YA TENÉS TU VEHÍCULO EMBARCADO?</span>
        <h3>Solicitá la gestión aduanal con E&amp;R</h3>
        <p>
          Crearemos tu expediente automáticamente con los datos
          de este VIN, tu factura y los impuestos calculados.
          No necesitás volver a enviar la información.
        </p>

        {error && (
          <div className="importer-service-error">{error}</div>
        )}
      </div>

      <button
        type="button"
        onClick={requestService}
        disabled={loading}
      >
        {loading
          ? "Creando expediente..."
          : "Solicitar servicio aduanal"}
        <span>→</span>
      </button>
    </section>
  );
}
