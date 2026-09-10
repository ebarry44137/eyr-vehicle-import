import { useEffect } from "react";

const Item = ({ icon, label, active, onClick }) => (
  <button type="button" className={`imn-item${active ? " active" : ""}`} onClick={onClick}>
    <span className="imn-icon">{icon}</span>
    <span>{label}</span>
  </button>
);

export default function InternalMobileNav({
  activeView, moreOpen, setMoreOpen, onNavigate, onNewQuote, onQuotations,
  onProspects, onImports, onOrganizations, onSubscriptions, onSettings, onLogout, permissions = {},
}) {
  const {
    isSystemAdmin, isTenantAdmin, isFullOfficePlan, isWhiteLabelClient,
    canManageOfficeUsers, canManagePortalClients, canManageImporters,
    canUseTenantImports, canUseOfficeOperations, canUseTenantDuca, canUseTenantFinance,
  } = permissions;

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (e) => { if (e.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen, setMoreOpen]);

  const go = (view) => () => onNavigate(view);
  const action = (fn) => () => { setMoreOpen(false); fn?.(); };

  return (
    <>
      {moreOpen && <button className="imn-backdrop" aria-label="Cerrar menú" onClick={() => setMoreOpen(false)} />}
      <section className={`imn-more-sheet${moreOpen ? " open" : ""}`} aria-hidden={!moreOpen}>
        <div className="imn-sheet-handle" />
        <div className="imn-sheet-head"><div><small>E&R SOLUTIONS</small><strong>Más herramientas</strong></div><button onClick={() => setMoreOpen(false)}>×</button></div>
        <div className="imn-more-grid">
          <Item icon="＋" label="Nueva cotización" active={activeView === "new"} onClick={action(onNewQuote)} />
          <Item icon="▤" label="Cotizaciones" active={activeView === "quotations"} onClick={action(onQuotations)} />
          {(isSystemAdmin || (isTenantAdmin && isFullOfficePlan)) && <Item icon="🎨" label="Mi Marca" active={activeView === "branding"} onClick={go("branding")} />}
          {isSystemAdmin && <Item icon="🏢" label="Oficinas / Clientes" active={activeView === "organizations"} onClick={action(onOrganizations)} />}
          {isSystemAdmin && <Item icon="♙" label="Suscripciones" active={activeView === "subscriptions"} onClick={action(onSubscriptions)} />}
          {isSystemAdmin && <Item icon="♟" label="Usuarios internos" active={activeView === "internal-users"} onClick={go("internal-users")} />}
          {canManageOfficeUsers && <Item icon="👥" label="Usuarios oficina" active={activeView === "office-users"} onClick={go("office-users")} />}
          {canManagePortalClients && <Item icon="💬" label="Clientes Portal" active={activeView === "portal-clients"} onClick={go("portal-clients")} />}
          {canManageImporters && <Item icon="🚢" label="Importadores" active={activeView === "importers"} onClick={go("importers")} />}
          {!isWhiteLabelClient && <Item icon="◎" label="Prospectos" active={activeView === "prospects"} onClick={action(onProspects)} />}
          {canUseTenantImports && <Item icon="📦" label="Gestiones" active={activeView === "imports"} onClick={action(onImports)} />}
          {canUseOfficeOperations && <Item icon="📄" label="Declaraciones" active={activeView === "declarations"} onClick={go("declarations")} />}
          {canUseTenantDuca && <Item icon="📑" label="Correlativos DUCA" active={activeView === "correlatives"} onClick={go("correlatives")} />}
          {canUseTenantFinance && <Item icon="💰" label="Finanzas" active={activeView === "finance"} onClick={go("finance")} />}
          {isSystemAdmin && <Item icon="🛠" label="Administración" active={activeView === "admin-center"} onClick={go("admin-center")} />}
          {isSystemAdmin && <Item icon="⚙" label="Configuración" active={activeView === "settings"} onClick={action(onSettings)} />}
        </div>
        <button className="imn-logout" type="button" onClick={action(onLogout)}>↪ Cerrar sesión</button>
      </section>

      <nav className="imn-dock" aria-label="Navegación principal móvil">
        <Item icon="⌂" label="Inicio" active={activeView === "dashboard"} onClick={go("dashboard")} />
        {canUseOfficeOperations ? <Item icon="▣" label="Aduanal" active={activeView === "customs"} onClick={go("customs")} /> : <Item icon="▤" label="Cotizaciones" active={activeView === "quotations"} onClick={action(onQuotations)} />}
        {canManagePortalClients ? <Item icon="👥" label="Clientes" active={activeView === "portal-clients"} onClick={go("portal-clients")} /> : canUseTenantImports ? <Item icon="🚢" label="Gestiones" active={activeView === "imports"} onClick={action(onImports)} /> : <Item icon="◎" label="Prospectos" active={activeView === "prospects"} onClick={action(onProspects)} />}
        <Item icon="＋" label="Nuevo" active={activeView === "new"} onClick={action(onNewQuote)} />
        <Item icon="•••" label="Más" active={moreOpen} onClick={() => setMoreOpen(!moreOpen)} />
      </nav>
    </>
  );
}
