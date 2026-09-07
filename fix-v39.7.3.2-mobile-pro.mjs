import fs from 'fs';
import path from 'path';

const target = path.resolve('src/App.css');
if (!fs.existsSync(target)) {
  console.error('❌ No encontré src/App.css. Ejecutá este instalador desde la raíz del proyecto.');
  process.exit(1);
}

const marker = '/* V39.7.3.2 · MOBILE PRO E&R */';
let css = fs.readFileSync(target, 'utf8');

if (css.includes(marker)) {
  console.log('ℹ️ V39.7.3.2 ya está instalada. No hice cambios duplicados.');
  process.exit(0);
}

const backup = `${target}.backup-v39.7.3.2-mobile-pro`;
fs.copyFileSync(target, backup);

const patch = `

${marker}
/*
   Mobile-first visual layer.
   Solo CSS: no toca App.jsx, lógica, Supabase, Firebase, R2 ni cotización.
*/

@media (max-width: 900px) {
  /* ===== APP INTERNA: navegación tipo aplicación ===== */
  .app {
    display: block !important;
    min-height: 100dvh !important;
    background: #f4f7fb !important;
  }

  .app > .sidebar {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    bottom: 0 !important;
    z-index: 1200 !important;
    width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    padding: 7px 8px calc(7px + env(safe-area-inset-bottom, 0px)) !important;
    display: block !important;
    border-top: 1px solid rgba(255,255,255,.10) !important;
    box-shadow: 0 -14px 38px rgba(5, 24, 46, .18) !important;
    background:
      radial-gradient(circle at 15% 0%, rgba(49, 105, 178, .28), transparent 35%),
      linear-gradient(180deg, #0a2748 0%, #06182e 100%) !important;
  }

  .app > .sidebar .brand {
    display: none !important;
  }

  .app > .sidebar .sidebar-footer {
    display: none !important;
  }

  .app > .sidebar > nav {
    width: 100% !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    gap: 6px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    padding: 0 1px 1px !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }

  .app > .sidebar > nav::-webkit-scrollbar {
    display: none !important;
  }

  .app > .sidebar .nav-item {
    flex: 0 0 72px !important;
    width: 72px !important;
    min-width: 72px !important;
    min-height: 58px !important;
    padding: 7px 5px !important;
    border: 1px solid transparent !important;
    border-radius: 14px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 3px !important;
    color: #9fb3ca !important;
    font-size: 8px !important;
    font-weight: 800 !important;
    line-height: 1.1 !important;
    text-align: center !important;
    white-space: normal !important;
  }

  .app > .sidebar .nav-item span {
    width: auto !important;
    min-width: 0 !important;
    font-size: 19px !important;
    line-height: 1 !important;
  }

  .app > .sidebar .nav-item.active {
    color: #fff !important;
    border-color: rgba(232, 167, 45, .26) !important;
    background: linear-gradient(180deg, rgba(232,167,45,.22), rgba(232,167,45,.08)) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.05) !important;
  }

  /* Campana separada de la barra inferior */
  .app > .sidebar .admin-notification-center {
    position: fixed !important;
    top: calc(12px + env(safe-area-inset-top, 0px)) !important;
    right: 14px !important;
    z-index: 1350 !important;
    margin: 0 !important;
  }

  .app > .sidebar .admin-notification-trigger {
    width: 44px !important;
    height: 44px !important;
    border-radius: 14px !important;
    border: 1px solid rgba(232,167,45,.32) !important;
    background: linear-gradient(145deg, #123c68, #0a2748) !important;
    box-shadow: 0 10px 28px rgba(7, 30, 57, .22) !important;
  }

  .app > .sidebar .admin-notification-panel {
    position: fixed !important;
    top: calc(66px + env(safe-area-inset-top, 0px)) !important;
    left: 12px !important;
    right: 12px !important;
    width: auto !important;
    max-height: calc(100dvh - 150px) !important;
  }

  .app > .main {
    margin-left: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
    padding: calc(20px + env(safe-area-inset-top, 0px)) 14px calc(92px + env(safe-area-inset-bottom, 0px)) !important;
    overflow-x: hidden !important;
  }

  .app > .main .topbar {
    max-width: none !important;
    margin: 0 0 18px !important;
    padding-right: 54px !important;
    gap: 12px !important;
    align-items: flex-start !important;
  }

  .app > .main .topbar h1 {
    font-size: clamp(28px, 8vw, 34px) !important;
    line-height: 1.02 !important;
    letter-spacing: -1.2px !important;
  }

  .app > .main .topbar p {
    max-width: 520px !important;
    font-size: 13px !important;
    line-height: 1.5 !important;
  }

  .app > .main .engine-status {
    flex: 0 0 auto !important;
    min-height: 42px !important;
    padding: 8px 11px !important;
    border-radius: 14px !important;
    font-size: 10px !important;
  }

  .app > .main .vin-card {
    border-radius: 24px !important;
    padding: 24px 16px !important;
    box-shadow: 0 18px 45px rgba(10, 52, 88, .12) !important;
  }

  .app > .main .vin-card-content {
    gap: 14px !important;
    align-items: flex-start !important;
  }

  .app > .main .vin-icon {
    width: 58px !important;
    height: 58px !important;
    min-width: 58px !important;
    border-radius: 17px !important;
    font-size: 25px !important;
  }

  .app > .main .vin-card h2 {
    font-size: clamp(27px, 8vw, 36px) !important;
    line-height: 1.07 !important;
    letter-spacing: -1px !important;
  }

  .app > .main .vin-card p {
    font-size: 13px !important;
    line-height: 1.5 !important;
  }

  .app > .main .internal-quote-mode {
    margin-top: 18px !important;
  }

  .app > .main .quote-mode-tabs,
  .app > .main .internal-quote-mode-tabs {
    width: 100% !important;
  }

  .app > .main input,
  .app > .main select,
  .app > .main textarea,
  .app > .main button {
    max-width: 100%;
  }
}

@media (max-width: 680px) {
  /* ===== LANDING: header móvil real ===== */
  .public-site .public-nav {
    width: calc(100% - 24px) !important;
    min-height: 86px !important;
    height: auto !important;
    padding: 8px 0 !important;
    gap: 10px !important;
    align-items: center !important;
  }

  .public-site .public-brand-logo {
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0 !important;
    height: 72px !important;
    overflow: visible !important;
  }

  .public-site .public-brand-logo img {
    width: 188px !important;
    height: 68px !important;
    max-width: 100% !important;
    max-height: 68px !important;
    object-fit: contain !important;
    object-position: left center !important;
    transform: none !important;
    margin: 0 !important;
  }

  .public-site .public-nav nav {
    flex: 0 0 auto !important;
    margin-left: auto !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 0 !important;
  }

  .public-site .public-nav .public-nav-link,
  .public-site .public-nav .public-nav-quote {
    display: none !important;
  }

  .public-site .public-nav .public-login-link {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-width: 96px !important;
    min-height: 43px !important;
    padding: 0 13px !important;
    border: 1px solid rgba(203, 151, 39, .42) !important;
    border-radius: 14px !important;
    background: linear-gradient(145deg, #fffaf0, #fff) !important;
    color: #0a3458 !important;
    font-size: 11px !important;
    font-weight: 900 !important;
    box-shadow: 0 8px 22px rgba(10, 52, 88, .07) !important;
    white-space: nowrap !important;
  }

  .public-site .public-hero {
    width: calc(100% - 24px) !important;
    margin-top: 8px !important;
    padding: 30px 22px !important;
    border-radius: 28px !important;
  }

  .public-site .public-hero h1 {
    font-size: clamp(38px, 11vw, 47px) !important;
    line-height: 1.03 !important;
    letter-spacing: -1.8px !important;
  }

  .public-site .public-hero-content > p {
    font-size: 16px !important;
    line-height: 1.55 !important;
  }

  .public-site .public-primary {
    min-height: 54px !important;
    border-radius: 16px !important;
  }
}

@media (max-width: 390px) {
  .public-site .public-brand-logo img {
    width: 165px !important;
  }

  .public-site .public-nav .public-login-link {
    min-width: 88px !important;
    padding: 0 10px !important;
    font-size: 10px !important;
  }

  .app > .main {
    padding-left: 11px !important;
    padding-right: 11px !important;
  }

  .app > .main .vin-card {
    padding-left: 14px !important;
    padding-right: 14px !important;
  }
}
`;

css += patch;
fs.writeFileSync(target, css, 'utf8');

console.log(`✅ Backup creado: ${backup}`);
console.log('');
console.log('✅ V39.7.3.2 · Mobile PRO aplicada.');
console.log('✅ Landing móvil: Acceso E&R visible.');
console.log('✅ App móvil: sidebar vertical -> navegación inferior deslizable.');
console.log('✅ Campana de notificaciones flotante arriba.');
console.log('✅ Contenido interno usa el 100% del ancho disponible.');
console.log('✅ No se modificó App.jsx, cotización, Supabase, Firebase ni R2.');
console.log('');
console.log('➡️ Ahora ejecutá: npm run build');
