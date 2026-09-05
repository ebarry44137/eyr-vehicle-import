import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./importer-portal.css";
import "./portal-v39.6.0.css";
import "./portal-customs-request-v39621.css";
import OperationFilesPanel from "../operation-files/OperationFilesPanel.jsx";

const DEFAULT_BRAND = {
  office_name: "E&R Solutions",
  organization_name: "E&R Solutions",
  tagline: "Gestión aduanal inteligente",
  logo_url: "/branding/eyr-logo-horizontal.png",
  primary_color: "#0A3458",
  secondary_color: "#E8A72D",
  accent_color: "#F5D87F",
};

const STATUS_LABELS = {
  CREATED: "Registrada",
  SHIPPED: "Embarcada",
  IN_TRANSIT: "En tránsito",
  ARRIVED: "Arribó a puerto",
  DOCUMENTS: "Documentación",
  CUSTOMS: "Proceso aduanal",
  SELECTIVE: "Selectivo",
  RELEASED: "Liberada",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada",
};

const STATUS_STEPS = [
  "CREATED","SHIPPED","IN_TRANSIT","ARRIVED","DOCUMENTS",
  "CUSTOMS","SELECTIVE","RELEASED","DELIVERED",
];

function portalSlugFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "portal") return "";
  return String(parts[1] || "").trim().toLowerCase();
}

function initials(value) {
  return (
    String(value || "C")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "C"
  );
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-GT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
  } catch {
    return value;
  }
}

function vehicleName(item) {
  return (
    [item?.vehicle_year,item?.vehicle_make,item?.vehicle_model,item?.vehicle_trim]
      .filter(Boolean)
      .join(" ") ||
    item?.reference_code ||
    "Vehículo"
  );
}

function progress(status) {
  const idx = STATUS_STEPS.indexOf(String(status || "").toUpperCase());
  return idx < 0 ? 0 : Math.round(((idx + 1) / STATUS_STEPS.length) * 100);
}

function setFavicon(url) {
  if (!url) return;
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export default function ImporterPortalPage() {
  const [session,setSession] = useState(null);
  const [context,setContext] = useState(null);
  const [branding,setBranding] = useState(DEFAULT_BRAND);
  const [imports,setImports] = useState([]);
  const [selected,setSelected] = useState(null);
  const [detail,setDetail] = useState(null);

  const [loading,setLoading] = useState(true);
  const [authLoading,setAuthLoading] = useState(false);
  const [importsLoading,setImportsLoading] = useState(false);
  const [detailLoading,setDetailLoading] = useState(false);

  const [activeView,setActiveView] = useState("dashboard");
  const [error,setError] = useState("");
  const [login,setLogin] = useState({email:"",password:""});
  const [filters,setFilters] = useState({search:"",status:"ALL"});

  // V39.6.21.1 · Solicitud de gestión aduanal desde Portal
  const [showCustomsRequest,setShowCustomsRequest] = useState(false);
  const [customsRequestSaving,setCustomsRequestSaving] = useState(false);
  const [customsRequestMessage,setCustomsRequestMessage] = useState("");
  const [customsRequestForm,setCustomsRequestForm] = useState({
    vin:"",
    bl:"",
    container_number:"",
    shipping_line:"",
    vehicle_year:"",
    vehicle_make:"",
    vehicle_model:"",
    estimated_arrival_date:"",
    shipping_line_release_confirmed:false,
    notes:"",
  });

  // V39.6.0 · Cotizador para cliente de oficina
  const [quoteVin,setQuoteVin] = useState("");
  const [quoteInvoice,setQuoteInvoice] = useState("");
  const [quoteLoading,setQuoteLoading] = useState(false);
  const [quoteResult,setQuoteResult] = useState(null);
  const [quoteError,setQuoteError] = useState("");

  const routeSlug = portalSlugFromLocation();
  const organization = context?.organization || null;
  const client = context?.client || null;
  const profile = context?.profile || null;

  const brandName =
    branding?.office_name ||
    branding?.organization_name ||
    organization?.name ||
    "Portal de Clientes";

  const logoUrl = String(branding?.logo_url || "").trim();

  const style = {
    "--ip-primary": branding?.primary_color || DEFAULT_BRAND.primary_color,
    "--ip-secondary": branding?.secondary_color || DEFAULT_BRAND.secondary_color,
    "--ip-accent": branding?.accent_color || DEFAULT_BRAND.accent_color,
  };

  const kpis = useMemo(() => ({
    active: imports.filter(x => !["DELIVERED","CANCELLED"].includes(String(x.status).toUpperCase())).length,
    arrived: imports.filter(x => ["ARRIVED","DOCUMENTS","CUSTOMS","SELECTIVE","RELEASED"].includes(String(x.status).toUpperCase())).length,
    duca: imports.filter(x => x.duca_confirmed).length,
    delivered: imports.filter(x => String(x.status).toUpperCase()==="DELIVERED").length,
  }), [imports]);

  async function loadBrand(slug=routeSlug) {
    if (!slug) {
      setBranding(DEFAULT_BRAND);
      return;
    }

    const {data,error} = await supabase.rpc(
      "public_importer_portal_branding_v3901",
      {p_slug:slug}
    );

    if (error) throw error;

    if (data?.organization_id) {
      setBranding({...DEFAULT_BRAND,...data});
    }
  }

  async function loadImports(next=filters) {
    setImportsLoading(true);
    setError("");
    try {
      const {data,error} = await supabase.rpc(
        "list_portal_operations_v3957",
        {
          p_search:String(next.search || "").trim() || null,
          p_status:next.status === "ALL" ? null : next.status,
        }
      );
      if (error) throw error;
      setImports(Array.isArray(data)?data:[]);
    } catch(err) {
      setError(err?.message || "No fue posible cargar tus importaciones.");
    } finally {
      setImportsLoading(false);
    }
  }

  async function openImport(item) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const {data,error} = await supabase.rpc(
        "portal_operation_detail_v3957",
        {
          p_source_type:item.source_type || "IMPORT_MANAGEMENT",
          p_operation_id:item.id
        }
      );
      if (error) throw error;
      setDetail(data || null);
    } catch(err) {
      setError(err?.message || "No fue posible abrir el expediente.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadPortal(nextSession=null) {
    setLoading(true);
    setError("");
    try {
      const s = nextSession || (await supabase.auth.getSession()).data?.session || null;
      setSession(s);

      if (!s?.user?.id) {
        setContext(null);
        setImports([]);
        return;
      }

      const {data,error} = await supabase.rpc(
        "office_client_portal_context_v3956",
        { p_slug: routeSlug || null }
      );
      if (error) throw error;

      if (!data?.authorized) {
        setContext(data || null);
        setImports([]);
        setError(data?.message || "No tenés acceso al portal de clientes.");
        return;
      }

      setContext(data);

      if (data?.portal_branding_slug) {
        await loadBrand(data.portal_branding_slug);
      }

      await loadImports({search:"",status:"ALL"});
    } catch(err) {
      setError(err?.message || "No fue posible cargar el portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBrand(routeSlug).catch(() => setBranding(DEFAULT_BRAND));
  }, [routeSlug]);

  useEffect(() => {
    let mounted=true;

    supabase.auth.getSession().then(({data}) => {
      if (mounted) loadPortal(data?.session || null);
    });

    const {data:listener} = supabase.auth.onAuthStateChange((_event,nextSession) => {
      if (mounted) loadPortal(nextSession);
    });

    return () => {
      mounted=false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.title = `${brandName} | Portal de Clientes`;
    if (logoUrl) setFavicon(logoUrl);
  }, [brandName,logoUrl]);

  function openCustomsRequest() {
    setCustomsRequestMessage("");
    setCustomsRequestForm({
      vin:"",
      bl:"",
      container_number:"",
      shipping_line:"",
      vehicle_year:"",
      vehicle_make:"",
      vehicle_model:"",
      estimated_arrival_date:"",
      shipping_line_release_confirmed:false,
      notes:"",
    });
    setShowCustomsRequest(true);
  }

  async function submitCustomsRequest(event) {
    event.preventDefault();

    const cleanShippingLine = String(customsRequestForm.shipping_line || "").trim();
    if (!cleanShippingLine) {
      setCustomsRequestMessage(
        "La naviera es obligatoria para coordinar la recolección de documentos."
      );
      return;
    }

    const cleanVin = String(customsRequestForm.vin || "")
      .trim()
      .toUpperCase();

    if (cleanVin && cleanVin.length !== 17) {
      setCustomsRequestMessage(
        "El VIN es opcional, pero si lo ingresás debe tener 17 caracteres."
      );
      return;
    }

    setCustomsRequestSaving(true);
    setCustomsRequestMessage("");

    try {
      const {data,error} = await supabase.rpc(
        "submit_portal_customs_request_v39621",
        {
          p_vin: cleanVin || null,
          p_bl:
            String(customsRequestForm.bl || "")
              .trim()
              .toUpperCase() || null,
          p_container_number:
            String(customsRequestForm.container_number || "")
              .trim()
              .toUpperCase() || null,
          p_shipping_line: cleanShippingLine,
          p_vehicle_year:
            customsRequestForm.vehicle_year
              ? Number(customsRequestForm.vehicle_year)
              : null,
          p_vehicle_make:
            String(customsRequestForm.vehicle_make || "").trim() || null,
          p_vehicle_model:
            String(customsRequestForm.vehicle_model || "").trim() || null,
          p_estimated_arrival_date:
            customsRequestForm.estimated_arrival_date || null,
          p_shipping_line_release_confirmed:
            Boolean(customsRequestForm.shipping_line_release_confirmed),
          p_notes:
            String(customsRequestForm.notes || "").trim() || null,
        }
      );

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;

      setCustomsRequestMessage(
        `✅ Solicitud ${row?.request_code || ""} enviada correctamente a ${brandName}.`
      );

      setCustomsRequestForm({
        vin:"",
        bl:"",
        container_number:"",
        shipping_line:"",
        vehicle_year:"",
        vehicle_make:"",
        vehicle_model:"",
        estimated_arrival_date:"",
        shipping_line_release_confirmed:false,
        notes:"",
      });
    } catch(err) {
      setCustomsRequestMessage(
        err?.message || "No fue posible enviar la solicitud."
      );
    } finally {
      setCustomsRequestSaving(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthLoading(true);
    setError("");
    try {
      const {data,error} = await supabase.auth.signInWithPassword({
        email:login.email.trim().toLowerCase(),
        password:login.password,
      });
      if (error) throw error;
      await loadPortal(data?.session);
    } catch(err) {
      setError(err?.message || "No fue posible iniciar sesión.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function runImporterQuote(event) {
    event?.preventDefault?.();

    const cleanVin = String(quoteVin || "").trim().toUpperCase();
    const invoice = Number(quoteInvoice || 0);

    setQuoteError("");
    setQuoteResult(null);

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
      setQuoteError("Ingresá un VIN válido de 17 caracteres.");
      return;
    }

    if (!Number.isFinite(invoice) || invoice <= 0) {
      setQuoteError("Ingresá el valor real de la factura en USD.");
      return;
    }

    setQuoteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("decode-vin", {
        body: {
          vin: cleanVin,
          calculation_mode: "IMPORTER",
          invoice_value_usd: invoice,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "No fue posible calcular la cotización.");

      setQuoteResult(data);
    } catch (err) {
      setQuoteError(err?.message || "No fue posible calcular la cotización.");
    } finally {
      setQuoteLoading(false);
    }
  }

  function moneyGTQ(value) {
    if (value === null || value === undefined || value === "") return "—";
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function moneyUSD(value) {
    if (value === null || value === undefined || value === "") return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  async function logout() {
    await supabase.auth.signOut();
    setContext(null);
    setImports([]);
    setSession(null);
  }

  if (loading) {
    return (
      <div className="ip-loading-screen" style={style}>
        {logoUrl ? <img className="ip-loading-logo" src={logoUrl} alt={brandName}/> : <div className="ip-loading-initials">{initials(brandName)}</div>}
        <div className="ip-spinner"/>
        <strong>Preparando tu portal...</strong>
      </div>
    );
  }

  if (!session) {
    return (
      <main className="ip-auth-shell" style={style}>
        <section className="ip-auth-brand">
          {logoUrl ? <div className="ip-brand-logo-box"><img src={logoUrl} alt={brandName}/></div> : <div className="ip-brand-mark">{initials(brandName)}</div>}
          <span>PORTAL DE CLIENTES</span>
          <h1>Tu gestión,<br/>siempre a la vista.</h1>
          <p>Consultá el avance de tus importaciones y documentos gestionados por {brandName}.</p>

          <div className="ip-auth-features">
            <article><b>🚢</b><div><strong>Mis importaciones</strong><span>Solo tus operaciones</span></div></article>
            <article><b>📄</b><div><strong>Documentos</strong><span>DUCA y expediente</span></div></article>
            <article><b>🔐</b><div><strong>Acceso privado</strong><span>Información exclusiva de tu cuenta</span></div></article>
          </div>
        </section>

        <section className="ip-auth-panel">
          <form className="ip-login-card" onSubmit={handleLogin}>
            <div className="ip-login-brand">
              {logoUrl ? <img src={logoUrl} alt={brandName}/> : <strong>{initials(brandName)}</strong>}
            </div>
            <small>ACCESO DE CLIENTES</small>
            <h2>Ingresar al portal</h2>
            <p>Usá las credenciales que te proporcionó {brandName}.</p>

            {error && <div className="ip-message error">{error}</div>}

            <label>
              <span>Correo electrónico</span>
              <input type="email" required value={login.email} onChange={e=>setLogin(p=>({...p,email:e.target.value}))}/>
            </label>

            <label>
              <span>Contraseña</span>
              <input type="password" required value={login.password} onChange={e=>setLogin(p=>({...p,password:e.target.value}))}/>
            </label>

            <button disabled={authLoading}>
              {authLoading ? "Ingresando..." : "Entrar al portal →"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (!context?.authorized) {
    return (
      <main className="ip-denied-shell" style={style}>
        <section className="ip-denied-card">
          {logoUrl && <img className="ip-denied-logo" src={logoUrl} alt={brandName}/>}
          <small>PORTAL DE CLIENTES</small>
          <h1>Esta cuenta no tiene acceso.</h1>
          <p>{error}</p>
          <button onClick={logout}>Cerrar sesión</button>
        </section>
      </main>
    );
  }

  return (
    <div className="ip-app" style={style}>
      <aside className="ip-sidebar">
        <div className="ip-company-brand">
          <div className="ip-company-logo">
            {logoUrl ? <img src={logoUrl} alt={brandName}/> : initials(brandName)}
          </div>
          <div>
            <small>PORTAL DE CLIENTES</small>
            <strong>{brandName}</strong>
          </div>
        </div>

        <nav>
          <button className={activeView==="dashboard"?"active":""} onClick={()=>setActiveView("dashboard")}><span>▦</span>Dashboard</button>
          <button className={activeView==="imports"?"active":""} onClick={()=>setActiveView("imports")}><span>🚢</span>Mis importaciones</button>
          <button type="button" onClick={openCustomsRequest}><span>＋</span>Solicitar gestión</button>
          <button className={activeView==="documents"?"active":""} onClick={()=>setActiveView("documents")}><span>📄</span>Documentos</button>
          <button className={activeView==="quote"?"active":""} onClick={()=>setActiveView("quote")}><span>🧮</span>Cotizador</button>
        </nav>

        <div className="ip-sidebar-footer">
          <div className="ip-user">
            <div>{initials(client?.contact_name || profile?.full_name)}</div>
            <section>
              <strong>{client?.contact_name || profile?.full_name || "Cliente"}</strong>
              <span>{client?.company_name || client?.email}</span>
              <small>CLIENTE</small>
            </section>
          </div>
          <button onClick={logout}>↪ Cerrar sesión</button>
        </div>
      </aside>

      <main className="ip-main">
        <header className="ip-topbar">
          <div>
            <small>PORTAL DE CLIENTES</small>
            <h1>{
              activeView==="imports" ? "Mis Importaciones" :
              activeView==="documents" ? "Documentos" :
              activeView==="quote" ? "Cotizador para Importador" :
              "Dashboard"
            }</h1>
          </div>
          <div className="ip-top-company">
            <strong>{client?.company_name || client?.contact_name}</strong>
          </div>
        </header>

        {error && <div className="ip-message error">{error}</div>}

        {activeView==="dashboard" ? (
          <>
            <section className="ip-welcome-card">
              <div className="ip-welcome-copy">
                <small>BIENVENIDO</small>
                <h2>Hola, {String(client?.contact_name || profile?.full_name || "Cliente").split(" ")[0]} 👋</h2>
                <p>Seguimiento de las operaciones que {brandName} está gestionando para tu cuenta.</p>
              </div>
            </section>

            <section className="ip-kpi-grid">
              <article><span>🚢</span><div><small>IMPORTACIONES ACTIVAS</small><strong>{kpis.active}</strong></div></article>
              <article><span>⚓</span><div><small>EN PUERTO / PROCESO</small><strong>{kpis.arrived}</strong></div></article>
              <article><span>📄</span><div><small>DUCA CONFIRMADAS</small><strong>{kpis.duca}</strong></div></article>
              <article><span>✓</span><div><small>ENTREGADAS</small><strong>{kpis.delivered}</strong></div></article>
            </section>

            <section className="ip-customs-request-cta">
              <div className="ip-customs-request-cta-icon">🛃</div>
              <div>
                <small>NUEVA OPERACIÓN</small>
                <h3>¿Necesitás iniciar otra gestión aduanal?</h3>
                <p>
                  Enviá los datos básicos del vehículo. La naviera es obligatoria
                  porque ahí coordinaremos la recolección de documentos.
                </p>
              </div>
              <button type="button" onClick={openCustomsRequest}>
                ＋ Solicitar nueva gestión aduanal
              </button>
            </section>

            <section className="ip-panel ip-imports-preview" style={{marginTop:16}}>
              <header>
                <div><small>SEGUIMIENTO</small><h3>Importaciones recientes</h3></div>
                <button className="ip-link-button" onClick={()=>setActiveView("imports")}>Ver todas →</button>
              </header>

              {imports.length===0 ? (
                <div className="ip-empty"><div>🚢</div><strong>No hay importaciones asignadas.</strong><p>Cuando tu oficina vincule una gestión a tu cuenta aparecerá aquí.</p></div>
              ) : (
                <div className="ip-import-list">
                  {imports.slice(0,5).map(item=>(
                    <button className="ip-import-row" key={item.id} onClick={()=>openImport(item)}>
                      <div className="ip-vehicle-icon">🚗</div>
                      <section><strong>{vehicleName(item)}</strong><span>{item.vin || "VIN pendiente"} · {item.reference_code}</span><small>ETA {formatDate(item.eta)} · {item.shipping_line || "Naviera pendiente"}</small></section>
                      <div className="ip-import-status"><strong>{item.status_label}</strong></div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : activeView==="imports" ? (
          <section className="ip-imports-page">
            <div className="ip-imports-hero">
              <div>
                <small>TUS EXPEDIENTES</small>
                <h2>Seguimiento de tus importaciones</h2>
                <p>Esta pantalla muestra únicamente las operaciones vinculadas a tu cuenta por {brandName}.</p>
              </div>
              <div className="ip-import-count"><small>EXPEDIENTES</small><strong>{imports.length}</strong></div>
            </div>

            <div className="ip-import-filters office-client-only">
              <div className="ip-import-search">
                <span>⌕</span>
                <input
                  value={filters.search}
                  onChange={e=>setFilters(p=>({...p,search:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter" && loadImports(filters)}
                  placeholder="Buscar VIN, vehículo, referencia, BL o contenedor..."
                />
              </div>

              <select value={filters.status} onChange={e=>{
                const next={...filters,status:e.target.value};
                setFilters(next);
                loadImports(next);
              }}>
                <option value="ALL">Todos los estados</option>
                {STATUS_STEPS.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                <option value="CANCELLED">Cancelada</option>
              </select>

              <button onClick={()=>loadImports(filters)}>{importsLoading?"Buscando...":"Buscar"}</button>
            </div>

            {imports.length===0 ? (
              <div className="ip-panel ip-empty"><div>🚢</div><strong>No hay importaciones asignadas.</strong><p>Solo aparecerán expedientes que pertenezcan a tu cuenta.</p></div>
            ) : (
              <div className="ip-import-card-grid">
                {imports.map(item=>(
                  <button className="ip-import-card" key={item.id} onClick={()=>openImport(item)}>
                    <header>
                      <div className="ip-import-card-icon">🚗</div>
                      <div className="ip-import-card-title"><small>{item.reference_code}</small><strong>{vehicleName(item)}</strong><span>{item.vin || "VIN pendiente"}</span></div>
                    </header>

                    <div className="ip-import-card-meta">
                      <div><span>Naviera</span><strong>{item.shipping_line || "—"}</strong></div>
                      <div><span>ETA</span><strong>{formatDate(item.eta)}</strong></div>
                      <div><span>BL</span><strong>{item.bl_number || "—"}</strong></div>
                      <div><span>Contenedor</span><strong>{item.container_number || "—"}</strong></div>
                    </div>

                    <div className="ip-progress-head"><div><span>ESTADO ACTUAL</span><strong>{item.status_label}</strong></div><b>{progress(item.status)}%</b></div>
                    <div className="ip-progress-track"><span style={{width:`${progress(item.status)}%`}}/></div>

                    <footer>
                      <span className={item.duca_confirmed?"ip-duca ready":"ip-duca"}>{item.duca_confirmed?"✓ DUCA confirmada":"○ DUCA pendiente"}</span>
                      <strong>Ver expediente →</strong>
                    </footer>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : activeView==="documents" ? (
          <section className="ip-documents-page">
            <div className="ip-imports-hero">
              <div>
                <small>ARCHIVOS PUBLICADOS</small>
                <h2>Documentos de tus gestiones</h2>
                <p>Abrí una gestión para consultar las fotos, DUCA, BL, título, factura y demás documentos que tu oficina haya publicado para vos.</p>
              </div>
              <div className="ip-import-count"><small>GESTIONES</small><strong>{imports.length}</strong></div>
            </div>

            {imports.length===0 ? (
              <div className="ip-panel ip-empty">
                <div>📄</div>
                <strong>No hay gestiones con acceso.</strong>
                <p>Cuando tu oficina vincule una gestión a tu cuenta podrás consultar aquí sus archivos publicados.</p>
              </div>
            ) : (
              <div className="ip-document-operation-grid">
                {imports.map(item=>(
                  <article className="ip-document-operation" key={`${item.source_type}-${item.id}`}>
                    <div>
                      <small>{item.source_type==="CUSTOMS_CASE" ? "EXPEDIENTE ADUANAL" : "GESTIÓN DE IMPORTACIÓN"}</small>
                      <strong>{vehicleName(item)}</strong>
                      <span>{item.reference_code} · {item.vin || "VIN pendiente"}</span>
                    </div>

                    <OperationFilesPanel
                      supabase={supabase}
                      sourceType={item.source_type || "IMPORT_MANAGEMENT"}
                      sourceId={item.id}
                      organizationId={item.organization_id}
                      readOnly={true}
                      title="Documentos publicados"
                    />
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeView==="quote" ? (
          <section className="ip-quote-page">
            <div className="ip-imports-hero">
              <div>
                <small>COTIZADOR INCLUIDO · CLIENTE E&amp;R</small>
                <h2>VIN + factura. Calculamos tus impuestos.</h2>
                <p>Ingresá el VIN y el valor real de tu factura. Como cliente activo de E&R, este cotizador está incluido sin límite de consultas.</p>
              </div>
              <div className="ip-quote-benefit">
                <span>🎁 BENEFICIO CLIENTE E&amp;R</span>
                <strong>Cotizador incluido</strong>
                <small>Consultas sin límite mientras tu acceso al Portal esté activo.</small>
              </div>
            </div>

            <form className="ip-quote-card" onSubmit={runImporterQuote}>
              <label>
                <span>VIN DEL VEHÍCULO</span>
                <input
                  value={quoteVin}
                  onChange={e=>setQuoteVin(e.target.value.toUpperCase())}
                  maxLength={17}
                  placeholder="17 caracteres"
                />
              </label>

              <label>
                <span>VALOR DE FACTURA</span>
                <div className="ip-quote-money-input">
                  <b>USD</b>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quoteInvoice}
                    onChange={e=>setQuoteInvoice(e.target.value)}
                    placeholder="Ej. 8500.00"
                  />
                </div>
              </label>

              <button disabled={quoteLoading}>
                {quoteLoading ? "Calculando..." : "Calcular impuestos →"}
              </button>
            </form>

            {quoteError && <div className="ip-message error">{quoteError}</div>}

            {quoteResult && (
              <section className="ip-quote-result">
                <header>
                  <div>
                    <small>RESULTADO</small>
                    <h3>
                      {[quoteResult?.vehicle?.model_year || quoteResult?.vehicle?.year,
                        quoteResult?.vehicle?.make,
                        quoteResult?.vehicle?.model,
                        quoteResult?.vehicle?.trim].filter(Boolean).join(" ")}
                    </h3>
                    <span>{quoteResult?.vehicle?.vin || quoteVin}</span>
                  </div>
                  <div>
                    <small>FACTURA UTILIZADA</small>
                    <strong>{moneyUSD(quoteResult?.invoice_value_usd || quoteInvoice)}</strong>
                  </div>
                </header>

                <div className="ip-quote-result-grid">
                  <article><span>IVA</span><strong>{moneyGTQ(quoteResult?.taxes?.iva_gtq)}</strong></article>
                  <article><span>IPRIMA</span><strong>{moneyGTQ(quoteResult?.taxes?.iprima_gtq)}</strong></article>
                  <article><span>Placas</span><strong>{moneyGTQ(quoteResult?.taxes?.plates_gtq)}</strong></article>
                  <article><span>Total tributos</span><strong>{moneyGTQ(quoteResult?.taxes?.total_taxes_gtq)}</strong></article>
                </div>

                <div className="ip-quote-freight">
                  <span>🚢 Flete marítimo estimado</span>
                  <strong>{moneyUSD(quoteResult?.freight?.price_usd)}</strong>
                  <small>{quoteResult?.freight?.category || "Categoría pendiente"}</small>
                </div>

                {quoteResult?.calculation_status !== "READY" && (
                  <div className="ip-quote-review">
                    ⚠️ Esta cotización requiere revisión antes de iniciar una gestión.
                  </div>
                )}
              </section>
            )}
          </section>
        ) : null}
      </main>

      {showCustomsRequest && (
        <div
          className="ip-request-backdrop"
          onMouseDown={(event)=>{
            if (
              event.target === event.currentTarget &&
              !customsRequestSaving
            ) {
              setShowCustomsRequest(false);
            }
          }}
        >
          <form className="ip-request-modal" onSubmit={submitCustomsRequest}>
            <header>
              <div>
                <small>SOLICITUD DESDE EL PORTAL</small>
                <h2>Solicitar nueva gestión aduanal</h2>
                <p>
                  Completá la información que tengás disponible. E&R revisará
                  la solicitud y terminará de crear el expediente.
                </p>
              </div>

              <button
                type="button"
                onClick={()=>setShowCustomsRequest(false)}
                disabled={customsRequestSaving}
              >
                ×
              </button>
            </header>

            {customsRequestMessage && (
              <div
                className={
                  customsRequestMessage.startsWith("✅")
                    ? "ip-request-message success"
                    : "ip-request-message"
                }
              >
                {customsRequestMessage}
              </div>
            )}

            <section className="ip-request-grid">
              <label className="span-2 required">
                <span>Naviera *</span>
                <input
                  required
                  value={customsRequestForm.shipping_line}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      shipping_line:e.target.value,
                    }))
                  }
                  placeholder="Ej. Port to Port, North Atlantic, Transoceanic..."
                />
                <small>
                  Obligatorio: necesitamos saber dónde recoger los documentos.
                </small>
              </label>

              <label>
                <span>VIN</span>
                <input
                  maxLength="17"
                  value={customsRequestForm.vin}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      vin:e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="17 caracteres"
                />
              </label>

              <label>
                <span>BL</span>
                <input
                  value={customsRequestForm.bl}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      bl:e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Número de BL"
                />
              </label>

              <label>
                <span>Contenedor</span>
                <input
                  value={customsRequestForm.container_number}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      container_number:e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Opcional"
                />
              </label>

              <label>
                <span>ETA / llegada estimada</span>
                <input
                  type="date"
                  value={customsRequestForm.estimated_arrival_date}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      estimated_arrival_date:e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                <span>Año</span>
                <input
                  type="number"
                  min="1900"
                  max="2100"
                  value={customsRequestForm.vehicle_year}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      vehicle_year:e.target.value,
                    }))
                  }
                  placeholder="Ej. 2020"
                />
              </label>

              <label>
                <span>Marca</span>
                <input
                  value={customsRequestForm.vehicle_make}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      vehicle_make:e.target.value,
                    }))
                  }
                  placeholder="Ej. Toyota"
                />
              </label>

              <label className="span-2">
                <span>Modelo / descripción del vehículo</span>
                <input
                  value={customsRequestForm.vehicle_model}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      vehicle_model:e.target.value,
                    }))
                  }
                  placeholder="Ej. Tacoma Double Cab"
                />
              </label>

              <label className="span-2 ip-release-check">
                <input
                  type="checkbox"
                  checked={
                    customsRequestForm.shipping_line_release_confirmed
                  }
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      shipping_line_release_confirmed:e.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>
                    Los documentos ya están liberados por la naviera
                  </strong>
                  <small>
                    Opcional. Marcá esta casilla únicamente si la naviera ya
                    confirmó la liberación.
                  </small>
                </div>
              </label>

              <label className="span-2">
                <span>Observaciones</span>
                <textarea
                  rows="4"
                  value={customsRequestForm.notes}
                  onChange={e=>
                    setCustomsRequestForm(p=>({
                      ...p,
                      notes:e.target.value,
                    }))
                  }
                  placeholder="Cualquier información que debamos conocer antes de iniciar..."
                />
              </label>
            </section>

            <footer>
              <button
                type="button"
                className="secondary"
                onClick={()=>setShowCustomsRequest(false)}
                disabled={customsRequestSaving}
              >
                Cancelar
              </button>

              <button type="submit" disabled={customsRequestSaving}>
                {customsRequestSaving
                  ? "Enviando..."
                  : "Enviar solicitud →"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {selected && (
        <div className="ip-detail-backdrop" onMouseDown={e=>{
          if (e.target===e.currentTarget) {setSelected(null);setDetail(null);}
        }}>
          <aside className="ip-detail-drawer">
            <header className="ip-detail-header">
              <div><small>EXPEDIENTE</small><h2>{vehicleName(selected)}</h2><span>{selected.reference_code} · {selected.vin || "Sin VIN"}</span></div>
              <button onClick={()=>{setSelected(null);setDetail(null)}}>×</button>
            </header>

            {detailLoading ? (
              <div className="ip-detail-loading"><div className="ip-spinner"/><strong>Cargando expediente...</strong></div>
            ) : (
              <>
                <section className="ip-detail-status-card">
                  <div><small>ESTADO ACTUAL</small><strong>{STATUS_LABELS[String(detail?.status || selected.status).toUpperCase()] || selected.status_label}</strong></div>
                </section>

                <section className="ip-detail-grid">
                  <div><span>Naviera</span><strong>{detail?.shipping_line || selected.shipping_line || "—"}</strong></div>
                  <div><span>Fecha de embarque</span><strong>{formatDate(detail?.shipped_at || selected.shipped_at)}</strong></div>
                  <div><span>ETA</span><strong>{formatDate(detail?.eta || selected.eta)}</strong></div>
                  <div><span>BL</span><strong>{detail?.bl_number || selected.bl_number || "—"}</strong></div>
                  <div><span>Contenedor</span><strong>{detail?.container_number || selected.container_number || "—"}</strong></div>
                  <div><span>DUCA</span><strong>{(detail?.duca_confirmed ?? selected.duca_confirmed)?"Confirmada":"Pendiente"}</strong></div>
                </section>

                <OperationFilesPanel
                  supabase={supabase}
                  sourceType={selected.source_type || "IMPORT_MANAGEMENT"}
                  sourceId={selected.id}
                  organizationId={selected.organization_id || detail?.organization_id}
                  readOnly={true}
                  title={selected.source_type === "CUSTOMS_CASE"
                    ? "Fotos y documentos del expediente aduanal"
                    : "Fotos y documentos publicados"}
                />
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
