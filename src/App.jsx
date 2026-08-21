import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { supabase } from "./supabaseClient";
import eyrSolutionsLogo from "./assets/eyr-solutions-logo.png";
import "./App.css";

function moneyGTQ(value) {
  if (value === null || value === undefined || value === "") return "—";

  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

function moneyUSD(value) {
  if (value === null || value === undefined || value === "") return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

function humanSatStatus(status) {
  const labels = {
    AUTOMATIC_MATCH: "Coincidencia automática",
    MANUAL_RESOLUTION: "Resolución aprendida",
    EXCEPTIONAL_RESOLUTION: "Resolución excepcional",
    AMBIGUOUS_VARIANT: "Variante por confirmar",
    REVIEW_REQUIRED: "Revisión requerida",
    NO_MATCH: "Sin coincidencia",
  };

  return labels[status] || status || "—";
}

function humanConfidence(confidence) {
  const labels = {
    AUTOMATIC_MATCH: "Alta",
    MANUAL_RESOLUTION: "Confirmada",
    EXCEPTIONAL_RESOLUTION: "Confirmada externamente",
    MANUAL_REVIEW: "Requiere revisión",
  };

  return labels[confidence] || confidence || "—";
}

function humanFuel(value) {
  const labels = {
    Gasoline: "Gasolina",
    Diesel: "Diésel",
    "Flexible Fuel Vehicle (FFV)": "Combustible flexible",
    Electricity: "Eléctrico",
  };

  return labels[value] || value || "—";
}

function humanDrive(value) {
  if (!value) return "—";

  const normalized = value.toUpperCase();

  if (
    normalized.includes("4WD") ||
    normalized.includes("4-WHEEL") ||
    normalized.includes("4 WHEEL") ||
    normalized.includes("4X4")
  ) {
    return "4x4";
  }

  if (normalized.includes("AWD")) {
    return "AWD";
  }

  if (
    normalized.includes("FWD") ||
    normalized.includes("FRONT")
  ) {
    return "Tracción delantera";
  }

  if (
    normalized.includes("RWD") ||
    normalized.includes("REAR")
  ) {
    return "Tracción trasera";
  }

  if (normalized.includes("4X2")) {
    return "4x2";
  }

  return value;
}

function percentToDecimal(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  return number / 100;
}

function displayTaxRate(value, fallback = null) {
  const number = Number(value ?? fallback);

  if (!Number.isFinite(number)) return "—";

  const percent = Math.abs(number) <= 1 ? number * 100 : number;

  return `${new Intl.NumberFormat("es-GT", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(percent) ? 0 : 2,
  }).format(percent)}%`;
}

function normalizeWhatsAppNumber(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function buildWhatsAppUrl(number, message) {
  const cleanNumber = normalizeWhatsAppNumber(number);
  if (!cleanNumber) return "";
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}


const CUSTOMS_STAGES = [
  ["docs_collected_at", "Documentos recogidos"],
  ["emptied_at", "Vaciado"],
  ["da_at", "DA"],
  ["corroboration_at", "Corroboración"],
  ["digitization_started_at", "Inicio digitación"],
  ["review_started_at", "En revisión"],
  ["declaration_signed_at", "Firma declaración"],
  ["iva_form_sent_at", "Formulario IVA enviado"],
  ["iva_paid_at", "IVA pagado"],
  ["selective_at", "Selectivo"],
  ["port_exit_at", "Salida del puerto"],
  ["docs_set_built_at", "Juego de documentos armado"],
  ["envelope_ready_at", "Sobre preparado"],
  ["delivered_at", "Vehículo / documentos entregados"],
];

function emptyCustomsForm() {
  return {
    notice_date: new Date().toISOString().slice(0, 10),
    client_name: "",
    phone: "",
    email: "",
    bl: "",
    container_number: "",
    vin: "",
    make: "",
    model: "",
    vehicle_trim: "",
    model_year: "",
    shipping_line: "",
    responsible: "",
    priority: "Normal",

    sat_vehicle_id: "",
    sat_line: "",
    sat_vehicle_type: "",
    sat_match_score: "",
    taxable_value_gtq: "",
    iva_rate: "",
    iva_gtq: "",
    iprima_rate: "",
    iprima_gtq: "",
    plates_gtq: "",
    total_taxes_gtq: "",
    tax_status: "PENDIENTE",

    document_collection_gtq: "",
    port_expenses_gtq: "",
    professional_fees_gtq: "",
    other_charges_gtq: "",
    other_charges_note: "",
    crane_usd: "",
  };
}


function getVehicleDisplayVersion(vehicle, sat) {
  const nativeVersion = [vehicle?.series, vehicle?.trim]
    .filter(Boolean)
    .join(" • ")
    .trim();

  if (nativeVersion) {
    return nativeVersion;
  }

  const satLine =
    sat?.selected_match?.line ||
    sat?.best_match?.line ||
    "";

  const model = String(vehicle?.model || "").trim();

  if (!satLine || !model) {
    return "Versión no especificada";
  }

  const normalizedLine = String(satLine).trim();
  const escapedModel = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Quita el modelo base del inicio de la línea SAT.
  // Ej.: "OUTLANDER XLS" -> "XLS"
  //      "HIGHLANDER LE AWD" -> "LE AWD"
  const variant = normalizedLine
    .replace(new RegExp(`^${escapedModel}\\s*`, "i"), "")
    .trim();

  if (!variant || variant.toUpperCase() === model.toUpperCase()) {
    return "Versión no especificada";
  }

  return `Versión ${variant}`;
}

function App() {
  // V22.1 · Landing pública + cotizador + sistema interno
  // Todas las Edge Functions reciben explícitamente el JWT de la sesión activa.
  async function invokeFunction(functionName, options = {}) {
    const {
      data: { session: currentSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!currentSession?.access_token) {
      throw new Error("La sesión expiró. Iniciá sesión nuevamente.");
    }

    return await supabase.functions.invoke(functionName, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        Authorization: `Bearer ${currentSession.access_token}`,
      },
    });
  }

  // V22 · Landing pública + cotizador para clientes + sistema interno
  const routeFromPath = () => {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/app" || path.startsWith("/app/")) return "internal";
    if (path === "/cotizador" || path.startsWith("/cotizador/")) return "public";
    return "landing";
  };

  const [siteMode, setSiteMode] = useState(routeFromPath);
  const [customerAuthMode, setCustomerAuthMode] = useState("guest");
  const [customerAuthLoading, setCustomerAuthLoading] = useState(false);
  const [customerAuthError, setCustomerAuthError] = useState("");
  const [customerAuthMessage, setCustomerAuthMessage] = useState("");
  const [customerForm, setCustomerForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [publicVin, setPublicVin] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicResult, setPublicResult] = useState(null);
  const [publicError, setPublicError] = useState("");
  const [publicQuotaRemaining, setPublicQuotaRemaining] = useState(null);
  const [subscriptionRequestLoading, setSubscriptionRequestLoading] = useState(false);

  const [appSettings, setAppSettings] = useState({ whatsapp_number: "" });
  const [settingsForm, setSettingsForm] = useState({ whatsapp_number: "" });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");

  // V21 · Autenticación interna E&R
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // V16 · Cotización comercial para cliente
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteGenerating, setQuoteGenerating] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    include_freight: true,
    document_collection_gtq: "",
    port_expenses_gtq: "",
    professional_fees_gtq: "",
    crane_usd: "",
  });
  const quoteRef = useRef(null);
  const [quoteCode, setQuoteCode] = useState("");

  // V20 · Historial de cotizaciones
  const [activeView, setActiveView] = useState("new");
  const [quotationSearch, setQuotationSearch] = useState("");
  const [quotations, setQuotations] = useState([]);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationError, setQuotationError] = useState("");
  const [selectedQuotation, setSelectedQuotation] = useState(null);

  // V22.6 · Prospectos / captación comercial
  const [prospectSearch, setProspectSearch] = useState("");
  const [prospects, setProspects] = useState([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [prospectsError, setProspectsError] = useState("");
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [prospectQueries, setProspectQueries] = useState([]);
  const [prospectQueriesLoading, setProspectQueriesLoading] = useState(false);
  const [prospectStatusForm, setProspectStatusForm] = useState({
    status: "NUEVO",
    notes: "",
  });
  const [prospectSaving, setProspectSaving] = useState(false);
  const [prospectMessage, setProspectMessage] = useState("");
  const [prospectQuoteLoadingId, setProspectQuoteLoadingId] = useState(null);
  const [quoteRecipient, setQuoteRecipient] = useState(null);

  // V23 · Control Aduanal
  const [customsSearch, setCustomsSearch] = useState("");
  const [customsCases, setCustomsCases] = useState([]);
  const [customsLoading, setCustomsLoading] = useState(false);
  const [customsError, setCustomsError] = useState("");
  const [showCustomsForm, setShowCustomsForm] = useState(false);
  const [customsForm, setCustomsForm] = useState(emptyCustomsForm());
  const [customsDecodeLoading, setCustomsDecodeLoading] = useState(false);
  const [customsDecodeResult, setCustomsDecodeResult] = useState(null);
  const [customsSaving, setCustomsSaving] = useState(false);
  const [selectedCustomsCase, setSelectedCustomsCase] = useState(null);
  const [customsDetail, setCustomsDetail] = useState(null);
  const [customsDetailSaving, setCustomsDetailSaving] = useState(false);
  const [customsMessage, setCustomsMessage] = useState("");

  // V24 · Gestiones de Importación
  const [importSearch, setImportSearch] = useState("");
  const [importManagements, setImportManagements] = useState([]);
  const [importManagementsLoading, setImportManagementsLoading] = useState(false);
  const [importManagementsError, setImportManagementsError] = useState("");
  const [selectedImportManagement, setSelectedImportManagement] = useState(null);
  const [importManagementDetail, setImportManagementDetail] = useState(null);
  const [importManagementSaving, setImportManagementSaving] = useState(false);
  const [importManagementMessage, setImportManagementMessage] = useState("");
  const [convertingQueryId, setConvertingQueryId] = useState(null);

  const [selectedSatId, setSelectedSatId] = useState(null);
  const [selectedDimension, setSelectedDimension] = useState(null);

  const [dimensionConfirmed, setDimensionConfirmed] = useState(false);
  const [dimensionForm, setDimensionForm] = useState({
    length_inches: "",
    width_inches: "",
    height_inches: "",
    wheelbase_inches: "",
    curb_weight_lb: "",
    source: "",
    source_url: "",
    source_notes: "",
    apply_scope: "EXACT",
  });

  const [showCatalogSearch, setShowCatalogSearch] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogHasSearched, setCatalogHasSearched] = useState(false);
  const [catalogResults, setCatalogResults] = useState([]);

  const [showExceptionalForm, setShowExceptionalForm] = useState(false);
  const [exceptionalConfirmed, setExceptionalConfirmed] = useState(false);
  const [exceptionalForm, setExceptionalForm] = useState({
    manual_line: "",
    manual_vehicle_type: "",
    manual_taxable_value: "",
    manual_iprima_percent: "",
    verification_source: "SAT Guatemala",
    notes: "",
  });

  async function loadInternalProfile(userId) {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, active, free_quotes_used, subscription_status, subscription_expires_at")
      .eq("id", userId)
      .single();

    if (profileError) {
      throw profileError;
    }

    setProfile(data);
    return data;
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!mounted) return;

        const currentSession = data?.session || null;
        setSession(currentSession);

        if (currentSession?.user?.id) {
          await loadInternalProfile(currentSession.user.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (mounted) {
          setAuthError(
            err?.message || "No fue posible validar la sesión."
          );
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    initializeAuth();

    const { data: authListener } =
      supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);

        if (nextSession?.user?.id) {
          try {
            await loadInternalProfile(nextSession.user.id);
          } catch (err) {
            if (mounted) {
              setAuthError(
                err?.message || "No fue posible cargar el perfil."
              );
            }
          }
        } else {
          setProfile(null);
        }

        if (mounted) setAuthLoading(false);
      });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);


  useEffect(() => {
    const onPopState = () => setSiteMode(routeFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => { loadAppSettings(); }, []);

  function navigateSite(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setSiteMode(
      path.startsWith("/app")
        ? "internal"
        : path.startsWith("/cotizador")
          ? "public"
          : "landing"
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadAppSettings() {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["whatsapp_number"]);
      if (error) throw error;
      const next = { whatsapp_number: "" };
      for (const row of data || []) {
        if (row.setting_key === "whatsapp_number") next.whatsapp_number = String(row.setting_value || "");
      }
      setAppSettings(next);
      setSettingsForm(next);
      return next;
    } catch (err) {
      console.error(err);
      setSettingsError(err?.message || "No fue posible cargar la configuración.");
      return null;
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveAppSettings(event) {
    event?.preventDefault?.();
    setSettingsSaving(true);
    setSettingsMessage("");
    setSettingsError("");
    try {
      const cleanWhatsapp = normalizeWhatsAppNumber(settingsForm.whatsapp_number);
      if (!cleanWhatsapp || cleanWhatsapp.length < 8) {
        throw new Error("Ingresá el número con código de país. Ejemplo: 50255555555.");
      }

      const { error } = await supabase.rpc("update_app_setting", {
        p_setting_key: "whatsapp_number",
        p_setting_value: cleanWhatsapp,
      });
      if (error) throw error;

      const next = { ...appSettings, whatsapp_number: cleanWhatsapp };
      setAppSettings(next);
      setSettingsForm(next);
      setSettingsMessage("Configuración guardada correctamente.");
    } catch (err) {
      console.error(err);
      setSettingsError(err?.message || "No fue posible guardar la configuración.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function openSettingsView() {
    setActiveView("settings");
    loadAppSettings();
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getSession();
    const currentUserId = data?.session?.user?.id;
    if (!currentUserId) {
      setProfile(null);
      return null;
    }
    return await loadInternalProfile(currentUserId);
  }

  async function handleGuestAccess(event) {
    event.preventDefault();
    setCustomerAuthError("");
    setCustomerAuthMessage("");

    const fullName = customerForm.full_name.trim();
    const email = customerForm.email.trim().toLowerCase();
    const phone = customerForm.phone.trim();

    if (!fullName || !email || !phone) {
      setCustomerAuthError("Completá nombre, correo y número de celular.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCustomerAuthError("Ingresá un correo electrónico válido.");
      return;
    }

    if (!/^[+0-9()\-\s]{8,20}$/.test(phone)) {
      setCustomerAuthError("Ingresá un número de celular válido.");
      return;
    }

    try {
      setCustomerAuthLoading(true);

      const { data, error: guestError } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            full_name: fullName,
            email,
            phone,
            lead_source: "PUBLIC_QUOTER",
          },
        },
      });

      if (guestError) throw guestError;
      if (!data?.user?.id || !data?.session) {
        throw new Error("No fue posible iniciar la prueba gratuita.");
      }

      const nextProfile = await loadInternalProfile(data.user.id);
      setSession(data.session);
      setProfile(nextProfile);
      setCustomerAuthMessage("Listo. Ya podés hacer tu primera cotización gratuita.");
    } catch (err) {
      const rawMessage = String(err?.message || "");
      const anonymousDisabled =
        rawMessage.toLowerCase().includes("anonymous") ||
        rawMessage.toLowerCase().includes("disabled");

      setCustomerAuthError(
        anonymousDisabled
          ? "La prueba gratuita todavía no está habilitada en Supabase Auth. Activá Anonymous Sign-Ins y volvé a intentar."
          : rawMessage || "No fue posible iniciar la prueba gratuita."
      );
    } finally {
      setCustomerAuthLoading(false);
    }
  }

  async function preparePaidAccount() {
    const keepName = profile?.full_name || customerForm.full_name || "";
    const keepEmail = profile?.email || customerForm.email || "";
    const keepPhone = profile?.phone || customerForm.phone || "";

    if (session?.user?.is_anonymous) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    }

    setCustomerForm({
      full_name: keepName,
      email: keepEmail,
      phone: keepPhone,
      password: "",
    });
    setCustomerAuthMode("register");
    setCustomerAuthError("");
    setCustomerAuthMessage(
      "Creá tu cuenta para solicitar o activar una suscripción mensual."
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCustomerAuth(event) {
    event.preventDefault();
    setCustomerAuthError("");
    setCustomerAuthMessage("");

    const email = customerForm.email.trim().toLowerCase();
    const password = customerForm.password;
    const fullName = customerForm.full_name.trim();
    const phone = customerForm.phone.trim();

    if (
      !email ||
      !password ||
      (customerAuthMode === "register" && (!fullName || !phone))
    ) {
      setCustomerAuthError("Completá nombre, correo, celular y contraseña.");
      return;
    }

    if (
      customerAuthMode === "register" &&
      !/^[+0-9()\-\s]{8,20}$/.test(phone)
    ) {
      setCustomerAuthError("Ingresá un número de celular válido.");
      return;
    }

    if (password.length < 6) {
      setCustomerAuthError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    try {
      setCustomerAuthLoading(true);

      if (customerAuthMode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data?.session?.user?.id) {
          const nextProfile = await loadInternalProfile(data.session.user.id);
          setSession(data.session);
          setProfile(nextProfile);
          setCustomerAuthMessage("Cuenta creada. Ya podés utilizar tu cotizador.");
        } else {
          setCustomerAuthMessage(
            "Cuenta creada. Revisá tu correo para confirmar la cuenta y luego iniciá sesión."
          );
          setCustomerAuthMode("login");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        if (!data?.user?.id) throw new Error("No fue posible iniciar sesión.");

        const nextProfile = await loadInternalProfile(data.user.id);
        if (!nextProfile?.active) {
          await supabase.auth.signOut();
          throw new Error("Tu cuenta se encuentra desactivada.");
        }

        setSession(data.session);
        setProfile(nextProfile);

        const role = String(nextProfile?.role || "").toUpperCase();
        if (["ADMIN", "OPERADOR"].includes(role)) {
          navigateSite("/app");
        }
      }

      setCustomerForm((prev) => ({
        full_name: prev.full_name,
        email: "",
        phone: prev.phone,
        password: "",
      }));
    } catch (err) {
      setCustomerAuthError(
        err?.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : err?.message || "No fue posible continuar."
      );
    } finally {
      setCustomerAuthLoading(false);
    }
  }

  async function handleCustomerLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPublicResult(null);
    setPublicVin("");
    setPublicError("");
    setPublicQuotaRemaining(null);
  }

  async function consultarPublico() {
    const cleanVin = publicVin.trim().toUpperCase();
    if (cleanVin.length !== 17 || !session) return;

    setPublicLoading(true);
    setPublicError("");
    setPublicResult(null);

    try {
      const { data, error: functionError } = await invokeFunction(
        "decode-vin",
        { body: { vin: cleanVin } }
      );

      if (functionError) throw functionError;

      if (!data?.success) {
        if (data?.code === "SUBSCRIPTION_REQUIRED") {
          if (data?.access?.remaining_count !== undefined && data?.access?.remaining_count !== null) {
            setPublicQuotaRemaining(Number(data.access.remaining_count));
          }
          await refreshProfile();
          setPublicError("FREE_LIMIT_REACHED");
          return;
        }
        throw new Error(data?.error || "No fue posible consultar el vehículo.");
      }

      setPublicResult(data);

      console.log("PUBLIC QUOTA ACCESS:", data?.access || null);

      if (data?.access?.remaining_count !== undefined && data?.access?.remaining_count !== null) {
        setPublicQuotaRemaining(Number(data.access.remaining_count));
      }

      await refreshProfile();
    } catch (err) {
      console.error(err);
      setPublicError(err?.message || "No fue posible consultar el vehículo.");
    } finally {
      setPublicLoading(false);
    }
  }

  async function markImportRequest(queryId = null) {
    try {
      const { error: requestError } = await supabase.rpc(
        "customer_mark_import_request",
        { p_query_id: queryId }
      );
      if (requestError) console.error("IMPORT REQUEST LOG ERROR:", requestError);
    } catch (err) {
      console.error("IMPORT REQUEST LOG EXCEPTION:", err);
    }
  }

  async function requestSubscription() {
    if (!session) return;
    setSubscriptionRequestLoading(true);
    setCustomerAuthMessage("");
    setCustomerAuthError("");

    try {
      const { data, error: functionError } = await invokeFunction(
        "subscription-manager",
        { body: { action: "request" } }
      );
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || "No fue posible registrar la solicitud.");
      await refreshProfile();
      setCustomerAuthMessage(
        "Solicitud registrada. E&R podrá activar tu plan mensual cuando se confirme el pago."
      );
    } catch (err) {
      setCustomerAuthError(err?.message || "No fue posible registrar la solicitud.");
    } finally {
      setSubscriptionRequestLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");

    const email = loginForm.email.trim().toLowerCase();
    const password = loginForm.password;

    if (!email || !password) {
      setAuthError("Ingresá tu correo y contraseña.");
      return;
    }

    try {
      setLoginLoading(true);

      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (loginError) throw loginError;
      if (!data?.user?.id) {
        throw new Error("No fue posible iniciar sesión.");
      }

      const internalProfile = await loadInternalProfile(data.user.id);
      const role = String(internalProfile?.role || "").toUpperCase();

      if (!internalProfile?.active) {
        await supabase.auth.signOut();
        throw new Error("Tu usuario está desactivado. Contactá al administrador.");
      }

      if (!["ADMIN", "OPERADOR"].includes(role)) {
        await supabase.auth.signOut();
        throw new Error(
          "Esta cuenta no tiene acceso al sistema interno de E&R."
        );
      }

      setSession(data.session);
      setLoginForm({ email: "", password: "" });
    } catch (err) {
      setAuthError(
        err?.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : err?.message || "No fue posible iniciar sesión."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    setAuthError("");
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setResult(null);
    setVin("");
    setActiveView("new");
  }

  function resetReviewState() {
    setSelectedSatId(null);
    setSelectedDimension(null);
    setDimensionConfirmed(false);
    setDimensionForm({
      length_inches: "",
      width_inches: "",
      height_inches: "",
      wheelbase_inches: "",
      curb_weight_lb: "",
      source: "",
      source_url: "",
      source_notes: "",
      apply_scope: "EXACT",
    });
    setShowCatalogSearch(false);
    setCatalogQuery("");
    setCatalogLoading(false);
    setCatalogHasSearched(false);
    setCatalogResults([]);
    setShowExceptionalForm(false);
    setExceptionalConfirmed(false);
    setExceptionalForm({
      manual_line: "",
      manual_vehicle_type: "",
      manual_taxable_value: "",
      manual_iprima_percent: "",
      verification_source: "SAT Guatemala",
      notes: "",
    });
  }

  async function ejecutarDecode(cleanVin, clearResult = true) {
    if (clearResult) {
      setResult(null);
    }

    const { data, error: functionError } =
      await invokeFunction("decode-vin", {
        body: {
          vin: cleanVin,
        },
      });

    if (functionError) {
      throw functionError;
    }

    if (!data?.success) {
      throw new Error(
        data?.error || "No fue posible consultar el vehículo."
      );
    }

    setResult(data);

    resetReviewState();

    return data;
  }

  async function consultarVehiculo() {
    const cleanVin = vin.trim().toUpperCase();

    if (cleanVin.length !== 17) return;

    setLoading(true);
    setError("");

    try {
      await ejecutarDecode(cleanVin);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Ocurrió un error al consultar el vehículo."
      );
    } finally {
      setLoading(false);
    }
  }

  function abrirBuscadorSat() {
    const defaultQuery = result?.vehicle?.model || "";
    setShowCatalogSearch(true);
    setCatalogQuery(defaultQuery);
    setCatalogResults([]);
    setCatalogHasSearched(false);
    setSelectedSatId(null);
    setShowExceptionalForm(false);
    setError("");
  }

  async function buscarCatalogoSat(searchText = catalogQuery) {
    if (!result?.vehicle?.vin) return;

    const cleanQuery = String(searchText || "").trim();
    if (cleanQuery.length < 2) {
      setError("Escribí al menos 2 caracteres para buscar en el catálogo SAT.");
      return;
    }

    setCatalogLoading(true);
    setError("");
    setSelectedSatId(null);

    try {
      const { data, error: searchError } =
        await invokeFunction("search-sat", {
          body: {
            vin: result.vehicle.vin,
            query: cleanQuery,
          },
        });

      if (searchError) throw searchError;
      if (!data?.success) {
        throw new Error(data?.error || "No fue posible buscar en el catálogo SAT.");
      }

      setCatalogResults(data.results || []);
      setCatalogHasSearched(true);
    } catch (err) {
      console.error(err);
      setError(err?.message || "No fue posible buscar en el catálogo SAT.");
    } finally {
      setCatalogLoading(false);
    }
  }

  function handleCatalogKeyDown(event) {
    if (event.key === "Enter" && !catalogLoading) {
      event.preventDefault();
      buscarCatalogoSat();
    }
  }

  async function confirmarSat() {
    if (!selectedSatId || !result?.vehicle?.vin) return;

    setReviewLoading(true);
    setError("");

    try {
      const { data, error: resolveError } =
        await invokeFunction("resolve-review", {
          body: {
            type: "SAT",
            vin: result.vehicle.vin,
            sat_vehicle_id: Number(selectedSatId),
            notes:
              "Línea SAT confirmada desde la pantalla de revisión inteligente",
          },
        });

      if (resolveError) {
        throw resolveError;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "No fue posible guardar la resolución SAT."
        );
      }

      await ejecutarDecode(result.vehicle.vin, false);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "No fue posible confirmar la línea SAT."
      );
    } finally {
      setReviewLoading(false);
    }
  }

  async function confirmarSatExcepcional() {
    if (!result?.vehicle?.vin) return;

    const taxableValue = Number(exceptionalForm.manual_taxable_value);
    const iprimaRate = percentToDecimal(exceptionalForm.manual_iprima_percent);

    if (!exceptionalForm.manual_line.trim()) {
      setError("Ingresá la línea o referencia SAT confirmada.");
      return;
    }
    if (!exceptionalForm.manual_vehicle_type.trim()) {
      setError("Ingresá el tipo de vehículo según SAT.");
      return;
    }
    if (!Number.isFinite(taxableValue) || taxableValue <= 0) {
      setError("Ingresá un valor imponible SAT válido.");
      return;
    }
    if (iprimaRate === null || iprimaRate < 0 || iprimaRate > 1) {
      setError("Ingresá una tasa IPRIMA válida entre 0% y 100%.");
      return;
    }
    if (!exceptionalForm.verification_source.trim()) {
      setError("Indicá la fuente donde verificaste el valor SAT.");
      return;
    }
    if (!exceptionalConfirmed) {
      setError("Debés confirmar que verificaste externamente el valor SAT.");
      return;
    }

    setReviewLoading(true);
    setError("");

    try {
      const { data, error: resolveError } =
        await invokeFunction("resolve-review", {
          body: {
            type: "SAT_EXCEPTIONAL",
            vin: result.vehicle.vin,
            manual_line: exceptionalForm.manual_line.trim(),
            manual_vehicle_type: exceptionalForm.manual_vehicle_type.trim(),
            manual_taxable_value: taxableValue,
            manual_iprima_rate: iprimaRate,
            manual_iva_rate: 0.12,
            manual_plates_gtq: 75,
            verification_source: exceptionalForm.verification_source.trim(),
            notes:
              exceptionalForm.notes.trim() ||
              "Resolución SAT excepcional confirmada desde E&R Vehicle Import",
          },
        });

      if (resolveError) throw resolveError;
      if (!data?.success) {
        throw new Error(data?.error || "No fue posible guardar la resolución SAT excepcional.");
      }

      await ejecutarDecode(result.vehicle.vin, false);
    } catch (err) {
      console.error(err);
      setError(err?.message || "No fue posible guardar la resolución excepcional.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function confirmarDimension() {
    if (!selectedDimension || !result?.vehicle?.vin) return;

    setReviewLoading(true);
    setError("");

    try {
      const { data, error: resolveError } =
        await invokeFunction("resolve-review", {
          body: {
            type: "DIMENSION",
            vin: result.vehicle.vin,

            dimension_model:
              selectedDimension.dimension_model,

            length_inches:
              selectedDimension.length_inches,

            width_inches:
              selectedDimension.width_inches ?? null,

            height_inches:
              selectedDimension.height_inches ?? null,

            wheelbase_inches:
              selectedDimension.wheelbase_inches ?? null,

            curb_weight_lb:
              selectedDimension.curb_weight_lb ?? null,

            notes:
              "Configuración confirmada desde la pantalla de revisión inteligente",
          },
        });

      if (resolveError) {
        throw resolveError;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "No fue posible guardar la resolución de dimensiones."
        );
      }

      await ejecutarDecode(result.vehicle.vin, false);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "No fue posible confirmar la configuración."
      );
    } finally {
      setReviewLoading(false);
    }
  }

  async function guardarDimensionesVerificadas() {
    if (!result?.vehicle?.vin) return;

    const length = Number(dimensionForm.length_inches);

    if (!Number.isFinite(length) || length <= 0) {
      setError("Ingresá un largo válido en pulgadas.");
      return;
    }

    if (!dimensionForm.source.trim()) {
      setError("Indicá la fuente donde verificaste las dimensiones.");
      return;
    }

    if (!dimensionConfirmed) {
      setError("Debés confirmar que verificaste las dimensiones antes de guardarlas.");
      return;
    }

    setReviewLoading(true);
    setError("");

    try {
      const toNumberOrNull = (value) => {
        if (value === "" || value === null || value === undefined) return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };

      const { data, error: resolveError } =
        await invokeFunction("resolve-dimension", {
          body: {
            vin: result.vehicle.vin,
            length_inches: length,
            width_inches: toNumberOrNull(dimensionForm.width_inches),
            height_inches: toNumberOrNull(dimensionForm.height_inches),
            wheelbase_inches: toNumberOrNull(dimensionForm.wheelbase_inches),
            curb_weight_lb: toNumberOrNull(dimensionForm.curb_weight_lb),
            source: dimensionForm.source.trim(),
            source_url: dimensionForm.source_url.trim() || null,
            source_notes: dimensionForm.source_notes.trim() || null,
            apply_scope: dimensionForm.apply_scope,
            confirmed: true,
          },
        });

      if (resolveError) throw resolveError;
      if (!data?.success) {
        throw new Error(data?.error || "No fue posible guardar las dimensiones verificadas.");
      }

      await ejecutarDecode(result.vehicle.vin, false);
    } catch (err) {
      console.error(err);
      setError(err?.message || "No fue posible guardar las dimensiones verificadas.");
    } finally {
      setReviewLoading(false);
    }
  }

  function makeQuoteCode(vinOverride = null) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const codeVin = vinOverride || vehicle?.vin || "VIN";
    return `ER-${y}${m}${d}-${hh}${mm}${ss}-${codeVin.slice(-6)}`;
  }

  function openQuoteModal() {
    const freightReady =
      !result?.freight_requires_review &&
      Number(result?.freight?.price_usd || 0) > 0;

    setQuoteForm({
      include_freight: freightReady,
      document_collection_gtq: "",
      port_expenses_gtq: "",
      professional_fees_gtq: "",
      crane_usd: "",
    });
    setQuoteCode(makeQuoteCode());
    setShowQuoteModal(true);
  }

  function closeQuoteModal() {
    if (quoteGenerating) return;
    setShowQuoteModal(false);
  }

  function quoteNumber() {
    return quoteCode || makeQuoteCode();
  }

  async function saveCurrentQuotation() {
    const payload = {
      quote_code: quoteNumber(),
      vin: vehicle?.vin,
      model_year: vehicle?.model_year,
      make: vehicle?.make,
      model: vehicle?.model,
      trim: vehicle?.trim,
      sat_vehicle_id: sat?.selected_match?.sat_vehicle_id ?? sat?.best_match?.sat_vehicle_id ?? null,
      sat_line: summary?.sat_line ?? sat?.selected_match?.line ?? null,
      sat_match_score: summary?.sat_match_score ?? sat?.selected_match?.match_score ?? null,
      sat_match_status: summary?.sat_match_status ?? sat?.match_status ?? null,
      sat_confidence: summary?.sat_confidence ?? sat?.selected_match?.confidence ?? null,
      sat_value_gtq: summary?.sat_value_gtq ?? taxes?.taxable_value_gtq ?? null,
      iva_gtq: taxes?.iva_gtq ?? 0,
      iprima_gtq: taxes?.iprima_gtq ?? 0,
      plates_gtq: taxes?.plates_gtq ?? 0,
      document_collection_gtq: quoteDocumentCollection,
      port_expenses_gtq: quotePortExpenses,
      professional_fees_gtq: quoteProfessionalFees,
      total_guatemala_gtq: quoteGuatemalaTotal,
      exchange_rate: quoteExchangeRate || null,
      total_guatemala_usd: quoteGuatemalaUsd,
      freight_category: freight?.category ?? summary?.freight_category ?? null,
      freight_usd: quoteFreightUsd,
      crane_usd: quoteCraneUsd,
      total_usd: quoteGrandTotalUsd,
      length_inches: dimensions?.length_inches ?? summary?.length_inches ?? null,
      dimension_model: dimensions?.dimension_model ?? summary?.dimension_model ?? null,
      dimension_source: dimensions?.dimension_source ?? vehicle?.dimension_source ?? null,
      quote_snapshot: {
        vehicle: {
          vin: vehicle?.vin, model_year: vehicle?.model_year, make: vehicle?.make,
          model: vehicle?.model, trim: vehicle?.trim, engine_liters: vehicle?.engine_liters,
          cylinders: vehicle?.cylinders, fuel_type: vehicle?.fuel_type, drive_type: vehicle?.drive_type,
        },
        sat: {
          line: summary?.sat_line ?? sat?.selected_match?.line ?? null,
          match_score: summary?.sat_match_score ?? sat?.selected_match?.match_score ?? null,
          match_status: summary?.sat_match_status ?? sat?.match_status ?? null,
          confidence: summary?.sat_confidence ?? sat?.selected_match?.confidence ?? null,
          taxable_value_gtq: summary?.sat_value_gtq ?? taxes?.taxable_value_gtq ?? null,
        },
        taxes: {
          iva_gtq: taxes?.iva_gtq ?? 0, iprima_gtq: taxes?.iprima_gtq ?? 0,
          plates_gtq: taxes?.plates_gtq ?? 0, total_taxes_gtq: taxes?.total_taxes_gtq ?? 0,
        },
        costs: {
          document_collection_gtq: quoteDocumentCollection, port_expenses_gtq: quotePortExpenses,
          professional_fees_gtq: quoteProfessionalFees, total_guatemala_gtq: quoteGuatemalaTotal,
        },
        freight: {
          category: freight?.category ?? null, price_usd: quoteFreightUsd, crane_usd: quoteCraneUsd,
          length_inches: dimensions?.length_inches ?? summary?.length_inches ?? null,
          dimension_model: dimensions?.dimension_model ?? summary?.dimension_model ?? null,
        },
        totals: {
          exchange_rate: quoteExchangeRate || null, total_guatemala_usd: quoteGuatemalaUsd,
          total_usd: quoteGrandTotalUsd,
        },
      },
    };

    const { data, error: functionError } = await invokeFunction("quotation-manager", {
      body: { action: "save", quotation: payload },
    });

    if (functionError) throw functionError;
    if (!data?.success) throw new Error(data?.error || "No fue posible guardar la cotización.");
    return data.quotation;
  }

  async function loadImportManagements(search = importSearch) {
    setImportManagementsLoading(true);
    setImportManagementsError("");

    try {
      let query = supabase
        .from("import_managements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      const clean = String(search || "").trim();
      if (clean) {
        const safe = clean.replace(/[%(),]/g, " ");
        query = query.or(
          `management_code.ilike.%${safe}%,client_name.ilike.%${safe}%,vin.ilike.%${safe}%,quote_code.ilike.%${safe}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setImportManagements(data || []);
    } catch (err) {
      console.error("IMPORT MANAGEMENT LOAD ERROR:", err);
      setImportManagementsError(err?.message || "No fue posible cargar las gestiones.");
    } finally {
      setImportManagementsLoading(false);
    }
  }

  function openImportManagementsView() {
    setActiveView("imports");
    setSelectedImportManagement(null);
    setImportManagementDetail(null);
    setImportManagementMessage("");
    loadImportManagements("");
  }

  async function convertProspectToImportManagement(query) {
    if (!query?.id) return;
    setConvertingQueryId(query.id);
    setProspectsError("");
    setProspectMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_create_import_management",
        { p_query_id: query.id }
      );
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      setProspectMessage(
        row?.management_code
          ? `Gestión ${row.management_code} creada correctamente.`
          : "Gestión de importación creada correctamente."
      );

      await loadProspectQueries(selectedProspect?.contact_key);
      await loadProspects(prospectSearch);
    } catch (err) {
      console.error("CONVERT IMPORT MANAGEMENT ERROR:", err);
      setProspectsError(err?.message || "No fue posible convertir el prospecto en gestión.");
    } finally {
      setConvertingQueryId(null);
    }
  }

  function openImportManagementDetail(item) {
    setSelectedImportManagement(item);
    setImportManagementDetail({ ...item });
    setImportManagementMessage("");
    setImportManagementsError("");
  }

  async function saveImportManagementDetail() {
    if (!importManagementDetail?.id) return;

    setImportManagementSaving(true);
    setImportManagementsError("");
    setImportManagementMessage("");

    try {
      const { data, error } = await supabase
        .from("import_managements")
        .update({
          status: importManagementDetail.status,
          responsible: importManagementDetail.responsible || null,
          pickup_location: importManagementDetail.pickup_location || null,
          destination_port: importManagementDetail.destination_port || null,
          shipping_line: importManagementDetail.shipping_line || null,
          container_number: importManagementDetail.container_number || null,
          bl: importManagementDetail.bl || null,
          estimated_sailing_date: importManagementDetail.estimated_sailing_date || null,
          estimated_arrival_date: importManagementDetail.estimated_arrival_date || null,
          notes: importManagementDetail.notes || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        })
        .eq("id", importManagementDetail.id)
        .select()
        .single();

      if (error) throw error;

      setSelectedImportManagement(data);
      setImportManagementDetail({ ...data });
      setImportManagementMessage("Gestión actualizada correctamente.");
      await loadImportManagements(importSearch);
    } catch (err) {
      console.error("IMPORT MANAGEMENT UPDATE ERROR:", err);
      setImportManagementsError(err?.message || "No fue posible actualizar la gestión.");
    } finally {
      setImportManagementSaving(false);
    }
  }

  async function loadCustomsCases(search = customsSearch) {
    setCustomsLoading(true);
    setCustomsError("");

    try {
      let query = supabase
        .from("customs_cases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      const cleanSearch = String(search || "").trim();

      if (cleanSearch) {
        const safeSearch = cleanSearch.replace(/[%(),]/g, " ");
        query = query.or(
          `case_code.ilike.%${safeSearch}%,client_name.ilike.%${safeSearch}%,vin.ilike.%${safeSearch}%,bl.ilike.%${safeSearch}%,container_number.ilike.%${safeSearch}%`
        );
      }

      const { data, error: casesError } = await query;

      if (casesError) throw casesError;

      setCustomsCases(data || []);

      if (selectedCustomsCase) {
        const refreshed = (data || []).find(
          (item) => item.id === selectedCustomsCase.id
        );

        if (refreshed) {
          setSelectedCustomsCase(refreshed);
          setCustomsDetail(refreshed);
        }
      }
    } catch (err) {
      console.error("CUSTOMS CASES LOAD ERROR:", err);
      setCustomsError(
        err?.message || "No fue posible cargar el control aduanal."
      );
    } finally {
      setCustomsLoading(false);
    }
  }

  function openCustomsView() {
    setActiveView("customs");
    setShowCustomsForm(false);
    setSelectedCustomsCase(null);
    setCustomsDetail(null);
    setCustomsMessage("");
    loadCustomsCases("");
  }

  function openManualCustomsCase() {
    setCustomsForm(emptyCustomsForm());
    setCustomsDecodeResult(null);
    setCustomsError("");
    setCustomsMessage("");
    setShowCustomsForm(true);
  }

  async function calculateManualCustomsTaxes() {
    const cleanVin = String(customsForm.vin || "")
      .trim()
      .toUpperCase();

    if (cleanVin.length !== 17) {
      setCustomsError("El VIN debe tener 17 caracteres para calcular SAT, IVA e IPRIMA.");
      return;
    }

    setCustomsDecodeLoading(true);
    setCustomsError("");
    setCustomsDecodeResult(null);

    try {
      const { data, error: decodeError } =
        await invokeFunction("decode-vin", {
          body: { vin: cleanVin },
        });

      if (decodeError) throw decodeError;
      if (!data?.success) {
        throw new Error(
          data?.error || "No fue posible calcular el vehículo."
        );
      }

      setCustomsDecodeResult(data);

      const v = data?.vehicle || {};
      const s = data?.sat || {};
      const t = data?.taxes || {};
      const summaryData = data?.summary || {};
      const selected =
        s?.selected_match || s?.best_match || {};

      setCustomsForm((prev) => ({
        ...prev,
        vin: cleanVin,
        make: v.make || prev.make,
        model: v.model || prev.model,
        vehicle_trim: v.trim || v.series || prev.vehicle_trim,
        model_year: v.model_year || prev.model_year,

        sat_vehicle_id:
          selected.sat_vehicle_id ?? prev.sat_vehicle_id,
        sat_line:
          summaryData.sat_line ||
          selected.line ||
          prev.sat_line,
        sat_vehicle_type:
          t.vehicle_type ||
          selected.vehicle_type ||
          prev.sat_vehicle_type,
        sat_match_score:
          summaryData.sat_match_score ??
          selected.match_score ??
          prev.sat_match_score,
        taxable_value_gtq:
          t.taxable_value_gtq ??
          summaryData.sat_value_gtq ??
          selected.taxable_value ??
          prev.taxable_value_gtq,
        iva_rate:
          t.iva_rate ?? prev.iva_rate,
        iva_gtq:
          t.iva_gtq ?? prev.iva_gtq,
        iprima_rate:
          t.iprima_rate ?? prev.iprima_rate,
        iprima_gtq:
          t.iprima_gtq ?? prev.iprima_gtq,
        plates_gtq:
          t.plates_gtq ?? prev.plates_gtq,
        total_taxes_gtq:
          t.total_taxes_gtq ?? prev.total_taxes_gtq,
        tax_status:
          data?.calculation_status === "READY"
            ? "CALCULADO"
            : "REVISION",
      }));

      if (data?.calculation_status !== "READY") {
        setCustomsError(
          "El VIN fue identificado, pero SAT requiere revisión. Podés completar/corregir los valores manualmente antes de guardar el expediente."
        );
      }
    } catch (err) {
      console.error("CUSTOMS DECODE ERROR:", err);
      setCustomsError(
        err?.message || "No fue posible calcular IVA e IPRIMA."
      );
    } finally {
      setCustomsDecodeLoading(false);
    }
  }

  async function saveManualCustomsCase(event) {
    event?.preventDefault?.();

    if (!String(customsForm.client_name || "").trim()) {
      setCustomsError("Ingresá el nombre del cliente.");
      return;
    }

    if (!String(customsForm.vin || "").trim()) {
      setCustomsError("Ingresá el VIN del vehículo.");
      return;
    }

    setCustomsSaving(true);
    setCustomsError("");
    setCustomsMessage("");

    try {
      const payload = {
        source_type: "CUSTOMS_ONLY",
        notice_date:
          customsForm.notice_date || new Date().toISOString().slice(0, 10),
        client_name: String(customsForm.client_name || "").trim(),
        phone: String(customsForm.phone || "").trim() || null,
        email: String(customsForm.email || "").trim().toLowerCase() || null,
        bl: String(customsForm.bl || "").trim().toUpperCase() || null,
        container_number:
          String(customsForm.container_number || "").trim().toUpperCase() || null,
        vin: String(customsForm.vin || "").trim().toUpperCase(),
        make: String(customsForm.make || "").trim() || null,
        model: String(customsForm.model || "").trim() || null,
        vehicle_trim:
          String(customsForm.vehicle_trim || "").trim() || null,
        model_year:
          customsForm.model_year !== ""
            ? Number(customsForm.model_year)
            : null,
        shipping_line:
          String(customsForm.shipping_line || "").trim() || null,
        responsible:
          String(customsForm.responsible || "").trim() || null,
        priority: customsForm.priority || "Normal",

        sat_vehicle_id:
          customsForm.sat_vehicle_id !== ""
            ? Number(customsForm.sat_vehicle_id)
            : null,
        sat_line:
          String(customsForm.sat_line || "").trim() || null,
        sat_vehicle_type:
          String(customsForm.sat_vehicle_type || "").trim() || null,
        sat_match_score:
          customsForm.sat_match_score !== ""
            ? Number(customsForm.sat_match_score)
            : null,
        taxable_value_gtq:
          customsForm.taxable_value_gtq !== ""
            ? Number(customsForm.taxable_value_gtq)
            : null,
        iva_rate:
          customsForm.iva_rate !== ""
            ? Number(customsForm.iva_rate)
            : null,
        iva_gtq:
          customsForm.iva_gtq !== ""
            ? Number(customsForm.iva_gtq)
            : null,
        iprima_rate:
          customsForm.iprima_rate !== ""
            ? Number(customsForm.iprima_rate)
            : null,
        iprima_gtq:
          customsForm.iprima_gtq !== ""
            ? Number(customsForm.iprima_gtq)
            : null,
        plates_gtq:
          customsForm.plates_gtq !== ""
            ? Number(customsForm.plates_gtq)
            : null,
        total_taxes_gtq:
          customsForm.total_taxes_gtq !== ""
            ? Number(customsForm.total_taxes_gtq)
            : null,
        tax_status: customsForm.tax_status || "PENDIENTE",

        document_collection_gtq:
          Number(customsForm.document_collection_gtq || 0),
        port_expenses_gtq:
          Number(customsForm.port_expenses_gtq || 0),
        professional_fees_gtq:
          Number(customsForm.professional_fees_gtq || 0),
        other_charges_gtq:
          Number(customsForm.other_charges_gtq || 0),
        other_charges_note:
          String(customsForm.other_charges_note || "").trim() || null,
        crane_usd:
          Number(customsForm.crane_usd || 0),

        created_by: user?.id || null,
      };

      const { data, error: insertError } =
        await supabase
          .from("customs_cases")
          .insert(payload)
          .select()
          .single();

      if (insertError) throw insertError;

      setShowCustomsForm(false);
      setCustomsForm(emptyCustomsForm());
      setCustomsDecodeResult(null);
      setCustomsMessage(
        `Expediente ${data.case_code} creado correctamente.`
      );

      await loadCustomsCases("");
    } catch (err) {
      console.error("CUSTOMS CASE SAVE ERROR:", err);
      setCustomsError(
        err?.message || "No fue posible crear el expediente aduanal."
      );
    } finally {
      setCustomsSaving(false);
    }
  }

  function openCustomsDetail(item) {
    setSelectedCustomsCase(item);
    setCustomsDetail({ ...item });
    setCustomsMessage("");
    setCustomsError("");
  }

  async function saveCustomsDetail() {
    if (!customsDetail?.id) return;

    setCustomsDetailSaving(true);
    setCustomsError("");
    setCustomsMessage("");

    try {
      const allowedKeys = [
        "client_name", "phone", "email", "bl", "container_number",
        "shipping_line", "responsible", "priority",
        "docs_collected_at", "emptied_at", "da_at", "corroboration_at",
        "digitization_started_at", "review_started_at",
        "declaration_signed_at", "iva_form_sent_at", "iva_paid_at",
        "selective_type", "selective_at", "port_exit_at",
        "docs_set_built_at", "envelope_ready_at", "delivered_at",
        "incident_status", "problem_reason", "action_taken",
        "pending_from", "delivery_status",
        "document_collection_gtq", "port_expenses_gtq",
        "professional_fees_gtq", "other_charges_gtq",
        "other_charges_note", "crane_usd",
      ];

      const updatePayload = {};

      for (const key of allowedKeys) {
        let value = customsDetail[key];

        if (
          [
            "document_collection_gtq",
            "port_expenses_gtq",
            "professional_fees_gtq",
            "other_charges_gtq",
            "crane_usd",
          ].includes(key)
        ) {
          value = Number(value || 0);
        } else if (value === "") {
          value = null;
        }

        updatePayload[key] = value;
      }

      updatePayload.updated_by = user?.id || null;
      updatePayload.updated_at = new Date().toISOString();

      const { data, error: updateError } =
        await supabase
          .from("customs_cases")
          .update(updatePayload)
          .eq("id", customsDetail.id)
          .select()
          .single();

      if (updateError) throw updateError;

      setSelectedCustomsCase(data);
      setCustomsDetail(data);
      setCustomsMessage("Expediente actualizado correctamente.");
      await loadCustomsCases(customsSearch);
    } catch (err) {
      console.error("CUSTOMS UPDATE ERROR:", err);
      setCustomsError(
        err?.message || "No fue posible actualizar el expediente."
      );
    } finally {
      setCustomsDetailSaving(false);
    }
  }

  async function loadProspects(search = prospectSearch) {
    setProspectsLoading(true);
    setProspectsError("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_customer_leads",
        {
          p_search: String(search || "").trim(),
          p_limit: 200,
        }
      );

      if (rpcError) throw rpcError;

      setProspects(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("PROSPECTS LOAD ERROR:", err);
      setProspectsError(
        err?.message || "No fue posible cargar los prospectos."
      );
    } finally {
      setProspectsLoading(false);
    }
  }

  async function loadProspectQueries(contactKey) {
    if (!contactKey) return;

    setProspectQueriesLoading(true);
    setProspectsError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_get_customer_queries",
        {
          p_contact_key: contactKey,
        }
      );

      if (rpcError) throw rpcError;

      setProspectQueries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("PROSPECT QUERIES ERROR:", err);
      setProspectsError(
        err?.message || "No fue posible cargar las consultas del cliente."
      );
    } finally {
      setProspectQueriesLoading(false);
    }
  }

  function openProspectsView() {
    setActiveView("prospects");
    setSelectedProspect(null);
    setProspectQueries([]);
    setProspectMessage("");
    loadProspects("");
  }

  function selectProspect(item) {
    setSelectedProspect(item);
    setProspectStatusForm({
      status: item?.lead_status || "NUEVO",
      notes: item?.lead_notes || "",
    });
    setProspectMessage("");
    loadProspectQueries(item?.contact_key);
  }

  async function saveProspectStatus() {
    if (!selectedProspect?.contact_key) return;

    setProspectSaving(true);
    setProspectMessage("");
    setProspectsError("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "admin_update_lead_status",
        {
          p_contact_key: selectedProspect.contact_key,
          p_status: prospectStatusForm.status,
          p_notes: prospectStatusForm.notes || null,
        }
      );

      if (rpcError) throw rpcError;

      setProspectMessage("Seguimiento actualizado.");
      await loadProspects(prospectSearch);

      setSelectedProspect((prev) =>
        prev
          ? {
              ...prev,
              lead_status: prospectStatusForm.status,
              lead_notes: prospectStatusForm.notes,
            }
          : prev
      );
    } catch (err) {
      console.error("PROSPECT STATUS ERROR:", err);
      setProspectsError(
        err?.message || "No fue posible actualizar el prospecto."
      );
    } finally {
      setProspectSaving(false);
    }
  }

  async function generateProspectQuotation(query) {
    if (!query?.vin) return;
    setProspectQuoteLoadingId(query.id);
    setProspectsError("");
    setError("");

    try {
      const data = await ejecutarDecode(String(query.vin).trim().toUpperCase(), true);
      const ready =
        data?.calculation_status === "READY" ||
        data?.summary?.calculation_status === "READY";

      if (!ready) {
        throw new Error("Este vehículo todavía requiere revisión SAT antes de generar una cotización comercial.");
      }

      setVin(query.vin);
      setQuoteForm({
        include_freight:
          !data?.freight_requires_review &&
          Number(data?.freight?.price_usd || 0) > 0,
        document_collection_gtq: "",
        port_expenses_gtq: "",
        professional_fees_gtq: "",
        crane_usd: "",
      });
      setQuoteRecipient({
        name: selectedProspect?.full_name || query.full_name || "Cliente",
        phone: selectedProspect?.phone || query.phone || "",
        contact_key: selectedProspect?.contact_key || query.contact_key || "",
        query_id: query.id,
      });
      setQuoteCode(makeQuoteCode(query.vin));
      setActiveView("new");
      setShowQuoteModal(true);
    } catch (err) {
      console.error("PROSPECT QUOTE ERROR:", err);
      setProspectsError(err?.message || "No fue posible preparar la cotización.");
    } finally {
      setProspectQuoteLoadingId(null);
    }
  }

  async function downloadQuoteAndOpenWhatsApp() {
    if (!quoteRef.current) return;

    try {
      setQuoteGenerating(true);
      const savedQuotation = await saveCurrentQuotation();

      const canvas = await html2canvas(quoteRef.current, {
        scale: 2,
        backgroundColor: "#f4f7fb",
        useCORS: true,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `Cotizacion-${vehicle?.vin || "EYR"}.png`;
      link.href = canvas.toDataURL("image/png", 1);
      link.click();

      if (quoteRecipient?.query_id) {
        await supabase.rpc("admin_mark_quote_generated", {
          p_query_id: quoteRecipient.query_id,
          p_quote_code: savedQuotation?.quote_code || quoteNumber(),
        });
      }

      const recipientPhone = normalizeWhatsAppNumber(quoteRecipient?.phone);
      if (recipientPhone) {
        const clientName = String(quoteRecipient?.name || "cliente").trim();
        const message =
          `Hola ${clientName}, te compartimos la cotización de importación para tu ` +
          `${[vehicle?.model_year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ")} ` +
          `(VIN ${vehicle?.vin || "—"}). La imagen ya fue generada; adjuntala en este chat para enviarla al cliente.`;

        window.open(buildWhatsAppUrl(recipientPhone, message), "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "No fue posible generar la cotización para WhatsApp.");
    } finally {
      setQuoteGenerating(false);
    }
  }

  async function loadQuotations(search = quotationSearch) {
    setQuotationLoading(true);
    setQuotationError("");
    try {
      const { data, error: functionError } = await invokeFunction("quotation-manager", {
        body: { action: "list", search: String(search || "").trim(), limit: 100 },
      });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || "No fue posible cargar las cotizaciones.");
      setQuotations(data.quotations || []);
      setSelectedQuotation(null);
    } catch (err) {
      console.error(err);
      setQuotationError(err?.message || "No fue posible cargar las cotizaciones.");
    } finally {
      setQuotationLoading(false);
    }
  }

  function openQuotationsView() {
    setActiveView("quotations");
    loadQuotations("");
  }

  function openNewQuoteView() {
    setActiveView("new");
  }

  async function downloadQuoteImage() {
    if (!quoteRef.current) return;

    try {
      setQuoteGenerating(true);

      // Guardamos/actualizamos la cotización antes de generar la imagen.
      await saveCurrentQuotation();

      const canvas = await html2canvas(quoteRef.current, {
        scale: 2,
        backgroundColor: "#f4f7fb",
        useCORS: true,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `Cotizacion-${vehicle?.vin || "EYR"}.png`;
      link.href = canvas.toDataURL("image/png", 1);
      link.click();
    } catch (err) {
      console.error(err);
      setError("No fue posible generar la imagen de la cotización.");
    } finally {
      setQuoteGenerating(false);
    }
  }

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      vin.length === 17 &&
      !loading
    ) {
      consultarVehiculo();
    }
  }

  const vehicle = result?.vehicle;
  const sat = result?.sat;
  const taxes = result?.taxes;
  const dimensions = result?.dimensions;
  const freight = result?.freight;
  const summary = result?.summary;

  const quoteDocumentCollection = Number(quoteForm.document_collection_gtq || 0);
  const quotePortExpenses = Number(quoteForm.port_expenses_gtq || 0);
  const quoteProfessionalFees = Number(quoteForm.professional_fees_gtq || 0);
  const quoteBaseTaxes = Number(taxes?.total_taxes_gtq || 0);
  const quoteGuatemalaTotal =
    quoteBaseTaxes +
    quoteDocumentCollection +
    quotePortExpenses +
    quoteProfessionalFees;
  const quoteFreightAvailable =
    !result?.freight_requires_review &&
    Number(freight?.price_usd || 0) > 0;
  const quoteFreightUsd =
    quoteForm.include_freight
      ? Number(freight?.price_usd || 0)
      : 0;
  const quoteCraneUsd =
    quoteForm.include_freight
      ? Number(quoteForm.crane_usd || 0)
      : 0;
  const quoteTransportUsd = quoteFreightUsd + quoteCraneUsd;
  const quoteExchangeRate = Number(
    summary?.exchange_rate || result?.exchange_rate || taxes?.exchange_rate || 0
  );
  const quoteGuatemalaUsd = quoteExchangeRate > 0
    ? quoteGuatemalaTotal / quoteExchangeRate
    : null;
  const quoteGrandTotalUsd = quoteGuatemalaUsd !== null
    ? quoteGuatemalaUsd + quoteTransportUsd
    : null;
  const canGenerateQuote =
    result?.calculation_status === "READY" ||
    summary?.calculation_status === "READY";

  /*
   * V13: revisión SAT compatible + resolución excepcional.
   * Si V13 indica no_compatible_match, no permitimos aprobar
   * candidatos contradictorios y abrimos el flujo excepcional.
   */
  const safeReviewOptions = (sat?.review_options || []).filter(
    (option) => option.selectable !== false && !option.has_conflict
  );

  const satReviewOptions =
    sat?.ambiguous_options?.length > 0
      ? sat.ambiguous_options
      : safeReviewOptions.length > 0
        ? safeReviewOptions
        : sat?.requires_review
          ? (sat?.candidates || []).filter((candidate) => !candidate.has_conflict).slice(0, 6)
          : [];

  const blockedSatOptions = (sat?.review_options || [])
    .filter((option) => option.selectable === false || option.has_conflict)
    .slice(0, 6);

  const dimensionReviewOptions = result?.freight_requires_review
    ? result?.freight_options || []
    : [];

  const needsSatSelectableReview =
    Boolean(sat?.requires_review) &&
    !sat?.no_compatible_match &&
    satReviewOptions.length > 0;

  const needsSatExceptionalReview =
    Boolean(sat?.requires_review) && Boolean(sat?.no_compatible_match);

  const needsDimensionReview =
    Boolean(result?.freight_requires_review) &&
    dimensionReviewOptions.length > 0;

  const needsMissingDimensionReview =
    Boolean(result?.freight_requires_review) &&
    dimensionReviewOptions.length === 0;

  const dimensionSearchAttempts = result?.dimension_search_attempts || [];
  const isExceptionalResolved = summary?.sat_exceptional_resolution === true;

  const internalRole = String(profile?.role || "").toUpperCase();
  const customerRole = internalRole === "CUSTOMER";
  const subscriptionStatus = String(profile?.subscription_status || "FREE").toUpperCase();
  const subscriptionActive =
    subscriptionStatus === "ACTIVE" &&
    (!profile?.subscription_expires_at ||
      new Date(profile.subscription_expires_at).getTime() > Date.now());
  const freeQuotesUsed = Number(profile?.free_quotes_used || 0);
  const backendRemaining = publicResult?.access?.remaining_count;

  const freeQuotesRemaining =
    backendRemaining !== undefined && backendRemaining !== null
      ? Math.max(0, Number(backendRemaining))
      : publicQuotaRemaining !== null
        ? Math.max(0, Number(publicQuotaRemaining))
        : Math.max(0, 3 - freeQuotesUsed);
  const publicCanQuote =
    Boolean(session) &&
    Boolean(profile?.active) &&
    (subscriptionActive || freeQuotesRemaining > 0 || ["ADMIN", "OPERADOR"].includes(internalRole));

  useEffect(() => {
    if (publicQuotaRemaining === null && profile) {
      setPublicQuotaRemaining(Math.max(0, 3 - Number(profile?.free_quotes_used || 0)));
    }
  }, [profile, publicQuotaRemaining]);

  const hasInternalAccess =
    Boolean(session) &&
    Boolean(profile?.active) &&
    ["ADMIN", "OPERADOR"].includes(internalRole);

  const isAnonymousCustomer = Boolean(session?.user?.is_anonymous);


  if (siteMode === "landing") {
    return (
      <div className="public-site">
        <header className="public-nav">
          <button className="public-brand public-brand-logo" onClick={() => navigateSite("/")}>
            <img src={eyrSolutionsLogo} alt="E&R Solutions Agencia Aduanal" />
          </button>

          <nav>
            <a className="public-nav-link" href="#como-funciona">Cómo funciona</a>
            <a className="public-nav-link" href="#beneficios">Beneficios</a>
            <button className="public-nav-quote" onClick={() => navigateSite("/cotizador")}>
              Cotizador
            </button>
            <button className="public-login-link" onClick={() => navigateSite("/app")}>
              Acceso E&amp;R
            </button>
          </nav>
        </header>

        <main>
          <section className="public-hero">
            <div className="public-hero-content">
              <span className="public-kicker">IMPORTÁ CON INFORMACIÓN CLARA</span>
              <h1>Conocé cuánto puede costar importar tu vehículo a Guatemala.</h1>
              <p>
                Ingresá el VIN y nuestro motor analiza el vehículo, cruza información SAT,
                estima tributos y calcula el flete marítimo.
              </p>

              <div className="public-hero-actions">
                <button className="public-primary" onClick={() => navigateSite("/cotizador")}>
                  Cotizar mi vehículo <span>→</span>
                </button>
                <span className="public-free-badge">3 cotizaciones gratis</span>
              </div>

              <div className="public-trust-row">
                <span>✓ Identificación por VIN</span>
                <span>✓ Referencia SAT Guatemala</span>
                <span>✓ Flete según dimensiones</span>
              </div>
            </div>

            <div className="public-hero-card">
              <div className="hero-card-top">
                <span>SIMULACIÓN INTELIGENTE</span>
                <span className="hero-live">● Motor conectado</span>
              </div>
              <div className="hero-vin-demo">
                <small>VIN DEL VEHÍCULO</small>
                <strong>3GNAL2EK9ES629619</strong>
                <span>17/17</span>
              </div>
              <div className="hero-flow">
                <div><strong>01</strong><span>VIN</span></div>
                <i>→</i>
                <div><strong>02</strong><span>SAT</span></div>
                <i>→</i>
                <div><strong>03</strong><span>Tributos</span></div>
                <i>→</i>
                <div><strong>04</strong><span>Flete</span></div>
              </div>
              <div className="hero-result-demo">
                <span>Resultado estimado</span>
                <strong>En segundos</strong>
              </div>
            </div>
          </section>

          <section className="public-section" id="como-funciona">
            <div className="public-section-heading">
              <span>PROCESO SIMPLE</span>
              <h2>Del VIN a una estimación completa.</h2>
            </div>
            <div className="public-steps">
              <article><b>01</b><h3>Ingresá el VIN</h3><p>Identificamos año, marca, modelo, motor y configuración.</p></article>
              <article><b>02</b><h3>Analizamos SAT</h3><p>Buscamos la línea que mejor corresponde al vehículo.</p></article>
              <article><b>03</b><h3>Calculamos</h3><p>Estimamos tributos y seleccionamos la tarifa marítima.</p></article>
              <article><b>04</b><h3>Recibí el resultado</h3><p>Visualizá los principales costos antes de tomar una decisión.</p></article>
            </div>
          </section>

          <section className="public-benefits" id="beneficios">
            <div>
              <span className="public-kicker">E&amp;R VEHICLE IMPORT</span>
              <h2>Menos incertidumbre antes de importar.</h2>
              <p>
                El cotizador te da una referencia rápida para evaluar un vehículo antes de avanzar
                con la operación. Los casos que requieren validación adicional son identificados
                por el sistema para evitar resultados forzados.
              </p>
              <button className="public-primary" onClick={() => navigateSite("/cotizador")}>
                Probar gratis <span>→</span>
              </button>
            </div>
            <div className="benefit-grid">
              <article><span>🧠</span><strong>Matching inteligente</strong><p>El sistema compara datos técnicos antes de aceptar una coincidencia.</p></article>
              <article><span>📏</span><strong>Flete por dimensiones</strong><p>La tarifa se determina a partir del tamaño del vehículo.</p></article>
              <article><span>🛡️</span><strong>Revisión segura</strong><p>Si los datos no son concluyentes, el sistema lo indica en vez de adivinar.</p></article>
              <article><span>📄</span><strong>Información clara</strong><p>Vehículo, tributos y transporte en una sola consulta.</p></article>
            </div>
          </section>

          <section className="public-cta">
            <span>EMPEZÁ SIN COSTO</span>
            <h2>Tus primeras 3 cotizaciones son gratis.</h2>
            <p>Dejanos tus datos de contacto, ingresá un VIN y probá el cotizador sin crear una cuenta.</p>
            <button className="public-primary public-primary-dark" onClick={() => navigateSite("/cotizador")}>
              Probar el cotizador <span>→</span>
            </button>
          </section>
        </main>

        <footer className="public-footer">
          <div className="public-brand public-brand-logo public-footer-logo">
            <img src={eyrSolutionsLogo} alt="E&R Solutions Agencia Aduanal" />
          </div>
          <span>Herramienta de estimación para importación de vehículos a Guatemala.</span>
        </footer>
      </div>
    );
  }

  if (siteMode === "public") {
    const publicVehicle = publicResult?.vehicle || {};
    const publicTaxes = publicResult?.taxes || {};
    const publicFreight = publicResult?.freight || {};
    const publicSummary = publicResult?.summary || {};
    const publicReady = publicResult?.calculation_status === "READY";
    const publicNeedsReview =
      publicResult &&
      ["SAT_REVIEW", "FREIGHT_REVIEW", "SAT_AND_FREIGHT_REVIEW"].includes(
        publicResult?.calculation_status
      );

    const customerFirstName =
      String(profile?.full_name || "Cliente").trim() || "Cliente";

    const reviewWhatsAppUrl = buildWhatsAppUrl(
      appSettings.whatsapp_number,
      `Hola E&R Solutions, soy ${customerFirstName}. Estoy cotizando el VIN ${
        publicVehicle?.vin || publicVin || "sin VIN"
      } (${[
        publicVehicle?.model_year,
        publicVehicle?.make,
        publicVehicle?.model,
        publicVehicle?.trim,
      ].filter(Boolean).join(" ")}). El cotizador indica que requiere revisión adicional E&R. ¿Me pueden ayudar a revisarlo?`
    );

    const subscriptionWhatsAppUrl = buildWhatsAppUrl(
      appSettings.whatsapp_number,
      `Hola E&R Solutions, soy ${customerFirstName}. Ya utilicé mis 3 cotizaciones gratuitas y quisiera coordinar el pago para activar mi suscripción mensual al cotizador.`
    );

    const importWhatsAppUrl = buildWhatsAppUrl(
      appSettings.whatsapp_number,
      `Hola E&R Solutions, soy ${customerFirstName}. Ya realicé una cotización en el portal y estoy listo(a) para iniciar la importación.

🚗 VEHÍCULO
VIN: ${publicVehicle?.vin || publicVin || "—"}
Vehículo: ${[
        publicVehicle?.model_year,
        publicVehicle?.make,
        publicVehicle?.model,
        publicVehicle?.trim,
      ].filter(Boolean).join(" ") || "—"}
Motor: ${publicVehicle?.engine_liters ? `${publicVehicle.engine_liters}L` : "—"} · ${publicVehicle?.cylinders || "—"} cilindros
Combustible: ${humanFuel(publicVehicle?.fuel_type)}
Tracción: ${humanDrive(publicVehicle?.drive_type)}

🇬🇹 SAT GUATEMALA
Línea SAT: ${publicSummary?.sat_line || publicResult?.sat?.selected_match?.line || "—"}
Tipo SAT: ${publicTaxes?.vehicle_type || publicResult?.sat?.selected_match?.vehicle_type || "—"}
Valor imponible: ${publicTaxes?.taxable_value_gtq ? moneyGTQ(publicTaxes.taxable_value_gtq) : "—"}

🧾 TRIBUTOS ESTIMADOS
IVA (${displayTaxRate(publicTaxes?.iva_rate, 0.12)}): ${publicTaxes?.iva_gtq ? moneyGTQ(publicTaxes.iva_gtq) : "—"}
IPRIMA (${displayTaxRate(publicTaxes?.iprima_rate)}): ${publicTaxes?.iprima_gtq ? moneyGTQ(publicTaxes.iprima_gtq) : "—"}
Placas: ${publicTaxes?.plates_gtq ? moneyGTQ(publicTaxes.plates_gtq) : "—"}
Total tributos: ${publicTaxes?.total_taxes_gtq ? moneyGTQ(publicTaxes.total_taxes_gtq) : "—"}

🚢 FLETE MARÍTIMO
Categoría: ${publicFreight?.category || "—"}
Flete: ${publicFreight?.price_usd ? moneyUSD(publicFreight.price_usd) : "—"}

Quisiera coordinar con ustedes los siguientes pasos para iniciar la gestión de importación.`
    );

    const whatsappConfigured = Boolean(normalizeWhatsAppNumber(appSettings.whatsapp_number));

    return (
      <div className="customer-shell">
        <header className="customer-topbar">
          <button className="public-brand public-brand-logo" onClick={() => navigateSite("/")}>
            <img src={eyrSolutionsLogo} alt="E&R Solutions Agencia Aduanal" />
          </button>
          <div className="customer-top-actions">
            <button onClick={() => navigateSite("/")}>Inicio</button>
            {session && profile && (
              <button className="customer-logout" onClick={handleCustomerLogout}>
                {session?.user?.is_anonymous ? "Salir del cotizador" : "Cerrar sesión"}
              </button>
            )}
          </div>
        </header>

        {!session || !profile ? (
          <main className="customer-auth-layout">
            <section className="customer-auth-copy">
              <span className="public-kicker">COTIZADOR E&amp;R</span>
              <h1>Probalo sin crear una cuenta.</h1>
              <p>
                Solo necesitamos tus datos de contacto para darte acceso a tus primeras
                3 cotizaciones gratuitas. Si después querés una suscripción mensual,
                podés crear tu cuenta.
              </p>

              <div className="customer-plan-card">
                <span>PRUEBA GRATUITA</span>
                <strong>3 cotizaciones</strong>
                <small>VIN + SAT + tributos + flete estimado</small>
              </div>

              <div className="lead-privacy-note">
                <span>🔐</span>
                <div>
                  <strong>Sin contraseña para probar</strong>
                  <small>Nombre, correo y celular quedan registrados para dar seguimiento a tu solicitud.</small>
                </div>
              </div>
            </section>

            <section className="customer-auth-card">
              <div className="customer-auth-tabs three-tabs">
                <button
                  className={customerAuthMode === "guest" ? "active" : ""}
                  onClick={() => {
                    setCustomerAuthMode("guest");
                    setCustomerAuthError("");
                    setCustomerAuthMessage("");
                  }}
                >
                  Probar gratis
                </button>
                <button
                  className={customerAuthMode === "login" ? "active" : ""}
                  onClick={() => {
                    setCustomerAuthMode("login");
                    setCustomerAuthError("");
                    setCustomerAuthMessage("");
                  }}
                >
                  Ya tengo cuenta
                </button>
                <button
                  className={customerAuthMode === "register" ? "active" : ""}
                  onClick={() => {
                    setCustomerAuthMode("register");
                    setCustomerAuthError("");
                    setCustomerAuthMessage("");
                  }}
                >
                  Crear cuenta
                </button>
              </div>

              {customerAuthMode === "guest" ? (
                <form onSubmit={handleGuestAccess}>
                  <div className="guest-form-heading">
                    <span className="public-kicker">ACCESO RÁPIDO</span>
                    <h2>Empezá tu cotización</h2>
                    <p>No tenés que crear una cuenta ni recordar una contraseña.</p>
                  </div>

                  <label>
                    <span>Nombre completo</span>
                    <input
                      value={customerForm.full_name}
                      onChange={(e) =>
                        setCustomerForm((p) => ({ ...p, full_name: e.target.value }))
                      }
                      placeholder="Tu nombre y apellido"
                      autoComplete="name"
                    />
                  </label>

                  <label>
                    <span>Correo electrónico</span>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) =>
                        setCustomerForm((p) => ({ ...p, email: e.target.value }))
                      }
                      placeholder="correo@ejemplo.com"
                      autoComplete="email"
                    />
                  </label>

                  <label>
                    <span>Número de celular</span>
                    <input
                      type="tel"
                      value={customerForm.phone}
                      onChange={(e) =>
                        setCustomerForm((p) => ({ ...p, phone: e.target.value }))
                      }
                      placeholder="+502 5555-5555"
                      autoComplete="tel"
                    />
                  </label>

                  {customerAuthError && (
                    <div className="customer-message error">{customerAuthError}</div>
                  )}
                  {customerAuthMessage && (
                    <div className="customer-message success">{customerAuthMessage}</div>
                  )}

                  <button
                    className="public-primary customer-submit"
                    disabled={customerAuthLoading}
                  >
                    {customerAuthLoading ? "Preparando..." : "Probar cotizador gratis"}
                    <span>→</span>
                  </button>

                  <small className="customer-legal">
                    Tus datos se utilizarán para identificar tus consultas y para que E&amp;R
                    pueda contactarte sobre tu cotización.
                  </small>
                </form>
              ) : (
                <form onSubmit={handleCustomerAuth}>
                  {customerAuthMode === "register" && (
                    <>
                      <div className="guest-form-heading">
                        <span className="public-kicker">CUENTA E&amp;R</span>
                        <h2>Prepará tu acceso mensual</h2>
                        <p>Esta opción es para clientes que quieren mantener un acceso con contraseña.</p>
                      </div>

                      <label>
                        <span>Nombre completo</span>
                        <input
                          value={customerForm.full_name}
                          onChange={(e) =>
                            setCustomerForm((p) => ({ ...p, full_name: e.target.value }))
                          }
                          placeholder="Tu nombre y apellido"
                          autoComplete="name"
                        />
                      </label>

                      <label>
                        <span>Número de celular</span>
                        <input
                          type="tel"
                          value={customerForm.phone}
                          onChange={(e) =>
                            setCustomerForm((p) => ({ ...p, phone: e.target.value }))
                          }
                          placeholder="+502 5555-5555"
                          autoComplete="tel"
                        />
                      </label>
                    </>
                  )}

                  <label>
                    <span>Correo electrónico</span>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) =>
                        setCustomerForm((p) => ({ ...p, email: e.target.value }))
                      }
                      placeholder="correo@ejemplo.com"
                      autoComplete="email"
                    />
                  </label>

                  <label>
                    <span>Contraseña</span>
                    <input
                      type="password"
                      value={customerForm.password}
                      onChange={(e) =>
                        setCustomerForm((p) => ({ ...p, password: e.target.value }))
                      }
                      placeholder="Mínimo 6 caracteres"
                      autoComplete={customerAuthMode === "login" ? "current-password" : "new-password"}
                    />
                  </label>

                  {customerAuthError && (
                    <div className="customer-message error">{customerAuthError}</div>
                  )}
                  {customerAuthMessage && (
                    <div className="customer-message success">{customerAuthMessage}</div>
                  )}

                  <button
                    className="public-primary customer-submit"
                    disabled={customerAuthLoading}
                  >
                    {customerAuthLoading
                      ? "Procesando..."
                      : customerAuthMode === "register"
                        ? "Crear cuenta"
                        : "Iniciar sesión"}
                    <span>→</span>
                  </button>

                  <small className="customer-legal">
                    La cuenta no es necesaria para probar el cotizador. Se recomienda para
                    clientes con suscripción o acceso frecuente.
                  </small>
                </form>
              )}
            </section>
          </main>
        ) : (
          <main className="customer-dashboard">
            <section className="customer-welcome">
              <div>
                <span className="public-kicker">HOLA, {(profile?.full_name || "CLIENTE").split(" ")[0].toUpperCase()}</span>
                <h1>Cotizá tu próximo vehículo.</h1>
                <p>Ingresá un VIN de 17 caracteres para iniciar el análisis.</p>
              </div>
              <div className={`quota-card ${subscriptionActive ? "active-plan" : ""}`}>
                {subscriptionActive ? (
                  <>
                    <span>PLAN MENSUAL</span>
                    <strong>Activo</strong>
                    <small>Consultas habilitadas</small>
                  </>
                ) : (
                  <>
                    <span>{isAnonymousCustomer ? "PRUEBA GRATUITA" : "PLAN GRATUITO"}</span>
                    <strong>{freeQuotesRemaining} de 3</strong>
                    <small>consultas disponibles</small>
                  </>
                )}
              </div>
            </section>

            {!publicCanQuote && !publicResult ? (
              <section className="public-paywall">
                <div className="paywall-icon">🔒</div>
                <span className="public-kicker">LÍMITE GRATUITO ALCANZADO</span>
                <h2>Ya utilizaste tus 3 cotizaciones gratuitas.</h2>
                <p>
                  Activá una suscripción mensual para continuar utilizando el cotizador.
                </p>
                <div className="paywall-features">
                  <span>✓ Cotizaciones adicionales</span>
                  <span>✓ Motor VIN + SAT</span>
                  <span>✓ Cálculo de tributos y flete</span>
                </div>
                <div className="public-contact-actions">
                  {whatsappConfigured ? (
                    <a
                      className="whatsapp-action"
                      href={subscriptionWhatsAppUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="whatsapp-icon">💬</span>
                      Coordinar pago por WhatsApp
                      <span>→</span>
                    </a>
                  ) : (
                    <div className="whatsapp-not-configured">WhatsApp temporalmente no disponible</div>
                  )}

                  {isAnonymousCustomer && (
                    <button
                      className="public-secondary-action"
                      onClick={preparePaidAccount}
                    >
                      Crear cuenta para mi suscripción
                    </button>
                  )}

                  {!isAnonymousCustomer && subscriptionStatus === "PENDING" && (
                    <div className="subscription-pending">
                      <strong>Solicitud pendiente</strong>
                      <span>Tu solicitud de suscripción ya fue registrada.</span>
                    </div>
                  )}
                </div>
                {customerAuthMessage && <div className="customer-message success">{customerAuthMessage}</div>}
                {customerAuthError && <div className="customer-message error">{customerAuthError}</div>}
              </section>
            ) : (
              <>
                <section className="public-vin-card">
                  <div>
                    <span className="public-kicker">CONSULTA INTELIGENTE</span>
                    <h2>¿Qué vehículo querés cotizar?</h2>
                    <p>Ingresá el VIN y E&amp;R hará el análisis automáticamente.</p>
                  </div>
                  <div className="public-vin-search">
                    <label>
                      <span>VIN DEL VEHÍCULO</span>
                      <div>
                        <input
                          value={publicVin}
                          maxLength={17}
                          onChange={(e) =>
                            setPublicVin(
                              e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "")
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && publicVin.length === 17 && !publicLoading) {
                              consultarPublico();
                            }
                          }}
                          placeholder="Ej. 2T3DF4DV5AW032159"
                        />
                        <small>{publicVin.length}/17</small>
                      </div>
                    </label>
                    <button
                      className="public-primary"
                      onClick={consultarPublico}
                      disabled={publicVin.length !== 17 || publicLoading || !publicCanQuote}
                    >
                      {publicLoading ? "Analizando..." : "Consultar vehículo"} <span>→</span>
                    </button>
                  </div>
                </section>

                {publicError && publicError !== "FREE_LIMIT_REACHED" && (
                  <div className="public-result-message error">
                    <strong>No pudimos completar la consulta</strong>
                    <span>{publicError}</span>
                  </div>
                )}

                {publicResult && (
                  <section className="public-result-area">
                    {publicReady && (
                      <div className="public-result-status ready">
                        <div><span>✓</span><div><small>RESULTADO DEL ANÁLISIS</small><strong>Cotización estimada lista</strong></div></div>
                        <b>READY</b>
                      </div>
                    )}

                    {publicNeedsReview && (
                      <div className="public-result-status review">
                        <div><span>🛡️</span><div><small>VALIDACIÓN ADICIONAL</small><strong>Este vehículo requiere revisión E&amp;R</strong></div></div>
                        <b>REVIEW</b>
                      </div>
                    )}

                    <div className="public-result-grid">
                      <article>
                        <span className="public-card-label">
                          TIPO SAT · {publicTaxes?.vehicle_type || publicResult?.sat?.selected_match?.vehicle_type || "NO ESPECIFICADO"}
                        </span>
                        <h3>{publicVehicle?.model_year} {publicVehicle?.make}</h3>
                        <strong>{publicVehicle?.model} {publicVehicle?.trim || ""}</strong>
                        <dl>
                          <div><dt>Motor</dt><dd>{publicVehicle?.engine_liters ? `${publicVehicle.engine_liters}L` : "—"} · {publicVehicle?.cylinders || "—"} cil.</dd></div>
                          <div><dt>Combustible</dt><dd>{humanFuel(publicVehicle?.fuel_type)}</dd></div>
                          <div><dt>Tracción</dt><dd>{humanDrive(publicVehicle?.drive_type)}</dd></div>
                        </dl>
                      </article>

                      <article>
                        <span className="public-card-label">TRIBUTOS ESTIMADOS</span>
                        <h3>{publicTaxes?.total_taxes_gtq ? moneyGTQ(publicTaxes.total_taxes_gtq) : "Pendiente"}</h3>
                        <dl>
                          <div>
                            <dt>IVA <small className="public-tax-rate">({displayTaxRate(publicTaxes?.iva_rate, 0.12)})</small></dt>
                            <dd>{publicTaxes?.iva_gtq ? moneyGTQ(publicTaxes.iva_gtq) : "—"}</dd>
                          </div>
                          <div>
                            <dt>IPRIMA <small className="public-tax-rate">({displayTaxRate(publicTaxes?.iprima_rate)})</small></dt>
                            <dd>{publicTaxes?.iprima_gtq ? moneyGTQ(publicTaxes.iprima_gtq) : "—"}</dd>
                          </div>
                          <div><dt>Placas</dt><dd>{publicTaxes?.plates_gtq ? moneyGTQ(publicTaxes.plates_gtq) : "—"}</dd></div>
                        </dl>
                      </article>

                      <article>
                        <span className="public-card-label">FLETE MARÍTIMO</span>
                        <h3>{publicFreight?.price_usd ? moneyUSD(publicFreight.price_usd) : "Pendiente"}</h3>
                        <dl>
                          <div><dt>Categoría</dt><dd>{publicFreight?.category || "—"}</dd></div>
                          <div><dt>Largo</dt><dd>{publicResult?.dimensions?.length_inches ? `${Number(publicResult.dimensions.length_inches).toFixed(2)}"` : "—"}</dd></div>
                          <div><dt>Estado</dt><dd>{publicSummary?.freight_status === "AUTOMATIC_FREIGHT" ? "Calculado" : "Validación"}</dd></div>
                        </dl>
                      </article>
                    </div>

                    {publicReady && (
                      <div className="public-import-cta">
                        <div className="public-import-cta-copy">
                          <span className="public-import-kicker">✓ VEHÍCULO LISTO PARA AVANZAR</span>
                          <h3>¿Estás listo para hacer tu importación?</h3>
                          <p>
                            Ya tenemos identificado el vehículo y los valores estimados.
                            Contactanos por WhatsApp para coordinar los siguientes pasos
                            e iniciar la gestión con E&amp;R.
                          </p>
                        </div>

                        {whatsappConfigured ? (
                          <button
                            type="button"
                            className="whatsapp-action import-whatsapp-action"
                            onClick={async () => {
                              await markImportRequest(publicResult?.customer_query_id || null);
                              window.open(importWhatsAppUrl, "_blank", "noopener,noreferrer");
                            }}
                          >
                            <span className="whatsapp-icon">💬</span>
                            Iniciar mi importación
                            <span>→</span>
                          </button>
                        ) : (
                          <div className="whatsapp-not-configured">
                            WhatsApp temporalmente no disponible
                          </div>
                        )}
                      </div>
                    )}

                    {publicNeedsReview && (
                      <div className="public-review-note">
                        <div>
                          <strong>¿Qué significa esto?</strong>
                          <p>
                            Encontramos el vehículo, pero uno de los datos necesarios no puede confirmarse
                            automáticamente con suficiente seguridad. El equipo E&amp;R puede revisarlo antes
                            de darte un valor definitivo.
                          </p>
                        </div>

                        {whatsappConfigured ? (
                          <a
                            className="whatsapp-action whatsapp-review"
                            href={reviewWhatsAppUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="whatsapp-icon">💬</span>
                            Solicitar revisión por WhatsApp
                            <span>→</span>
                          </a>
                        ) : (
                          <div className="whatsapp-not-configured">WhatsApp temporalmente no disponible</div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {publicResult && !publicCanQuote && (
                  <section className="public-after-result-paywall">
                    <div>
                      <span className="public-kicker">3 DE 3 CONSULTAS UTILIZADAS</span>
                      <strong>Esta fue tu última cotización gratuita.</strong>
                      <p>Activá el plan mensual para continuar cotizando otros vehículos.</p>
                    </div>
                    <div className="public-contact-actions compact">
                      <a
                        className="whatsapp-action"
                        href={subscriptionWhatsAppUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="whatsapp-icon">💬</span>
                        Coordinar pago por WhatsApp
                        <span>→</span>
                      </a>

                      {isAnonymousCustomer && (
                        <button
                          className="public-secondary-action"
                          onClick={preparePaidAccount}
                        >
                          Crear cuenta para mi suscripción
                        </button>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        )}
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="auth-loading-card">
          <div className="auth-brand-mark">E&amp;R</div>
          <div className="auth-spinner"></div>
          <h2>Validando acceso</h2>
          <p>Conectando con E&amp;R Vehicle Import...</p>
        </div>
      </div>
    );
  }

  if (!hasInternalAccess) {
    return (
      <div className="auth-shell">
        <div className="auth-layout">
          <section className="auth-visual">
            <div className="auth-visual-overlay"></div>
            <div className="auth-visual-content">
              <div className="auth-logo-lockup">
                <div className="auth-brand-mark auth-brand-mark-large">E&amp;R</div>
                <div>
                  <strong>VEHICLE IMPORT</strong>
                  <span>GLOBAL LOGISTIC</span>
                </div>
              </div>
              <div className="auth-copy">
                <span className="auth-eyebrow">PLATAFORMA INTERNA</span>
                <h1>Control inteligente para cada importación.</h1>
                <p>VIN, SAT, impuestos, flete, revisiones y cotizaciones en un solo lugar.</p>
              </div>
              <div className="auth-feature-row">
                <span>VIN Intelligence</span>
                <span>SAT Match</span>
                <span>Freight Engine</span>
              </div>
            </div>
          </section>

          <section className="auth-panel">
            <div className="auth-panel-inner">
              <span className="auth-eyebrow">ACCESO SEGURO</span>
              <h2>Bienvenido a E&amp;R</h2>
              <p className="auth-subtitle">Ingresá con tu cuenta autorizada para continuar.</p>

              <form className="auth-form" onSubmit={handleLogin}>
                <label>
                  <span>Correo electrónico</span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="usuario@eyr.com"
                    value={loginForm.email}
                    onChange={(e) =>
                      setLoginForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    disabled={loginLoading}
                  />
                </label>

                <label>
                  <span>Contraseña</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    disabled={loginLoading}
                  />
                </label>

                {authError && (
                  <div className="auth-error">
                    <strong>No pudimos ingresar</strong>
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={loginLoading}
                >
                  {loginLoading ? "Ingresando..." : "Iniciar sesión"}
                  <span>→</span>
                </button>
              </form>

              <div className="auth-security-note">
                <span>🔐</span>
                <p><strong>Acceso interno E&amp;R</strong>Solo usuarios ADMIN u OPERADOR autorizados.</p>
              </div>
              <button className="auth-back-public" type="button" onClick={() => navigateSite("/")}>
                ← Volver al sitio público
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">E&R</div>

          <div>
            <h2>Vehicle Import</h2>
            <span>Global Logistic</span>
          </div>
        </div>

        <nav>
          <button className="nav-item">
            <span>▦</span>
            Dashboard
          </button>

          <button
            className={`nav-item ${activeView === "new" ? "active" : ""}`}
            onClick={openNewQuoteView}
          >
            <span>＋</span>
            Nueva Cotización
          </button>

          <button
            className={`nav-item ${activeView === "quotations" ? "active" : ""}`}
            onClick={openQuotationsView}
          >
            <span>▤</span>
            Cotizaciones
          </button>

          <button
            className={`nav-item ${activeView === "prospects" ? "active" : ""}`}
            onClick={openProspectsView}
          >
            <span>◎</span>
            Prospectos
          </button>

          <button
            className={`nav-item ${activeView === "imports" ? "active" : ""}`}
            onClick={openImportManagementsView}
          >
            <span>🚢</span>
            Gestiones de Importación
          </button>

          <button
            className={`nav-item ${activeView === "customs" ? "active" : ""}`}
            onClick={openCustomsView}
          >
            <span>▣</span>
            Control Aduanal
          </button>

          <button className="nav-item">
            <span>⚠</span>
            Revisiones
          </button>

          <button
            className={`nav-item ${activeView === "settings" ? "active" : ""}`}
            onClick={openSettingsView}
          >
            <span>⚙</span>
            Configuración
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">
              {(profile?.full_name || profile?.email || "E").charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-copy">
              <strong>{profile?.full_name || "Usuario E&R"}</strong>
              <span>{profile?.email}</span>
              <small>{internalRole}</small>
            </div>
          </div>

          <button className="sidebar-logout" onClick={handleLogout}>
            <span>↪</span> Cerrar sesión
          </button>

          <div className="system-status">
            <span className="status-dot"></span>
            Sistema operativo
          </div>

          <small>E&R Vehicle Import v1.3</small>
        </div>
      </aside>

      <main className="main">
        {activeView === "imports" ? (
          <section className="imports-module">
            <header className="topbar imports-topbar">
              <div>
                <span className="eyebrow">OPERACIÓN INTERNACIONAL</span>
                <h1>Gestiones de Importación</h1>
                <p>Seguimiento de clientes que confirmaron su importación con E&amp;R.</p>
              </div>
              <div className="imports-count-card">
                <span>GESTIONES</span>
                <strong>{importManagements.length}</strong>
              </div>
            </header>

            <section className="imports-kpis">
              <article><span>Activas</span><strong>{importManagements.filter((i) => !["ENTREGADO","CANCELADO"].includes(i.status)).length}</strong></article>
              <article><span>Confirmadas</span><strong>{importManagements.filter((i) => i.status === "CLIENTE_CONFIRMÓ").length}</strong></article>
              <article><span>En tránsito</span><strong>{importManagements.filter((i) => ["EMBARCADO","TRÁNSITO_MARÍTIMO"].includes(i.status)).length}</strong></article>
              <article><span>En Guatemala</span><strong>{importManagements.filter((i) => ["ARRIBÓ_GUATEMALA","CONTROL_ADUANAL","LIBERADO"].includes(i.status)).length}</strong></article>
            </section>

            <section className="imports-search-card">
              <div>
                <span className="section-label">GESTIONES</span>
                <h2>Control de importaciones</h2>
              </div>
              <form className="imports-search-form" onSubmit={(e) => { e.preventDefault(); loadImportManagements(importSearch); }}>
                <input value={importSearch} onChange={(e) => setImportSearch(e.target.value)} placeholder="Buscar gestión, cliente, VIN o cotización..." />
                <button type="submit" disabled={importManagementsLoading}>{importManagementsLoading ? "Buscando..." : "Buscar"}</button>
              </form>
            </section>

            {importManagementMessage && <div className="customer-message success">{importManagementMessage}</div>}
            {importManagementsError && <div className="customer-message error">{importManagementsError}</div>}

            <section className="imports-table-card">
              <div className="imports-table-head">
                <div><span className="section-label">CONTROL GENERAL</span><h2>{importManagementsLoading ? "Cargando..." : `${importManagements.length} gestión${importManagements.length === 1 ? "" : "es"}`}</h2></div>
                <button className="secondary-button" onClick={() => loadImportManagements(importSearch)} disabled={importManagementsLoading}>↻ Actualizar</button>
              </div>
              <div className="imports-table-wrap">
                <table className="imports-table">
                  <thead><tr><th>Gestión</th><th>Cliente</th><th>Vehículo</th><th>Cotización</th><th>Estado</th><th>Responsable</th><th></th></tr></thead>
                  <tbody>
                    {!importManagementsLoading && importManagements.length === 0 && <tr><td colSpan="7" className="empty-cell">Todavía no hay gestiones de importación.</td></tr>}
                    {importManagements.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.management_code}</strong><small>{new Date(item.created_at).toLocaleDateString("es-GT")}</small></td>
                        <td><strong>{item.client_name}</strong><small>{item.phone || "Sin teléfono"}</small></td>
                        <td><strong>{[item.model_year,item.make,item.model,item.vehicle_trim].filter(Boolean).join(" ")}</strong><small>{item.vin}</small></td>
                        <td><strong>{item.quote_code || "—"}</strong><small>{item.freight_usd ? `Flete ${moneyUSD(item.freight_usd)}` : "Sin flete"}</small></td>
                        <td><span className="import-status">{String(item.status || "").replaceAll("_"," ")}</span></td>
                        <td><strong>{item.responsible || "Sin asignar"}</strong></td>
                        <td><button className="prospect-open-button" onClick={() => openImportManagementDetail(item)}>Ver →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedImportManagement && importManagementDetail && (
              <div className="quote-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !importManagementSaving) { setSelectedImportManagement(null); setImportManagementDetail(null); } }}>
                <div className="import-detail-modal">
                  <div className="quote-modal-head">
                    <div><small>GESTIÓN DE IMPORTACIÓN</small><h2>{importManagementDetail.management_code}</h2><p>{importManagementDetail.client_name} · {importManagementDetail.vin}</p></div>
                    <button className="quote-close" onClick={() => { setSelectedImportManagement(null); setImportManagementDetail(null); }}>×</button>
                  </div>

                  <div className="import-detail-body">
                    <section className="import-vehicle-card">
                      <span className="section-label">VEHÍCULO</span>
                      <h3>{[importManagementDetail.model_year,importManagementDetail.make,importManagementDetail.model,importManagementDetail.vehicle_trim].filter(Boolean).join(" ")}</h3>
                      <p>VIN · {importManagementDetail.vin}</p>
                      <div><span>Cotización</span><strong>{importManagementDetail.quote_code || "—"}</strong></div>
                    </section>

                    <section className="import-progress-card">
                      <span className="section-label">ESTADO OPERATIVO</span>
                      <select value={importManagementDetail.status || "COTIZADO"} onChange={(e) => setImportManagementDetail((p) => ({...p,status:e.target.value}))}>
                        <option value="COTIZADO">Cotizado</option>
                        <option value="CLIENTE_CONFIRMÓ">Cliente confirmó</option>
                        <option value="PAGO_INICIAL">Pago inicial</option>
                        <option value="POR_RECOGER">Vehículo por recoger</option>
                        <option value="TRÁNSITO_A_PUERTO">En tránsito a puerto</option>
                        <option value="EMBARCADO">Embarcado</option>
                        <option value="TRÁNSITO_MARÍTIMO">En tránsito marítimo</option>
                        <option value="ARRIBÓ_GUATEMALA">Arribó a Guatemala</option>
                        <option value="CONTROL_ADUANAL">Control aduanal</option>
                        <option value="LIBERADO">Liberado</option>
                        <option value="ENTREGADO">Entregado</option>
                        <option value="CANCELADO">Cancelado</option>
                      </select>
                      <label><span>Responsable</span><input value={importManagementDetail.responsible || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,responsible:e.target.value}))} placeholder="Responsable E&R" /></label>
                    </section>

                    <section className="import-logistics-grid">
                      <label><span>Lugar de recogida</span><input value={importManagementDetail.pickup_location || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,pickup_location:e.target.value}))} /></label>
                      <label><span>Puerto destino</span><input value={importManagementDetail.destination_port || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,destination_port:e.target.value}))} /></label>
                      <label><span>Naviera</span><input value={importManagementDetail.shipping_line || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,shipping_line:e.target.value}))} /></label>
                      <label><span>Contenedor</span><input value={importManagementDetail.container_number || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,container_number:e.target.value}))} /></label>
                      <label><span>BL</span><input value={importManagementDetail.bl || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,bl:e.target.value}))} /></label>
                      <label><span>Fecha estimada embarque</span><input type="date" value={importManagementDetail.estimated_sailing_date || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,estimated_sailing_date:e.target.value}))} /></label>
                      <label><span>Fecha estimada arribo</span><input type="date" value={importManagementDetail.estimated_arrival_date || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,estimated_arrival_date:e.target.value}))} /></label>
                      <label className="span-2"><span>Notas</span><textarea rows="4" value={importManagementDetail.notes || ""} onChange={(e) => setImportManagementDetail((p) => ({...p,notes:e.target.value}))} /></label>
                    </section>
                  </div>

                  <div className="customs-form-actions sticky">
                    <button className="secondary-button" onClick={() => { setSelectedImportManagement(null); setImportManagementDetail(null); }}>Cerrar</button>
                    <button className="primary-button" onClick={saveImportManagementDetail} disabled={importManagementSaving}>{importManagementSaving ? "Guardando..." : "Guardar gestión"} <span>→</span></button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : activeView === "customs" ? (
          <section className="customs-module">
            <header className="topbar customs-topbar">
              <div>
                <span className="eyebrow">OPERACIÓN · GUATEMALA</span>
                <h1>Control Aduanal</h1>
                <p>
                  Expedientes, tributos, seguimiento documental y entrega final.
                </p>
              </div>

              <button
                className="primary-button customs-new-button"
                onClick={openManualCustomsCase}
              >
                + Nueva gestión aduanal
              </button>
            </header>

            <section className="customs-kpis">
              <article>
                <span>Expedientes activos</span>
                <strong>
                  {customsCases.filter((item) => !item.delivered_at).length}
                </strong>
              </article>
              <article>
                <span>Pendiente documentos</span>
                <strong>
                  {customsCases.filter((item) => !item.docs_collected_at).length}
                </strong>
              </article>
              <article>
                <span>En digitación / revisión</span>
                <strong>
                  {customsCases.filter((item) =>
                    ["Digitación iniciada", "En revisión"].includes(item.current_status)
                  ).length}
                </strong>
              </article>
              <article>
                <span>Con selectivo</span>
                <strong>
                  {customsCases.filter((item) => Boolean(item.selective_at)).length}
                </strong>
              </article>
              <article className="urgent">
                <span>Urgentes</span>
                <strong>
                  {customsCases.filter((item) => item.traffic_light === "URGENTE").length}
                </strong>
              </article>
            </section>

            <section className="customs-search-card">
              <div>
                <span className="section-label">EXPEDIENTES ADUANALES</span>
                <h2>Seguimiento operativo</h2>
              </div>

              <form
                className="customs-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  loadCustomsCases(customsSearch);
                }}
              >
                <input
                  value={customsSearch}
                  onChange={(e) => setCustomsSearch(e.target.value)}
                  placeholder="Buscar expediente, cliente, VIN, BL o contenedor..."
                />
                <button type="submit" disabled={customsLoading}>
                  {customsLoading ? "Buscando..." : "Buscar"}
                </button>
              </form>
            </section>

            {customsMessage && (
              <div className="customer-message success">{customsMessage}</div>
            )}

            {customsError && (
              <div className="customer-message error">{customsError}</div>
            )}

            <section className="customs-table-card">
              <div className="customs-table-head">
                <div>
                  <span className="section-label">CONTROL GENERAL</span>
                  <h2>
                    {customsLoading
                      ? "Cargando..."
                      : `${customsCases.length} expediente${customsCases.length === 1 ? "" : "s"}`}
                  </h2>
                </div>

                <button
                  className="secondary-button"
                  onClick={() => loadCustomsCases(customsSearch)}
                  disabled={customsLoading}
                >
                  ↻ Actualizar
                </button>
              </div>

              <div className="customs-table-wrap">
                <table className="customs-table">
                  <thead>
                    <tr>
                      <th>Expediente</th>
                      <th>Cliente</th>
                      <th>Vehículo</th>
                      <th>BL / Contenedor</th>
                      <th>Naviera</th>
                      <th>Estado</th>
                      <th>Progreso</th>
                      <th>Semáforo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!customsLoading && customsCases.length === 0 && (
                      <tr>
                        <td colSpan="9" className="empty-cell">
                          No hay expedientes registrados.
                        </td>
                      </tr>
                    )}

                    {customsCases.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.case_code}</strong>
                          <small>
                            {item.source_type === "CUSTOMS_ONLY"
                              ? "Gestión aduanal externa"
                              : "Importación E&R"}
                          </small>
                        </td>
                        <td>
                          <strong>{item.client_name}</strong>
                          <small>{item.phone || "Sin teléfono"}</small>
                        </td>
                        <td>
                          <strong>
                            {[item.model_year, item.make, item.model, item.vehicle_trim]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </strong>
                          <small>{item.vin}</small>
                        </td>
                        <td>
                          <strong>{item.bl || "—"}</strong>
                          <small>{item.container_number || "Sin contenedor"}</small>
                        </td>
                        <td>
                          <strong>{item.shipping_line || "—"}</strong>
                          <small>{item.responsible || "Sin responsable"}</small>
                        </td>
                        <td>
                          <span className="customs-current-status">
                            {item.current_status || "Pendiente"}
                          </span>
                        </td>
                        <td>
                          <div className="customs-progress">
                            <div>
                              <span
                                style={{
                                  width: `${Math.round(Number(item.progress || 0) * 100)}%`,
                                }}
                              ></span>
                            </div>
                            <strong>
                              {Math.round(Number(item.progress || 0) * 100)}%
                            </strong>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`customs-light ${String(
                              item.traffic_light || "EN TIEMPO"
                            )
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {item.traffic_light || "EN TIEMPO"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="prospect-open-button"
                            onClick={() => openCustomsDetail(item)}
                          >
                            Ver →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {showCustomsForm && (
              <div
                className="quote-modal-backdrop"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget && !customsSaving) {
                    setShowCustomsForm(false);
                  }
                }}
              >
                <div className="customs-form-modal">
                  <div className="quote-modal-head">
                    <div>
                      <small>NUEVA GESTIÓN ADUANAL</small>
                      <h2>Registrar expediente externo</h2>
                      <p>
                        Para clientes que no embarcaron con E&amp;R y únicamente
                        solicitan la gestión aduanal en Guatemala.
                      </p>
                    </div>
                    <button
                      className="quote-close"
                      onClick={() => setShowCustomsForm(false)}
                      disabled={customsSaving}
                    >
                      ×
                    </button>
                  </div>

                  <form onSubmit={saveManualCustomsCase}>
                    <section className="customs-form-section">
                      <div className="customs-section-title">
                        <span>01</span>
                        <div>
                          <strong>Cliente y expediente</strong>
                          <small>
                            El número E&amp;R-AAAA-XXXX se generará automáticamente.
                          </small>
                        </div>
                      </div>

                      <div className="customs-form-grid">
                        <label>
                          <span>Fecha de aviso</span>
                          <input
                            type="date"
                            value={customsForm.notice_date}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                notice_date: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="span-2">
                          <span>Cliente *</span>
                          <input
                            value={customsForm.client_name}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                client_name: e.target.value,
                              }))
                            }
                            placeholder="Nombre o razón social"
                          />
                        </label>
                        <label>
                          <span>Teléfono</span>
                          <input
                            value={customsForm.phone}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                phone: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Correo</span>
                          <input
                            type="email"
                            value={customsForm.email}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                email: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>BL</span>
                          <input
                            value={customsForm.bl}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                bl: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Contenedor</span>
                          <input
                            value={customsForm.container_number}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                container_number: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Naviera</span>
                          <input
                            value={customsForm.shipping_line}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                shipping_line: e.target.value,
                              }))
                            }
                            placeholder="Port to Port, North Atlantic..."
                          />
                        </label>
                        <label>
                          <span>Responsable</span>
                          <input
                            value={customsForm.responsible}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                responsible: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Prioridad</span>
                          <select
                            value={customsForm.priority}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                priority: e.target.value,
                              }))
                            }
                          >
                            <option>Normal</option>
                            <option>Alta</option>
                            <option>Urgente</option>
                          </select>
                        </label>
                      </div>
                    </section>

                    <section className="customs-form-section customs-tax-section">
                      <div className="customs-section-title">
                        <span>02</span>
                        <div>
                          <strong>Vehículo + cálculo SAT</strong>
                          <small>
                            El mismo motor VIN calcula valor SAT, IVA e IPRIMA.
                          </small>
                        </div>
                      </div>

                      <div className="customs-vin-row">
                        <input
                          value={customsForm.vin}
                          maxLength="17"
                          onChange={(e) =>
                            setCustomsForm((p) => ({
                              ...p,
                              vin: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="VIN de 17 caracteres"
                        />
                        <button
                          type="button"
                          className="primary-button"
                          onClick={calculateManualCustomsTaxes}
                          disabled={customsDecodeLoading}
                        >
                          {customsDecodeLoading
                            ? "Calculando..."
                            : "Calcular IVA e IPRIMA"}
                          <span>→</span>
                        </button>
                      </div>

                      {customsDecodeResult && (
                        <div className="customs-decode-summary">
                          <div>
                            <span>Vehículo identificado</span>
                            <strong>
                              {[
                                customsForm.model_year,
                                customsForm.make,
                                customsForm.model,
                                customsForm.vehicle_trim,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            </strong>
                          </div>
                          <div>
                            <span>Estado del motor</span>
                            <strong>{customsDecodeResult.calculation_status}</strong>
                          </div>
                        </div>
                      )}

                      <div className="customs-form-grid">
                        <label>
                          <span>Marca</span>
                          <input
                            value={customsForm.make}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                make: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Modelo</span>
                          <input
                            value={customsForm.model}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                model: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Año</span>
                          <input
                            type="number"
                            value={customsForm.model_year}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                model_year: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Versión</span>
                          <input
                            value={customsForm.vehicle_trim}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                vehicle_trim: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="span-2">
                          <span>Línea SAT</span>
                          <input
                            value={customsForm.sat_line}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                sat_line: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Tipo SAT</span>
                          <input
                            value={customsForm.sat_vehicle_type}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                sat_vehicle_type: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Valor imponible (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.taxable_value_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                taxable_value_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>IVA utilizado</span>
                          <input
                            type="number"
                            step="0.0001"
                            value={customsForm.iva_rate}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                iva_rate: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>IVA (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.iva_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                iva_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>IPRIMA utilizada</span>
                          <input
                            type="number"
                            step="0.0001"
                            value={customsForm.iprima_rate}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                iprima_rate: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>IPRIMA (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.iprima_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                iprima_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Placas (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.plates_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                plates_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Total tributos (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.total_taxes_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                total_taxes_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                    </section>

                    <section className="customs-form-section">
                      <div className="customs-section-title">
                        <span>03</span>
                        <div>
                          <strong>Cobro de la gestión</strong>
                          <small>
                            Costos comerciales de E&amp;R para este expediente.
                          </small>
                        </div>
                      </div>

                      <div className="customs-form-grid">
                        <label>
                          <span>Recolección documentos (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.document_collection_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                document_collection_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Gastos portuarios (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.port_expenses_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                port_expenses_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Honorarios (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.professional_fees_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                professional_fees_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Grúa (USD)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.crane_usd}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                crane_usd: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span>Otros gastos (Q)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={customsForm.other_charges_gtq}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                other_charges_gtq: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="span-2">
                          <span>Concepto de otros gastos</span>
                          <input
                            value={customsForm.other_charges_note}
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                other_charges_note: e.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>

                      <div className="customs-cost-summary">
                        <div>
                          <span>Tributos estimados</span>
                          <strong>
                            {moneyGTQ(Number(customsForm.total_taxes_gtq || 0))}
                          </strong>
                        </div>
                        <div>
                          <span>Cobro E&amp;R en Guatemala</span>
                          <strong>
                            {moneyGTQ(
                              Number(customsForm.document_collection_gtq || 0) +
                              Number(customsForm.port_expenses_gtq || 0) +
                              Number(customsForm.professional_fees_gtq || 0) +
                              Number(customsForm.other_charges_gtq || 0)
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Grúa</span>
                          <strong>
                            {moneyUSD(Number(customsForm.crane_usd || 0))}
                          </strong>
                        </div>
                      </div>
                    </section>

                    <div className="customs-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setShowCustomsForm(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={customsSaving}
                      >
                        {customsSaving
                          ? "Creando expediente..."
                          : "Crear expediente automático"}
                        <span>→</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {selectedCustomsCase && customsDetail && (
              <div
                className="quote-modal-backdrop"
                onMouseDown={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    !customsDetailSaving
                  ) {
                    setSelectedCustomsCase(null);
                    setCustomsDetail(null);
                  }
                }}
              >
                <div className="customs-detail-modal">
                  <div className="quote-modal-head">
                    <div>
                      <small>EXPEDIENTE ADUANAL</small>
                      <h2>{customsDetail.case_code}</h2>
                      <p>
                        {customsDetail.client_name} · {customsDetail.vin}
                      </p>
                    </div>
                    <button
                      className="quote-close"
                      onClick={() => {
                        setSelectedCustomsCase(null);
                        setCustomsDetail(null);
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div className="customs-detail-summary">
                    <article>
                      <span>Estado actual</span>
                      <strong>{customsDetail.current_status}</strong>
                    </article>
                    <article>
                      <span>Progreso</span>
                      <strong>
                        {Math.round(Number(customsDetail.progress || 0) * 100)}%
                      </strong>
                    </article>
                    <article>
                      <span>Días sin movimiento</span>
                      <strong>{customsDetail.days_without_movement ?? 0}</strong>
                    </article>
                    <article>
                      <span>Semáforo</span>
                      <strong>{customsDetail.traffic_light}</strong>
                    </article>
                  </div>

                  <section className="customs-detail-section">
                    <div className="customs-section-title">
                      <span>01</span>
                      <div>
                        <strong>Etapas del expediente</strong>
                        <small>
                          Registrá la fecha cuando cada paso se complete.
                        </small>
                      </div>
                    </div>

                    <div className="customs-stage-grid">
                      {CUSTOMS_STAGES.map(([key, label], index) => (
                        <label key={key} className={customsDetail[key] ? "done" : ""}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{label}</strong>
                            <input
                              type="date"
                              value={
                                customsDetail[key]
                                  ? String(customsDetail[key]).slice(0, 10)
                                  : ""
                              }
                              onChange={(e) =>
                                setCustomsDetail((p) => ({
                                  ...p,
                                  [key]: e.target.value || null,
                                }))
                              }
                            />
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="customs-form-grid detail-selects">
                      <label>
                        <span>Tipo de selectivo</span>
                        <select
                          value={customsDetail.selective_type || ""}
                          onChange={(e) =>
                            setCustomsDetail((p) => ({
                              ...p,
                              selective_type: e.target.value || null,
                            }))
                          }
                        >
                          <option value="">Pendiente</option>
                          <option value="Verde">Verde</option>
                          <option value="Rojo">Rojo</option>
                          <option value="Sin selectivo">Sin selectivo</option>
                        </select>
                      </label>
                      <label>
                        <span>Estado entrega</span>
                        <select
                          value={customsDetail.delivery_status || "Pendiente"}
                          onChange={(e) =>
                            setCustomsDetail((p) => ({
                              ...p,
                              delivery_status: e.target.value,
                            }))
                          }
                        >
                          <option>Pendiente</option>
                          <option>Listo para entrega</option>
                          <option>Entregado</option>
                          <option>Archivado</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="customs-detail-section">
                    <div className="customs-section-title">
                      <span>02</span>
                      <div>
                        <strong>Incidencias y pendientes</strong>
                        <small>
                          Conserva la lógica del control operativo actual.
                        </small>
                      </div>
                    </div>

                    <div className="customs-form-grid">
                      <label>
                        <span>Estado incidencia</span>
                        <select
                          value={customsDetail.incident_status || ""}
                          onChange={(e) =>
                            setCustomsDetail((p) => ({
                              ...p,
                              incident_status: e.target.value || null,
                            }))
                          }
                        >
                          <option value="">Sin incidencia</option>
                          <option value="Pendiente">Pendiente</option>
                          <option value="En gestión">En gestión</option>
                          <option value="Resuelta">Resuelta</option>
                        </select>
                      </label>
                      <label className="span-2">
                        <span>Motivo / problema</span>
                        <textarea
                          rows="2"
                          value={customsDetail.problem_reason || ""}
                          onChange={(e) =>
                            setCustomsDetail((p) => ({
                              ...p,
                              problem_reason: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="span-2">
                        <span>Acción realizada</span>
                        <textarea
                          rows="2"
                          value={customsDetail.action_taken || ""}
                          onChange={(e) =>
                            setCustomsDetail((p) => ({
                              ...p,
                              action_taken: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Pendiente de</span>
                        <input
                          value={customsDetail.pending_from || ""}
                          onChange={(e) =>
                            setCustomsDetail((p) => ({
                              ...p,
                              pending_from: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section className="customs-detail-section">
                    <div className="customs-section-title">
                      <span>03</span>
                      <div>
                        <strong>Valores del expediente</strong>
                        <small>
                          Tributos calculados y cobro comercial registrado.
                        </small>
                      </div>
                    </div>

                    <div className="customs-value-cards">
                      <article>
                        <span>Valor SAT</span>
                        <strong>{moneyGTQ(customsDetail.taxable_value_gtq || 0)}</strong>
                      </article>
                      <article>
                        <span>
                          IVA {displayTaxRate(customsDetail.iva_rate)}
                        </span>
                        <strong>{moneyGTQ(customsDetail.iva_gtq || 0)}</strong>
                      </article>
                      <article>
                        <span>
                          IPRIMA {displayTaxRate(customsDetail.iprima_rate)}
                        </span>
                        <strong>{moneyGTQ(customsDetail.iprima_gtq || 0)}</strong>
                      </article>
                      <article>
                        <span>Total tributos</span>
                        <strong>{moneyGTQ(customsDetail.total_taxes_gtq || 0)}</strong>
                      </article>
                    </div>
                  </section>

                  <div className="customs-form-actions sticky">
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setSelectedCustomsCase(null);
                        setCustomsDetail(null);
                      }}
                    >
                      Cerrar
                    </button>
                    <button
                      className="primary-button"
                      onClick={saveCustomsDetail}
                      disabled={customsDetailSaving}
                    >
                      {customsDetailSaving
                        ? "Guardando..."
                        : "Guardar seguimiento"}
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : activeView === "prospects" ? (
          <section className="prospects-module">
            <header className="topbar prospects-topbar">
              <div>
                <span className="eyebrow">CAPTACIÓN COMERCIAL</span>
                <h1>Prospectos</h1>
                <p>
                  Personas que utilizaron el cotizador público y pueden convertirse
                  en clientes de E&amp;R.
                </p>
              </div>

              <div className="prospect-summary-badge">
                <span>PROSPECTOS</span>
                <strong>{prospects.length}</strong>
              </div>
            </header>

            <section className="prospect-stats">
              <article>
                <span>Total prospectos</span>
                <strong>{prospects.length}</strong>
              </article>
              <article>
                <span>Nuevos</span>
                <strong>
                  {prospects.filter((p) => (p.lead_status || "NUEVO") === "NUEVO").length}
                </strong>
              </article>
              <article>
                <span>En seguimiento</span>
                <strong>
                  {prospects.filter((p) =>
                    ["CONTACTADO", "SEGUIMIENTO"].includes(p.lead_status)
                  ).length}
                </strong>
              </article>
              <article>
                <span>Convertidos</span>
                <strong>
                  {prospects.filter((p) => p.lead_status === "CONVERTIDO").length}
                </strong>
              </article>
            </section>

            <section className="prospect-search-card">
              <div>
                <span className="section-label">BUSCADOR</span>
                <h2>Buscar cliente, correo, celular o VIN</h2>
              </div>

              <form
                className="prospect-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  loadProspects(prospectSearch);
                }}
              >
                <input
                  value={prospectSearch}
                  onChange={(e) => setProspectSearch(e.target.value)}
                  placeholder="Ej. Ronaldo, correo, 3766..., VIN..."
                />
                <button type="submit" disabled={prospectsLoading}>
                  {prospectsLoading ? "Buscando..." : "Buscar"}
                  <span>⌕</span>
                </button>
              </form>
            </section>

            {prospectsError && (
              <div className="customer-message error">{prospectsError}</div>
            )}

            <div className={`prospects-layout ${selectedProspect ? "has-detail" : ""}`}>
              <section className="prospects-list-card">
                <div className="prospects-list-head">
                  <div>
                    <span className="section-label">BASE DE PROSPECTOS</span>
                    <h2>
                      {prospectsLoading
                        ? "Cargando..."
                        : `${prospects.length} prospecto${prospects.length === 1 ? "" : "s"}`}
                    </h2>
                  </div>

                  <button
                    className="secondary-button"
                    onClick={() => loadProspects(prospectSearch)}
                    disabled={prospectsLoading}
                  >
                    ↻ Actualizar
                  </button>
                </div>

                <div className="prospects-table-wrap">
                  <table className="prospects-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Consultas</th>
                        <th>Último vehículo</th>
                        <th>Actividad</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!prospectsLoading && prospects.length === 0 && (
                        <tr>
                          <td colSpan="6" className="empty-cell">
                            No hay prospectos que coincidan con la búsqueda.
                          </td>
                        </tr>
                      )}

                      {prospects.map((item) => (
                        <tr key={item.contact_key}>
                          <td>
                            <strong>{item.full_name || "Cliente sin nombre"}</strong>
                            <small>{item.email || "Sin correo"}</small>
                            <small>{item.phone || "Sin celular"}</small>
                          </td>
                          <td>
                            <strong>{item.used_count || 0} / 3</strong>
                            <small>
                              {item.query_count || 0} registradas
                            </small>
                          </td>
                          <td>
                            <strong>{item.latest_vehicle || "—"}</strong>
                            <small>{item.latest_vin || "Sin VIN registrado"}</small>
                          </td>
                          <td>
                            <strong>
                              {item.updated_at
                                ? new Date(item.updated_at).toLocaleDateString("es-GT")
                                : "—"}
                            </strong>
                            <small>
                              {item.updated_at
                                ? new Date(item.updated_at).toLocaleTimeString("es-GT", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : ""}
                            </small>
                          </td>
                          <td>
                            <span className={`lead-status ${(item.lead_status || "NUEVO").toLowerCase()}`}>
                              {item.lead_status || "NUEVO"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="prospect-open-button"
                              onClick={() => selectProspect(item)}
                            >
                              Ver →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {selectedProspect && (
                <aside className="prospect-detail-card">
                  <div className="prospect-detail-head">
                    <div>
                      <span className="section-label">DETALLE DEL PROSPECTO</span>
                      <h2>{selectedProspect.full_name || "Cliente"}</h2>
                      <p>{selectedProspect.email || "Sin correo"}</p>
                      <p>{selectedProspect.phone || "Sin celular"}</p>
                    </div>

                    <button
                      className="prospect-close"
                      onClick={() => {
                        setSelectedProspect(null);
                        setProspectQueries([]);
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {selectedProspect.phone && (
                    <a
                      className="whatsapp-action prospect-whatsapp"
                      href={buildWhatsAppUrl(
                        selectedProspect.phone,
                        `Hola ${selectedProspect.full_name || ""}, te contactamos de E&R Solutions. Vimos que realizaste una cotización de importación de vehículo y queremos ayudarte con los siguientes pasos.`
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="whatsapp-icon">💬</span>
                      Contactar por WhatsApp
                    </a>
                  )}

                  <div className="prospect-followup">
                    <label>
                      <span>Estado comercial</span>
                      <select
                        value={prospectStatusForm.status}
                        onChange={(e) =>
                          setProspectStatusForm((prev) => ({
                            ...prev,
                            status: e.target.value,
                          }))
                        }
                      >
                        <option value="NUEVO">Nuevo</option>
                        <option value="CONTACTADO">Contactado</option>
                        <option value="SEGUIMIENTO">En seguimiento</option>
                        <option value="CONVERTIDO">Convertido</option>
                        <option value="NO_INTERESADO">No interesado</option>
                      </select>
                    </label>

                    <label>
                      <span>Notas de seguimiento</span>
                      <textarea
                        rows="3"
                        value={prospectStatusForm.notes}
                        onChange={(e) =>
                          setProspectStatusForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        placeholder="Ej. Se llamó, interesado en traer el vehículo el próximo mes..."
                      />
                    </label>

                    <button
                      className="primary-button"
                      onClick={saveProspectStatus}
                      disabled={prospectSaving}
                    >
                      {prospectSaving ? "Guardando..." : "Guardar seguimiento"}
                    </button>

                    {prospectMessage && (
                      <div className="customer-message success">{prospectMessage}</div>
                    )}
                  </div>

                  <div className="prospect-query-history">
                    <div className="prospect-history-title">
                      <span className="section-label">CONSULTAS REALIZADAS</span>
                      <strong>
                        {prospectQueriesLoading
                          ? "Cargando..."
                          : `${prospectQueries.length} consulta${prospectQueries.length === 1 ? "" : "s"}`}
                      </strong>
                    </div>

                    {!prospectQueriesLoading && prospectQueries.length === 0 && (
                      <div className="prospect-empty-history">
                        Este prospecto es anterior al registro detallado de consultas.
                        Las próximas consultas sí aparecerán aquí.
                      </div>
                    )}

                    {prospectQueries.map((q) => (
                      <article className="prospect-query-item" key={q.id}>
                        <div className="prospect-query-top">
                          <div>
                            <strong>
                              {[q.model_year, q.make, q.model, q.vehicle_trim]
                                .filter(Boolean)
                                .join(" ") || "Vehículo consultado"}
                            </strong>
                            <small>{q.vin}</small>
                            {q.import_requested_at && (
                              <span className="import-request-badge">🔥 Solicitó iniciar importación</span>
                            )}
                          </div>
                          <span className={`query-result ${String(q.calculation_status || "").toLowerCase()}`}>
                            {q.calculation_status || "—"}
                          </span>
                        </div>

                        <dl>
                          <div>
                            <dt>Línea SAT</dt>
                            <dd>{q.sat_line || "Pendiente de revisión"}</dd>
                          </div>
                          <div>
                            <dt>Valor SAT</dt>
                            <dd>{q.sat_value_gtq ? moneyGTQ(q.sat_value_gtq) : "—"}</dd>
                          </div>
                          <div>
                            <dt>Tributos</dt>
                            <dd>{q.total_taxes_gtq ? moneyGTQ(q.total_taxes_gtq) : "—"}</dd>
                          </div>
                          <div>
                            <dt>Flete</dt>
                            <dd>{q.freight_usd ? moneyUSD(q.freight_usd) : "—"}</dd>
                          </div>
                        </dl>

                        {q.import_requested_at && (
                          <div className="prospect-import-actions">
                            <div>
                              <small>SOLICITUD DE IMPORTACIÓN</small>
                              <span>{new Date(q.import_requested_at).toLocaleString("es-GT")}</span>
                            </div>
                            <button
                              className="primary-button prospect-generate-quote"
                              onClick={() => generateProspectQuotation(q)}
                              disabled={prospectQuoteLoadingId === q.id || q.calculation_status !== "READY"}
                            >
                              {prospectQuoteLoadingId === q.id ? "Preparando..." : "Generar cotización"} <span>→</span>
                            </button>
                          </div>
                        )}

                        {q.quote_generated_at && (
                          <div className="prospect-quote-generated">
                            <span>✓ Cotización {q.quote_code || ""} generada</span>

                            {q.import_management_id ? (
                              <button
                                className="prospect-management-created"
                                onClick={openImportManagementsView}
                              >
                                Gestión creada · Ver →
                              </button>
                            ) : (
                              <button
                                className="primary-button prospect-convert-management"
                                onClick={() => convertProspectToImportManagement(q)}
                                disabled={convertingQueryId === q.id}
                              >
                                {convertingQueryId === q.id ? "Creando..." : "Convertir en gestión"}
                                <span>→</span>
                              </button>
                            )}
                          </div>
                        )}

                        <small className="prospect-query-date">
                          {q.created_at
                            ? new Date(q.created_at).toLocaleString("es-GT")
                            : ""}
                        </small>
                      </article>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          </section>
        ) : activeView === "settings" ? (
          <section className="settings-module">
            <header className="topbar settings-topbar">
              <div>
                <span className="eyebrow">E&R VEHICLE IMPORT</span>
                <h1>Configuración</h1>
                <p>Parámetros comerciales del portal público y del cotizador.</p>
              </div>
            </header>

            <section className="settings-card">
              <div className="settings-card-head">
                <div className="settings-icon">💬</div>
                <div>
                  <span className="section-label">CONTACTO COMERCIAL</span>
                  <h2>WhatsApp del cotizador</h2>
                  <p>Este número se usará para revisiones adicionales y coordinación de pagos.</p>
                </div>
              </div>

              <form className="settings-form" onSubmit={saveAppSettings}>
                <label>
                  <span>Número de WhatsApp</span>
                  <div className="settings-input-row">
                    <span className="country-prefix">+</span>
                    <input
                      type="tel"
                      value={settingsForm.whatsapp_number}
                      onChange={(e) => setSettingsForm({ whatsapp_number: e.target.value })}
                      placeholder="50255555555"
                      disabled={settingsLoading || settingsSaving}
                    />
                  </div>
                  <small>Incluí código de país. Para Guatemala: 502 + número de 8 dígitos.</small>
                </label>

                <div className="settings-preview">
                  <span>Vista previa</span>
                  <strong>{normalizeWhatsAppNumber(settingsForm.whatsapp_number) ? `+${normalizeWhatsAppNumber(settingsForm.whatsapp_number)}` : "No configurado"}</strong>
                </div>

                {settingsError && <div className="customer-message error">{settingsError}</div>}
                {settingsMessage && <div className="customer-message success">{settingsMessage}</div>}

                <div className="settings-actions">
                  <button type="submit" className="primary-button" disabled={settingsLoading || settingsSaving}>
                    {settingsSaving ? "Guardando..." : "Guardar configuración"} <span>→</span>
                  </button>

                  {normalizeWhatsAppNumber(appSettings.whatsapp_number) && (
                    <a
                      className="secondary-button settings-test-link"
                      href={buildWhatsAppUrl(appSettings.whatsapp_number, "Prueba de configuración de WhatsApp desde E&R Vehicle Import.")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Probar enlace
                    </a>
                  )}
                </div>
              </form>
            </section>
          </section>
        ) : activeView === "quotations" ? (
          <section className="quotations-module">
            <header className="topbar quotations-topbar">
              <div>
                <span className="eyebrow">E&R GLOBAL LOGISTIC</span>
                <h1>Cotizaciones</h1>
                <p>Historial de cotizaciones generadas para clientes.</p>
              </div>
              <button className="primary-button" onClick={openNewQuoteView}>
                ＋ Nueva cotización
              </button>
            </header>

            <section className="quotation-search-card">
              <div>
                <span className="section-label">BUSCADOR</span>
                <h2>Buscar por código de cotización</h2>
                <p>Podés escribir el código completo o una parte, por ejemplo 629619.</p>
              </div>
              <div className="quotation-search-row">
                <input
                  value={quotationSearch}
                  onChange={(e) => setQuotationSearch(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") loadQuotations(); }}
                  placeholder="Ej. ER-20260819-154500-629619"
                />
                <button className="primary-button" onClick={() => loadQuotations()} disabled={quotationLoading}>
                  {quotationLoading ? "Buscando..." : "Buscar"} <span>⌕</span>
                </button>
                {quotationSearch && (
                  <button className="secondary-button" onClick={() => { setQuotationSearch(""); loadQuotations(""); }}>
                    Limpiar
                  </button>
                )}
              </div>
            </section>

            {quotationError && <div className="error-box">{quotationError}</div>}

            <section className="quotation-history-card">
              <div className="quotation-history-head">
                <div>
                  <span className="section-label">HISTORIAL</span>
                  <h2>{quotationLoading ? "Cargando..." : `${quotations.length} cotización${quotations.length === 1 ? "" : "es"}`}</h2>
                </div>
                <button className="secondary-button" onClick={() => loadQuotations()} disabled={quotationLoading}>↻ Actualizar</button>
              </div>

              <div className="quotation-table-wrap">
                <table className="quotation-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Fecha</th>
                      <th>VIN</th>
                      <th>Vehículo</th>
                      <th>Match SAT</th>
                      <th>Total Guatemala</th>
                      <th>Flete</th>
                      <th>Grúa</th>
                      <th>Total USD</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!quotationLoading && quotations.length === 0 && (
                      <tr><td colSpan="10" className="quotation-empty">No hay cotizaciones que coincidan con la búsqueda.</td></tr>
                    )}
                    {quotations.map((q) => (
                      <tr key={q.id || q.quote_code}>
                        <td><strong>{q.quote_code}</strong></td>
                        <td>{q.created_at ? new Date(q.created_at).toLocaleDateString("es-GT") : "—"}</td>
                        <td className="quotation-vin">{q.vin}</td>
                        <td>{[q.model_year, q.make, q.model, q.vehicle_trim].filter(Boolean).join(" ")}</td>
                        <td>
                          <span className={`sat-match-pill ${Number(q.sat_match_score) >= 90 ? "high" : "review"}`}>
                            {q.sat_match_score !== null && q.sat_match_score !== undefined ? `${Number(q.sat_match_score).toFixed(0)}%` : "—"}
                          </span>
                        </td>
                        <td>{moneyGTQ(q.total_guatemala_gtq)}</td>
                        <td>{moneyUSD(q.freight_usd)}</td>
                        <td>{moneyUSD(q.crane_usd)}</td>
                        <td>{q.total_usd !== null && q.total_usd !== undefined ? moneyUSD(q.total_usd) : "GTQ + USD"}</td>
                        <td><button className="table-view-button" onClick={() => setSelectedQuotation(q)}>Ver</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {selectedQuotation && (
              <section className="quotation-detail-card">
                <div className="quotation-detail-head">
                  <div>
                    <span className="section-label">DETALLE DE COTIZACIÓN</span>
                    <h2>{selectedQuotation.quote_code}</h2>
                  </div>
                  <button className="quote-close" onClick={() => setSelectedQuotation(null)}>×</button>
                </div>

                <div className="quotation-detail-grid">
                  <div className="quotation-detail-block">
                    <small>VEHÍCULO</small>
                    <strong>{[selectedQuotation.model_year, selectedQuotation.make, selectedQuotation.model, selectedQuotation.trim].filter(Boolean).join(" ")}</strong>
                    <span>VIN: {selectedQuotation.vin}</span>
                  </div>
                  <div className="quotation-detail-block sat-highlight">
                    <small>MATCH EN TABLA SAT</small>
                    <strong>{selectedQuotation.sat_match_score !== null && selectedQuotation.sat_match_score !== undefined ? `${Number(selectedQuotation.sat_match_score).toFixed(0)}%` : "—"}</strong>
                    <span>{selectedQuotation.sat_line || "Sin línea SAT"}</span>
                    <span>{selectedQuotation.sat_match_status || "—"} · {selectedQuotation.sat_confidence || "—"}</span>
                  </div>
                  <div className="quotation-detail-block">
                    <small>VALOR IMPONIBLE SAT</small>
                    <strong>{moneyGTQ(selectedQuotation.sat_value_gtq)}</strong>
                    <span>IVA: {moneyGTQ(selectedQuotation.iva_gtq)} · IPRIMA: {moneyGTQ(selectedQuotation.iprima_gtq)}</span>
                  </div>
                  <div className="quotation-detail-block">
                    <small>COSTOS GUATEMALA</small>
                    <strong>{moneyGTQ(selectedQuotation.total_guatemala_gtq)}</strong>
                    <span>Docs. {moneyGTQ(selectedQuotation.document_collection_gtq)} · Portuarios {moneyGTQ(selectedQuotation.port_expenses_gtq)} · Honorarios {moneyGTQ(selectedQuotation.professional_fees_gtq)}</span>
                  </div>
                  <div className="quotation-detail-block">
                    <small>TRANSPORTE</small>
                    <strong>{moneyUSD(selectedQuotation.freight_usd)}</strong>
                    <span>{selectedQuotation.freight_category || "—"} · Grúa {moneyUSD(selectedQuotation.crane_usd)}</span>
                  </div>
                  <div className="quotation-detail-block total-highlight">
                    <small>TOTAL GENERAL</small>
                    <strong>{selectedQuotation.total_usd !== null && selectedQuotation.total_usd !== undefined ? moneyUSD(selectedQuotation.total_usd) : "GTQ + USD"}</strong>
                    <span>{moneyGTQ(selectedQuotation.total_guatemala_gtq)} + {moneyUSD(Number(selectedQuotation.freight_usd || 0) + Number(selectedQuotation.crane_usd || 0))}</span>
                  </div>
                </div>
              </section>
            )}
          </section>
        ) : (
          <>
        <header className="topbar">
          <div>
            <span className="eyebrow">
              E&R GLOBAL LOGISTIC
            </span>

            <h1>Nueva Cotización</h1>

            <p>
              Consulta automática de vehículo, SAT,
              impuestos y flete.
            </p>
          </div>

          <div className="engine-status">
            <span className="status-dot"></span>
            Motor VIN conectado
          </div>
        </header>

        <section className="vin-card">
          <div className="vin-card-content">
            <div className="vin-icon">🚘</div>

            <div>
              <span className="section-label">
                CONSULTA INTELIGENTE
              </span>

              <h2>¿Qué vehículo vamos a importar?</h2>

              <p>
                Ingresa el VIN de 17 caracteres y E&R
                analizará automáticamente el vehículo.
              </p>
            </div>
          </div>

          <div className="vin-search">
            <div className="vin-input-wrapper">
              <label>VIN DEL VEHÍCULO</label>

              <input
                value={vin}
                maxLength={17}
                disabled={loading || reviewLoading}
                onKeyDown={handleKeyDown}
                onChange={(e) =>
                  setVin(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-HJ-NPR-Z0-9]/g, "")
                  )
                }
                placeholder="Ej. 2T3DF4DV5AW032159"
              />

              <span className="vin-count">
                {vin.length}/17
              </span>
            </div>

            <button
              className="search-button"
              disabled={
                vin.length !== 17 ||
                loading ||
                reviewLoading
              }
              onClick={consultarVehiculo}
            >
              {loading
                ? "Analizando..."
                : "Consultar vehículo"}

              <span>{loading ? "⌛" : "→"}</span>
            </button>
          </div>

          <div className="process-line">
            <span>VIN / NHTSA</span>
            <i></i>
            <span>SAT Guatemala</span>
            <i></i>
            <span>Impuestos</span>
            <i></i>
            <span>Dimensiones</span>
            <i></i>
            <span>Flete</span>
          </div>
        </section>

        {error && (
          <section className="result-message error-message">
            <strong>⚠ No pudimos completar la operación</strong>
            <p>{error}</p>
          </section>
        )}

        {!result && !error && (
          <section className="empty-state">
            <div className="radar">
              <span>{loading ? "🔎" : "🚗"}</span>
            </div>

            <h2>
              {loading
                ? "Analizando vehículo..."
                : "Listo para analizar un vehículo"}
            </h2>

            <p>
              {loading
                ? "Estamos consultando VIN, SAT, impuestos, dimensiones y flete."
                : "Al consultar un VIN, aquí aparecerá toda la información necesaria para preparar la importación."}
            </p>

            <div className="feature-grid">
              <div>
                <span>🚙</span>
                <strong>Vehículo</strong>
                <small>Marca, modelo y versión</small>
              </div>

              <div>
                <span>🇬🇹</span>
                <strong>Valor SAT</strong>
                <small>Matching inteligente</small>
              </div>

              <div>
                <span>🧾</span>
                <strong>Impuestos</strong>
                <small>IVA + IPRIMA + placas</small>
              </div>

              <div>
                <span>🚢</span>
                <strong>Flete</strong>
                <small>Según dimensiones reales</small>
              </div>
            </div>
          </section>
        )}

        {result && (
          <section className="results-area">
            <div
              className={`quote-status ${
                result.calculation_status === "READY"
                  ? "ready"
                  : "review"
              }`}
            >
              <div>
                <span className="quote-status-label">
                  RESULTADO DEL ANÁLISIS
                </span>

                <h2>
                  {result.calculation_status === "READY"
                    ? "✓ Cotización lista"
                    : "⚠ Requiere revisión"}
                </h2>
              </div>

              <strong>
                {result.calculation_status}
              </strong>
            </div>

            {/* ==========================================
                REVISIÓN SAT
            ========================================== */}

            {needsSatSelectableReview && (
              <section className="smart-review">
                <div className="smart-review-header">
                  <div className="review-icon-large">
                    🇬🇹
                  </div>

                  <div>
                    <span className="review-eyebrow">
                      REVISIÓN INTELIGENTE · SAT
                    </span>

                    <h2>
                      Confirmá la línea correcta del vehículo
                    </h2>

                    <p>
                      Encontramos más de una posibilidad.
                      Seleccioná la que corresponda al vehículo
                      que estás cotizando.
                    </p>
                  </div>
                </div>

                <div className="review-options">
                  {satReviewOptions.map((option) => {
                    const id =
                      option.sat_vehicle_id;

                    const selected =
                      Number(selectedSatId) === Number(id);

                    return (
                      <button
                        type="button"
                        key={id}
                        className={`review-option ${
                          selected ? "selected" : ""
                        }`}
                        onClick={() =>
                          setSelectedSatId(id)
                        }
                      >
                        <div className="review-radio">
                          {selected ? "✓" : ""}
                        </div>

                        <div className="review-option-main">
                          <strong>
                            {option.line ||
                              "Línea no especificada"}
                          </strong>

                          <span>
                            {[
                              option.vehicle_type,
                              option.engine_cc
                                ? `${option.engine_cc} cc`
                                : null,
                              option.fuel_type,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </span>
                        </div>

                        <div className="review-option-value">
                          <strong>
                            {moneyGTQ(
                              option.taxable_value
                            )}
                          </strong>

                          {option.match_score !==
                            null &&
                            option.match_score !==
                              undefined && (
                              <span>
                                Coincidencia{" "}
                                {Number(
                                  option.match_score
                                ).toFixed(0)}
                                %
                              </span>
                            )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="review-actions">
                  <div>
                    <strong>
                      🧠 Esta decisión quedará aprendida
                    </strong>

                    <span>
                      La próxima consulta de este VIN utilizará
                      la selección confirmada.
                    </span>
                  </div>

                  <button
                    className="confirm-review-button"
                    disabled={
                      !selectedSatId ||
                      reviewLoading
                    }
                    onClick={confirmarSat}
                  >
                    {reviewLoading
                      ? "Guardando..."
                      : "Confirmar línea SAT"}
                    <span>→</span>
                  </button>
                </div>
              </section>
            )}

            {needsSatExceptionalReview && (
              <section className="smart-review exceptional-review">
                <div className="smart-review-header">
                  <div className="review-icon-large">🛡️</div>
                  <div>
                    <span className="review-eyebrow">REVISIÓN SAT · SIN COINCIDENCIA COMPATIBLE</span>
                    <h2>No encontramos una línea SAT segura para este vehículo</h2>
                    <p>
                      El motor descartó los resultados encontrados porque contradicen datos objetivos del VIN.
                      Verificá el valor aplicable en SAT antes de registrar una resolución excepcional.
                    </p>
                  </div>
                </div>

                <div className="detected-vehicle-strip">
                  <div><span>Vehículo</span><strong>{vehicle?.model_year} {vehicle?.make} {vehicle?.model}</strong></div>
                  <div><span>Motor</span><strong>{vehicle?.engine_cc ? `${vehicle.engine_cc} cc` : "—"}</strong></div>
                  <div><span>Cilindros</span><strong>{vehicle?.cylinders ?? "—"}</strong></div>
                  <div><span>Puertas</span><strong>{vehicle?.doors ?? "—"}</strong></div>
                </div>

                {blockedSatOptions.length > 0 && (
                  <div className="blocked-results">
                    <div className="blocked-results-title">
                      <strong>Candidatos descartados</strong>
                      <span>Se muestran únicamente como referencia; no pueden aprobarse desde aquí.</span>
                    </div>

                    {blockedSatOptions.map((option) => (
                      <div className="blocked-option" key={`${option.sat_vehicle_id}-${option.model_year ?? "rest"}`}>
                        <div>
                          <strong>{option.line}</strong>
                          <span>{option.model_year || "Resto de años"} · {option.engine_cc || "—"} cc · {option.cylinders || "—"} cil.</span>
                        </div>
                        <div className="blocked-warning-list">
                          {(option.warnings || []).map((warning, index) => (
                            <span key={`${warning}-${index}`}>✕ {warning}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="catalog-resolution-zone">
                  {!showCatalogSearch ? (
                    <div className="catalog-entry-action">
                      <div>
                        <strong>🔎 Primero agotemos el catálogo SAT</strong>
                        <span>Buscá otra línea del mismo fabricante antes de registrar una excepción.</span>
                      </div>
                      <button className="catalog-open-button" type="button" onClick={abrirBuscadorSat}>
                        Buscar en catálogo SAT <span>→</span>
                      </button>
                    </div>
                  ) : (
                    <div className="catalog-search-box">
                      <div className="catalog-search-heading">
                        <div>
                          <span>BÚSQUEDA MANUAL SEGURA</span>
                          <h3>Catálogo SAT</h3>
                          <p>El sistema bloqueará automáticamente líneas que contradigan año, motor, cilindros o combustible.</p>
                        </div>
                        <button
                          type="button"
                          className="close-form-button"
                          onClick={() => {
                            setShowCatalogSearch(false);
                            setCatalogResults([]);
                            setCatalogHasSearched(false);
                            setSelectedSatId(null);
                          }}
                        >×</button>
                      </div>

                      <div className="catalog-search-row">
                        <div className="catalog-search-input">
                          <label>Buscar línea SAT</label>
                          <input
                            value={catalogQuery}
                            onChange={(e) => setCatalogQuery(e.target.value.toUpperCase())}
                            onKeyDown={handleCatalogKeyDown}
                            placeholder="Ej. BRONCO, RAV4, SILVERADO..."
                          />
                        </div>
                        <button
                          type="button"
                          className="catalog-search-button"
                          onClick={() => buscarCatalogoSat()}
                          disabled={catalogLoading || catalogQuery.trim().length < 2}
                        >
                          {catalogLoading ? "Buscando..." : "Buscar"} <span>⌕</span>
                        </button>
                      </div>

                      {catalogHasSearched && (
                        <div className="catalog-results">
                          <div className="catalog-results-summary">
                            <strong>{catalogResults.length} resultado{catalogResults.length === 1 ? "" : "s"}</strong>
                            <span>Los resultados incompatibles aparecen bloqueados.</span>
                          </div>

                          {catalogResults.length === 0 ? (
                            <div className="catalog-empty">
                              <strong>No encontramos líneas con esa búsqueda.</strong>
                              <span>Probá otra palabra o continuá con una resolución excepcional si ya verificaste el dato en SAT.</span>
                            </div>
                          ) : (
                            <div className="catalog-result-list">
                              {catalogResults.map((option) => {
                                const selected = Number(selectedSatId) === Number(option.id);
                                const blocked = option.selectable === false || option.has_conflict;

                                return (
                                  <button
                                    type="button"
                                    key={option.id}
                                    className={`catalog-result-item ${selected ? "selected" : ""} ${blocked ? "blocked" : ""}`}
                                    disabled={blocked}
                                    onClick={() => setSelectedSatId(option.id)}
                                  >
                                    <div className="catalog-result-radio">{selected ? "✓" : blocked ? "×" : ""}</div>
                                    <div className="catalog-result-main">
                                      <div className="catalog-result-title">
                                        <strong>{option.line}</strong>
                                        <span className={blocked ? "catalog-status blocked" : "catalog-status safe"}>
                                          {blocked ? "No compatible" : "Compatible"}
                                        </span>
                                      </div>
                                      <span>
                                        {option.model_year || "Resto de años"} · {option.vehicle_type || "—"} · {option.engine_cc || "—"} cc · {option.cylinders || "—"} cil. · {option.doors || "—"} puertas
                                      </span>
                                      {(option.warnings || []).length > 0 && (
                                        <div className="catalog-warning-list">
                                          {(option.warnings || []).map((warning, index) => (
                                            <span key={`${option.id}-${index}`}>⚠ {warning}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="catalog-result-value">
                                      <strong>{moneyGTQ(option.taxable_value)}</strong>
                                      <span>Score {Number(option.match_score || 0).toFixed(0)}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {catalogResults.some((option) => option.selectable !== false && !option.has_conflict) && (
                            <div className="catalog-confirm-row">
                              <div>
                                <strong>Seleccioná únicamente la línea que hayas confirmado.</strong>
                                <span>El backend volverá a validar la compatibilidad antes de guardar.</span>
                              </div>
                              <button
                                type="button"
                                className="confirm-review-button"
                                disabled={!selectedSatId || reviewLoading}
                                onClick={confirmarSat}
                              >
                                {reviewLoading ? "Guardando..." : "Confirmar línea SAT"}<span>→</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!showExceptionalForm && catalogHasSearched ? (
                  <div className="exceptional-entry-action">
                    <div>
                      <strong>¿Ninguna línea del catálogo corresponde?</strong>
                      <span>Si ya verificaste el dato directamente en SAT, podés registrar una resolución excepcional con trazabilidad.</span>
                    </div>
                    <button className="exceptional-open-button" onClick={() => setShowExceptionalForm(true)}>
                      Registrar valor verificado externamente <span>→</span>
                    </button>
                  </div>
                ) : showExceptionalForm ? (
                  <div className="exceptional-form">
                    <div className="exceptional-form-title">
                      <div>
                        <span>CONFIRMACIÓN EXTERNA</span>
                        <h3>Datos SAT verificados</h3>
                      </div>
                      <button className="close-form-button" type="button" onClick={() => setShowExceptionalForm(false)}>×</button>
                    </div>

                    <div className="exceptional-grid">
                      <label>
                        <span>Línea / referencia SAT *</span>
                        <input
                          value={exceptionalForm.manual_line}
                          onChange={(e) => setExceptionalForm((prev) => ({ ...prev, manual_line: e.target.value }))}
                          placeholder="Ej. BRONCO ..."
                        />
                      </label>

                      <label>
                        <span>Tipo de vehículo SAT *</span>
                        <input
                          value={exceptionalForm.manual_vehicle_type}
                          onChange={(e) => setExceptionalForm((prev) => ({ ...prev, manual_vehicle_type: e.target.value }))}
                          placeholder="Ej. CAMIONETA / JEEP"
                        />
                      </label>

                      <label>
                        <span>Valor imponible SAT (Q) *</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={exceptionalForm.manual_taxable_value}
                          onChange={(e) => setExceptionalForm((prev) => ({ ...prev, manual_taxable_value: e.target.value }))}
                          placeholder="0.00"
                        />
                      </label>

                      <label>
                        <span>Tasa IPRIMA (%) *</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={exceptionalForm.manual_iprima_percent}
                          onChange={(e) => setExceptionalForm((prev) => ({ ...prev, manual_iprima_percent: e.target.value }))}
                          placeholder="Ej. 15"
                        />
                      </label>

                      <label className="full-field">
                        <span>Fuente de verificación *</span>
                        <input
                          value={exceptionalForm.verification_source}
                          onChange={(e) => setExceptionalForm((prev) => ({ ...prev, verification_source: e.target.value }))}
                          placeholder="Ej. SAT Guatemala - Tabla de valores 2026"
                        />
                      </label>

                      <label className="full-field">
                        <span>Observación</span>
                        <textarea
                          rows="3"
                          value={exceptionalForm.notes}
                          onChange={(e) => setExceptionalForm((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Detalle de cómo se verificó la clasificación o el valor..."
                        />
                      </label>
                    </div>

                    <div className="exceptional-tax-preview">
                      <div><span>IVA 12%</span><strong>{moneyGTQ(Number(exceptionalForm.manual_taxable_value || 0) * 0.12)}</strong></div>
                      <div><span>IPRIMA</span><strong>{moneyGTQ(Number(exceptionalForm.manual_taxable_value || 0) * (percentToDecimal(exceptionalForm.manual_iprima_percent) || 0))}</strong></div>
                      <div><span>Placas</span><strong>{moneyGTQ(75)}</strong></div>
                      <div className="preview-total"><span>Total estimado</span><strong>{moneyGTQ(
                        Number(exceptionalForm.manual_taxable_value || 0) * 0.12 +
                        Number(exceptionalForm.manual_taxable_value || 0) * (percentToDecimal(exceptionalForm.manual_iprima_percent) || 0) +
                        75
                      )}</strong></div>
                    </div>

                    <label className="verification-check">
                      <input
                        type="checkbox"
                        checked={exceptionalConfirmed}
                        onChange={(e) => setExceptionalConfirmed(e.target.checked)}
                      />
                      <span>Confirmo que verifiqué externamente esta clasificación, valor imponible y tasa IPRIMA.</span>
                    </label>

                    <div className="exceptional-form-actions">
                      <button type="button" className="secondary-review-button" onClick={() => setShowExceptionalForm(false)} disabled={reviewLoading}>Cancelar</button>
                      <button
                        type="button"
                        className="confirm-review-button danger-safe"
                        onClick={confirmarSatExcepcional}
                        disabled={reviewLoading || !exceptionalConfirmed}
                      >
                        {reviewLoading ? "Guardando..." : "Guardar y calcular impuestos"}<span>→</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            )}

            {/* ==========================================
                REVISIÓN DIMENSIONES
            ========================================== */}

            {needsDimensionReview && (
              <section className="smart-review dimension-review">
                <div className="smart-review-header">
                  <div className="review-icon-large">
                    📏
                  </div>

                  <div>
                    <span className="review-eyebrow">
                      REVISIÓN INTELIGENTE · DIMENSIONES
                    </span>

                    <h2>
                      ¿Qué configuración tiene este vehículo?
                    </h2>

                    <p>
                      Las variantes encontradas pueden cambiar
                      la categoría y el precio del flete.
                    </p>
                  </div>
                </div>

                <div className="review-options">
                  {dimensionReviewOptions.map(
                    (option, index) => {
                      const selected =
                        selectedDimension === option;

                      return (
                        <button
                          type="button"
                          key={`${option.dimension_model}-${index}`}
                          className={`review-option ${
                            selected ? "selected" : ""
                          }`}
                          onClick={() =>
                            setSelectedDimension(option)
                          }
                        >
                          <div className="review-radio">
                            {selected ? "✓" : ""}
                          </div>

                          <div className="review-option-main">
                            <strong>
                              {option.dimension_model}
                            </strong>

                            <span>
                              {option.length_inches
                                ? `${Number(
                                    option.length_inches
                                  ).toFixed(2)}" de largo`
                                : "Largo no disponible"}
                            </span>
                          </div>

                          <div className="review-option-value">
                            <strong>
                              {moneyUSD(
                                option.freight_usd
                              )}
                            </strong>

                            <span>
                              {option.freight_category ||
                                "Categoría pendiente"}
                            </span>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>

                <div className="review-actions">
                  <div>
                    <strong>
                      📦 La configuración será guardada
                    </strong>

                    <span>
                      El motor recordará esta selección para
                      futuras consultas del VIN.
                    </span>
                  </div>

                  <button
                    className="confirm-review-button"
                    disabled={
                      !selectedDimension ||
                      reviewLoading
                    }
                    onClick={confirmarDimension}
                  >
                    {reviewLoading
                      ? "Guardando..."
                      : "Confirmar configuración"}
                    <span>→</span>
                  </button>
                </div>
              </section>
            )}

            {needsMissingDimensionReview && (
              <section className="smart-review dimension-review dimension-missing-review">
                <div className="smart-review-header">
                  <div className="review-icon-large">📏</div>
                  <div>
                    <span className="review-eyebrow">REVISIÓN INTELIGENTE · DIMENSIONES</span>
                    <h2>No encontramos dimensiones automáticas</h2>
                    <p>
                      El vehículo está identificado, pero NHTSA y el catálogo verificado no tienen una ficha reutilizable todavía.
                    </p>
                  </div>
                </div>

                <div className="dimension-vehicle-summary">
                  <strong>{vehicle?.model_year} {vehicle?.make} {vehicle?.model} {vehicle?.trim || ""}</strong>
                  <span>
                    {[
                      vehicle?.engine_liters ? `${vehicle.engine_liters}L` : null,
                      humanDrive(vehicle?.drive_type),
                      vehicle?.doors ? `${vehicle.doors} puertas` : null,
                    ].filter(Boolean).join(" • ")}
                  </span>
                </div>

                {dimensionSearchAttempts.length > 0 && (
                  <div className="dimension-attempts">
                    <span className="dimension-subtitle">BÚSQUEDAS REALIZADAS</span>
                    {dimensionSearchAttempts.map((attempt, index) => (
                      <div className="dimension-attempt" key={`${attempt.source || "NHTSA"}-${attempt.model_query}-${index}`}>
                        <div>
                          <strong>{attempt.source === "VERIFIED_CATALOG" ? "Catálogo verificado" : "NHTSA CVS"}</strong>
                          <span>{attempt.model_query || vehicle?.model}</span>
                        </div>
                        <span className={attempt.result_count > 0 ? "attempt-ok" : "attempt-empty"}>
                          {attempt.result_count > 0 ? `${attempt.result_count} resultado(s)` : "Sin resultados"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="dimension-manual-form">
                  <div className="dimension-form-heading">
                    <div>
                      <span className="dimension-subtitle">DATOS VERIFICADOS</span>
                      <h3>Registrar dimensiones para calcular el flete</h3>
                    </div>
                    <span className="dimension-required-note">* requerido</span>
                  </div>

                  <div className="dimension-fields-grid">
                    <label>
                      <span>Largo * <small>pulgadas</small></span>
                      <input type="number" step="0.01" value={dimensionForm.length_inches} onChange={(e) => setDimensionForm((prev) => ({ ...prev, length_inches: e.target.value }))} placeholder="Ej. 180.10" />
                    </label>
                    <label>
                      <span>Ancho <small>pulgadas</small></span>
                      <input type="number" step="0.01" value={dimensionForm.width_inches} onChange={(e) => setDimensionForm((prev) => ({ ...prev, width_inches: e.target.value }))} placeholder="Opcional" />
                    </label>
                    <label>
                      <span>Alto <small>pulgadas</small></span>
                      <input type="number" step="0.01" value={dimensionForm.height_inches} onChange={(e) => setDimensionForm((prev) => ({ ...prev, height_inches: e.target.value }))} placeholder="Opcional" />
                    </label>
                    <label>
                      <span>Distancia entre ejes <small>pulgadas</small></span>
                      <input type="number" step="0.01" value={dimensionForm.wheelbase_inches} onChange={(e) => setDimensionForm((prev) => ({ ...prev, wheelbase_inches: e.target.value }))} placeholder="Opcional" />
                    </label>
                    <label>
                      <span>Peso <small>lb</small></span>
                      <input type="number" step="0.1" value={dimensionForm.curb_weight_lb} onChange={(e) => setDimensionForm((prev) => ({ ...prev, curb_weight_lb: e.target.value }))} placeholder="Opcional" />
                    </label>
                    <label>
                      <span>Fuente *</span>
                      <input value={dimensionForm.source} onChange={(e) => setDimensionForm((prev) => ({ ...prev, source: e.target.value }))} placeholder="Ej. ficha técnica del fabricante" />
                    </label>
                    <label className="dimension-wide-field">
                      <span>Referencia / URL</span>
                      <input value={dimensionForm.source_url} onChange={(e) => setDimensionForm((prev) => ({ ...prev, source_url: e.target.value }))} placeholder="Enlace o referencia del documento" />
                    </label>
                    <label className="dimension-wide-field">
                      <span>Observaciones</span>
                      <textarea rows="3" value={dimensionForm.source_notes} onChange={(e) => setDimensionForm((prev) => ({ ...prev, source_notes: e.target.value }))} placeholder="Detalle de la verificación realizada..." />
                    </label>
                  </div>

                  <div className="dimension-scope-box">
                    <span className="dimension-subtitle">APLICAR ESTAS DIMENSIONES A</span>
                    <label className="scope-option">
                      <input type="radio" name="dimension-scope" value="EXACT" checked={dimensionForm.apply_scope === "EXACT"} onChange={() => setDimensionForm((prev) => ({ ...prev, apply_scope: "EXACT" }))} />
                      <div><strong>Esta configuración exacta</strong><span>Conserva trim, motor, tracción y puertas como referencia.</span></div>
                    </label>
                    <label className="scope-option">
                      <input type="radio" name="dimension-scope" value="MODEL_EQUIVALENT" checked={dimensionForm.apply_scope === "MODEL_EQUIVALENT"} onChange={() => setDimensionForm((prev) => ({ ...prev, apply_scope: "MODEL_EQUIVALENT" }))} />
                      <div><strong>Versiones equivalentes del modelo</strong><span>Comparte la ficha entre trims, manteniendo año, motor, tracción y puertas para evitar coincidencias demasiado amplias.</span></div>
                    </label>
                  </div>

                  <label className="verification-check dimension-verification-check">
                    <input type="checkbox" checked={dimensionConfirmed} onChange={(e) => setDimensionConfirmed(e.target.checked)} />
                    <span>Confirmo que verifiqué estas dimensiones en una fuente confiable y que corresponden a este vehículo.</span>
                  </label>

                  <div className="review-actions dimension-save-actions">
                    <div>
                      <strong>🧠 El sistema aprenderá esta ficha</strong>
                      <span>Al guardar, se volverá a consultar el VIN y el flete se calculará con el catálogo verificado.</span>
                    </div>
                    <button
                      type="button"
                      className="confirm-review-button"
                      onClick={guardarDimensionesVerificadas}
                      disabled={reviewLoading || !dimensionConfirmed || !dimensionForm.length_inches || !dimensionForm.source.trim()}
                    >
                      {reviewLoading ? "Guardando..." : "Guardar y calcular flete"}<span>→</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {isExceptionalResolved && (
              <div className="exceptional-resolved-banner">
                <span>🛡️</span>

                <div>
                  <strong>Resolución SAT excepcional aplicada</strong>
                  <p>
                    Este valor fue confirmado externamente y quedó
                    registrado con trazabilidad para este VIN.
                  </p>
                </div>
              </div>
            )}

            <div className="result-grid">
              <article className="result-card vehicle-result">
                <div className="result-card-header">
                  <span className="result-icon">🚙</span>

                  <div>
                    <small>
                      TIPO SAT · {taxes?.vehicle_type || sat?.selected_match?.vehicle_type || "NO ESPECIFICADO"}
                    </small>
                    <h3>
                      {vehicle?.model_year} {vehicle?.make}
                    </h3>
                  </div>
                </div>

                <h2 className="vehicle-model">
                  {vehicle?.model}
                </h2>

                <p className="vehicle-version">
                  {getVehicleDisplayVersion(vehicle, sat)}
                </p>

                <div className="detail-list">
                  <div>
                    <span>VIN</span>
                    <strong>{vehicle?.vin}</strong>
                  </div>

                  <div>
                    <span>Motor</span>
                    <strong>
                      {vehicle?.engine_liters
                        ? `${vehicle.engine_liters}L`
                        : "—"}

                      {vehicle?.cylinders
                        ? ` • ${vehicle.cylinders} cilindros`
                        : ""}
                    </strong>
                  </div>

                  <div>
                    <span>Combustible</span>
                    <strong>
                      {humanFuel(vehicle?.fuel_type)}
                    </strong>
                  </div>

                  <div>
                    <span>Tracción</span>
                    <strong>
                      {humanDrive(vehicle?.drive_type)}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span className="result-icon">🇬🇹</span>

                  <div>
                    <small>SAT GUATEMALA</small>
                    <h3>Valor imponible</h3>
                  </div>
                </div>

                <div className="big-money">
                  {moneyGTQ(summary?.sat_value_gtq)}
                </div>

                <div className="detail-list">
                  <div>
                    <span>Línea SAT</span>
                    <strong>
                      {summary?.sat_line || "Pendiente"}
                    </strong>
                  </div>

                  <div>
                    <span>Matching</span>
                    <strong>
                      {humanSatStatus(
                        summary?.sat_match_status
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Confianza</span>
                    <strong>
                      {humanConfidence(
                        summary?.sat_confidence
                      )}
                    </strong>
                  </div>
                </div>

                {sat?.requires_review && (
                  <div className="review-badge">
                    ⚠ Requiere confirmación
                  </div>
                )}

                {isExceptionalResolved && (
                  <div className="exceptional-badge">
                    🛡️ Verificación externa
                  </div>
                )}
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span className="result-icon">🧾</span>

                  <div>
                    <small>IMPUESTOS</small>
                    <h3>Tributos estimados</h3>
                  </div>
                </div>

                <div className="big-money">
                  {moneyGTQ(
                    taxes?.total_taxes_gtq
                  )}
                </div>

                <div className="detail-list">
                  <div>
                    <span>
                      IVA <small className="public-tax-rate">({displayTaxRate(taxes?.iva_rate, 0.12)})</small>
                    </span>
                    <strong>
                      {moneyGTQ(taxes?.iva_gtq)}
                    </strong>
                  </div>

                  <div>
                    <span>
                      IPRIMA <small className="public-tax-rate">({displayTaxRate(taxes?.iprima_rate)})</small>
                    </span>
                    <strong>
                      {moneyGTQ(taxes?.iprima_gtq)}
                    </strong>
                  </div>

                  <div>
                    <span>Placas</span>
                    <strong>
                      {moneyGTQ(taxes?.plates_gtq)}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="result-card freight-result">
                <div className="result-card-header">
                  <span className="result-icon">🚢</span>

                  <div>
                    <small>FLETE MARÍTIMO</small>
                    <h3>Tarifa calculada</h3>
                  </div>
                </div>

                <div className="big-money usd">
                  {moneyUSD(freight?.price_usd)}
                </div>

                <div className="detail-list">
                  <div>
                    <span>Categoría</span>
                    <strong>
                      {freight?.category || "Pendiente"}
                    </strong>
                  </div>

                  <div>
                    <span>Largo</span>
                    <strong>
                      {dimensions?.length_inches
                        ? `${Number(
                            dimensions.length_inches
                          ).toFixed(2)}"`
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Configuración</span>
                    <strong>
                      {dimensions?.dimension_model || "—"}
                    </strong>
                  </div>
                </div>

                {result.freight_requires_review && (
                  <div className="review-badge">
                    ⚠ Requiere confirmación
                  </div>
                )}
              </article>
            </div>

            {canGenerateQuote && (
              <div className="quote-action-bar">
                <div>
                  <small>COTIZACIÓN COMERCIAL</small>
                  <strong>Resultado listo para compartir con el cliente</strong>
                  <span>Agregá los costos variables y generá la imagen final.</span>
                </div>
                <button className="primary-button quote-open-button" onClick={openQuoteModal}>
                  Generar cotización <span>→</span>
                </button>
              </div>
            )}
          </section>
        )}

        {showQuoteModal && result && (
          <div className="quote-modal-backdrop" onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeQuoteModal();
          }}>
            <div className="quote-modal">
              <div className="quote-modal-head">
                <div>
                  <small>COTIZACIÓN PARA CLIENTE</small>
                  <h2>Completar costos variables</h2>
                  <p>El vehículo, impuestos y flete ya vienen del cálculo realizado.</p>
                  {quoteRecipient && (
                    <div className="quote-recipient-pill">
                      <span>CLIENTE</span>
                      <strong>{quoteRecipient.name || "Prospecto"}</strong>
                      <small>{quoteRecipient.phone || "Sin celular"}</small>
                    </div>
                  )}
                </div>
                <div className="quote-modal-head-actions">
                  <button
                    className="primary-button quote-download-top"
                    onClick={downloadQuoteImage}
                    disabled={quoteGenerating}
                  >
                    {quoteGenerating ? "Generando..." : "Descargar PNG"} <span>↓</span>
                  </button>
                  <button className="quote-close" onClick={closeQuoteModal} aria-label="Cerrar">×</button>
                </div>
              </div>

              <div className="quote-mode-card">
                <div>
                  <small>TIPO DE COTIZACIÓN</small>
                  <strong>
                    {quoteForm.include_freight
                      ? "Importación completa"
                      : "Solo gestión aduanal"}
                  </strong>
                  <span>
                    {quoteForm.include_freight
                      ? "Incluye transporte marítimo dentro del total."
                      : "El vehículo fue embarcado por otra empresa; E&R cotiza únicamente la gestión en Guatemala."}
                  </span>
                </div>

                <label className={`quote-freight-toggle ${!quoteFreightAvailable ? "unavailable" : ""}`}>
                  <div>
                    <b>Incluir flete marítimo</b>
                    {!quoteFreightAvailable && (
                      <small>Flete no disponible para este VIN</small>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(quoteForm.include_freight)}
                    disabled={!quoteFreightAvailable}
                    onChange={(e) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        include_freight: e.target.checked,
                        crane_usd: e.target.checked ? prev.crane_usd : "",
                      }))
                    }
                  />
                  <span className="quote-toggle-track">
                    <span className="quote-toggle-thumb"></span>
                  </span>
                </label>
              </div>

              <div className="quote-cost-form">
                <label>
                  <span>Recolección de documentos (Q)</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={quoteForm.document_collection_gtq}
                    onChange={(e) => setQuoteForm((p) => ({ ...p, document_collection_gtq: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Gastos portuarios (Q)</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={quoteForm.port_expenses_gtq}
                    onChange={(e) => setQuoteForm((p) => ({ ...p, port_expenses_gtq: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Honorarios (Q)</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={quoteForm.professional_fees_gtq}
                    onChange={(e) => setQuoteForm((p) => ({ ...p, professional_fees_gtq: e.target.value }))}
                  />
                </label>
                <label>
                  <span>Grúa (USD)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={
                      quoteForm.include_freight
                        ? "0.00"
                        : "No aplica sin flete"
                    }
                    value={quoteForm.crane_usd}
                    disabled={!quoteForm.include_freight}
                    onChange={(e) =>
                      setQuoteForm((p) => ({
                        ...p,
                        crane_usd: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="quote-live-totals">
                <div><span>Tributos calculados</span><strong>{moneyGTQ(quoteBaseTaxes)}</strong></div>
                <div><span>Costos adicionales</span><strong>{moneyGTQ(quoteDocumentCollection + quotePortExpenses + quoteProfessionalFees)}</strong></div>
                <div className="quote-total-gtq"><span>Total costos Guatemala</span><strong>{moneyGTQ(quoteGuatemalaTotal)}</strong></div>
                <div>
                  <span>Flete marítimo</span>
                  <strong>
                    {quoteForm.include_freight
                      ? moneyUSD(quoteFreightUsd)
                      : "NO INCLUIDO"}
                  </strong>
                </div>
                <div><span>Grúa</span><strong>{moneyUSD(quoteCraneUsd)}</strong></div>
                {quoteGrandTotalUsd !== null && (
                  <div className="quote-total-usd"><span>Total general USD</span><strong>{moneyUSD(quoteGrandTotalUsd)}</strong></div>
                )}
              </div>

              <div className="quote-preview-wrap">
                <div className="quote-preview" ref={quoteRef}>
                  <header className="quote-sheet-header">
                    <div className="quote-sheet-brand">
                      <div className="quote-sheet-logo">E&amp;R</div>
                      <div><strong>E&amp;R VEHICLE IMPORT</strong><span>GLOBAL LOGISTIC</span></div>
                    </div>
                    <div className="quote-sheet-title">
                      <h2>
                        {quoteForm.include_freight
                          ? "COTIZACIÓN DE IMPORTACIÓN"
                          : "COTIZACIÓN DE GESTIÓN ADUANAL"}
                      </h2>
                      <span>
                        {quoteForm.include_freight
                          ? "VEHÍCULOS · GUATEMALA"
                          : "SERVICIOS ADUANALES · GUATEMALA"}
                      </span>
                    </div>
                    <div className="quote-sheet-meta">
                      <span>Fecha</span><strong>{new Date().toLocaleDateString("es-GT")}</strong>
                      <span>Cotización #</span><strong>{quoteNumber()}</strong>
                    </div>
                  </header>

                  <section className="quote-vehicle-strip">
                    <div>
                      <small>
                        TIPO SAT · {taxes?.vehicle_type || sat?.selected_match?.vehicle_type || "NO ESPECIFICADO"}
                      </small>
                      <h3>{vehicle?.year || vehicle?.model_year} {vehicle?.make}</h3>
                      <strong>{vehicle?.model} {vehicle?.trim || ""}</strong>
                    </div>
                    <div className="quote-vehicle-data">
                      <span>VIN<strong>{vehicle?.vin}</strong></span>
                      <span>Motor<strong>{vehicle?.engine_liters ? `${vehicle.engine_liters}L` : "—"} · {vehicle?.cylinders || "—"} cilindros</strong></span>
                      <span>Tracción<strong>{humanDrive(vehicle?.drive_type)}</strong></span>
                    </div>
                  </section>

                  <section className="quote-sheet-grid">
                    <div className="quote-sheet-card">
                      <small>COSTOS EN GUATEMALA</small>
                      <div>
                        <span>IVA ({displayTaxRate(taxes?.iva_rate, 0.12)})</span>
                        <strong>{moneyGTQ(taxes?.iva_gtq || 0)}</strong>
                      </div>
                      <div>
                        <span>IPRIMA ({displayTaxRate(taxes?.iprima_rate)})</span>
                        <strong>{moneyGTQ(taxes?.iprima_gtq || 0)}</strong>
                      </div>
                      <div><span>Placas</span><strong>{moneyGTQ(taxes?.plates_gtq || 0)}</strong></div>
                      <div><span>Recolección de documentos</span><strong>{moneyGTQ(quoteDocumentCollection)}</strong></div>
                      <div><span>Gastos portuarios</span><strong>{moneyGTQ(quotePortExpenses)}</strong></div>
                      <div><span>Honorarios</span><strong>{moneyGTQ(quoteProfessionalFees)}</strong></div>
                      <div className="quote-sheet-subtotal"><span>TOTAL GUATEMALA</span><strong>{moneyGTQ(quoteGuatemalaTotal)}</strong></div>
                    </div>

                    {quoteForm.include_freight ? (
                      <div className="quote-sheet-card quote-freight-card">
                        <small>TRANSPORTE MARÍTIMO</small>
                        <div><span>Categoría</span><strong>{freight?.category || "—"}</strong></div>
                        <div><span>Largo</span><strong>{dimensions?.length_inches ? `${Number(dimensions.length_inches).toFixed(2)}"` : "—"}</strong></div>
                        <div><span>Configuración</span><strong>{dimensions?.dimension_model || vehicle?.model || "—"}</strong></div>
                        {quoteForm.include_freight && (
                      <div>
                        <span>Grúa</span>
                        <strong>{moneyUSD(quoteCraneUsd)}</strong>
                      </div>
                    )}
                        <div className="quote-freight-price"><span>FLETE MARÍTIMO</span><strong>{moneyUSD(quoteFreightUsd)}</strong></div>
                      </div>
                    ) : (
                      <div className="quote-sheet-card quote-customs-only-card">
                        <small>MODALIDAD DE SERVICIO</small>
                        <strong>SOLO GESTIÓN ADUANAL</strong>
                        <p>
                          Esta cotización no incluye transporte marítimo.
                          El vehículo fue embarcado por cuenta del cliente o por un tercero.
                        </p>
                        
                      </div>
                    )}
                  </section>

                  <section className="quote-grand-summary">
                    <div><span>Total costos Guatemala</span><strong>{moneyGTQ(quoteGuatemalaTotal)}</strong></div>
                    {quoteGuatemalaUsd !== null && (
                      <div><span>Equivalente costos Guatemala</span><strong>{moneyUSD(quoteGuatemalaUsd)}</strong></div>
                    )}
                    {quoteForm.include_freight && (
                      <div>
                        <span>Flete marítimo</span>
                        <strong>{moneyUSD(quoteFreightUsd)}</strong>
                      </div>
                    )}
                    {quoteForm.include_freight && (
                      <div>
                        <span>Grúa</span>
                        <strong>{moneyUSD(quoteCraneUsd)}</strong>
                      </div>
                    )}
                    <div className="quote-grand-total">
                      <span>
                        {quoteGrandTotalUsd !== null
                          ? "TOTAL GENERAL"
                          : quoteForm.include_freight
                            ? "FLETE + COSTOS GUATEMALA"
                            : "COSTOS GUATEMALA"}
                      </span>
                      <strong>{quoteGrandTotalUsd !== null ? moneyUSD(quoteGrandTotalUsd) : `${moneyUSD(quoteTransportUsd)} + ${moneyGTQ(quoteGuatemalaTotal)}`}</strong>
                    </div>
                  </section>

                  <footer className="quote-sheet-footer">
                    <div><strong>Notas importantes</strong><span>Cotización sujeta a validación final. Valores pueden variar por actualizaciones de SAT, naviera o gastos operativos.</span></div>
                    <div className="quote-sheet-footer-brand">E&amp;R GLOBAL LOGISTIC</div>
                  </footer>
                </div>
              </div>

              {!quoteExchangeRate && (
                <div className="quote-rate-note">
                  ℹ️ El sistema no recibió un tipo de cambio en este resultado. Por seguridad, no mezclamos GTQ y USD en un único total; la imagen mostrará ambos importes separados hasta que conectemos el tipo de cambio automático.
                </div>
              )}

              <div className="quote-modal-actions quote-modal-actions-sticky">
                <div className="quote-sticky-hint">
                  <small>LISTA PARA COMPARTIR</small>
                  <span>La imagen incluirá el vehículo, costos, impuestos y flete.</span>
                </div>
                <div className="quote-sticky-buttons">
                  <button className="secondary-button" onClick={closeQuoteModal}>Cancelar</button>
                  {quoteRecipient?.phone && (
                    <button className="whatsapp-action quote-whatsapp-send" onClick={downloadQuoteAndOpenWhatsApp} disabled={quoteGenerating}>
                      <span className="whatsapp-icon">💬</span>
                      {quoteGenerating ? "Generando..." : "Descargar y abrir WhatsApp"}
                    </button>
                  )}
                  <button className="primary-button" onClick={downloadQuoteImage} disabled={quoteGenerating}>
                    {quoteGenerating ? "Generando imagen..." : "Descargar cotización PNG"} <span>↓</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
