import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { supabase } from "./supabaseClient";
import eyrSolutionsLogo from "./assets/eyr-solutions-logo.png";
import QuoteModeTabs from "./modules/public-quoter/QuoteModeTabs";
import ImporterQuoteFields from "./modules/public-quoter/ImporterQuoteFields";
import ImporterCustomsServiceRequest from "./modules/importer-customs/ImporterCustomsServiceRequest";
import AdminNotificationBell from "./modules/notifications/AdminNotificationBell";
import ProspectList from "./modules/prospects/ProspectList";
import ProspectDetailDrawer from "./modules/prospects/ProspectDetailDrawer";
import InternalUsersPage from "./modules/internal-users/InternalUsersPage";
import OfficeUsersPage from "./modules/office-users/OfficeUsersPage";
import FinanceDashboard from "./modules/finance/FinanceDashboard";
import CustomsCaseFinance from "./modules/finance/CustomsCaseFinance";
import DeclarationsPage from "./modules/declarations/DeclarationsPage";
import CustomerAutocomplete from "./modules/customers/CustomerAutocomplete";
import AdminCenterPage from "./modules/admin/AdminCenterPage";
import CommercialQuotePage from "./modules/commercial-quotes/CommercialQuotePage";
import DucaCorrelativesPage from "./modules/declarations/DucaCorrelativesPage";
import "./modules/layout/sidebar-scroll.css";
import "./modules/customs/control-aduanal-duca.css";
import "./modules/customs/manual-customs.css";
import "./modules/branding/branding-v35.css";
import "./modules/branding/branding-sidebar-fix-v35.1.css";
import "./App.css";
import { buildQuoteCode } from "./utils/quoteCode";
import OfficePortalClientsPage from "./modules/office-portal-clients/OfficePortalClientsPage.jsx";
import ImportersPage from "./modules/importers/ImportersPage.jsx";
import OperationFilesPanel from "./modules/operation-files/OperationFilesPanel.jsx";
import "./modules/customs/portal-customs-requests-v39621.css";

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
    MANUAL: "Base definida manualmente",
  };

  return labels[status] || status || "—";
}

function humanConfidence(confidence) {
  const labels = {
    AUTOMATIC_MATCH: "Alta",
    MANUAL_RESOLUTION: "Confirmada",
    EXCEPTIONAL_RESOLUTION: "Confirmada externamente",
    MANUAL_REVIEW: "Requiere revisión",
    MANUAL: "Confirmada por E&R",
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


const VEHICLE_BRAND_LOGO_SLUGS = {
  acura: "acura",
  "alfa romeo": "alfa-romeo",
  "aston martin": "aston-martin",
  audi: "audi",
  bentley: "bentley",
  bmw: "bmw",
  buick: "buick",
  byd: "byd",
  cadillac: "cadillac",
  chevrolet: "chevrolet",
  chevy: "chevrolet",
  chrysler: "chrysler",
  dodge: "dodge",
  ferrari: "ferrari",
  fiat: "fiat",
  ford: "ford",
  genesis: "genesis",
  gmc: "gmc",
  honda: "honda",
  hyundai: "hyundai",
  infiniti: "infiniti",
  jaguar: "jaguar",
  jeep: "jeep",
  kia: "kia",
  lamborghini: "lamborghini",
  "land rover": "land-rover",
  landrover: "land-rover",
  lexus: "lexus",
  lincoln: "lincoln",
  lotus: "lotus",
  lucid: "lucid",
  maserati: "maserati",
  mazda: "mazda",
  mclaren: "mclaren",
  "mc laren": "mclaren",
  "mercedes benz": "mercedes-benz",
  "mercedes-benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  mini: "mini",
  "mini cooper": "mini",
  mitsubishi: "mitsubishi",
  nissan: "nissan",
  polestar: "polestar",
  porsche: "porsche",
  ram: "ram",
  "ram trucks": "ram",
  rivian: "rivian",
  "rolls royce": "rolls-royce",
  "rolls-royce": "rolls-royce",
  subaru: "subaru",
  tesla: "tesla",
  toyota: "toyota",
  vinfast: "vinfast",
  "vin fast": "vinfast",
  volkswagen: "volkswagen",
  vw: "volkswagen",
  volvo: "volvo",
};

function normalizeVehicleBrandName(make) {
  return String(make || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[._/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function officialVehicleLogoUrl(make) {
  const normalized = normalizeVehicleBrandName(make);
  const slug = VEHICLE_BRAND_LOGO_SLUGS[normalized];

  if (!slug) return "";

  return `https://raw.githubusercontent.com/diegojasso/car-logos-SVG/main/logos/${slug}.svg`;
}

function VehicleMakeLogo({ make }) {
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = officialVehicleLogoUrl(make);

    setLogoDataUrl("");
    setLogoError(false);

    if (!url) {
      setLogoError(true);
      return () => {
        cancelled = true;
      };
    }

    async function loadOfficialLogo() {
      try {
        const response = await fetch(url, {
          mode: "cors",
          cache: "force-cache",
        });

        if (!response.ok) {
          throw new Error(`Logo HTTP ${response.status}`);
        }

        const svgText = await response.text();

        const dataUrl =
          "data:image/svg+xml;charset=UTF-8," +
          encodeURIComponent(svgText);

        if (!cancelled) {
          setLogoDataUrl(dataUrl);
        }
      } catch (err) {
        console.warn("VEHICLE BRAND LOGO ERROR:", make, err);

        if (!cancelled) {
          setLogoError(true);
        }
      }
    }

    loadOfficialLogo();

    return () => {
      cancelled = true;
    };
  }, [make]);

  if (logoDataUrl) {
    return (
      <img
        className="quote-make-official-logo"
        data-quote-vehicle-logo="true"
        src={logoDataUrl}
        alt={`Logo ${make || "vehículo"}`}
      />
    );
  }

  return (
    <div
      className={`quote-make-logo-loading${logoError ? " error" : ""}`}
      data-quote-vehicle-logo="true"
    >
      {logoError
        ? String(make || "MARCA").toUpperCase()
        : "Cargando logo..."}
    </div>
  );
}

async function waitForQuoteImages(root) {
  if (!root) return;

  // Da tiempo a que VehicleMakeLogo termine de convertir el SVG oficial
  // a data URL antes de que html2canvas capture la cotización.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pendingVehicleLogo = root.querySelector(
      '[data-quote-vehicle-logo="true"].quote-make-logo-loading:not(.error)'
    );

    if (!pendingVehicleLogo) break;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }

          const done = () => resolve();

          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });

          setTimeout(done, 2500);
        })
    )
  );
}

function QuoteWhatsAppIcon() {
  return (
    <svg viewBox="0 0 448 512" aria-hidden="true">
      <circle cx="224" cy="256" r="214" fill="#25D366" />
      <path
        fill="#fff"
        d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"
      />
    </svg>
  );
}

function QuoteLocationIcon() {
  return (
    <svg viewBox="0 0 384 512" aria-hidden="true">
      <path
        fill="#fff"
        d="M192 0C86 0 0 86 0 192c0 77.4 27 99 172.3 309.7 9.5 13.8 29.9 13.8 39.4 0C357 291 384 269.4 384 192 384 86 298 0 192 0zm0 272c-44.2 0-80-35.8-80-80s35.8-80 80-80 80 35.8 80 80-35.8 80-80 80z"
      />
    </svg>
  );
}

function QuoteFacebookIcon() {
  return (
    <svg viewBox="0 0 320 512" aria-hidden="true">
      <path
        fill="#0A3458"
        d="M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5 16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0 129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z"
      />
    </svg>
  );
}

function QuoteInstagramIcon() {
  return (
    <svg viewBox="0 0 448 512" aria-hidden="true">
      <path
        fill="#0A3458"
        d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"
      />
    </svg>
  );
}

function QuoteTikTokIcon() {
  return (
    <svg viewBox="0 0 448 512" aria-hidden="true">
      <path
        fill="#0A3458"
        d="M448 209.91a210.06 210.06 0 0 1-122.77-39.25V349.38A162.55 162.55 0 1 1 185 188.31V278.2a74.62 74.62 0 1 0 52.23 71.18V0h88a121.18 121.18 0 0 0 1.86 22.17 122.18 122.18 0 0 0 53.91 80.22 121.43 121.43 0 0 0 67 20.14Z"
      />
    </svg>
  );
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
    client_id: null,
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

    // V39.6.21 · origen Portal del Cliente
    portal_request_id: null,
    portal_client_id: null,
    portal_request_code: "",
    portal_release_confirmed: false,
    portal_request_notes: "",
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
    if (
      path === "/app" ||
      path.startsWith("/app/") ||
      path.startsWith("/o/")
    ) return "internal";
    if (path === "/cotizador" || path.startsWith("/cotizador/")) return "public";
    return "landing";
  };

  // V38.3 · El tenant del login se resuelve ANTES de autenticar al usuario.
  // /app conserva E&R. /o/:slug presenta la marca de la oficina cliente.
  const loginOfficeSlugFromLocation = () => {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const match = path.match(/^\/o\/([a-z0-9-]+)$/i);
    if (match?.[1]) return match[1].toLowerCase();

    const querySlug = new URLSearchParams(window.location.search).get("office");
    return String(querySlug || "").trim().toLowerCase();
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
  const [publicQuoteMode, setPublicQuoteMode] = useState("SAT");
  const [publicInvoiceValueUsd, setPublicInvoiceValueUsd] = useState("");
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicResult, setPublicResult] = useState(null);
  const [publicError, setPublicError] = useState("");
  const [publicQuotaRemaining, setPublicQuotaRemaining] = useState(null);
  const [subscriptionRequestLoading, setSubscriptionRequestLoading] = useState(false);

  const [appSettings, setAppSettings] = useState({
    whatsapp_number: "",
    importer_exchange_rate: "",
  });
  const [settingsForm, setSettingsForm] = useState({
    whatsapp_number: "",
    importer_exchange_rate: "",
  });
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

  // V38 · SaaS / White Label por organización
  const [tenantContext, setTenantContext] = useState(null);
  const [publicLoginBranding, setPublicLoginBranding] = useState(null);
  const [publicLoginBrandingLoading, setPublicLoginBrandingLoading] = useState(false);
  const [publicLoginBrandingError, setPublicLoginBrandingError] = useState("");
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState("");
  const [brandingError, setBrandingError] = useState("");
  const [brandingLogoFile, setBrandingLogoFile] = useState(null);
  const [brandingForm, setBrandingForm] = useState({
    office_name: "",
    tagline: "",
    primary_color: "#0A3458",
    secondary_color: "#E8A72D",
    accent_color: "#F5D87F",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    quote_footer: "",
    logo_url: "",
  });

  // V38.1 · Administración SaaS de Oficinas / Clientes
  const [organizations, setOrganizations] = useState([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const [organizationsMessage, setOrganizationsMessage] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [showOrganizationForm, setShowOrganizationForm] = useState(false);
  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    slug: "",
    plan_code: "QUOTER",
    owner_email: "",
  });
  const [organizationEditForm, setOrganizationEditForm] = useState({
    plan_code: "QUOTER",
    subscription_status: "ACTIVE",
    active: true,
    owner_email: "",
  });

  const [vin, setVin] = useState("");
  // V37.4 · Cotizador interno SAT + Importadores
  const [internalQuoteMode, setInternalQuoteMode] = useState("SAT");
  const [internalInvoiceValueUsd, setInternalInvoiceValueUsd] = useState("");
  // V37.6 · Cotizador manual de impuestos
  const [manualTaxableValueGtq, setManualTaxableValueGtq] = useState("");
  const [manualTaxRuleId, setManualTaxRuleId] = useState("");
  const [manualTaxRules, setManualTaxRules] = useState([]);
  const [manualVehicleName, setManualVehicleName] = useState("");
  const [manualVin, setManualVin] = useState("");
  // V37.4.4 · clasificación tributaria aprendible
  const [selectedTaxRuleId, setSelectedTaxRuleId] = useState(null);
  const [taxClassSaving, setTaxClassSaving] = useState(false);
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

  // V37 · Cotización comercial E&R
  const [commercialQuoteContext, setCommercialQuoteContext] = useState(null);

  // V20 · Historial de cotizaciones
  const [activeView, setActiveView] = useState("new");
  const [quotationSearch, setQuotationSearch] = useState("");
  const [quotations, setQuotations] = useState([]);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationError, setQuotationError] = useState("");
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [quotationUsers, setQuotationUsers] = useState([]);
  const [quotationOwnerFilter, setQuotationOwnerFilter] = useState("");

  // V26 · Usuarios y Suscripciones
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [subscriptionUsers, setSubscriptionUsers] = useState([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [subscriptionActionUserId, setSubscriptionActionUserId] = useState(null);

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
  const [prospectPage, setProspectPage] = useState(1);
  const PROSPECT_PAGE_SIZE = 20;
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
  const [customsPortalCandidate, setCustomsPortalCandidate] = useState(null);
  const [customsPortalCandidateLoading, setCustomsPortalCandidateLoading] = useState(false);

  // V39.6.21 · Solicitudes aduanales recibidas desde Portal
  const [portalCustomsRequests, setPortalCustomsRequests] = useState([]);
  const [portalCustomsRequestsLoading, setPortalCustomsRequestsLoading] = useState(false);
  const [portalCustomsRequestError, setPortalCustomsRequestError] = useState("");


  // V39.2.4 · Portal del Cliente en Control Aduanal
  const [customsPortalAssignmentClients, setCustomsPortalAssignmentClients] = useState([]);
  const [customsPortalAssignmentLoading, setCustomsPortalAssignmentLoading] = useState(false);

  // V24 · Gestiones de Importación
  const [importSearch, setImportSearch] = useState("");
  const [importManagements, setImportManagements] = useState([]);
  const [importManagementsLoading, setImportManagementsLoading] = useState(false);
  const [importManagementsError, setImportManagementsError] = useState("");
  const [selectedImportManagement, setSelectedImportManagement] = useState(null);
  const [importManagementDetail, setImportManagementDetail] = useState(null);
  const [importManagementSaving, setImportManagementSaving] = useState(false);
  // V39.3 · Selector maestro de Importadores
  const [operationImporters, setOperationImporters] = useState([]);
  const [operationImportersLoading, setOperationImportersLoading] = useState(false);

  const [importManagementMessage, setImportManagementMessage] = useState("");

  // V39.2.3 · Cliente del Portal vinculado a la gestión
  const [portalAssignmentClients, setPortalAssignmentClients] = useState([]);
  const [portalAssignmentLoading, setPortalAssignmentLoading] = useState(false);
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

  async function loadTenantContext() {
    try {
      setBrandingLoading(true);
      const { data, error: tenantError } = await supabase.rpc("my_organization_context_v38");
      if (tenantError) throw tenantError;
      const context = data || null;
      setTenantContext(context);
      const b = context?.branding || {};
      const o = context?.organization || {};
      setBrandingForm({
        office_name: b.office_name || o.name || "",
        tagline: b.tagline || "",
        primary_color: b.primary_color || "#0A3458",
        secondary_color: b.secondary_color || "#E8A72D",
        accent_color: b.accent_color || "#F5D87F",
        phone: b.phone || "",
        whatsapp: b.whatsapp || "",
        email: b.email || "",
        address: b.address || "",
        quote_footer: b.quote_footer || "",
        logo_url: b.logo_url || "",
      });
      return context;
    } catch (err) {
      console.error("V38 TENANT CONTEXT ERROR:", err);
      setTenantContext(null);
      return null;
    } finally {
      setBrandingLoading(false);
    }
  }

  async function loadOrganizationsV381(search = organizationSearch) {
    if (!isSystemAdmin) return;
    setOrganizationsLoading(true);
    setOrganizationsError("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_organizations_v381",
        { p_search: String(search || "").trim() || null }
      );
      if (rpcError) throw rpcError;
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("V38.1 ORGANIZATIONS LIST ERROR:", err);
      setOrganizationsError(
        err?.message || "No fue posible cargar las oficinas."
      );
    } finally {
      setOrganizationsLoading(false);
    }
  }

  async function openOrganizationsView() {
    setActiveView("organizations");
    setOrganizationsMessage("");
    setOrganizationsError("");
    setSelectedOrganization(null);
    await loadOrganizationsV381("");
  }

  function resetOrganizationFormV381() {
    setOrganizationForm({
      name: "",
      slug: "",
      plan_code: "QUOTER",
      owner_email: "",
    });
  }

  async function createOrganizationV381(event) {
    event?.preventDefault?.();
    setOrganizationSaving(true);
    setOrganizationsError("");
    setOrganizationsMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_create_organization_v381",
        {
          p_name: organizationForm.name.trim(),
          p_slug: organizationForm.slug.trim(),
          p_plan_code: organizationForm.plan_code,
          p_owner_email:
            organizationForm.owner_email.trim() || null,
        }
      );
      if (rpcError) throw rpcError;

      setOrganizationsMessage(
        data?.owner_linked
          ? "Oficina creada y usuario propietario asignado."
          : data?.owner_email
            ? "Oficina creada. El correo indicado todavía no existe como usuario; podés asignarlo después."
            : "Oficina creada correctamente."
      );
      setShowOrganizationForm(false);
      resetOrganizationFormV381();
      await loadOrganizationsV381("");
    } catch (err) {
      console.error("V38.1 CREATE ORGANIZATION ERROR:", err);
      setOrganizationsError(
        err?.message || "No fue posible crear la oficina."
      );
    } finally {
      setOrganizationSaving(false);
    }
  }

  function selectOrganizationV381(organization) {
    setSelectedOrganization(organization);
    setOrganizationEditForm({
      plan_code: organization?.plan_code || "QUOTER",
      subscription_status:
        organization?.subscription_status || "ACTIVE",
      active: organization?.active !== false,
      owner_email: organization?.owner_email || "",
    });
    setOrganizationsError("");
    setOrganizationsMessage("");
  }

  async function saveOrganizationV381() {
    if (!selectedOrganization?.id) return;
    setOrganizationSaving(true);
    setOrganizationsError("");
    setOrganizationsMessage("");
    try {
      const { data, error: updateError } = await supabase.rpc(
        "admin_update_organization_v381",
        {
          p_organization_id: selectedOrganization.id,
          p_plan_code: organizationEditForm.plan_code,
          p_subscription_status:
            organizationEditForm.subscription_status,
          p_active: Boolean(organizationEditForm.active),
        }
      );
      if (updateError) throw updateError;

      const requestedOwner =
        String(organizationEditForm.owner_email || "")
          .trim()
          .toLowerCase();
      const currentOwner =
        String(selectedOrganization?.owner_email || "")
          .trim()
          .toLowerCase();

      if (requestedOwner && requestedOwner !== currentOwner) {
        const { error: ownerError } = await supabase.rpc(
          "admin_assign_organization_owner_v381",
          {
            p_organization_id: selectedOrganization.id,
            p_owner_email: requestedOwner,
          }
        );
        if (ownerError) throw ownerError;
      }

      setOrganizationsMessage(
        "Cambios guardados correctamente."
      );
      await loadOrganizationsV381(organizationSearch);
      if (data?.organization_id) {
        const refreshed = (Array.isArray(organizations) ? organizations : [])
          .find((item) => item.id === data.organization_id);
        if (refreshed) setSelectedOrganization(refreshed);
      }
    } catch (err) {
      console.error("V38.1 UPDATE ORGANIZATION ERROR:", err);
      setOrganizationsError(
        err?.message || "No fue posible guardar los cambios."
      );
    } finally {
      setOrganizationSaving(false);
    }
  }

  async function toggleOrganizationV381(organization) {
    if (!organization?.id) return;
    setOrganizationSaving(true);
    setOrganizationsError("");
    setOrganizationsMessage("");
    try {
      const willActivate = organization.active === false;
      const { error: rpcError } = await supabase.rpc(
        "admin_update_organization_v381",
        {
          p_organization_id: organization.id,
          p_plan_code: organization.plan_code,
          p_subscription_status: willActivate ? "ACTIVE" : "SUSPENDED",
          p_active: willActivate,
        }
      );
      if (rpcError) throw rpcError;
      setOrganizationsMessage(
        willActivate
          ? "Oficina activada."
          : "Oficina suspendida. Sus datos se conservan."
      );
      await loadOrganizationsV381(organizationSearch);
    } catch (err) {
      console.error("V38.1 TOGGLE ORGANIZATION ERROR:", err);
      setOrganizationsError(
        err?.message || "No fue posible cambiar el estado."
      );
    } finally {
      setOrganizationSaving(false);
    }
  }

  async function uploadTenantLogo() {
    if (!brandingLogoFile) return brandingForm.logo_url || "";
    const organizationId = tenantContext?.organization?.id;
    if (!organizationId) throw new Error("La organización todavía no está configurada.");

    const ext = String(brandingLogoFile.name || "logo.png").split(".").pop().toLowerCase();
    const safeExt = ["png", "jpg", "jpeg", "webp", "svg"].includes(ext) ? ext : "png";
    const path = `${organizationId}/logo-${Date.now()}.${safeExt}`;
    const { error: uploadError } = await supabase.storage
      .from("organization-logos")
      .upload(path, brandingLogoFile, { upsert: true, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("organization-logos").getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function saveTenantBranding(event) {
    event?.preventDefault?.();
    setBrandingSaving(true);
    setBrandingMessage("");
    setBrandingError("");
    try {
      const logoUrl = await uploadTenantLogo();
      const { data, error: saveError } = await supabase.rpc("save_organization_branding_v38", {
        p_office_name: brandingForm.office_name.trim(),
        p_tagline: brandingForm.tagline.trim(),
        p_primary_color: brandingForm.primary_color,
        p_secondary_color: brandingForm.secondary_color,
        p_accent_color: brandingForm.accent_color,
        p_phone: brandingForm.phone.trim(),
        p_whatsapp: brandingForm.whatsapp.trim(),
        p_email: brandingForm.email.trim(),
        p_address: brandingForm.address.trim(),
        p_quote_footer: brandingForm.quote_footer.trim(),
        p_logo_url: logoUrl || brandingForm.logo_url || null,
      });
      if (saveError) throw saveError;
      setBrandingLogoFile(null);
      await loadTenantContext();
      setBrandingMessage("Marca actualizada. Las nuevas cotizaciones usarán esta identidad visual.");
      return data;
    } catch (err) {
      setBrandingError(err?.message || "No fue posible guardar la marca.");
    } finally {
      setBrandingSaving(false);
    }
  }

  async function loadInternalProfile(userId) {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, job_title, active, free_quotes_used, subscription_status, subscription_expires_at, organization_id")
      .eq("id", userId)
      .single();

    if (profileError) {
      throw profileError;
    }

    setProfile(data);
    await loadTenantContext();
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
          setTenantContext(null);
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
          setTenantContext(null);
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

  async function loadPublicLoginBrandingV383() {
    const slug = loginOfficeSlugFromLocation();

    if (!slug) {
      setPublicLoginBranding(null);
      setPublicLoginBrandingError("");
      return null;
    }

    setPublicLoginBrandingLoading(true);
    setPublicLoginBrandingError("");

    try {
      const { data, error } = await supabase.rpc("public_login_branding_v383", {
        p_slug: slug,
      });
      if (error) throw error;
      if (!data?.organization_id) {
        throw new Error("No encontramos una oficina activa con este enlace.");
      }
      setPublicLoginBranding(data);
      return data;
    } catch (err) {
      console.error("V38.3 PUBLIC LOGIN BRANDING ERROR:", err);
      setPublicLoginBranding(null);
      setPublicLoginBrandingError(
        err?.message || "No fue posible cargar la identidad de esta oficina."
      );
      return null;
    } finally {
      setPublicLoginBrandingLoading(false);
    }
  }

  useEffect(() => {
    if (siteMode === "internal" && !session) {
      loadPublicLoginBrandingV383();
    }
  }, [siteMode, session]);

  function navigateSite(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setSiteMode(
      (path.startsWith("/app") || path.startsWith("/o/"))
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
        .in("setting_key", ["whatsapp_number", "importer_exchange_rate"]);
      if (error) throw error;
      const next = {
        whatsapp_number: "",
        importer_exchange_rate: "",
      };

      for (const row of data || []) {
        if (row.setting_key === "whatsapp_number") {
          next.whatsapp_number = String(row.setting_value || "");
        }

        if (row.setting_key === "importer_exchange_rate") {
          next.importer_exchange_rate = String(row.setting_value || "");
        }
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

      const importerExchangeRate = Number(settingsForm.importer_exchange_rate);

      if (!Number.isFinite(importerExchangeRate) || importerExchangeRate <= 0) {
        throw new Error(
          "Ingresá un tipo de cambio interno válido para el cotizador de importadores."
        );
      }

      const { error } = await supabase.rpc("update_app_setting", {
        p_setting_key: "whatsapp_number",
        p_setting_value: cleanWhatsapp,
      });
      if (error) throw error;

      const { error: exchangeError } = await supabase.rpc("update_app_setting", {
        p_setting_key: "importer_exchange_rate",
        p_setting_value: importerExchangeRate.toFixed(4),
      });
      if (exchangeError) throw exchangeError;

      const next = {
        ...appSettings,
        whatsapp_number: cleanWhatsapp,
        importer_exchange_rate: importerExchangeRate.toFixed(4),
      };
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
    setPublicQuoteMode("SAT");
    setPublicInvoiceValueUsd("");
    setPublicError("");
    setPublicQuotaRemaining(null);
  }

  async function consultarPublico() {
    const cleanVin = publicVin.trim().toUpperCase();
    if (cleanVin.length !== 17 || !session) return;

    const importerInvoice =
      publicQuoteMode === "IMPORTER"
        ? Number(publicInvoiceValueUsd)
        : null;

    if (
      publicQuoteMode === "IMPORTER" &&
      (!Number.isFinite(importerInvoice) || importerInvoice <= 0)
    ) {
      setPublicError("Ingresá un valor de factura válido en USD.");
      return;
    }

    setPublicLoading(true);
    setPublicError("");
    setPublicResult(null);

    try {
      const { data, error: functionError } = await invokeFunction(
        "decode-vin",
        {
          body: {
            vin: cleanVin,
            calculation_mode: publicQuoteMode,
            invoice_value_usd:
              publicQuoteMode === "IMPORTER"
                ? importerInvoice
                : null,
          },
        }
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

      const tenant = await loadTenantContext();
      const hasOfficeMembership = Boolean(tenant?.membership?.active);
      const requestedOfficeSlug = loginOfficeSlugFromLocation();
      const authenticatedOfficeSlug = String(tenant?.organization?.slug || "").toLowerCase();

      // En un enlace white-label, una cuenta externa solo puede entrar a la
      // organización representada por ese enlace. ADMIN/OPERADOR E&R conservan
      // acceso de soporte por /app.
      if (
        requestedOfficeSlug &&
        !["ADMIN", "OPERADOR"].includes(role) &&
        authenticatedOfficeSlug !== requestedOfficeSlug
      ) {
        await supabase.auth.signOut();
        throw new Error("Esta cuenta no pertenece a la oficina de este enlace.");
      }

      if (!["ADMIN", "OPERADOR"].includes(role) && !hasOfficeMembership) {
        await supabase.auth.signOut();
        throw new Error(
          "Esta cuenta no tiene acceso a una organización activa en la plataforma."
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
    setSelectedTaxRuleId(null);
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

  async function ejecutarDecode(
    cleanVin,
    clearResult = true,
    decodeOptions = {}
  ) {
    if (clearResult) {
      setResult(null);
    }

    const calculationMode =
      String(decodeOptions?.calculation_method || "SAT").toUpperCase();

    const invoiceValueUsd =
      calculationMode === "IMPORTER"
        ? Number(decodeOptions?.invoice_value_usd || 0)
        : null;

    const { data, error: functionError } =
      await invokeFunction("decode-vin", {
        body: {
          vin: cleanVin,
          calculation_mode: calculationMode,
          invoice_value_usd: invoiceValueUsd,
        },
      });

    if (functionError) {
      throw functionError;
    }

    if (!data?.success && data?.code !== "TAX_CLASSIFICATION_REVIEW") {
      throw new Error(
        data?.error || "No fue posible consultar el vehículo."
      );
    }

    setResult(data);

    resetReviewState();

    return data;
  }

  async function loadManualTaxRules() {
    if (manualTaxRules.length) return manualTaxRules;
    try {
      const { data, error: rulesError } = await supabase.rpc("list_tax_vehicle_rules_v3744");
      if (rulesError) throw rulesError;
      const rows = Array.isArray(data) ? data : [];
      setManualTaxRules(rows);
      return rows;
    } catch (err) {
      console.error("MANUAL TAX RULES ERROR:", err);
      setError(err?.message || "No fue posible cargar las reglas tributarias.");
      return [];
    }
  }

  function calcularImpuestosManual() {
    const taxableValue = Number(manualTaxableValueGtq);
    const rule = manualTaxRules.find(
      (item) => Number(item.id) === Number(manualTaxRuleId)
    );

    if (!Number.isFinite(taxableValue) || taxableValue <= 0) {
      setError("Ingresá un valor imponible válido en quetzales.");
      return;
    }

    if (!rule) {
      setError("Seleccioná la categoría tributaria del vehículo.");
      return;
    }

    const ivaRate = Number(rule.iva_rate || 0);
    const iprimaRate = Number(rule.iprima_rate || 0);
    const plates = Number(rule.plate_fee_gtq || 0);

    const iva = Math.round(taxableValue * ivaRate * 100) / 100;
    const iprima = Math.round(taxableValue * iprimaRate * 100) / 100;
    const total = Math.round((iva + iprima + plates) * 100) / 100;

    const cleanVin =
      String(manualVin || "").trim().toUpperCase() || null;

    const cleanVehicleName =
      String(manualVehicleName || "").trim().toUpperCase() ||
      "CÁLCULO MANUAL";

    const manualSummary = {
      calculation_status: "READY",
      calculation_method: "MANUAL",
      sat_value_gtq: taxableValue,
      sat_line: "BASE MANUAL E&R",
      sat_match_status: "MANUAL",
      sat_confidence: "MANUAL",
      total_taxes_gtq: total,
    };

    setError("");
    setResult({
      success: true,

      // V39.6.2 · El cálculo manual es definitivo dentro de este modo.
      // No depende del matching VIN / Tabla SAT.
      calculation_status: "READY",
      calculation_method: "MANUAL",
      manual_calculation: true,

      vehicle: {
        vin: cleanVin,
        model: cleanVehicleName,
      },

      sat: {
        requires_review: false,
        match_status: "MANUAL",
        confidence: "MANUAL",
        selected_match: null,
        manual_source: true,
      },

      taxes: {
        taxable_value_gtq: taxableValue,
        sat_value_gtq: taxableValue,
        iva_rate: ivaRate,
        iva_gtq: iva,
        iprima_rate: iprimaRate,
        iprima_gtq: iprima,
        plates_gtq: plates,
        total_taxes_gtq: total,
        total_gtq: total,
        vehicle_type: rule.vehicle_type,
        calculation_source: "MANUAL",
      },

      // El render general usa summary para el encabezado y la tarjeta
      // de valor imponible. En manual lo llenamos explícitamente.
      summary: manualSummary,

      dimensions: null,
      freight: null,
      freight_requires_review: false,
      manual_tax_rule: rule,

      warnings: [
        "Valor imponible establecido manualmente por E&R Solutions.",
      ],
    });
  }

  async function consultarVehiculo() {
    const cleanVin = vin.trim().toUpperCase();

    if (cleanVin.length !== 17) return;

    const importerInvoice =
      internalQuoteMode === "IMPORTER"
        ? Number(internalInvoiceValueUsd)
        : null;

    if (
      internalQuoteMode === "IMPORTER" &&
      (!Number.isFinite(importerInvoice) || importerInvoice <= 0)
    ) {
      setError("Ingresá un valor de factura válido en USD.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await ejecutarDecode(cleanVin, true, {
        calculation_method: internalQuoteMode,
        invoice_value_usd:
          internalQuoteMode === "IMPORTER" ? importerInvoice : null,
      });
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

  async function confirmarClasificacionTributaria() {
    const review = result?.tax_classification_review;
    if (!review?.raw_vehicle_type || !selectedTaxRuleId) return;

    setTaxClassSaving(true);
    setError("");

    try {
      const { data, error: learnError } = await supabase.rpc(
        "learn_tax_vehicle_type_v3744",
        {
          p_raw_vehicle_type: review.raw_vehicle_type,
          p_source_rule_id: Number(selectedTaxRuleId),
        }
      );

      if (learnError) throw learnError;

      const learned = Array.isArray(data) ? data[0] : data;

      await ejecutarDecode(vin.trim().toUpperCase(), true, {
        calculation_method: internalQuoteMode,
        invoice_value_usd:
          internalQuoteMode === "IMPORTER"
            ? Number(internalInvoiceValueUsd)
            : null,
      });

      setSelectedTaxRuleId(null);
      setError("");
      console.info("Clasificación tributaria aprendida:", learned);
    } catch (err) {
      console.error("TAX CLASSIFICATION LEARN ERROR:", err);
      setError(
        err?.message ||
          "No fue posible guardar la clasificación tributaria."
      );
    } finally {
      setTaxClassSaving(false);
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
  return buildQuoteCode({
    vin: vinOverride || vehicle?.vin || "VIN",

    isWhiteLabelClient,

    officeName:
      tenantBranding?.office_name ||
      tenantOrganization?.name ||
      tenantBrandName ||
      "",

    // Preparado para cuando agreguemos este campo
    // configurable por oficina.
    explicitPrefix:
      tenantBranding?.quote_prefix ||
      tenantOrganization?.quote_prefix ||
      "",
  });
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
      calculation_method:
        result?.calculation_method ||
        summary?.calculation_method ||
        "SAT",
      invoice_value_usd:
        result?.calculation_method === "IMPORTER"
          ? Number(result?.invoice_value_usd || summary?.invoice_value_usd || 0)
          : null,
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
        calculation: {
          method:
            result?.calculation_method ||
            summary?.calculation_method ||
            "SAT",
          invoice_value_usd:
            result?.calculation_method === "IMPORTER"
              ? Number(result?.invoice_value_usd || summary?.invoice_value_usd || 0)
              : null,
        },
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
          exchange_rate: quoteExchangeRate || null,
          total_guatemala_usd: quoteGuatemalaUsd,
          total_usd: quoteGrandTotalUsd,
          total_gtq: quoteGrandTotalGtq,
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

  // V37.5.2 · Carátula oficial + VIN y vehículo obligatorios
  async function printVehicleEnvelopeCover(record, source = "customs") {
    if (!record) return;

    const safe = (value) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    let workingRecord = { ...record };
    let cleanVin = String(workingRecord.vin || "").trim().toUpperCase();

    // Nunca imprimir "SIN VIN". Si falta, E&R lo solicita y lo registra.
    if (!cleanVin) {
      const enteredVin = window.prompt(
        "Este expediente no tiene VIN registrado.\n\nIngresá el VIN antes de imprimir la carátula:"
      );

      if (enteredVin === null) return;

      cleanVin = String(enteredVin || "").trim().toUpperCase();

      if (cleanVin.length !== 17) {
        window.alert(
          "El VIN debe tener exactamente 17 caracteres. No se imprimió la carátula."
        );
        return;
      }

      try {
        const table =
          source === "import" ? "import_managements" : "customs_cases";

        const { data, error: vinSaveError } = await supabase
          .from(table)
          .update({
            vin: cleanVin,
            updated_at: new Date().toISOString(),
            updated_by: session?.user?.id || user?.id || null,
          })
          .eq("id", workingRecord.id)
          .select()
          .single();

        if (vinSaveError) throw vinSaveError;

        workingRecord = { ...workingRecord, ...data, vin: cleanVin };

        if (source === "import") {
          setSelectedImportManagement(workingRecord);
          setImportManagementDetail(workingRecord);
          await loadImportManagements(importSearch);
        } else {
          setSelectedCustomsCase(workingRecord);
          setCustomsDetail(workingRecord);
          await loadCustomsCases(customsSearch);
        }
      } catch (err) {
        console.error("ENVELOPE VIN SAVE ERROR:", err);
        window.alert(
          `No fue posible registrar el VIN antes de imprimir.\n\n${err?.message || ""}`
        );
        return;
      }
    }

    const clientName = safe(
      workingRecord.client_name ||
        workingRecord.customer_name ||
        workingRecord.full_name ||
        "CLIENTE"
    ).toUpperCase();

    let rawVehicleLabel = String(workingRecord.vehicle_model || "").trim();

    if (!rawVehicleLabel) {
      rawVehicleLabel = [
        workingRecord.make,
        workingRecord.model,
        workingRecord.vehicle_trim,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    }

    // Nunca imprimir "VEHÍCULO". Si falta, E&R lo solicita y lo registra.
    if (!rawVehicleLabel) {
      const enteredVehicle = window.prompt(
        "Este expediente no tiene el vehículo registrado.\n\nIngresá el vehículo y línea antes de imprimir la carátula:\nEjemplo: TOYOTA YARIS"
      );

      if (enteredVehicle === null) return;

      rawVehicleLabel = String(enteredVehicle || "").trim().toUpperCase();

      if (!rawVehicleLabel) {
        window.alert(
          "Debés ingresar el vehículo y línea. No se imprimió la carátula."
        );
        return;
      }

      try {
        const table =
          source === "import" ? "import_managements" : "customs_cases";

        // Guardamos el texto completo en el campo de modelo/línea disponible.
        // Esto evita inventar una separación Marca / Línea cuando el usuario
        // ingresó un nombre comercial completo.
        const vehiclePayload =
          source === "import"
            ? {
                vehicle_model: rawVehicleLabel,
                updated_at: new Date().toISOString(),
                updated_by: session?.user?.id || user?.id || null,
              }
            : {
                vehicle_model: rawVehicleLabel,
                updated_at: new Date().toISOString(),
                updated_by: session?.user?.id || user?.id || null,
              };

        const { data, error: vehicleSaveError } = await supabase
          .from(table)
          .update(vehiclePayload)
          .eq("id", workingRecord.id)
          .select()
          .single();

        if (vehicleSaveError) throw vehicleSaveError;

        workingRecord = {
          ...workingRecord,
          ...data,
          vehicle_model: rawVehicleLabel,
        };

        if (source === "import") {
          setSelectedImportManagement(workingRecord);
          setImportManagementDetail(workingRecord);
          await loadImportManagements(importSearch);
        } else {
          setSelectedCustomsCase(workingRecord);
          setCustomsDetail(workingRecord);
          await loadCustomsCases(customsSearch);
        }
      } catch (err) {
        console.error("ENVELOPE VEHICLE SAVE ERROR:", err);
        window.alert(
          `No fue posible registrar el vehículo antes de imprimir.\n\n${err?.message || ""}`
        );
        return;
      }
    }

    const vehicleLabel = safe(rawVehicleLabel).toUpperCase();

    const vinValue = safe(cleanVin);
    const templateUrl =
      `${window.location.origin}/branding/formato-caratula-eyr.png`;

    const printWindow = window.open("", "_blank", "width=920,height=1180");

    if (!printWindow) {
      window.alert(
        "El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para E&R e intentá de nuevo."
      );
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Carátula · ${vinValue}</title>
  <style>
    *{box-sizing:border-box}
    html,body{
      margin:0;padding:0;background:#eef2f6;
      font-family:Arial,Helvetica,sans-serif;color:#143957
    }
    .toolbar{
      width:210mm;margin:16px auto 10px;
      display:flex;align-items:center;justify-content:space-between;gap:16px
    }
    .toolbar strong{display:block;font-size:18px}
    .toolbar small{display:block;margin-top:4px;color:#66798d}
    .toolbar button{
      border:0;border-radius:10px;background:#e7ad35;color:#082e52;
      padding:12px 18px;font-weight:900;cursor:pointer
    }
    .sheet{
      position:relative;width:210mm;height:297mm;margin:0 auto 24px;
      background:#fff url("${templateUrl}") center/100% 100% no-repeat;
      overflow:hidden;box-shadow:0 10px 40px rgba(9,34,58,.15)
    }
    .client{
      position:absolute;z-index:2;left:17mm;right:17mm;top:88mm;
      margin:0;text-align:center;text-transform:uppercase;
      color:#173a5c;font-size:12.5mm;line-height:1.05;font-weight:950;
      letter-spacing:.15mm
    }
    .vehicle-block{
      position:absolute;z-index:2;left:14mm;right:14mm;top:166mm;
      text-align:center;text-transform:uppercase;color:#f39a20
    }
    .vehicle{
      margin:0;font-size:8.5mm;line-height:1.05;font-weight:950
    }
    .vin{
      margin-top:4mm;font-size:8.2mm;line-height:1.05;
      font-weight:950;letter-spacing:.12mm
    }

    @page{size:A4 portrait;margin:0}
    @media print{
      html,body{background:#fff}
      .toolbar{display:none!important}
      .sheet{margin:0;box-shadow:none}
      body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <strong>Carátula E&amp;R · lista para imprimir</strong>
      <small>${clientName} · ${vinValue}</small>
    </div>
    <button onclick="window.print()">🖨️ Imprimir</button>
  </div>

  <main class="sheet">
    <h1 class="client">${clientName}</h1>
    <section class="vehicle-block">
      <h2 class="vehicle">${vehicleLabel}</h2>
      <div class="vin">VIN: ${vinValue}</div>
    </section>
  </main>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
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

  async function loadPortalClientsForManagement(managementId) {
    if (!managementId) {
      setPortalAssignmentClients([]);
      return [];
    }

    setPortalAssignmentLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "list_portal_clients_for_management_v3923",
        { p_management_id: managementId }
      );

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      setPortalAssignmentClients(rows);
      return rows;
    } catch (err) {
      console.error("PORTAL CLIENTS FOR MANAGEMENT ERROR:", err);
      setPortalAssignmentClients([]);
      setImportManagementsError(
        err?.message || "No fue posible cargar los clientes disponibles para el portal."
      );
      return [];
    } finally {
      setPortalAssignmentLoading(false);
    }
  }

  async function loadImportersForOperation(organizationId = null) {
    setOperationImportersLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "list_importers_for_operation_v393",
        {
          p_organization_id: organizationId || null,
        }
      );

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      setOperationImporters(rows);
      return rows;
    } catch (err) {
      console.error("OPERATION IMPORTERS ERROR:", err);
      setOperationImporters([]);
      return [];
    } finally {
      setOperationImportersLoading(false);
    }
  }

  async function openImportManagementDetail(item) {
    setSelectedImportManagement(item);
    setImportManagementDetail({ ...item });
    setImportManagementMessage("");
    setImportManagementsError("");
    await loadPortalClientsForManagement(item.id);
      await loadImportersForOperation(item.organization_id || null);
  }

  async function saveImportManagementDetail() {
    if (!importManagementDetail?.id) return;

    setImportManagementSaving(true);
    setImportManagementsError("");
    setImportManagementMessage("");

    try {

      const { error: importerAssignmentError } = await supabase.rpc(
        "assign_import_management_importer_v393",
        {
          p_management_id: importManagementDetail.id,
          p_importer_id: importManagementDetail.importer_id || null,
        }
      );

      if (importerAssignmentError) throw importerAssignmentError;

      const { data: portalAssignment, error: portalAssignmentError } = await supabase.rpc(
        "assign_import_management_portal_client_v3923",
        {
          p_management_id: importManagementDetail.id,
          p_portal_client_id: importManagementDetail.office_portal_client_id || null,
        }
      );

      if (portalAssignmentError) throw portalAssignmentError;

      const { data, error } = await supabase
        .from("import_managements")
        .update({
          status: importManagementDetail.status,
          responsible: importManagementDetail.responsible || null,
          pickup_location: importManagementDetail.pickup_location || null,
          destination_port: importManagementDetail.destination_port || null,
          shipping_line: importManagementDetail.shipping_line || null,
          container_number: importManagementDetail.container_number || null,
          vin: importManagementDetail.vin || null,
          vehicle_model: importManagementDetail.vehicle_model || null,
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

  async function loadPortalCustomsRequests() {
    setPortalCustomsRequestsLoading(true);
    setPortalCustomsRequestError("");

    try {
      const {data,error} = await supabase.rpc(
        "list_portal_customs_requests_v39621",
        { p_status: "PENDING" }
      );

      if (error) throw error;
      setPortalCustomsRequests(Array.isArray(data) ? data : []);
    } catch(err) {
      console.error("PORTAL CUSTOMS REQUESTS ERROR:", err);
      setPortalCustomsRequests([]);
      setPortalCustomsRequestError(
        err?.message || "No fue posible cargar solicitudes del Portal."
      );
    } finally {
      setPortalCustomsRequestsLoading(false);
    }
  }

  function openPortalCustomsRequest(request) {
    setCustomsDecodeResult(null);
    setCustomsError("");
    setCustomsMessage("");

    setCustomsForm({
      ...emptyCustomsForm(),
      notice_date: new Date().toISOString().slice(0,10),
      client_name:
        request.company_name ||
        request.contact_name ||
        "Cliente del Portal",
      phone: request.client_phone || "",
      email: request.client_email || "",
      bl: request.bl || "",
      container_number: request.container_number || "",
      vin: request.vin || "",
      make: request.vehicle_make || "",
      model: request.vehicle_model || "",
      model_year: request.vehicle_year || "",
      shipping_line: request.shipping_line || "",
      portal_request_id: request.id,
      portal_client_id: request.office_portal_client_id,
      portal_request_code: request.request_code || "",
      portal_release_confirmed: Boolean(request.shipping_line_release_confirmed),
      portal_request_notes: request.notes || "",
    });

    setShowCustomsForm(true);
  }

  useEffect(() => {
    if (activeView === "customs") {
      loadPortalCustomsRequests();
    }
  }, [activeView]);

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

    // En una gestión ingresada manualmente el VIN es opcional.
    // Si existe, lo guardamos; si no, el expediente puede continuar
    // sin cálculo automático de SAT / IVA / IPRIMA.
    const cleanManualVin = String(customsForm.vin || "")
      .trim()
      .toUpperCase();

    if (cleanManualVin && cleanManualVin.length !== 17) {
      setCustomsError(
        "El VIN es opcional, pero si lo ingresás debe contener 17 caracteres."
      );
      return;
    }

    setCustomsSaving(true);
    setCustomsError("");
    setCustomsMessage("");

    try {
      // V37.3 · detector preventivo de expedientes duplicados.
      const cleanManualBl = String(customsForm.bl || "")
        .trim()
        .toUpperCase();
      const cleanManualContainer = String(customsForm.container_number || "")
        .trim()
        .toUpperCase();

      if (cleanManualVin || cleanManualBl || cleanManualContainer) {
        const { data: duplicateRows, error: duplicateError } =
          await supabase.rpc("check_customs_case_duplicates", {
            p_vin: cleanManualVin || null,
            p_bl: cleanManualBl || null,
            p_container_number: cleanManualContainer || null,
          });

        if (duplicateError) throw duplicateError;

        if ((duplicateRows || []).length > 0) {
          const duplicateText = duplicateRows
            .slice(0, 5)
            .map(
              (item) =>
                `${item.case_code} · ${item.client_name} · ${item.match_reason}`
            )
            .join("\n");

          const continueAnyway = window.confirm(
            `⚠️ POSIBLE GESTIÓN DUPLICADA\n\n${duplicateText}\n\n` +
              `Si es la misma gestión, presioná CANCELAR y revisá el expediente existente.\n\n` +
              `¿Crear una gestión nueva de todos modos?`
          );

          if (!continueAnyway) {
            setCustomsError(
              `No se creó la gestión. Revisá el expediente ${duplicateRows[0].case_code} antes de continuar.`
            );
            return;
          }
        }
      }

      const { data: resolvedClientRows, error: clientResolveError } =
        await supabase.rpc("resolve_customer_for_work", {
          p_client_id: customsForm.client_id || null,
          p_name: String(customsForm.client_name || "").trim(),
          p_phone: String(customsForm.phone || "").trim() || null,
          p_email:
            String(customsForm.email || "").trim().toLowerCase() || null,
          p_nit: null,
        });

      if (clientResolveError) throw clientResolveError;

      const resolvedClient = Array.isArray(resolvedClientRows)
        ? resolvedClientRows[0]
        : resolvedClientRows;

      const payload = {
        source_type: "CUSTOMS_ONLY",
        client_id: resolvedClient?.id || null,
        notice_date:
          customsForm.notice_date || new Date().toISOString().slice(0, 10),
        client_name:
          resolvedClient?.name ||
          String(customsForm.client_name || "").trim(),
        phone:
          String(customsForm.phone || "").trim() ||
          resolvedClient?.phone ||
          null,
        email:
          String(customsForm.email || "").trim().toLowerCase() ||
          resolvedClient?.email ||
          null,
        bl: cleanManualBl || null,
        container_number: cleanManualContainer || null,
        vin: cleanManualVin || null,
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

        created_by: session?.user?.id || null,
      };

      const { data, error: insertError } =
        await supabase
          .from("customs_cases")
          .insert(payload)
          .select()
          .single();

      if (insertError) throw insertError;

      // V39.6.21 · Si nació desde el Portal, vincular automáticamente al cliente
      // y cerrar la solicitud únicamente después de crear el expediente real.
      if (customsForm.portal_request_id) {
        if (customsForm.portal_client_id) {
          const { error: portalLinkError } = await supabase.rpc(
            "assign_customs_case_portal_client_v3924",
            {
              p_customs_case_id: data.id,
              p_portal_client_id: customsForm.portal_client_id,
            }
          );
          if (portalLinkError) throw portalLinkError;
        }

        const { error: requestConvertError } = await supabase.rpc(
          "mark_portal_customs_request_converted_v39621",
          {
            p_request_id: customsForm.portal_request_id,
            p_customs_case_id: data.id,
          }
        );
        if (requestConvertError) throw requestConvertError;
      }

      setShowCustomsForm(false);
      setCustomsForm(emptyCustomsForm());
      setCustomsDecodeResult(null);
      setCustomsMessage(
        `Expediente ${data.case_code} creado correctamente.`
      );

      await loadCustomsCases("");
      if (customsForm.portal_request_id) await loadPortalCustomsRequests();
    } catch (err) {
      console.error("CUSTOMS CASE SAVE ERROR:", err);
      setCustomsError(
        err?.message || "No fue posible crear el expediente aduanal."
      );
    } finally {
      setCustomsSaving(false);
    }
  }

  async function loadPortalClientsForCustomsCase(customsCaseId) {
    if (!customsCaseId) {
      setCustomsPortalAssignmentClients([]);
      return [];
    }

    setCustomsPortalAssignmentLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "list_portal_clients_for_customs_case_v3924",
        { p_customs_case_id: customsCaseId }
      );

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      setCustomsPortalAssignmentClients(rows);
      return rows;
    } catch (err) {
      console.error("CUSTOMS PORTAL CLIENTS ERROR:", err);
      setCustomsPortalAssignmentClients([]);
      setCustomsError(
        err?.message || "No fue posible cargar los clientes disponibles para el portal."
      );
      return [];
    } finally {
      setCustomsPortalAssignmentLoading(false);
    }
  }

  async function loadCustomsPortalCandidate(customsCaseId) {
    setCustomsPortalCandidateLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "customs_case_portal_candidate_v3951",
        { p_customs_case_id: customsCaseId }
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setCustomsPortalCandidate(row || null);
      return row || null;
    } catch (err) {
      console.error("CUSTOMS PORTAL CANDIDATE ERROR:", err);
      setCustomsPortalCandidate(null);
      return null;
    } finally {
      setCustomsPortalCandidateLoading(false);
    }
  }

async function openCustomsDetail(item) {
    setSelectedCustomsCase(item);
    setCustomsDetail({ ...item });
    setCustomsMessage("");
    setCustomsError("");
      await loadPortalClientsForCustomsCase(item.id);
      await loadImportersForOperation(item.organization_id || null);
      await loadCustomsPortalCandidate(item.id);
  }

  async function saveCustomsDetail() {
    if (!customsDetail?.id) return;

    setCustomsDetailSaving(true);
    setCustomsError("");
    setCustomsMessage("");

    try {

      const { error: customsImporterAssignmentError } = await supabase.rpc(
        "assign_customs_case_importer_v393",
        {
          p_customs_case_id: customsDetail.id,
          p_importer_id: customsDetail.importer_id || null,
        }
      );

      if (customsImporterAssignmentError) throw customsImporterAssignmentError;


      const { error: customsPortalAssignmentError } = await supabase.rpc(
        "assign_customs_case_portal_client_v3924",
        {
          p_customs_case_id: customsDetail.id,
          p_portal_client_id:
            customsDetail.office_portal_client_id || null,
        }
      );

      if (customsPortalAssignmentError) {
        throw customsPortalAssignmentError;
      }

      const allowedKeys = [
        "client_name", "phone", "email", "vin", "bl", "container_number",
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

      updatePayload.updated_by = session?.user?.id || null;
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
      setProspectPage(1);
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
      const data = await ejecutarDecode(
        String(query.vin).trim().toUpperCase(),
        true,
        {
          calculation_method: query.calculation_method || "SAT",
          invoice_value_usd: query.invoice_value_usd || null,
        }
      );

      const ready =
        data?.calculation_status === "READY" ||
        data?.summary?.calculation_status === "READY";

      if (!ready) {
        throw new Error(
          "Este vehículo todavía requiere revisión antes de preparar la cotización comercial."
        );
      }

      const prospectSnapshot = selectedProspect
        ? { ...selectedProspect }
        : {
            full_name: query.full_name || "Cliente",
            phone: query.phone || "",
            contact_key: query.contact_key || "",
          };

      setCommercialQuoteContext({
  query: { ...query },
  prospect: prospectSnapshot,
  result: data,

  quoteCode: makeQuoteCode(query.vin),

  isWhiteLabelClient,

  officeName:
    tenantBranding?.office_name ||
    tenantOrganization?.name ||
    tenantBrandName ||
    "",

  quotePrefix:
    tenantBranding?.quote_prefix ||
    tenantOrganization?.quote_prefix ||
    "",
});

      setSelectedProspect(null);
      setActiveView("commercial-quote");
    } catch (err) {
      console.error("PROSPECT COMMERCIAL QUOTE ERROR:", err);
      setProspectsError(
        err?.message || "No fue posible preparar la cotización comercial."
      );
    } finally {
      setProspectQuoteLoadingId(null);
    }
  }

  async function downloadQuoteAndOpenWhatsApp() {
    if (!quoteRef.current) return;

    try {
      setQuoteGenerating(true);
      const savedQuotation = await saveCurrentQuotation();

      await waitForQuoteImages(quoteRef.current);

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

  async function loadSubscriptions(search = subscriptionSearch) {
    setSubscriptionLoading(true);
    setSubscriptionError("");
    setSubscriptionMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_list_subscriptions",
        {
          p_search: String(search || "").trim() || null,
        }
      );

      if (error) throw error;

      setSubscriptionUsers(data || []);
    } catch (err) {
      console.error("SUBSCRIPTIONS LOAD ERROR:", err);
      setSubscriptionError(
        err?.message || "No fue posible cargar los usuarios y suscripciones."
      );
    } finally {
      setSubscriptionLoading(false);
    }
  }

  function openSubscriptionsView() {
    setActiveView("subscriptions");
    setSubscriptionSearch("");
    setSubscriptionError("");
    setSubscriptionMessage("");
    loadSubscriptions("");
  }

  async function manageSubscription(userId, action, months = 1) {
    if (!userId || !action) return;

    setSubscriptionActionUserId(userId);
    setSubscriptionError("");
    setSubscriptionMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "admin_manage_subscription",
        {
          p_user_id: userId,
          p_action: action,
          p_months: months,
        }
      );

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;

      const actionLabels = {
        ACTIVATE: "Suscripción activada",
        RENEW: "Suscripción renovada",
        SUSPEND: "Suscripción suspendida",
        RESUME: "Suscripción reactivada",
        CANCEL: "Suscripción cancelada",
        ENABLE_ACCOUNT: "Cuenta habilitada",
        DISABLE_ACCOUNT: "Cuenta deshabilitada",
      };

      setSubscriptionMessage(
        `${actionLabels[action] || "Suscripción actualizada"}${
          row?.full_name ? ` para ${row.full_name}` : ""
        }.`
      );

      await loadSubscriptions(subscriptionSearch);
    } catch (err) {
      console.error("SUBSCRIPTION ACTION ERROR:", err);
      setSubscriptionError(
        err?.message || "No fue posible actualizar la suscripción."
      );
    } finally {
      setSubscriptionActionUserId(null);
    }
  }

  async function loadQuotations(
    search = quotationSearch,
    ownerUserId = quotationOwnerFilter
  ) {
    setQuotationLoading(true);
    setQuotationError("");

    try {
      const { data, error: functionError } = await invokeFunction("quotation-manager", {
        body: {
          action: "list",
          search: String(search || "").trim(),
          owner_user_id: String(ownerUserId || "").trim() || null,
          limit: 100,
        },
      });

      if (functionError) throw functionError;
      if (!data?.success) {
        throw new Error(data?.error || "No fue posible cargar las cotizaciones.");
      }

      setQuotations(data.quotations || []);
      setQuotationUsers(data.user_summary || []);
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
    setQuotationOwnerFilter("");
    loadQuotations("", "");
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

      await waitForQuoteImages(quoteRef.current);

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
  const quoteGrandTotalGtq =
    quoteGrandTotalUsd !== null && quoteExchangeRate > 0
      ? quoteGrandTotalUsd * quoteExchangeRate
      : null;
  const canGenerateQuote =
    !result?.manual_calculation &&
    (
      result?.calculation_status === "READY" ||
      summary?.calculation_status === "READY"
    );

  /*
   * V13: revisión SAT compatible + resolución excepcional.
   * Si V13 indica no_compatible_match, no permitimos aprobar
   * candidatos contradictorios y abrimos el flujo excepcional.
   */
  /*
   * V34.3 · SAT REVIEW YEAR GUARD
   *
   * La tabla SAT puede traer simultáneamente:
   * - una columna específica para el año del VIN; y
   * - "resto de años".
   *
   * Si ya existe valor específico para el año del vehículo,
   * "resto de años" NO debe competir como candidato.
   */
  const vinModelYear = Number(vehicle?.model_year || vehicle?.year || 0);

  function normalizeSatYear(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 1900 ? parsed : null;
  }

  function applySatYearGuard(options = []) {
    const usable = (options || []).filter(Boolean);

    if (!usable.length || !vinModelYear) return usable;

    const exactYear = usable.filter(
      (option) => normalizeSatYear(option.model_year) === vinModelYear
    );

    // Regla principal: si SAT tiene el año exacto, descartamos resto de años
    // y cualquier otro año ANTES de mostrar SAT Review.
    let pool = exactYear.length > 0
      ? exactYear
      : usable.filter((option) => normalizeSatYear(option.model_year) === null);

    // Si ni año exacto ni "resto de años" existen, conservamos los candidatos
    // recibidos para no dejar la revisión sin opciones.
    if (!pool.length) pool = usable;

    // Deduplicación: misma línea/configuración/año no debe aparecer dos veces
    // solamente porque el backend entregó registros repetidos.
    const bestByKey = new Map();

    for (const option of pool) {
      const key = [
        String(option.line || "").trim().toUpperCase(),
        String(option.vehicle_type || "").trim().toUpperCase(),
        String(option.engine_cc || ""),
        String(option.fuel_type || "").trim().toUpperCase(),
        String(option.cylinders || ""),
        String(option.doors || ""),
        String(normalizeSatYear(option.model_year) ?? "REST"),
      ].join("|");

      const current = bestByKey.get(key);
      const optionScore = Number(option.match_score ?? -1);
      const currentScore = Number(current?.match_score ?? -1);

      if (!current || optionScore > currentScore) {
        bestByKey.set(key, option);
      }
    }

    return Array.from(bestByKey.values());
  }

  const safeReviewOptions = applySatYearGuard(
    (sat?.review_options || []).filter(
      (option) => option.selectable !== false && !option.has_conflict
    )
  );

  const guardedAmbiguousOptions = applySatYearGuard(
    sat?.ambiguous_options || []
  );

  const guardedCandidates = applySatYearGuard(
    (sat?.candidates || []).filter((candidate) => !candidate.has_conflict)
  );

  const satReviewOptions =
    guardedAmbiguousOptions.length > 0
      ? guardedAmbiguousOptions
      : safeReviewOptions.length > 0
        ? safeReviewOptions
        : sat?.requires_review
          ? guardedCandidates.slice(0, 6)
          : [];

  const blockedSatOptions = (sat?.review_options || [])
    .filter((option) => option.selectable === false || option.has_conflict)
    .slice(0, 6);

  const dimensionReviewOptions = result?.freight_requires_review
    ? result?.freight_options || []
    : [];

  const resolvedCalculationMethod = String(
    result?.calculation_method ||
    summary?.calculation_method ||
    internalQuoteMode ||
    "SAT"
  ).toUpperCase();

  const isImporterCalculation =
    resolvedCalculationMethod === "IMPORTER";

  const isManualCalculation =
    resolvedCalculationMethod === "MANUAL" ||
    result?.manual_calculation === true;

  // V37.4.1 · En IMPORTER la Tabla SAT no define la base imponible.
  // El VIN se conserva para identificación/dimensiones/flete.
  const needsSatSelectableReview =
    !isImporterCalculation &&
    !isManualCalculation &&
    Boolean(sat?.requires_review) &&
    !sat?.no_compatible_match &&
    satReviewOptions.length > 0;

  const needsSatExceptionalReview =
    !isImporterCalculation &&
    !isManualCalculation &&
    Boolean(sat?.requires_review) &&
    Boolean(sat?.no_compatible_match);

  const needsTaxClassificationReview =
    result?.code === "TAX_CLASSIFICATION_REVIEW" &&
    Boolean(result?.tax_classification_review?.raw_vehicle_type) &&
    (result?.tax_classification_review?.options || []).length > 0;

  const needsDimensionReview =
    Boolean(result?.freight_requires_review) &&
    dimensionReviewOptions.length > 0;

  const needsMissingDimensionReview =
    Boolean(result?.freight_requires_review) &&
    dimensionReviewOptions.length === 0;

  const dimensionSearchAttempts = result?.dimension_search_attempts || [];
  const isExceptionalResolved = summary?.sat_exceptional_resolution === true;

  const internalRole = String(profile?.role || "").toUpperCase();
  const internalJobTitle = String(profile?.job_title || "").toUpperCase();
  const isSystemAdmin = internalRole === "ADMIN";
  const tenantMembershipRole = String(tenantContext?.membership?.member_role || "").toUpperCase();
  const isTenantMember = Boolean(tenantContext?.membership?.active);
  const isTenantAdmin = ["OWNER", "ADMIN"].includes(tenantMembershipRole);
  const isWhiteLabelClient = isTenantMember && !["ADMIN", "OPERADOR"].includes(internalRole);
  const tenantOrganization = tenantContext?.organization || null;
  const tenantBranding = tenantContext?.branding || null;
  const tenantBrandName = tenantBranding?.office_name || tenantOrganization?.name || "E&R VEHICLE IMPORT";
  const tenantTagline = tenantBranding?.tagline || (isWhiteLabelClient ? "COTIZADOR VEHICULAR" : "GLOBAL LOGISTIC");
  const tenantLogoUrl = tenantBranding?.logo_url || (isWhiteLabelClient ? "" : "/branding/eyr-logo-horizontal.png");

  // V38.2 · Permisos por plan SaaS
  const tenantPlanCode = String(tenantOrganization?.plan_code || "").toUpperCase();
  const isFullOfficePlan = tenantPlanCode === "FULL_OFFICE";
  const isImporterPlan = ["IMPORTER", "IMPORTER_PRO", "FULL_OFFICE"].includes(tenantPlanCode);
  const canUseOfficeOperations = !isWhiteLabelClient || isFullOfficePlan;
  const canUseTenantImports = !isWhiteLabelClient || isImporterPlan;
  const canUseTenantDuca =
    isSystemAdmin || (isWhiteLabelClient && isFullOfficePlan && isTenantAdmin);
  const canUseTenantFinance =
    isSystemAdmin ||
    (isWhiteLabelClient && isFullOfficePlan &&
      (isTenantAdmin || internalJobTitle === "FINANZAS"));

  const canManageOfficeUsers =
    isWhiteLabelClient &&
    isFullOfficePlan &&
    isTenantAdmin;

  const canManageImporters =
    isSystemAdmin ||
    (isWhiteLabelClient && isFullOfficePlan && isTenantAdmin);

  const canManagePortalClients =
    isSystemAdmin ||
    (isWhiteLabelClient && isFullOfficePlan && isTenantAdmin);
  const tenantEyebrow = isWhiteLabelClient
    ? tenantBrandName.toUpperCase()
    : "E&R GLOBAL LOGISTIC";
  const internalRoleLabel =
    isSystemAdmin
      ? "ADMIN"
      : internalJobTitle === "DIGITADOR"
        ? "DIGITADOR"
        : isWhiteLabelClient
          ? `OFICINA · ${tenantMembershipRole || "USUARIO"}`
          : internalRole;
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
    (["ADMIN", "OPERADOR"].includes(internalRole) || isTenantMember);

  const isAnonymousCustomer = Boolean(session?.user?.is_anonymous);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--tenant-primary", tenantBranding?.primary_color || "#0A3458");
    root.style.setProperty("--tenant-secondary", tenantBranding?.secondary_color || "#E8A72D");
    root.style.setProperty("--tenant-accent", tenantBranding?.accent_color || "#F5D87F");
  }, [tenantBranding?.primary_color, tenantBranding?.secondary_color, tenantBranding?.accent_color]);


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
    const publicCalculationMode =
      publicResult?.calculation_method ||
      publicSummary?.calculation_method ||
      publicQuoteMode;
    const publicImporterMode = publicCalculationMode === "IMPORTER";
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

📌 MÉTODO DE CÁLCULO
${publicImporterMode ? "FACTURA DE IMPORTADOR" : "TABLA SAT"}
${publicImporterMode ? `Valor factura: ${moneyUSD(publicResult?.invoice_value_usd || publicInvoiceValueUsd)}` : `Línea SAT: ${publicSummary?.sat_line || publicResult?.sat?.selected_match?.line || "—"}`}
Tipo SAT: ${publicTaxes?.vehicle_type || publicResult?.sat?.selected_match?.vehicle_type || "—"}

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
                    <span className="public-kicker">
                      {publicQuoteMode === "IMPORTER"
                        ? "COTIZADOR PARA IMPORTADORES"
                        : "CONSULTA INTELIGENTE"}
                    </span>
                    <h2>
                      {publicQuoteMode === "IMPORTER"
                        ? "VIN + factura. Nosotros hacemos el resto."
                        : "¿Qué vehículo querés cotizar?"}
                    </h2>
                    <p>
                      {publicQuoteMode === "IMPORTER"
                        ? "Usamos el valor real de tu factura como base para IVA e IPRIMA y calculamos el flete por tamaño."
                        : "Ingresá el VIN y E&R hará el análisis automáticamente."}
                    </p>
                  </div>
                  <QuoteModeTabs
                    mode={publicQuoteMode}
                    disabled={publicLoading}
                    onChange={(nextMode) => {
                      setPublicQuoteMode(nextMode);
                      setPublicResult(null);
                      setPublicError("");
                      if (nextMode === "SAT") {
                        setPublicInvoiceValueUsd("");
                      }
                    }}
                  />

                  {publicQuoteMode === "IMPORTER" && (
                    <ImporterQuoteFields
                      invoiceValue={publicInvoiceValueUsd}
                      onInvoiceChange={setPublicInvoiceValueUsd}
                      disabled={publicLoading}
                    />
                  )}

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
                            if (
                              e.key === "Enter" &&
                              publicVin.length === 17 &&
                              !publicLoading &&
                              (
                                publicQuoteMode !== "IMPORTER" ||
                                Number(publicInvoiceValueUsd) > 0
                              )
                            ) {
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
                      disabled={
                        publicVin.length !== 17 ||
                        publicLoading ||
                        !publicCanQuote ||
                        (publicQuoteMode === "IMPORTER" &&
                          Number(publicInvoiceValueUsd) <= 0)
                      }
                    >
                      {publicLoading
                        ? "Analizando..."
                        : publicQuoteMode === "IMPORTER"
                          ? "Calcular con factura"
                          : "Consultar vehículo"}{" "}
                      <span>→</span>
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
                        <div className="public-ready-tags">
                          <b>READY</b>
                          <em>
                            {publicImporterMode
                              ? "FACTURA IMPORTADOR"
                              : "TABLA SAT"}
                          </em>
                        </div>
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
                          {publicImporterMode ? "IMPORTADOR" : "TIPO SAT"} ·{" "}
                          {publicTaxes?.vehicle_type ||
                            publicResult?.sat?.selected_match?.vehicle_type ||
                            "NO ESPECIFICADO"}
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

                        <div className={`public-tax-basis ${publicImporterMode ? "invoice" : "sat"}`}>
                          <span>Base de cálculo</span>
                          <strong>
                            {publicImporterMode
                              ? `Factura · ${moneyUSD(
                                  publicResult?.invoice_value_usd ||
                                  publicInvoiceValueUsd
                                )}`
                              : "Tabla SAT"}
                          </strong>
                        </div>

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
                      publicImporterMode ? (
                        <ImporterCustomsServiceRequest
                          result={publicResult}
                          invokeFunction={invokeFunction}
                          onCreated={(customsCase) => {
                            setPublicResult((previous) => ({
                              ...previous,
                              customs_service_request: customsCase,
                            }));
                          }}
                        />
                      ) : (
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
                      )
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

  const loginIsWhiteLabel = Boolean(loginOfficeSlugFromLocation());
  const loginBrandName =
    publicLoginBranding?.office_name ||
    publicLoginBranding?.organization_name ||
    "Tu oficina";
  const loginTagline = publicLoginBranding?.tagline || "Gestión aduanal inteligente";
  const loginLogoUrl = loginIsWhiteLabel
    ? String(publicLoginBranding?.logo_url || "")
    : eyrSolutionsLogo;
  const loginPrimary = loginIsWhiteLabel
    ? publicLoginBranding?.primary_color || "#0A3458"
    : "#0A3458";
  const loginSecondary = loginIsWhiteLabel
    ? publicLoginBranding?.secondary_color || "#E8A72D"
    : "#E8A72D";

  if (authLoading || (siteMode === "internal" && loginIsWhiteLabel && publicLoginBrandingLoading)) {
    return (
      <div className="auth-shell">
        <div className="auth-loading-card">
          <img
            className="auth-loading-logo"
            src={loginLogoUrl || eyrSolutionsLogo}
            alt={loginIsWhiteLabel ? loginBrandName : "E&R Solutions Agencia Aduanal"}
          />
          <div className="auth-spinner"></div>
          <h2>Validando acceso</h2>
          <p>{loginIsWhiteLabel ? `Conectando con ${loginBrandName}...` : "Conectando con E&R Solutions..."}</p>
        </div>
      </div>
    );
  }

  if (!hasInternalAccess) {
    return (
      <div
        className={`auth-shell ${loginIsWhiteLabel ? "tenant-login-v383" : "eyr-login-v383"}`}
        style={{
          "--login-primary": loginPrimary,
          "--login-secondary": loginSecondary,
        }}
      >
        <div className="auth-layout">
          <section className="auth-visual">
            <div className="auth-visual-overlay"></div>
            <div className="auth-visual-content">
              <div className={`auth-logo-lockup auth-logo-lockup-v35 ${loginIsWhiteLabel ? "tenant-auth-logo-v383" : ""}`}>
                {loginLogoUrl ? (
                  <img
                    src={loginLogoUrl}
                    alt={loginIsWhiteLabel ? loginBrandName : "E&R Solutions Agencia Aduanal"}
                  />
                ) : (
                  <div className="tenant-auth-wordmark-v383">
                    <span>{loginBrandName.charAt(0).toUpperCase()}</span>
                    <strong>{loginBrandName}</strong>
                  </div>
                )}
              </div>
              <div className="auth-copy">
                <span className="auth-eyebrow">{loginIsWhiteLabel ? "PLATAFORMA DE TU OFICINA" : "PLATAFORMA INTERNA"}</span>
                <h1>{loginIsWhiteLabel ? "Tu operación aduanal, en un solo lugar." : "Control inteligente para cada importación."}</h1>
                <p>
                  {loginIsWhiteLabel
                    ? loginTagline
                    : "VIN, SAT, impuestos, flete, revisiones y cotizaciones en un solo lugar."}
                </p>
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
              <h2>{loginIsWhiteLabel ? `Bienvenido a ${loginBrandName}` : "Bienvenido a E&R"}</h2>
              <p className="auth-subtitle">Ingresá con tu cuenta autorizada para continuar.</p>

              <form className="auth-form" onSubmit={handleLogin}>
                <label>
                  <span>Correo electrónico</span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder={loginIsWhiteLabel ? "usuario@tuoficina.com" : "usuario@eyr.com"}
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

              {publicLoginBrandingError && loginIsWhiteLabel && (
                <div className="auth-error">
                  <strong>Enlace de oficina no disponible</strong>
                  <span>{publicLoginBrandingError}</span>
                </div>
              )}

              <div className="auth-security-note">
                <span>🔐</span>
                <p>
                  <strong>Acceso seguro</strong>
                  {loginIsWhiteLabel
                    ? `Usuarios autorizados de ${loginBrandName}.`
                    : "Usuarios E&R y oficinas autorizadas."}
                </p>
              </div>

              {loginIsWhiteLabel && (
                <div className="auth-powered-v383">
                  Tecnología respaldada por <strong>E&amp;R Solutions</strong>
                </div>
              )}

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
        <div className="brand brand-v35 brand-full-logo">
          {tenantLogoUrl ? (
            <img
              src={tenantLogoUrl}
              alt={tenantBrandName}
              className="brand-full-logo-image tenant-sidebar-logo"
            />
          ) : (
            <div className="tenant-sidebar-wordmark">
              <strong>{tenantBrandName}</strong>
              <span>{tenantTagline}</span>
            </div>
          )}
        </div>

        <AdminNotificationBell
          supabase={supabase}
          userId={session?.user?.id || null}
        />

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

          {(isSystemAdmin || isTenantAdmin) && (
            <button
              className={`nav-item ${activeView === "branding" ? "active" : ""}`}
              onClick={() => setActiveView("branding")}
            >
              <span>🎨</span>
              Mi Marca
            </button>
          )}

          {isSystemAdmin && (
            <button
              className={`nav-item ${activeView === "organizations" ? "active" : ""}`}
              onClick={openOrganizationsView}
            >
              <span>🏢</span>
              Oficinas / Clientes
            </button>
          )}

          {isSystemAdmin && (
            <button
              className={`nav-item ${activeView === "subscriptions" ? "active" : ""}`}
              onClick={openSubscriptionsView}
            >
              <span>♙</span>
              Usuarios y Suscripciones
            </button>
          )}

          {isSystemAdmin && (
            <button
              className={`nav-item ${activeView === "internal-users" ? "active" : ""}`}
              onClick={() => setActiveView("internal-users")}
            >
              <span>♟</span>
              Usuarios Internos
            </button>
          )}

          {canManageOfficeUsers && (
            <button
              className={`nav-item ${activeView === "office-users" ? "active" : ""}`}
              onClick={() => setActiveView("office-users")}
            >
              <span>👥</span>
              Usuarios de Oficina
            </button>
          )}

          {canManagePortalClients && (
            <button
              className={`nav-item ${activeView === "portal-clients" ? "active" : ""}`}
              onClick={() => setActiveView("portal-clients")}
            >
              <span>👥</span>
              Clientes del Portal
            </button>
          )}

          {canManageImporters && (
            <button
              className={`nav-item ${activeView === "importers" ? "active" : ""}`}
              onClick={() => setActiveView("importers")}
            >
              <span>🚢</span>
              Importadores
            </button>
          )}

          {!isWhiteLabelClient && (
          <button
            className={`nav-item ${activeView === "prospects" ? "active" : ""}`}
            onClick={openProspectsView}
          >
            <span>◎</span>
            Prospectos
          </button>
          )}

          {canUseTenantImports && (
          <button
            className={`nav-item ${activeView === "imports" ? "active" : ""}`}
            onClick={openImportManagementsView}
          >
            <span>🚢</span>
            Gestiones de Importación
          </button>
          )}

          {canUseOfficeOperations && (
          <button
            className={`nav-item ${activeView === "customs" ? "active" : ""}`}
            onClick={openCustomsView}
          >
            <span>▣</span>
            Control Aduanal
          </button>
          )}

          {canUseOfficeOperations && (
          <button
            className={`nav-item ${activeView === "declarations" ? "active" : ""}`}
            onClick={() => setActiveView("declarations")}
          >
            <span>📄</span>
            Declaraciones
          </button>
          )}

          {canUseTenantDuca && (
            <button
              className={`nav-item ${activeView === "correlatives" ? "active" : ""}`}
              onClick={() => setActiveView("correlatives")}
            >
              <span>📑</span>
              Correlativos DUCA
            </button>
          )}

          {canUseOfficeOperations && (
            <button className="nav-item">
              <span>⚠</span>
              Revisiones
            </button>
          )}

          {canUseTenantFinance && (
            <button
              className={`nav-item ${activeView === "finance" ? "active" : ""}`}
              onClick={() => setActiveView("finance")}
            >
              <span>💰</span>
              Finanzas
            </button>
          )}

          {isSystemAdmin && (
            <button
              className={`nav-item ${activeView === "admin-center" ? "active" : ""}`}
              onClick={() => setActiveView("admin-center")}
            >
              <span>🛠</span>
              Administración
            </button>
          )}

          {isSystemAdmin && (
            <button
              className={`nav-item ${activeView === "settings" ? "active" : ""}`}
              onClick={openSettingsView}
            >
              <span>⚙</span>
              Configuración
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-avatar">
              {(profile?.full_name || profile?.email || "E").charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-copy">
              <strong>{profile?.full_name || "Usuario E&R"}</strong>
              <span>{profile?.email}</span>
              <small>{internalRoleLabel}</small>
            </div>
          </div>

          <button className="sidebar-logout" onClick={handleLogout}>
            <span>↪</span> Cerrar sesión
          </button>

          <div className="system-status">
            <span className="status-dot"></span>
            Sistema operativo
          </div>

          <small>{isWhiteLabelClient ? `${tenantBrandName} · Powered by E&R` : "E&R Solutions · Vehicle Import"}</small>
        </div>
      </aside>

      <main className="main">
        {activeView === "commercial-quote" && isSystemAdmin && commercialQuoteContext ? (
          <CommercialQuotePage
            supabase={supabase}
            context={commercialQuoteContext}
            logo={eyrSolutionsLogo}
            buildWhatsAppUrl={buildWhatsAppUrl}
            onBack={() => {
              const previousProspect = commercialQuoteContext?.prospect || null;
              setActiveView("prospects");
              setSelectedProspect(previousProspect);
              if (previousProspect?.contact_key) {
                loadProspectQueries(previousProspect.contact_key);
              }
              loadProspects(prospectSearch);
            }}
            onFinalized={async () => {
              if (commercialQuoteContext?.query?.contact_key) {
                await loadProspectQueries(commercialQuoteContext.query.contact_key);
              }
            }}
          />
        ) : activeView === "admin-center" && isSystemAdmin ? (
          <AdminCenterPage supabase={supabase} />
        ) : activeView === "portal-clients" && canManagePortalClients ? (
          <OfficePortalClientsPage
            supabase={supabase}
            invokeFunction={invokeFunction}
            officeName={tenantBrandName}
            officeSlug={tenantOrganization?.slug || ""}
            isSystemAdmin={isSystemAdmin}
          />
        ) : activeView === "importers" && canManageImporters ? (
          <ImportersPage
            supabase={supabase}
            isSystemAdmin={isSystemAdmin}
            canEdit={canManageImporters}
            tenantOrganizationId={tenantOrganization?.id || ""}
            tenantBrandName={tenantBrandName}
          />
        ) : activeView === "declarations" && canUseOfficeOperations ? (
          <DeclarationsPage
            supabase={supabase}
            isAdmin={isSystemAdmin || (isWhiteLabelClient && isFullOfficePlan && isTenantAdmin)}
          />
        ) : activeView === "correlatives" && canUseTenantDuca ? (
          <DucaCorrelativesPage supabase={supabase} />
        ) : activeView === "finance" && canUseTenantFinance ? (
          <FinanceDashboard
  supabase={supabase}
  officeName={tenantBrandName}
  isWhiteLabelClient={isWhiteLabelClient}
/>
        ) : activeView === "office-users" && canManageOfficeUsers ? (
          <OfficeUsersPage
            invokeFunction={invokeFunction}
            currentUserId={session?.user?.id || null}
            officeName={tenantBrandName}
          />
        ) : activeView === "internal-users" && isSystemAdmin ? (
          <InternalUsersPage
            invokeFunction={invokeFunction}
            currentUserId={session?.user?.id || null}
          />
        ) : activeView === "subscriptions" ? (
          <section className="subscriptions-module">
            <header className="topbar subscriptions-topbar">
              <div>
                <span className="eyebrow">ADMINISTRACIÓN DEL SISTEMA</span>
                <h1>Usuarios y Suscripciones</h1>
                <p>
                  Activación, renovaciones, vencimientos y control de acceso al cotizador.
                </p>
              </div>

              <button
                className="secondary-button"
                onClick={() => loadSubscriptions(subscriptionSearch)}
                disabled={subscriptionLoading}
              >
                ↻ Actualizar
              </button>
            </header>

            <section className="subscription-kpis">
              <article>
                <span>Usuarios</span>
                <strong>{subscriptionUsers.length}</strong>
              </article>
              <article className="active">
                <span>Suscripciones activas</span>
                <strong>
                  {subscriptionUsers.filter((item) => item.effective_status === "ACTIVE").length}
                </strong>
              </article>
              <article className="warning">
                <span>Vencen en 7 días</span>
                <strong>
                  {subscriptionUsers.filter((item) =>
                    item.effective_status === "ACTIVE" &&
                    item.days_remaining !== null &&
                    item.days_remaining >= 0 &&
                    item.days_remaining <= 7
                  ).length}
                </strong>
              </article>
              <article className="expired">
                <span>Vencidas / bloqueadas</span>
                <strong>
                  {subscriptionUsers.filter((item) =>
                    ["EXPIRED", "SUSPENDED", "CANCELLED"].includes(item.effective_status)
                  ).length}
                </strong>
              </article>
            </section>

            <section className="subscription-search-card">
              <div>
                <span className="section-label">CLIENTES DEL SISTEMA</span>
                <h2>Control de acceso</h2>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadSubscriptions(subscriptionSearch);
                }}
              >
                <input
                  value={subscriptionSearch}
                  onChange={(e) => setSubscriptionSearch(e.target.value)}
                  placeholder="Buscar nombre, correo o teléfono..."
                />
                <button type="submit" disabled={subscriptionLoading}>
                  {subscriptionLoading ? "Buscando..." : "Buscar"}
                </button>
                {subscriptionSearch && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSubscriptionSearch("");
                      loadSubscriptions("");
                    }}
                  >
                    Limpiar
                  </button>
                )}
              </form>
            </section>

            {subscriptionMessage && (
              <div className="customer-message success">{subscriptionMessage}</div>
            )}
            {subscriptionError && (
              <div className="customer-message error">{subscriptionError}</div>
            )}

            <section className="subscription-table-card">
              <div className="subscription-table-head">
                <div>
                  <span className="section-label">SUSCRIPCIONES</span>
                  <h2>
                    {subscriptionLoading
                      ? "Cargando..."
                      : `${subscriptionUsers.length} usuario${subscriptionUsers.length === 1 ? "" : "s"}`}
                  </h2>
                </div>
              </div>

              <div className="subscription-table-wrap">
                <table className="subscription-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Plan</th>
                      <th>Estado</th>
                      <th>Vigencia</th>
                      <th>Uso</th>
                      <th>Cuenta</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!subscriptionLoading && subscriptionUsers.length === 0 && (
                      <tr>
                        <td colSpan="7" className="empty-cell">
                          No hay usuarios que coincidan con la búsqueda.
                        </td>
                      </tr>
                    )}

                    {subscriptionUsers.map((item) => {
                      const busy = subscriptionActionUserId === item.user_id;
                      const status = String(item.effective_status || "FREE").toUpperCase();
                      const internal = ["ADMIN", "OPERADOR"].includes(
                        String(item.role || "").toUpperCase()
                      );

                      return (
                        <tr key={item.user_id}>
                          <td>
                            <div className="subscription-user">
                              <div className="subscription-avatar">
                                {(item.full_name || item.email || "U").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong>{item.full_name || "Sin nombre"}</strong>
                                <span>{item.email || "Sin correo"}</span>
                                <small>{item.phone || "Sin teléfono"} · {item.role}</small>
                              </div>
                            </div>
                          </td>

                          <td>
                            <strong>{internal ? "INTERNO" : item.subscription_plan || "FREE"}</strong>
                            {!internal && (
                              <small>
                                {item.subscription_started_at
                                  ? `Desde ${new Date(item.subscription_started_at).toLocaleDateString("es-GT")}`
                                  : "Sin suscripción"}
                              </small>
                            )}
                          </td>

                          <td>
                            <span className={`subscription-status ${status.toLowerCase()}`}>
                              {internal ? "INTERNO" : status}
                            </span>
                          </td>

                          <td>
                            {internal ? (
                              <strong>Sin vencimiento</strong>
                            ) : item.subscription_expires_at ? (
                              <>
                                <strong>
                                  {new Date(item.subscription_expires_at).toLocaleDateString("es-GT")}
                                </strong>
                                <small>
                                  {item.days_remaining >= 0
                                    ? `${item.days_remaining} día${item.days_remaining === 1 ? "" : "s"} restante${item.days_remaining === 1 ? "" : "s"}`
                                    : `Venció hace ${Math.abs(item.days_remaining)} día${Math.abs(item.days_remaining) === 1 ? "" : "s"}`}
                                </small>
                              </>
                            ) : (
                              <span>—</span>
                            )}
                          </td>

                          <td>
                            <strong>{item.query_count || 0} consultas</strong>
                            <small>
                              Gratis usadas: {item.free_quotes_used || 0}/3
                            </small>
                          </td>

                          <td>
                            <span className={`account-status ${item.active ? "enabled" : "disabled"}`}>
                              {item.active ? "Habilitada" : "Deshabilitada"}
                            </span>
                          </td>

                          <td>
                            {internal ? (
                              <span className="subscription-internal-note">
                                Acceso ilimitado
                              </span>
                            ) : (
                              <div className="subscription-actions">
                                {["FREE", "EXPIRED", "CANCELLED"].includes(status) && (
                                  <button
                                    className="subscription-action primary"
                                    disabled={busy || !item.active}
                                    onClick={() =>
                                      manageSubscription(item.user_id, "ACTIVATE", 1)
                                    }
                                  >
                                    {busy ? "..." : "Activar 1 mes"}
                                  </button>
                                )}

                                {status === "ACTIVE" && (
                                  <>
                                    <button
                                      className="subscription-action primary"
                                      disabled={busy}
                                      onClick={() =>
                                        manageSubscription(item.user_id, "RENEW", 1)
                                      }
                                    >
                                      +1 mes
                                    </button>
                                    <button
                                      className="subscription-action warning"
                                      disabled={busy}
                                      onClick={() =>
                                        manageSubscription(item.user_id, "SUSPEND", 1)
                                      }
                                    >
                                      Suspender
                                    </button>
                                  </>
                                )}

                                {status === "SUSPENDED" && (
                                  <button
                                    className="subscription-action primary"
                                    disabled={busy}
                                    onClick={() =>
                                      manageSubscription(item.user_id, "RESUME", 1)
                                    }
                                  >
                                    Reactivar
                                  </button>
                                )}

                                {!["CANCELLED", "FREE"].includes(status) && (
                                  <button
                                    className="subscription-action danger"
                                    disabled={busy}
                                    onClick={() =>
                                      manageSubscription(item.user_id, "CANCEL", 1)
                                    }
                                  >
                                    Cancelar
                                  </button>
                                )}

                                <button
                                  className={`subscription-action ${
                                    item.active ? "neutral" : "primary"
                                  }`}
                                  disabled={busy}
                                  onClick={() =>
                                    manageSubscription(
                                      item.user_id,
                                      item.active ? "DISABLE_ACCOUNT" : "ENABLE_ACCOUNT",
                                      1
                                    )
                                  }
                                >
                                  {item.active ? "Deshabilitar cuenta" : "Habilitar cuenta"}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="subscription-info-card">
              <div>💡</div>
              <div>
                <strong>Cómo funciona el vencimiento</strong>
                <p>
                  Al llegar la fecha de vencimiento, el motor bloquea nuevas consultas
                  automáticamente. Si el cliente paga antes de vencer, “+1 mes” suma
                  el nuevo mes sobre su fecha actual de vencimiento.
                </p>
              </div>
            </section>
          </section>
        ) : activeView === "imports" ? (
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

                                        <section className="import-importer-card">
                      <div className="import-importer-head">
                        <div>
                          <span className="section-label">IMPORTADOR · V39.3</span>
                          <h3>Importador responsable</h3>
                          <p>Seleccioná un registro del Directorio de Importadores.</p>
                        </div>
                      </div>

                      <label className="import-importer-field">
                        <span>Importador</span>
                        <select
                          value={importManagementDetail.importer_id || ""}
                          disabled={operationImportersLoading}
                          onChange={(e) =>
                            setImportManagementDetail((prev) => ({
                              ...prev,
                              importer_id: e.target.value || null,
                            }))
                          }
                        >
                          <option value="">
                            {operationImportersLoading
                              ? "Cargando importadores..."
                              : "— Sin importador asignado —"}
                          </option>
                          {operationImporters.map((importer) => (
                            <option key={importer.id} value={importer.id}>
                              {[
                                importer.display_name,
                                importer.nit ? `NIT ${importer.nit}` : "",
                                importer.organization_name,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </option>
                          ))}
                        </select>
                        <small>
                          El mismo importador se sincronizará con Control Aduanal si ambos expedientes están relacionados.
                        </small>
                      </label>
                    </section>

<OperationFilesPanel
                      supabase={supabase}
                      sourceType="IMPORT_MANAGEMENT"
                      sourceId={importManagementDetail.id}
                      organizationId={importManagementDetail.organization_id}
                      title="Archivos de esta gestión"
                    />

<section className="import-portal-client-card">
                      <div className="import-portal-client-head">
                        <div>
                          <span className="section-label">PORTAL DEL CLIENTE · V39.2.3</span>
                          <h3>¿Quién puede ver esta gestión?</h3>
                          <p>
                            Vinculá la gestión a un cliente del portal. Solo ese cliente podrá verla
                            cuando ingrese al portal de su oficina.
                          </p>
                        </div>
                        <span className={`portal-link-state ${importManagementDetail.office_portal_client_id ? "linked" : ""}`}>
                          {importManagementDetail.office_portal_client_id ? "VINCULADA" : "SIN VINCULAR"}
                        </span>
                      </div>

                      <label className="import-portal-client-field">
                        <span>Cliente del Portal</span>
                        <select
                          value={importManagementDetail.office_portal_client_id || ""}
                          disabled={portalAssignmentLoading}
                          onChange={(e) =>
                            setImportManagementDetail((prev) => ({
                              ...prev,
                              office_portal_client_id: e.target.value || null,
                            }))
                          }
                        >
                          <option value="">
                            {portalAssignmentLoading
                              ? "Cargando clientes..."
                              : "— No mostrar esta gestión en ningún portal —"}
                          </option>

                          {portalAssignmentClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {[
                                client.company_name || client.contact_name,
                                client.company_name ? client.contact_name : "",
                                client.organization_name,
                              ].filter(Boolean).join(" · ")}
                              {!client.active ? " · INACTIVO" : ""}
                            </option>
                          ))}
                        </select>

                        <small>
                          Al guardar la gestión, la asignación se actualizará automáticamente.
                        </small>
                      </label>

                      {importManagementDetail.office_portal_client_id && (
                        <div className="import-portal-client-notice">
                          <span>🔐</span>
                          <div>
                            <strong>Acceso privado</strong>
                            <p>
                              Este vínculo no convierte al cliente en usuario interno de la oficina.
                              Únicamente habilita esta gestión dentro de su Portal de Clientes.
                            </p>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="import-cover-data-card">
                      <div className="import-cover-data-head">
                        <div>
                          <span className="section-label">DATOS PARA CARÁTULA</span>
                          <h3>Vehículo y VIN</h3>
                          <p>
                            Son opcionales al registrar la gestión. Si los dejás vacíos,
                            E&R los solicitará automáticamente al momento de imprimir.
                          </p>
                        </div>
                        <span className="optional-badge">OPCIONAL</span>
                      </div>

                      <div className="import-cover-data-grid">
                        <label>
                          <span>Vehículo / línea</span>
                          <input
                            value={
                              importManagementDetail.vehicle_model ||
                              [importManagementDetail.make, importManagementDetail.model, importManagementDetail.vehicle_trim]
                                .filter(Boolean)
                                .join(" ")
                            }
                            onChange={(e) =>
                              setImportManagementDetail((p) => ({
                                ...p,
                                vehicle_model: e.target.value,
                              }))
                            }
                            placeholder="Ej. TOYOTA YARIS"
                          />
                          <small>Así aparecerá impreso en la carátula.</small>
                        </label>

                        <label>
                          <span>VIN</span>
                          <input
                            value={importManagementDetail.vin || ""}
                            onChange={(e) =>
                              setImportManagementDetail((p) => ({
                                ...p,
                                vin: e.target.value.toUpperCase(),
                              }))
                            }
                            maxLength="17"
                            placeholder="17 caracteres"
                          />
                          <small>
                            {String(importManagementDetail.vin || "").trim()
                              ? `${String(importManagementDetail.vin || "").trim().length}/17 caracteres`
                              : "Podés registrarlo ahora o antes de imprimir."}
                          </small>
                        </label>
                      </div>
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
                    <button
                      className="envelope-cover-button"
                      type="button"
                      onClick={() => printVehicleEnvelopeCover(importManagementDetail, "import")}
                    >
                      🖨️ Imprimir carátula
                    </button>
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

            <section className="portal-customs-requests-card">
              <header>
                <div>
                  <span className="section-label">PORTAL DEL CLIENTE · V39.6.21</span>
                  <h2>Solicitudes de nuevas gestiones</h2>
                  <p>Solicitudes enviadas por clientes que todavía no se han convertido en expediente aduanal.</p>
                </div>
                <button type="button" onClick={loadPortalCustomsRequests} disabled={portalCustomsRequestsLoading}>
                  {portalCustomsRequestsLoading ? "Actualizando..." : "↻ Actualizar"}
                </button>
              </header>

              {portalCustomsRequestError && (
                <div className="customer-message error">{portalCustomsRequestError}</div>
              )}

              {!portalCustomsRequestsLoading && portalCustomsRequests.length === 0 ? (
                <div className="portal-customs-empty">
                  <span>✓</span>
                  <div>
                    <strong>No hay solicitudes pendientes</strong>
                    <small>Cuando un cliente solicite una nueva gestión desde su Portal aparecerá aquí.</small>
                  </div>
                </div>
              ) : (
                <div className="portal-customs-request-list">
                  {portalCustomsRequests.map((request) => (
                    <article key={request.id}>
                      <div className="portal-customs-request-icon">🛃</div>

                      <div className="portal-customs-request-main">
                        <div>
                          <span>{request.request_code}</span>
                          {request.shipping_line_release_confirmed && (
                            <em>✓ LIBERADO POR NAVIERA</em>
                          )}
                        </div>
                        <strong>{request.company_name || request.contact_name || "Cliente del Portal"}</strong>
                        <small>
                          {request.shipping_line} · {request.vin || "VIN pendiente"} · {request.bl || "BL pendiente"}
                        </small>
                        {request.notes && <p>{request.notes}</p>}
                      </div>

                      <div className="portal-customs-request-meta">
                        <small>Solicitada</small>
                        <strong>{new Date(request.created_at).toLocaleDateString("es-GT")}</strong>
                      </div>

                      <button type="button" onClick={() => openPortalCustomsRequest(request)}>
                        Revisar y completar →
                      </button>
                    </article>
                  ))}
                </div>
              )}
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
                      <th>Vehículo / Correlativo DUCA</th>
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
                          <small className="customs-duca-number">
                            DUCA: {item.duca_correlative_number || "Pendiente de asignación"}
                          </small>
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
                    {customsForm.portal_request_id && (
                      <section className="portal-request-prefill-banner">
                        <span>🛃</span>
                        <div>
                          <small>SOLICITUD {customsForm.portal_request_code}</small>
                          <strong>Datos precargados desde el Portal del Cliente</strong>
                          <p>
                            Naviera: {customsForm.shipping_line || "—"}
                            {customsForm.portal_release_confirmed ? " · ✓ Documentos reportados como liberados" : ""}
                          </p>
                          {customsForm.portal_request_notes && (
                            <p>Nota del cliente: {customsForm.portal_request_notes}</p>
                          )}
                        </div>
                      </section>
                    )}
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
                          <CustomerAutocomplete
                            supabase={supabase}
                            value={customsForm.client_name}
                            clientId={customsForm.client_id}
                            phone={customsForm.phone}
                            email={customsForm.email}
                            required
                            placeholder="Escribí nombre o razón social..."
                            onSelect={(client) =>
                              setCustomsForm((p) => ({
                                ...p,
                                client_id: client.id || null,
                                client_name: client.name || "",
                                phone:
                                  p.phone ||
                                  client.phone ||
                                  "",
                                email:
                                  p.email ||
                                  client.email ||
                                  "",
                              }))
                            }
                          />
                          <small>
                            Escribí para buscar. Si no existe, podés crearlo sin salir de la gestión.
                          </small>
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
                          <strong>Vehículo + cálculo SAT <em className="optional-field">Opcional</em></strong>
                          <small>
                            Si contás con VIN podés calcular SAT, IVA e IPRIMA automáticamente.
                            Si no lo tenés, podés crear la gestión sin este cálculo.
                          </small>
                        </div>
                      </div>

                      <div className="customs-vin-optional-block">
                        <div className="customs-vin-label">
                          <span>VIN DEL VEHÍCULO</span>
                          <small>Opcional</small>
                        </div>

                        <div className="customs-vin-row">
                          <input
                            value={customsForm.vin}
                            maxLength="17"
                            onChange={(e) =>
                              setCustomsForm((p) => ({
                                ...p,
                                vin: e.target.value
                                  .toUpperCase()
                                  .replace(/\s/g, ""),
                              }))
                            }
                            placeholder="Ingresalo solo si lo tenés"
                          />
                          <button
                            type="button"
                            className="primary-button"
                            onClick={calculateManualCustomsTaxes}
                            disabled={
                              customsDecodeLoading ||
                              String(customsForm.vin || "").trim().length !== 17
                            }
                          >
                            {customsDecodeLoading
                              ? "Calculando..."
                              : "Calcular IVA e IPRIMA"}
                            <span>→</span>
                          </button>
                        </div>

                        {!customsForm.vin && (
                          <div className="customs-vin-helper">
                            ✓ Podés continuar sin VIN. Los impuestos quedarán pendientes
                            hasta que decidan registrarlos.
                          </div>
                        )}
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

                                                      <section className="customs-importer-section">
                    <div className="customs-importer-head">
                      <div>
                        <span className="section-label">CLIENTE / IMPORTADOR · V39.5.1</span>
                        <h3>{customsPortalCandidate?.contact_name || customsDetail.client_name || "Cliente del expediente"}</h3>
                        <p>
                          {[customsPortalCandidate?.email || customsDetail.email, customsPortalCandidate?.phone || customsDetail.phone]
                            .filter(Boolean).join(" · ") || "Datos tomados directamente del expediente aduanal."}
                        </p>
                      </div>
                    </div>
                    <div className="customs-importer-field">
                      <small>
                        ✅ Este cliente se toma de Control Aduanal. No necesitás volver a registrarlo en un catálogo de importadores.
                      </small>
                    </div>
                  </section>

<OperationFilesPanel
                    supabase={supabase}
                    sourceType="CUSTOMS_CASE"
                    sourceId={customsDetail.id}
                    organizationId={customsDetail.organization_id}
                    title="Archivos del expediente aduanal"
                  />

<section className="customs-portal-access-v3951">
                    <div>
                      <span className="section-label">ACCESO AL PORTAL · V39.5.1</span>
                      <h3>
                        {customsPortalCandidateLoading
                          ? "Verificando acceso..."
                          : customsPortalCandidate?.portal_user_id
                          ? "🟢 Portal activo"
                          : "⚪ Sin acceso al Portal"}
                      </h3>
                      <p>
                        {customsPortalCandidate?.portal_user_id
                          ? `Usuario: ${customsPortalCandidate.email || "registrado"}`
                          : "Este cliente existe por su expediente, pero todavía no tiene usuario del Portal."}
                      </p>
                    </div>

                    {!customsPortalCandidateLoading && customsPortalCandidate && !customsPortalCandidate.portal_user_id && (
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          setActiveView("portal-clients");
                          setSelectedCustomsCase(null);
                          setCustomsDetail(null);
                        }}
                      >
                        🔐 Ir a crear acceso al Portal
                      </button>
                    )}

                    {!customsPortalCandidateLoading && customsPortalCandidate?.portal_client_id && (
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() =>
                          setCustomsDetail((prev) => ({
                            ...prev,
                            office_portal_client_id: customsPortalCandidate.portal_client_id,
                          }))
                        }
                      >
                        Vincular este expediente
                      </button>
                    )}
                  </section>

                  <section className="customs-portal-client-section">
                    <div className="customs-portal-client-head">
                      <div>
                        <span className="section-label">PORTAL DEL CLIENTE · V39.2.4</span>
                        <h3>¿Quién puede ver este expediente?</h3>
                        <p>
                          Elegí el cliente que podrá consultar el avance aduanal desde
                          el Portal de Clientes de su oficina.
                        </p>
                      </div>

                      <span
                        className={`portal-link-state ${
                          customsDetail.office_portal_client_id
                            ? "linked"
                            : ""
                        }`}
                      >
                        {customsDetail.office_portal_client_id
                          ? "VINCULADO"
                          : "SIN VINCULAR"}
                      </span>
                    </div>

                    <label className="customs-portal-client-field">
                      <span>Cliente del Portal</span>

                      <select
                        value={customsDetail.office_portal_client_id || ""}
                        disabled={customsPortalAssignmentLoading}
                        onChange={(e) =>
                          setCustomsDetail((prev) => ({
                            ...prev,
                            office_portal_client_id:
                              e.target.value || null,
                          }))
                        }
                      >
                        <option value="">
                          {customsPortalAssignmentLoading
                            ? "Cargando clientes..."
                            : "— Ningún cliente puede ver este expediente —"}
                        </option>

                        {customsPortalAssignmentClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {[
                              client.company_name || client.contact_name,
                              client.company_name
                                ? client.contact_name
                                : "",
                              client.organization_name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            {!client.active ? " · INACTIVO" : ""}
                          </option>
                        ))}
                      </select>

                      <small>
                        Si este expediente proviene de una Gestión de Importación,
                        el cliente se sincroniza automáticamente en ambos módulos.
                      </small>
                    </label>

                    {customsDetail.office_portal_client_id && (
                      <div className="customs-portal-client-notice">
                        <span>🔐</span>
                        <div>
                          <strong>Acceso privado</strong>
                          <p>
                            El cliente solamente verá el seguimiento de sus propias
                            gestiones. No obtiene acceso al sistema interno.
                          </p>
                        </div>
                      </div>
                    )}
                  </section>

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

                  {isSystemAdmin && (
                    <CustomsCaseFinance
                      supabase={supabase}
                      caseId={customsDetail.id}
                      caseCode={customsDetail.case_code}
                      clientName={customsDetail.client_name}
                      onChanged={() => loadCustomsCases(customsSearch)}
                    />
                  )}

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
                      className="envelope-cover-button"
                      type="button"
                      onClick={() => printVehicleEnvelopeCover(customsDetail, "customs")}
                    >
                      🖨️ Imprimir carátula
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

            <div className="prospects-layout">
              <ProspectList
                prospects={prospects}
                loading={prospectsLoading}
                page={prospectPage}
                pageSize={PROSPECT_PAGE_SIZE}
                onPageChange={setProspectPage}
                onOpen={selectProspect}
                onRefresh={() => loadProspects(prospectSearch)}
              />
            </div>

            <ProspectDetailDrawer
              prospect={selectedProspect}
              queries={prospectQueries}
              queriesLoading={prospectQueriesLoading}
              statusForm={prospectStatusForm}
              setStatusForm={setProspectStatusForm}
              saving={prospectSaving}
              message={prospectMessage}
              quoteLoadingId={prospectQuoteLoadingId}
              convertingQueryId={convertingQueryId}
              onClose={() => {
                setSelectedProspect(null);
                setProspectQueries([]);
                setProspectMessage("");
              }}
              onSaveStatus={saveProspectStatus}
              onGenerateQuotation={generateProspectQuotation}
              onConvertManagement={convertProspectToImportManagement}
              onOpenManagements={openImportManagementsView}
              buildWhatsAppUrl={buildWhatsAppUrl}
              moneyGTQ={moneyGTQ}
              moneyUSD={moneyUSD}
            />
          </section>
        ) : activeView === "organizations" && isSystemAdmin ? (
          <section className="organizations-v381-module">
            <header className="topbar organizations-v381-topbar">
              <div>
                <span className="eyebrow">SAAS · V38.1</span>
                <h1>Oficinas / Clientes</h1>
                <p>
                  Creá, administrá y suspendé las oficinas que compren acceso al sistema.
                </p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  resetOrganizationFormV381();
                  setShowOrganizationForm(true);
                  setOrganizationsError("");
                  setOrganizationsMessage("");
                }}
              >
                + Nueva oficina
              </button>
            </header>

            <section className="organizations-v381-kpis">
              <div>
                <span>OFICINAS</span>
                <strong>{organizations.length}</strong>
                <small>registradas</small>
              </div>
              <div>
                <span>ACTIVAS</span>
                <strong>
                  {organizations.filter((item) => item.active !== false).length}
                </strong>
                <small>con acceso</small>
              </div>
              <div>
                <span>SUSPENDIDAS</span>
                <strong>
                  {organizations.filter((item) => item.active === false).length}
                </strong>
                <small>sin acceso</small>
              </div>
              <div>
                <span>USUARIOS</span>
                <strong>
                  {organizations.reduce(
                    (sum, item) => sum + Number(item.member_count || 0),
                    0
                  )}
                </strong>
                <small>miembros SaaS</small>
              </div>
            </section>

            <section className="organizations-v381-toolbar">
              <div className="organizations-v381-search">
                <span>⌕</span>
                <input
                  value={organizationSearch}
                  onChange={(e) => setOrganizationSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      loadOrganizationsV381(organizationSearch);
                    }
                  }}
                  placeholder="Buscar oficina, plan o propietario..."
                />
              </div>
              <button
                type="button"
                onClick={() => loadOrganizationsV381(organizationSearch)}
                disabled={organizationsLoading}
              >
                {organizationsLoading ? "Cargando..." : "Buscar"}
              </button>
            </section>

            {organizationsError && (
              <div className="customer-message error">{organizationsError}</div>
            )}
            {organizationsMessage && (
              <div className="customer-message success">{organizationsMessage}</div>
            )}

            <div className="organizations-v381-layout">
              <section className="organizations-v381-list">
                <div className="organizations-v381-list-head">
                  <div>
                    <small>PORTAFOLIO SAAS</small>
                    <h2>Clientes del sistema</h2>
                  </div>
                  <span>{organizations.length} oficina(s)</span>
                </div>

                {organizationsLoading ? (
                  <div className="organizations-v381-empty">
                    Cargando oficinas...
                  </div>
                ) : organizations.length === 0 ? (
                  <div className="organizations-v381-empty">
                    <strong>No hay oficinas todavía.</strong>
                    <span>Creá el primer cliente White Label.</span>
                  </div>
                ) : (
                  <div className="organizations-v381-table-wrap">
                    <table className="organizations-v381-table">
                      <thead>
                        <tr>
                          <th>Oficina</th>
                          <th>Plan</th>
                          <th>Propietario</th>
                          <th>Usuarios</th>
                          <th>Estado</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {organizations.map((organization) => (
                          <tr
                            key={organization.id}
                            className={
                              selectedOrganization?.id === organization.id
                                ? "selected"
                                : ""
                            }
                            onClick={() => selectOrganizationV381(organization)}
                          >
                            <td>
                              <div className="organizations-v381-office">
                                <span>
                                  {(organization.office_name ||
                                    organization.name ||
                                    "O")
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </span>
                                <div>
                                  <strong>
                                    {organization.office_name ||
                                      organization.name}
                                  </strong>
                                  <small>/{organization.slug}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`organizations-v381-plan plan-${String(
                                organization.plan_code || "QUOTER"
                              ).toLowerCase()}`}>
                                {organization.plan_code || "QUOTER"}
                              </span>
                            </td>
                            <td>
                              <strong className="organizations-v381-owner">
                                {organization.owner_name || "Sin propietario"}
                              </strong>
                              <small>{organization.owner_email || "—"}</small>
                            </td>
                            <td>{organization.member_count || 0}</td>
                            <td>
                              <span
                                className={`organizations-v381-status ${
                                  organization.active === false
                                    ? "suspended"
                                    : "active"
                                }`}
                              >
                                {organization.active === false
                                  ? "SUSPENDIDA"
                                  : organization.subscription_status || "ACTIVE"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="organizations-v381-open"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectOrganizationV381(organization);
                                }}
                              >
                                Administrar →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <aside className="organizations-v381-detail">
                {!selectedOrganization ? (
                  <div className="organizations-v381-detail-empty">
                    <span>🏢</span>
                    <strong>Seleccioná una oficina</strong>
                    <p>
                      Desde aquí vas a cambiar su plan, asignar propietario y
                      suspender o reactivar el acceso.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="organizations-v381-detail-head">
                      <div className="organizations-v381-detail-logo">
                        {selectedOrganization.logo_url ? (
                          <img
                            src={selectedOrganization.logo_url}
                            alt={selectedOrganization.office_name || selectedOrganization.name}
                          />
                        ) : (
                          <strong>
                            {(selectedOrganization.office_name ||
                              selectedOrganization.name ||
                              "O")
                              .slice(0, 2)
                              .toUpperCase()}
                          </strong>
                        )}
                      </div>
                      <div>
                        <small>ORGANIZACIÓN</small>
                        <h2>
                          {selectedOrganization.office_name ||
                            selectedOrganization.name}
                        </h2>
                        <span>/{selectedOrganization.slug}</span>
                      </div>
                    </div>

                    <div className="organizations-v381-login-link-v383">
                      <span>ENLACE WHITE LABEL</span>
                      <strong>{`${window.location.origin}/o/${selectedOrganization.slug}`}</strong>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `${window.location.origin}/o/${selectedOrganization.slug}`
                            );
                            setOrganizationsMessage("Enlace de acceso copiado.");
                          } catch (err) {
                            console.error("COPY WHITE LABEL LINK ERROR:", err);
                            setOrganizationsError("No fue posible copiar el enlace automáticamente.");
                          }
                        }}
                      >
                        📋 Copiar enlace de acceso
                      </button>
                    </div>

                    <div className="organizations-v381-info-grid">
                      <div>
                        <span>Creada</span>
                        <strong>
                          {selectedOrganization.created_at
                            ? new Date(
                                selectedOrganization.created_at
                              ).toLocaleDateString("es-GT")
                            : "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Usuarios</span>
                        <strong>{selectedOrganization.member_count || 0}</strong>
                      </div>
                    </div>

                    <label>
                      <span>Plan contratado</span>
                      <select
                        value={organizationEditForm.plan_code}
                        onChange={(e) =>
                          setOrganizationEditForm((prev) => ({
                            ...prev,
                            plan_code: e.target.value,
                          }))
                        }
                      >
                        <option value="QUOTER">Cotizador</option>
                        <option value="IMPORTER">Importador</option>
                        <option value="IMPORTER_PRO">Importador Pro</option>
                        <option value="FULL_OFFICE">Full Office</option>
                      </select>
                    </label>

                    <label>
                      <span>Estado de suscripción</span>
                      <select
                        value={organizationEditForm.subscription_status}
                        onChange={(e) =>
                          setOrganizationEditForm((prev) => ({
                            ...prev,
                            subscription_status: e.target.value,
                          }))
                        }
                      >
                        <option value="ACTIVE">Activa</option>
                        <option value="TRIAL">Prueba</option>
                        <option value="PAST_DUE">Pago pendiente</option>
                        <option value="SUSPENDED">Suspendida</option>
                      </select>
                    </label>

                    <label>
                      <span>Correo del propietario</span>
                      <input
                        type="email"
                        value={organizationEditForm.owner_email}
                        onChange={(e) =>
                          setOrganizationEditForm((prev) => ({
                            ...prev,
                            owner_email: e.target.value,
                          }))
                        }
                        placeholder="cliente@oficina.com"
                      />
                      <small>
                        El usuario debe existir en E&amp;R para poder asignarlo.
                      </small>
                    </label>

                    <label className="organizations-v381-active-toggle">
                      <input
                        type="checkbox"
                        checked={organizationEditForm.active}
                        onChange={(e) =>
                          setOrganizationEditForm((prev) => ({
                            ...prev,
                            active: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        <strong>Acceso habilitado</strong>
                        <small>
                          Al desactivarlo conservamos toda la información.
                        </small>
                      </span>
                    </label>

                    <button
                      className="primary-button organizations-v381-save"
                      type="button"
                      disabled={organizationSaving}
                      onClick={saveOrganizationV381}
                    >
                      {organizationSaving ? "Guardando..." : "Guardar cambios →"}
                    </button>

                    <button
                      className={`organizations-v381-suspend ${
                        selectedOrganization.active === false ? "activate" : ""
                      }`}
                      type="button"
                      disabled={organizationSaving}
                      onClick={() =>
                        toggleOrganizationV381(selectedOrganization)
                      }
                    >
                      {selectedOrganization.active === false
                        ? "✓ Reactivar oficina"
                        : "⏸ Suspender oficina"}
                    </button>
                  </>
                )}
              </aside>
            </div>

            {showOrganizationForm && (
              <div
                className="modal-overlay"
                onMouseDown={() => {
                  if (!organizationSaving) setShowOrganizationForm(false);
                }}
              >
                <div
                  className="modal-card organizations-v381-create-modal"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="modal-close"
                    type="button"
                    onClick={() => setShowOrganizationForm(false)}
                  >
                    ×
                  </button>

                  <div className="organizations-v381-create-head">
                    <span>🏢</span>
                    <div>
                      <small>NUEVO CLIENTE SAAS</small>
                      <h2>Crear oficina</h2>
                      <p>
                        Esta oficina tendrá su propia marca, usuarios y plan.
                      </p>
                    </div>
                  </div>

                  <form
                    className="organizations-v381-create-form"
                    onSubmit={createOrganizationV381}
                  >
                    <label>
                      <span>Nombre comercial</span>
                      <input
                        required
                        value={organizationForm.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setOrganizationForm((prev) => ({
                            ...prev,
                            name,
                            slug:
                              prev.slug ||
                              name
                                .toLowerCase()
                                .normalize("NFD")
                                .replace(/[\u0300-\u036f]/g, "")
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/(^-|-$)/g, ""),
                          }));
                        }}
                        placeholder="Ej. Importadora del Caribe"
                      />
                    </label>

                    <label>
                      <span>Identificador / slug</span>
                      <input
                        required
                        value={organizationForm.slug}
                        onChange={(e) =>
                          setOrganizationForm((prev) => ({
                            ...prev,
                            slug: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, ""),
                          }))
                        }
                        placeholder="importadora-del-caribe"
                      />
                    </label>

                    <label>
                      <span>Plan inicial</span>
                      <select
                        value={organizationForm.plan_code}
                        onChange={(e) =>
                          setOrganizationForm((prev) => ({
                            ...prev,
                            plan_code: e.target.value,
                          }))
                        }
                      >
                        <option value="QUOTER">Cotizador</option>
                        <option value="IMPORTER">Importador</option>
                        <option value="IMPORTER_PRO">Importador Pro</option>
                        <option value="FULL_OFFICE">Full Office</option>
                      </select>
                    </label>

                    <label>
                      <span>Correo del propietario · opcional</span>
                      <input
                        type="email"
                        value={organizationForm.owner_email}
                        onChange={(e) =>
                          setOrganizationForm((prev) => ({
                            ...prev,
                            owner_email: e.target.value,
                          }))
                        }
                        placeholder="cliente@oficina.com"
                      />
                      <small>
                        Si ya existe como usuario, queda vinculado de una vez.
                      </small>
                    </label>

                    <div className="organizations-v381-create-actions">
                      <button
                        type="button"
                        onClick={() => setShowOrganizationForm(false)}
                      >
                        Cancelar
                      </button>
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={organizationSaving}
                      >
                        {organizationSaving
                          ? "Creando..."
                          : "Crear oficina →"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        ) : activeView === "branding" ? (
          <section className="tenant-branding-module">
            <header className="topbar tenant-branding-topbar">
              <div>
                <span className="eyebrow">WHITE LABEL · V38</span>
                <h1>Mi Marca</h1>
                <p>Personalizá cómo verá tu cliente las cotizaciones generadas por esta oficina.</p>
              </div>
              <span className="tenant-plan-pill">{tenantOrganization?.plan_code || "SIN PLAN"}</span>
            </header>

            <div className="tenant-branding-layout">
              <form className="tenant-branding-form" onSubmit={saveTenantBranding}>
                <section className="tenant-config-card">
                  <div className="tenant-card-head"><span>🏢</span><div><small>IDENTIDAD</small><h2>Datos de la oficina</h2></div></div>
                  <div className="tenant-form-grid">
                    <label><span>Nombre comercial</span><input value={brandingForm.office_name} onChange={(e)=>setBrandingForm(p=>({...p,office_name:e.target.value}))} placeholder="Ej. Aduana Rivera" required /></label>
                    <label><span>Eslogan / línea secundaria</span><input value={brandingForm.tagline} onChange={(e)=>setBrandingForm(p=>({...p,tagline:e.target.value}))} placeholder="Ej. Importaciones y Aduanas" /></label>
                    <label className="tenant-logo-field"><span>Logo</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e)=>setBrandingLogoFile(e.target.files?.[0] || null)} /><small>PNG transparente recomendado.</small></label>
                    <label><span>Correo comercial</span><input type="email" value={brandingForm.email} onChange={(e)=>setBrandingForm(p=>({...p,email:e.target.value}))} placeholder="ventas@oficina.com" /></label>
                    <label><span>Teléfono</span><input value={brandingForm.phone} onChange={(e)=>setBrandingForm(p=>({...p,phone:e.target.value}))} /></label>
                    <label><span>WhatsApp</span><input value={brandingForm.whatsapp} onChange={(e)=>setBrandingForm(p=>({...p,whatsapp:e.target.value}))} placeholder="502..." /></label>
                    <label className="span-2"><span>Dirección</span><input value={brandingForm.address} onChange={(e)=>setBrandingForm(p=>({...p,address:e.target.value}))} /></label>
                  </div>
                </section>

                <section className="tenant-config-card">
                  <div className="tenant-card-head"><span>🎨</span><div><small>COLORES</small><h2>Identidad visual</h2></div></div>
                  <div className="tenant-color-grid">
                    <label><span>Principal</span><div><input type="color" value={brandingForm.primary_color} onChange={(e)=>setBrandingForm(p=>({...p,primary_color:e.target.value}))}/><code>{brandingForm.primary_color}</code></div></label>
                    <label><span>Secundario</span><div><input type="color" value={brandingForm.secondary_color} onChange={(e)=>setBrandingForm(p=>({...p,secondary_color:e.target.value}))}/><code>{brandingForm.secondary_color}</code></div></label>
                    <label><span>Acento</span><div><input type="color" value={brandingForm.accent_color} onChange={(e)=>setBrandingForm(p=>({...p,accent_color:e.target.value}))}/><code>{brandingForm.accent_color}</code></div></label>
                  </div>
                  <label className="tenant-footer-field"><span>Pie de cotización</span><textarea rows="3" value={brandingForm.quote_footer} onChange={(e)=>setBrandingForm(p=>({...p,quote_footer:e.target.value}))} placeholder="Condiciones, teléfonos o mensaje comercial..." /></label>
                </section>

                {brandingError && <div className="customer-message error">{brandingError}</div>}
                {brandingMessage && <div className="customer-message success">{brandingMessage}</div>}
                <button className="primary-button tenant-save-brand" type="submit" disabled={brandingSaving || brandingLoading}>{brandingSaving ? "Guardando..." : "Guardar mi marca"} <span>→</span></button>
              </form>

              <aside className="tenant-brand-preview" style={{"--preview-primary": brandingForm.primary_color, "--preview-secondary": brandingForm.secondary_color, "--preview-accent": brandingForm.accent_color}}>
                <small>VISTA PREVIA DE COTIZACIÓN</small>
                <div className="tenant-preview-sheet">
                  <header>
                    <div className="tenant-preview-logo">
                      {brandingForm.logo_url ? <img src={brandingForm.logo_url} alt="Logo"/> : <strong>{(brandingForm.office_name || "MI OFICINA").slice(0,2).toUpperCase()}</strong>}
                    </div>
                    <div><strong>{brandingForm.office_name || "MI OFICINA"}</strong><span>{brandingForm.tagline || "COTIZADOR VEHICULAR"}</span></div>
                  </header>
                  <div className="tenant-preview-title"><span>COTIZACIÓN</span><strong>TOYOTA YARIS 2020</strong></div>
                  <div className="tenant-preview-lines"><i></i><i></i><i></i></div>
                  <div className="tenant-preview-total"><span>TOTAL GENERAL</span><strong>Q 00,000.00</strong></div>
                  <footer>{brandingForm.quote_footer || brandingForm.phone || brandingForm.email || "Tu información comercial aparecerá aquí."}</footer>
                </div>
              </aside>
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
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          whatsapp_number: e.target.value,
                        }))
                      }
                      placeholder="50255555555"
                      disabled={settingsLoading || settingsSaving}
                    />
                  </div>
                  <small>Incluí código de país. Para Guatemala: 502 + número de 8 dígitos.</small>
                </label>

                <label>
                  <span>Tipo de cambio interno · Facturas de importadores</span>
                  <div className="settings-input-row">
                    <span className="country-prefix">Q</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={settingsForm.importer_exchange_rate}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          importer_exchange_rate: e.target.value,
                        }))
                      }
                      placeholder="Ej. 7.6500"
                      disabled={settingsLoading || settingsSaving}
                    />
                  </div>
                  <small>
                    Uso interno. El cliente no verá este valor; se utiliza para convertir
                    su factura USD antes de calcular IVA e IPRIMA.
                  </small>
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
                <span className="eyebrow">{isWhiteLabelClient ? tenantBrandName.toUpperCase() : "E&R GLOBAL LOGISTIC"}</span>
                <h1>Cotizaciones</h1>
                <p>
                  {["ADMIN", "OPERADOR"].includes(String(profile?.role || "").toUpperCase())
                    ? "Control de cotizaciones separado por usuario."
                    : "Tus cotizaciones y consultas generadas."}
                </p>
              </div>
              <button className="primary-button" onClick={openNewQuoteView}>
                ＋ Nueva cotización
              </button>
            </header>

            {["ADMIN", "OPERADOR"].includes(String(profile?.role || "").toUpperCase()) && (
              <section className="quotation-users-card">
                <div className="quotation-users-head">
                  <div>
                    <span className="section-label">CONTROL POR USUARIO</span>
                    <h2>Quién está utilizando el sistema</h2>
                    <p>
                      Seleccioná un usuario para ver únicamente sus cotizaciones.
                    </p>
                  </div>

                  <button
                    className={`quotation-user-filter ${quotationOwnerFilter === "" ? "active" : ""}`}
                    onClick={() => {
                      setQuotationOwnerFilter("");
                      loadQuotations(quotationSearch, "");
                    }}
                  >
                    <span>Todos</span>
                    <strong>
                      {quotationUsers.reduce(
                        (total, item) => total + Number(item.quotation_count || 0),
                        0
                      )}
                    </strong>
                  </button>
                </div>

                <div className="quotation-user-grid">
                  {quotationUsers.map((item) => {
                    const ownerId = item.owner_user_id || "__HISTORICAL__";
                    const isHistorical = !item.owner_user_id;

                    return (
                      <button
                        key={ownerId}
                        className={`quotation-user-card ${
                          quotationOwnerFilter === ownerId ? "active" : ""
                        } ${isHistorical ? "historical" : ""}`}
                        onClick={() => {
                          if (isHistorical) {
                            setQuotationOwnerFilter("");
                            setQuotationSearch("");
                            setQuotations([]);
                            setQuotationError(
                              "Las cotizaciones históricas no tienen usuario asignado porque fueron creadas antes del control multiusuario."
                            );
                            return;
                          }

                          setQuotationOwnerFilter(ownerId);
                          loadQuotations(quotationSearch, ownerId);
                        }}
                      >
                        <div className="quotation-user-avatar">
                          {(item.owner_name || "H").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <strong>{item.owner_name || "Histórico / Sin asignar"}</strong>
                          <span>{item.owner_email || "Cotizaciones anteriores"}</span>
                          <small>{item.owner_role || "HISTÓRICO"}</small>
                        </div>
                        <b>{item.quotation_count || 0}</b>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      loadQuotations(quotationSearch, quotationOwnerFilter);
                    }
                  }}
                  placeholder="Ej. ER-20260819-154500-629619"
                />
                <button
                  className="primary-button"
                  onClick={() => loadQuotations(quotationSearch, quotationOwnerFilter)}
                  disabled={quotationLoading}
                >
                  {quotationLoading ? "Buscando..." : "Buscar"} <span>⌕</span>
                </button>
                {quotationSearch && (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setQuotationSearch("");
                      loadQuotations("", quotationOwnerFilter);
                    }}
                  >
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
                <button
                  className="secondary-button"
                  onClick={() => loadQuotations(quotationSearch, quotationOwnerFilter)}
                  disabled={quotationLoading}
                >
                  ↻ Actualizar
                </button>
              </div>

              <div className="quotation-table-wrap">
                <table className="quotation-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Fecha</th>
                      <th>Usuario</th>
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
                      <tr><td colSpan="11" className="quotation-empty">No hay cotizaciones que coincidan con la búsqueda.</td></tr>
                    )}
                    {quotations.map((q) => (
                      <tr key={q.id || q.quote_code}>
                        <td><strong>{q.quote_code}</strong></td>
                        <td>{q.created_at ? new Date(q.created_at).toLocaleDateString("es-GT") : "—"}</td>
                        <td>
                          <strong>{q.owner_name || "Histórico"}</strong>
                          <small>{q.owner_email || "Sin usuario asignado"}</small>
                        </td>
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
                  <div className="quotation-detail-block quotation-owner-detail">
                    <small>USUARIO / PROPIETARIO</small>
                    <strong>{selectedQuotation.owner_name || "Histórico / Sin asignar"}</strong>
                    <span>{selectedQuotation.owner_email || "Esta cotización fue creada antes del control multiusuario."}</span>
                  </div>
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
              {tenantEyebrow}
            </span>

            <h1>Cotizador Interno</h1>

            <p>
              {isWhiteLabelClient
                ? "Calculá por Tabla SAT, factura de importador o cálculo manual desde tu propia oficina."
                : "Calculá por Tabla SAT o con factura de importador, sin consumir consultas públicas."}
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
                {internalQuoteMode === "MANUAL"
                  ? "CÁLCULO MANUAL"
                  : internalQuoteMode === "IMPORTER"
                    ? "IMPORTADOR CON FACTURA"
                    : "TABLA SAT GUATEMALA"}
              </span>

              <h2>
                {internalQuoteMode === "MANUAL"
                  ? "Valor definido por E&R. Cálculos automáticos."
                  : internalQuoteMode === "IMPORTER"
                    ? "VIN + factura. Calculamos los impuestos."
                    : "¿Qué vehículo vamos a importar?"}
              </h2>

              <p>
                {internalQuoteMode === "MANUAL"
                  ? "Ingresá el valor imponible ya determinado y la categoría tributaria."
                  : internalQuoteMode === "IMPORTER"
                    ? "Ingresá el valor real de la factura en USD y el VIN de 17 caracteres."
                    : "Ingresá el VIN y E&R analizará automáticamente vehículo, SAT, impuestos y flete."}
              </p>
            </div>
          </div>

          <div className="internal-quote-mode">
            <QuoteModeTabs
              mode={internalQuoteMode}
              disabled={loading || reviewLoading}
              onChange={(nextMode) => {
                setInternalQuoteMode(nextMode);
                setResult(null);
                setError("");
                resetReviewState();
                if (nextMode === "SAT") {
                  setInternalInvoiceValueUsd("");
                }
              }}
            />

            <button
              type="button"
              className={`manual-mode-tab ${internalQuoteMode === "MANUAL" ? "active" : ""}`}
              onClick={async () => {
                setInternalQuoteMode("MANUAL");
                setResult(null);
                setError("");
                resetReviewState();
                await loadManualTaxRules();
              }}
            >
              <span>🧮</span>
              <div><strong>Cálculo Manual</strong><small>Valor imponible definido por E&amp;R</small></div>
            </button>

            {internalQuoteMode === "IMPORTER" && (
              <ImporterQuoteFields
                invoiceValue={internalInvoiceValueUsd}
                onInvoiceChange={setInternalInvoiceValueUsd}
                disabled={loading || reviewLoading}
              />
            )}

            {internalQuoteMode === "IMPORTER" && (
              <div className="internal-importer-note">
                <strong>🧾 Cálculo para importador</strong>
                <span>
                  El motor utilizará el valor real de factura y el tipo de cambio
                  configurado para calcular IVA, IPRIMA y costos de importación.
                </span>
              </div>
            )}
          </div>

          {internalQuoteMode === "MANUAL" && (
            <section className="manual-tax-card">
              <div className="manual-tax-heading">
                <div><span>🧮 RESPALDO OPERATIVO</span><h3>Cotización manual de impuestos</h3>
                  <p>Ingresá el valor imponible que ya determinaste. E&amp;R seguirá calculando automáticamente IVA, IPRIMA, placas y total.</p></div>
                <b>MANUAL</b>
              </div>
              <div className="manual-tax-grid">
                <label><span>Valor imponible · GTQ</span><div className="manual-money"><b>Q</b><input type="number" min="0" step="0.01" value={manualTaxableValueGtq} onChange={(e)=>setManualTaxableValueGtq(e.target.value)} placeholder="0.00"/></div></label>
                <label><span>Categoría tributaria</span><select value={manualTaxRuleId} onFocus={loadManualTaxRules} onChange={(e)=>setManualTaxRuleId(e.target.value)}><option value="">Seleccionar...</option>{manualTaxRules.map((r)=><option key={r.id} value={r.id}>{r.vehicle_type} · IPRIMA {Number(r.iprima_rate*100).toFixed(0)}%</option>)}</select></label>
                <label><span>Vehículo / línea · opcional</span><input value={manualVehicleName} onChange={(e)=>setManualVehicleName(e.target.value)} placeholder="Ej. TOYOTA YARIS"/></label>
                <label><span>VIN · opcional</span><input value={manualVin} maxLength={17} onChange={(e)=>setManualVin(e.target.value.toUpperCase())} placeholder="17 caracteres"/></label>
              </div>
              <div className="manual-tax-action"><span>Este modo no depende del Motor VIN / SAT.</span><button className="search-button" type="button" onClick={calcularImpuestosManual}>Calcular impuestos <span>→</span></button></div>
            </section>
          )}

          {internalQuoteMode !== "MANUAL" && (
            <>
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
                reviewLoading ||
                (internalQuoteMode === "IMPORTER" &&
                  Number(internalInvoiceValueUsd) <= 0)
              }
              onClick={consultarVehiculo}
            >
              {loading
                ? "Analizando..."
                : internalQuoteMode === "IMPORTER"
                  ? "Calcular con factura"
                  : "Consultar Tabla SAT"}

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
            </>
          )}
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
                V37.4.4 · CLASIFICACIÓN TRIBUTARIA
            ========================================== */}

            {needsTaxClassificationReview && (
              <section className="smart-review tax-classification-review">
                <div className="smart-review-header">
                  <div className="review-icon-large">🧾</div>
                  <div>
                    <span className="review-eyebrow">
                      REVISIÓN TRIBUTARIA · NUEVA CLASIFICACIÓN
                    </span>
                    <h2>
                      SAT identificó: {result.tax_classification_review.raw_vehicle_type}
                    </h2>
                    <p>
                      Esta clasificación todavía no tiene una regla aprendida.
                      Seleccioná la categoría tributaria equivalente. La decisión
                      quedará guardada para las próximas consultas.
                    </p>
                  </div>
                </div>

                <div className="tax-rule-options">
                  {(result.tax_classification_review.options || []).map((rule) => {
                    const selected =
                      Number(selectedTaxRuleId) === Number(rule.id);

                    return (
                      <button
                        type="button"
                        key={rule.id}
                        className={`tax-rule-option ${selected ? "selected" : ""}`}
                        onClick={() => setSelectedTaxRuleId(rule.id)}
                      >
                        <span className="review-radio">
                          {selected ? "✓" : ""}
                        </span>
                        <div>
                          <strong>{rule.vehicle_type}</strong>
                          <small>
                            IVA {Number(rule.iva_rate * 100).toFixed(0)}% ·
                            IPRIMA {Number(rule.iprima_rate * 100).toFixed(0)}% ·
                            Placas {moneyGTQ(rule.plate_fee_gtq)}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="review-actions">
                  <div>
                    <strong>🧠 E&R aprenderá esta equivalencia</strong>
                    <span>
                      La próxima vez que SAT devuelva “{result.tax_classification_review.raw_vehicle_type}”
                      el cálculo continuará automáticamente.
                    </span>
                  </div>

                  <button
                    className="confirm-review-button"
                    disabled={!selectedTaxRuleId || taxClassSaving}
                    onClick={confirmarClasificacionTributaria}
                  >
                    {taxClassSaving
                      ? "Guardando..."
                      : "Confirmar categoría tributaria"}
                    <span>→</span>
                  </button>
                </div>
              </section>
            )}

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
                              normalizeSatYear(option.model_year)
                                ? `Año ${normalizeSatYear(option.model_year)}`
                                : "Resto de años",
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
                    <small>
                      {isManualCalculation ? "BASE MANUAL E&R" : "SAT GUATEMALA"}
                    </small>
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
                      {isManualCalculation
                        ? "Definida manualmente"
                        : summary?.sat_line || "Pendiente"}
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

                {isImporterCalculation && (
                  <div className="importer-conversion-audit">
                    <div>
                      <span>Factura ingresada</span>
                      <strong>
                        {moneyUSD(
                          Number(
                            result?.invoice_value_usd ||
                            summary?.invoice_value_usd ||
                            taxes?.invoice_value_usd ||
                            0
                          )
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Tipo de cambio Banguat</span>
                      <strong>
                        Q {Number(
                          taxes?.invoice_exchange_rate ||
                          taxes?.exchange_rate ||
                          0
                        ).toFixed(5)}
                      </strong>
                    </div>
                    <div>
                      <span>Base convertida a quetzales</span>
                      <strong>
                        {moneyGTQ(
                          taxes?.invoice_taxable_value_gtq ??
                          taxes?.taxable_value_gtq
                        )}
                      </strong>
                    </div>
                  </div>
                )}

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

              {!isManualCalculation && (
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
              )}
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
                <div className="quote-preview tenant-quote-preview" ref={quoteRef} style={{"--tenant-primary": tenantBranding?.primary_color || "#0A3458", "--tenant-secondary": tenantBranding?.secondary_color || "#E8A72D", "--tenant-accent": tenantBranding?.accent_color || "#F5D87F"}}>
                  <header className="quote-sheet-header quote-pro-header">
                    <div className="quote-sheet-brand tenant-quote-brand-logo-only">
                      <div className="quote-sheet-logo tenant-quote-logo tenant-quote-logo-large">
                        {tenantLogoUrl ? (
                          <img src={tenantLogoUrl} alt={tenantBrandName} />
                        ) : (
                          tenantBrandName.slice(0, 2).toUpperCase()
                        )}
                      </div>
                    </div>

                    <div className="quote-sheet-title">
                      <h2>
                        {(result?.calculation_method || summary?.calculation_method) === "IMPORTER"
                          ? "COTIZACIÓN PARA IMPORTADOR"
                          : quoteForm.include_freight
                            ? "COTIZACIÓN DE IMPORTACIÓN"
                            : "COTIZACIÓN DE GESTIÓN ADUANAL"}
                      </h2>
                      <span>
                        {(result?.calculation_method || summary?.calculation_method) === "IMPORTER"
                          ? "BASE · FACTURA DE SUBASTA"
                          : quoteForm.include_freight
                            ? "VEHÍCULOS · GUATEMALA"
                            : "SERVICIOS ADUANALES · GUATEMALA"}
                      </span>
                    </div>

                    <div className="quote-sheet-meta quote-pro-meta">
                      <span>Fecha</span>
                      <strong>{new Date().toLocaleDateString("es-GT")}</strong>

                      <span>Cotización #</span>
                      <strong>{quoteNumber()}</strong>

                      <span>Vigencia</span>
                      <strong>15 días</strong>
                    </div>
                  </header>

                  <section className="quote-vehicle-strip quote-pro-vehicle-strip">
                    <div className="quote-pro-vehicle-main">
                      <small>
                        TIPO SAT · {taxes?.vehicle_type || sat?.selected_match?.vehicle_type || "NO ESPECIFICADO"}
                      </small>
                      <h3>{vehicle?.year || vehicle?.model_year} {vehicle?.make}</h3>
                      <strong>{vehicle?.model} {vehicle?.trim || ""}</strong>
                    </div>

                    <div className="quote-vehicle-data">
                      <span>
                        VIN
                        <strong>{vehicle?.vin}</strong>
                      </span>

                      <span>
                        Motor
                        <strong>
                          {vehicle?.engine_liters ? `${vehicle.engine_liters}L` : "—"} · {vehicle?.cylinders || "—"} cilindros
                        </strong>
                      </span>

                      <span>
                        Tracción
                        <strong>{humanDrive(vehicle?.drive_type)}</strong>
                      </span>
                    </div>

                    <div className="quote-pro-make-badge">
                      <VehicleMakeLogo make={vehicle?.make} />
                    </div>
                  </section>

                  <section className="quote-sheet-grid quote-pro-cost-grid">
                    <div className="quote-sheet-card quote-pro-cost-card">
                      <small>COSTOS EN GUATEMALA</small>

                      {(result?.calculation_method || summary?.calculation_method) === "IMPORTER" && (
                        <div className="quote-importer-basis">
                          <span>Factura utilizada</span>
                          <strong>
                            {moneyUSD(
                              result?.invoice_value_usd ||
                              summary?.invoice_value_usd ||
                              0
                            )}
                          </strong>
                        </div>
                      )}

                      <div>
                        <span>IVA ({displayTaxRate(taxes?.iva_rate, 0.12)})</span>
                        <strong>{moneyGTQ(taxes?.iva_gtq || 0)}</strong>
                      </div>

                      <div>
                        <span>IPRIMA ({displayTaxRate(taxes?.iprima_rate)})</span>
                        <strong>{moneyGTQ(taxes?.iprima_gtq || 0)}</strong>
                      </div>

                      <div>
                        <span>Placas</span>
                        <strong>{moneyGTQ(taxes?.plates_gtq || 0)}</strong>
                      </div>

                      <div>
                        <span>Recolección de documentos</span>
                        <strong>{moneyGTQ(quoteDocumentCollection)}</strong>
                      </div>

                      <div>
                        <span>Gastos portuarios</span>
                        <strong>{moneyGTQ(quotePortExpenses)}</strong>
                      </div>

                      <div>
                        <span>Honorarios</span>
                        <strong>{moneyGTQ(quoteProfessionalFees)}</strong>
                      </div>

                      <div className="quote-sheet-subtotal">
                        <span>TOTAL GUATEMALA</span>
                        <strong>{moneyGTQ(quoteGuatemalaTotal)}</strong>
                      </div>
                    </div>

                    {quoteForm.include_freight ? (
                      <div className="quote-sheet-card quote-freight-card quote-pro-freight-card">
                        <small>TRANSPORTE MARÍTIMO</small>

                        <div>
                          <span>Categoría</span>
                          <strong>{freight?.category || "—"}</strong>
                        </div>

                        <div>
                          <span>Largo</span>
                          <strong>
                            {dimensions?.length_inches
                              ? `${Number(dimensions.length_inches).toFixed(2)}"`
                              : "—"}
                          </strong>
                        </div>

                        <div>
                          <span>Configuración</span>
                          <strong>{dimensions?.dimension_model || vehicle?.model || "—"}</strong>
                        </div>

                        <div>
                          <span>Grúa</span>
                          <strong>{moneyUSD(quoteCraneUsd)}</strong>
                        </div>

                        <div className="quote-freight-price quote-pro-freight-price">
                          <span>FLETE MARÍTIMO</span>
                          <strong>{moneyUSD(quoteFreightUsd)}</strong>
                        </div>
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

                  <section className="quote-grand-summary quote-pro-summary">
                    <div>
                      <span>Total costos Guatemala</span>
                      <strong>{moneyGTQ(quoteGuatemalaTotal)}</strong>
                    </div>

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

                    <div className="quote-grand-total quote-pro-grand-total">
                      <span>
                        {quoteForm.include_freight
                          ? "FLETE + COSTOS GUATEMALA"
                          : "COSTOS GUATEMALA"}
                      </span>

                      <strong>
                        {quoteForm.include_freight
                          ? `${moneyUSD(quoteTransportUsd)} + ${moneyGTQ(quoteGuatemalaTotal)}`
                          : moneyGTQ(quoteGuatemalaTotal)}
                      </strong>
                    </div>
                  </section>

                  <section className="quote-pro-info-grid">
                    <article className="quote-pro-service-card">
                      <div className="quote-pro-card-title">
                        <span className="quote-pro-round-icon">✓</span>
                        <h3>NUESTRO SERVICIO INCLUYE</h3>
                      </div>

                      <ul>
                        <li>Asesoría y acompañamiento en todo el proceso</li>
                        <li>Coordinación de transporte en Estados Unidos</li>
                        <li>Gestión de documentación de exportación e importación</li>
                        <li>Trámite aduanal en Guatemala</li>
                        <li>Pago y gestión de impuestos (IVA e IPRIMA)</li>
                        <li>Gestión de placas y requisitos de circulación</li>
                        <li>Coordinación con navieras y autoridades</li>
                        <li>Soporte continuo hasta la entrega de tu vehículo</li>
                      </ul>
                    </article>

                    <div className="quote-pro-side-stack">
                      <article className="quote-pro-start-card">
                        <div className="quote-pro-card-title">
                          <span className="quote-pro-rocket">🚀</span>
                          <h3>¿CÓMO INICIAR?</h3>
                        </div>

                        <div className="quote-pro-steps">
                          <div><b>1</b><span>Confirmás la propuesta</span></div>
                          <i>→</i>
                          <div><b>2</b><span>Realizás el pago inicial</span></div>
                          <i>→</i>
                          <div><b>3</b><span>Formalizamos tu expediente</span></div>
                          <i>→</i>
                          <div><b>4</b><span>Iniciamos la coordinación</span></div>
                          <i>→</i>
                          <div><b>5</b><span>Te mantenemos informado</span></div>
                        </div>
                      </article>

                      <article className="quote-pro-important-card">
                        <div className="quote-pro-important-icon">▤</div>
                        <div>
                          <h3>IMPORTANTE</h3>
                          <ul>
                            <li>Cotización sujeta a validación final.</li>
                            <li>Valores pueden variar por actualizaciones de SAT, naviera o gastos operativos.</li>
                            <li>Se confirmarán al momento de iniciar el proceso con la documentación completa.</li>
                          </ul>
                        </div>
                      </article>
                    </div>
                  </section>

                  <section className="quote-pro-assurance">
                    <article>
                      <span className="quote-pro-assurance-icon">▣</span>
                      <div>
                        <h3>VIGENCIA DE COTIZACIÓN</h3>
                        <strong>15 días</strong>
                        <p>Después de esta fecha los valores pueden variar.</p>
                      </div>
                    </article>

                    <article>
                      <span className="quote-pro-assurance-icon">🤝</span>
                      <div>
                        <h3>ESTAMOS PARA SERVIRTE</h3>
                        <p>Cualquier duda, con gusto te asesoramos.</p>
                        <strong>{tenantBrandName}</strong>
                        <small>Tu vehículo, en manos expertas.</small>
                      </div>
                    </article>
                  </section>

                  <footer className="quote-sheet-footer quote-pro-footer">
                    <div className="quote-pro-footer-slogan">
                      "Más que trámites, soluciones."
                    </div>

                    <div className="quote-pro-footer-contact">
                      <span className="quote-pro-footer-svg-icon whatsapp">
                        <QuoteWhatsAppIcon />
                      </span>
                      <strong>
                        {appSettings?.whatsapp_number ||
                          tenantBranding?.whatsapp ||
                          tenantBranding?.phone ||
                          "Contáctanos"}
                      </strong>
                    </div>

                    <div className="quote-pro-footer-location">
                      <span className="quote-pro-footer-svg-icon location">
                        <QuoteLocationIcon />
                      </span>
                      <strong>
                        {tenantBranding?.address || "Puerto Barrios, Izabal · Guatemala"}
                      </strong>
                    </div>

                    <div className="quote-pro-footer-social">
                      <div className="quote-social-icons" aria-label="Redes sociales">
                        <span><QuoteFacebookIcon /></span>
                        <span><QuoteInstagramIcon /></span>
                        <span><QuoteTikTokIcon /></span>
                      </div>
                      <strong>{tenantBrandName}</strong>
                    </div>
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