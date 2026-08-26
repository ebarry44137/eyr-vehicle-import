import { useEffect, useRef, useState } from "react";
import "./customers.css";

export default function CustomerAutocomplete({
  supabase,
  value = "",
  clientId = null,
  phone = "",
  email = "",
  onSelect,
  placeholder = "Escribí nombre o empresa...",
  required = false,
}) {
  const [query, setQuery] = useState(value || "");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    function onDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function search(nextQuery) {
    const clean = String(nextQuery || "").trim();

    if (clean.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "search_customers_secure",
        {
          p_search: clean,
          p_limit: 8,
        }
      );

      if (rpcError) throw rpcError;

      setItems(data || []);
      setOpen(true);
    } catch (err) {
      console.error("CUSTOMER SEARCH ERROR:", err);
      setError(err?.message || "No fue posible buscar clientes.");
    } finally {
      setLoading(false);
    }
  }

  function change(nextQuery) {
    setQuery(nextQuery);
    onSelect?.({
      id: null,
      name: nextQuery,
      phone,
      email,
      isNewText: true,
    });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(nextQuery), 250);
  }

  function choose(item) {
    setQuery(item.name || "");
    setOpen(false);
    setItems([]);
    setError("");
    onSelect?.({
      id: item.id,
      name: item.name,
      phone: item.phone || "",
      email: item.email || "",
      nit: item.nit || "",
      isNewText: false,
    });
  }

  async function createQuick() {
    const clean = String(query || "").trim();

    if (!clean) {
      setError("Escribí el nombre del cliente.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "resolve_customer_for_work",
        {
          p_client_id: null,
          p_name: clean,
          p_phone: phone || null,
          p_email: email || null,
          p_nit: null,
        }
      );

      if (rpcError) throw rpcError;

      const item = Array.isArray(data) ? data[0] : data;

      choose({
        id: item.id,
        name: item.name,
        phone: item.phone,
        email: item.email,
        nit: item.nit,
      });
    } catch (err) {
      console.error("CUSTOMER QUICK CREATE ERROR:", err);
      setError(err?.message || "No fue posible crear el cliente.");
    } finally {
      setCreating(false);
    }
  }

  const exact = items.some(
    (item) =>
      String(item.name || "").trim().toLowerCase() ===
      String(query || "").trim().toLowerCase()
  );

  return (
    <div className="customer-autocomplete" ref={wrapRef}>
      <div className={`customer-autocomplete-input ${clientId ? "selected" : ""}`}>
        <input
          value={query}
          required={required}
          onChange={(e) => change(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) search(query);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />

        {loading ? (
          <span className="customer-autocomplete-status">Buscando...</span>
        ) : clientId ? (
          <span className="customer-autocomplete-status linked">✓ Vinculado</span>
        ) : null}
      </div>

      {open && (
        <div className="customer-autocomplete-menu">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => choose(item)}
            >
              <div>
                <strong>{item.name}</strong>
                <span>
                  {[item.nit ? `NIT ${item.nit}` : null, item.phone]
                    .filter(Boolean)
                    .join(" · ") || "Cliente registrado"}
                </span>
              </div>
              <small>Seleccionar →</small>
            </button>
          ))}

          {!loading && !exact && query.trim() && (
            <button
              type="button"
              className="customer-autocomplete-create"
              onClick={createQuick}
              disabled={creating}
            >
              <div>
                <strong>
                  {creating ? "Creando..." : `＋ Crear “${query.trim()}”`}
                </strong>
                <span>
                  No encontramos una coincidencia exacta.
                </span>
              </div>
            </button>
          )}

          {!loading && items.length === 0 && !query.trim() && (
            <div className="customer-autocomplete-empty">
              Escribí al menos 2 caracteres.
            </div>
          )}
        </div>
      )}

      {error && <small className="customer-autocomplete-error">{error}</small>}
    </div>
  );
}
