import { useState } from "react";
import { agencyEmails, agencySocialLinks, agencyHours } from "./agencyContact.js";
import "./commercial-landing.css";

const asset = (name) => `/commercial/${name}.webp`;
const heroSlides = [
  { image: "hero", label: "Importación de vehículos", lead: "TU PRÓXIMO VEHÍCULO.", accent: "MÁS CERCA.", copy: "Desde Estados Unidos hasta Guatemala. Transporte, logística y gestión aduanal con un equipo que te acompaña." },
  { image: "port", label: "Logística internacional", lead: "DE ORIGEN A DESTINO.", accent: "CONECTADOS.", copy: "Tu operación necesita más que un traslado. Coordinamos los pasos para que sepás cómo avanzar." },
  { image: "documents", label: "Gestión aduanal", lead: "CADA TRÁMITE.", accent: "CON CLARIDAD.", copy: "Orientación documental y gestión aduanal en Guatemala, según las necesidades de tu importación." },
];
const services = [
  { name: "Transporte desde USA", image: "transport", copy: "Tu vehículo, desde el origen hasta Guatemala. Coordinamos el transporte según tu operación." },
  { name: "Logística internacional", image: "port", copy: "Conectamos las etapas de tu importación con coordinación y atención personalizada." },
  { name: "Gestión aduanal", image: "documents", copy: "Te orientamos con la documentación y los trámites aduanales en destino." },
];
const steps = [
  ["Contanos qué necesitás", "¿Ya tenés un vehículo o estás explorando opciones? Empecemos desde ahí."],
  ["Revisamos tu operación", "Conocemos el origen, el destino y los servicios que necesitás."],
  ["Coordinamos el servicio", "Definimos juntos el alcance y los siguientes pasos de tu importación."],
  ["Te acompañamos en destino", "Damos seguimiento a la gestión y te orientamos durante el proceso."],
];
const questions = [
  ["¿Puedo consultar si aún no tengo un VIN?", "Sí. Contanos qué servicio necesitás y en qué etapa estás. Para consultar un vehículo en el cotizador, sí necesitás su VIN."],
  ["¿Ofrecen solo gestión aduanal?", "Sí. Podés consultar por gestión aduanal o por una operación que también incluya transporte y coordinación logística. Revisamos el alcance según tu caso."],
  ["¿La estimación del cotizador es un precio definitivo?", "No. Es una referencia para evaluar tu importación. Los valores y servicios aplicables deben revisarse antes de confirmar la operación."],
];

function Icon({ kind = "arrow", ...props }) {
  const paths = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    chat: <><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8 8c0 4 4 7 7 7l1-2-3-1-1 1-2-2 1-1-1-3Z" /></>,
    person: <><circle cx="12" cy="7" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3M3 21h18" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    document: <><path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h7" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    facebook: <><path d="M14 21v-8h3l.5-4H14V7c0-1 .5-2 2-2h2V2h-3c-3 0-5 2-5 5v2H7v4h3v8" /></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".7" /></>,
    tiktok: <><path d="M14 3v12a4 4 0 1 1-4-4M14 3c1 4 3 5 6 5v3c-3 0-5-1-6-2" /></>,
    linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 10v7M11 17v-7M11 13c0-4 6-4 6 0v4" /><circle cx="7" cy="7" r=".6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[kind]}</svg>;
}

function AgencyContactDetails({ whatsappUrl, whatsappReady, number }) {
  return <div className="ec-agency-details">
    <p className="ec-contact-label">CONTACTO DIRECTO</p>
    {agencyEmails.map((contact) => <a className="ec-email-contact" href={`mailto:${contact.email}`} key={contact.email}><span className="ec-email-icon"><Icon kind="mail" /></span><span><small>{contact.area} · {contact.name}</small><strong>{contact.email}</strong></span><Icon /></a>)}
    {whatsappReady && <a className="ec-contact-number" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><Icon kind="chat" /><span>WhatsApp <strong>+{number}</strong></span><Icon /></a>}
    <p className="ec-contact-location">Puerto Barrios, Izabal · Guatemala</p>
    <div className="ec-business-hours"><span className="ec-hours-icon"><Icon kind="clock" /></span><div><p>HORARIO DE ATENCIÓN</p><div className="ec-hours-slots">{agencyHours.map((hours) => <div key={hours.label}><small>{hours.label}</small>{hours.periods.map((period) => <span key={period.opens}><time dateTime={period.opens}>{period.opens}</time> – <time dateTime={period.closes}>{period.closes}</time></span>)}</div>)}</div></div></div>
    {agencySocialLinks.length > 0 && <nav className="ec-social-links" aria-label="Redes sociales de E&R">{agencySocialLinks.map((social) => <a key={social.platform} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={`E&R Solutions en ${social.label}`}><Icon kind={social.platform} /><span>{social.label}</span></a>)}</nav>}
  </div>;
}

export default function CommercialLanding({ logo, whatsappNumber, settingsLoading, settingsError }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [service, setService] = useState("");
  const [scene, setScene] = useState(0);
  const currentScene = heroSlides[scene];
  const [formMessage, setFormMessage] = useState("");
  const number = String(whatsappNumber || "").replace(/\D/g, "");
  const whatsappReady = /^\d{8,15}$/.test(number);
  const whatsappUrl = whatsappReady ? `https://wa.me/${number}?text=${encodeURIComponent("Hola, me interesa conocer los servicios de E&R Solutions para mi importación.")}` : "#contacto";
  const contactProps = whatsappReady ? { href: whatsappUrl, target: "_blank", rel: "noopener noreferrer" } : { href: "#contacto" };

  function submitConsultation(event) {
    event.preventDefault();
    if (!whatsappReady) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    if (name.length < 2 || !/^\d{8,15}$/.test(phone.replace(/\D/g, ""))) {
      setFormMessage("Ingresá tu nombre y un teléfono válido de 8 a 15 dígitos.");
      return;
    }
    const message = ["Hola, E&R Solutions. Quiero asesoría para mi importación.", `Nombre: ${name}`, `WhatsApp: ${phone}`, `Servicio: ${service}`, `Mi operación: ${String(data.get("operation") || "").trim() || "Me gustaría recibir orientación."}`].join("\n");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setFormMessage("Tu consulta está preparada. Completá el envío del mensaje en WhatsApp para contactar al equipo. Si no se abrió, permití la nueva pestaña y volvé a intentar.");
  }

  return (
    <div className="eyr-commercial">
      <a href="#contenido-comercial" className="ec-skip">Saltar al contenido</a>
      <header className="ec-header">
        <div className="ec-wrap ec-header-inner">
          <a href="/" className="ec-brand" aria-label="E&R Solutions, inicio"><img src={logo} alt="E&R Solutions · Agencia Aduanal" width="200" height="81" /></a>
          <button type="button" className="ec-menu-toggle" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="ec-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon kind={menuOpen ? "close" : "menu"} /></button>
          <nav id="ec-navigation" className={menuOpen ? "ec-navigation ec-navigation-open" : "ec-navigation"} aria-label="Navegación principal" onClick={() => setMenuOpen(false)}>
            <a href="#inicio">Inicio</a><a href="#servicios">Servicios</a><a href="#como-importar">Cómo importar</a><a href="/cotizador">Cotizador</a><a href="#contacto">Contacto</a><a href="/portal" className="ec-button ec-button-orange">Portal de clientes <Icon /></a>
          </nav>
        </div>
      </header>
      <main id="contenido-comercial">
        <section id="inicio" className="ec-hero-shell" aria-labelledby="ec-title">
          <div className="ec-hero-scene">
            {heroSlides.map((item, index) => <img key={item.image} className={index === scene ? "ec-hero-image ec-scene-active" : "ec-hero-image"} src={asset(item.image)} alt="" fetchPriority={index === 0 ? "high" : "auto"} loading={index === 0 ? "eager" : "lazy"} width="1536" height="1024" />)}
            <div className="ec-hero-overlay" />
            <div className="ec-wrap ec-hero">
              <div className="ec-hero-copy">
                <p className="ec-eyebrow"><span className="ec-live-dot" /> E&R Solutions · Guatemala</p>
                <div className="ec-scene-text" key={scene}>
                  <h1 id="ec-title">{currentScene.lead}<br /><em>{currentScene.accent}</em></h1>
                  <p className="ec-hero-description">{currentScene.copy}</p>
                </div>
                <ul className="ec-trust"><li><Icon kind="globe" /> Transporte desde USA</li><li><Icon kind="document" /> Logística y gestión aduanal</li><li><Icon kind="person" /> Atención personalizada</li></ul>
                <div className="ec-actions"><a href="#contacto" className="ec-button ec-button-orange">COTIZÁ TU IMPORTACIÓN <Icon /></a><a {...contactProps} className="ec-button ec-button-outline"><Icon kind="chat" /> HABLEMOS</a></div>
              </div>
              <div className="ec-scene-controls"><div className="ec-scene-buttons" role="group" aria-label="Escenas de nuestros servicios">{heroSlides.map((item, index) => <button type="button" key={item.image} aria-label={`Ver ${item.label}`} aria-pressed={scene === index} onClick={() => setScene(index)}><span>0{index + 1}</span><i /></button>)}</div><span className="ec-scene-caption">{currentScene.label}</span></div>
            </div>
          </div>
          <div className="ec-wrap ec-route-strip">
            <div className="ec-route-item"><span className="ec-route-icon"><Icon kind="globe" /></span><div><small>DESDE EL ORIGEN</small><strong>Estados Unidos</strong><span>Coordinación de transporte</span></div></div>
            <div className="ec-route-connection"><span /><Icon /><span /></div>
            <div className="ec-route-item"><span className="ec-route-icon"><Icon kind="document" /></span><div><small>HASTA TU DESTINO</small><strong>Guatemala</strong><span>Logística y gestión aduanal</span></div></div>
            <a href="/cotizador" className="ec-route-quoter"><span>¿YA TENÉS EL VIN?</span><strong>Hacé tus números <Icon /></strong><small>Abrir cotizador de vehículos</small></a>
          </div>
        </section>
        <section id="servicios" className="ec-section ec-services" aria-labelledby="ec-services-title"><div className="ec-wrap">
          <div className="ec-section-heading"><div><p className="ec-eyebrow">EL RESPALDO QUE NECESITÁS</p><h2 id="ec-services-title">UNA AGENCIA.<br /><em>TODA TU IMPORTACIÓN.</em></h2></div><p>Tu operación tiene distintas etapas.<br />Con E&R, encontrás un equipo para conectarlas.</p></div>
          <div className="ec-service-grid">{services.map((item, index) => <article className="ec-service-card" key={item.name}><div className="ec-service-top"><span className="ec-service-index">0{index + 1}</span><Icon kind={["globe", "arrow", "document"][index]} /></div><h3>{item.name}</h3><p>{item.copy}</p><a href="#contacto" onClick={() => setService(item.name)}>Consultar servicio <Icon /></a></article>)}</div>
          <div className="ec-service-note"><span>¿Solo necesitás una parte del proceso?</span><a href="#contacto" onClick={() => setService("Necesito orientación")}>CONTANOS TU CASO <Icon /></a></div>
        </div></section>
        <section className="ec-section ec-story" aria-labelledby="ec-story-title"><div className="ec-wrap">
          <div className="ec-section-heading"><div><p className="ec-eyebrow">VEHÍCULOS · LOGÍSTICA · ADUANAS</p><h2 id="ec-story-title">CADA ETAPA,<br /><em>CONECTADA.</em></h2></div><p>Desde la coordinación del transporte hasta la documentación en destino. Conocé las áreas en las que podemos acompañarte.</p></div>
          <div className="ec-story-grid"><article className="ec-story-tall"><img src={asset("port")} alt="Ilustración de un buque portacontenedores en puerto" loading="lazy" width="960" height="428" /><div><span>LOGÍSTICA INTERNACIONAL</span><h3>Unimos origen<br />y destino.</h3></div></article><article><img src={asset("transport")} alt="Imagen ilustrativa de transporte de vehículos" loading="lazy" width="960" height="640" /><div><span>TRANSPORTE DESDE USA</span><h3>Tu vehículo en movimiento.</h3></div></article><article className="ec-story-wide"><img src={asset("documents")} alt="Imagen ilustrativa de revisión de documentos de importación" loading="lazy" width="960" height="640" /><div><span>GESTIÓN ADUANAL</span><h3>Documentos con claridad.</h3></div></article></div>
        </div></section>
        <section id="como-importar" className="ec-section ec-process" aria-labelledby="ec-process-title"><div className="ec-wrap"><p className="ec-eyebrow">ASÍ EMPEZAMOS</p><div className="ec-section-heading"><h2 id="ec-process-title">TU IMPORTACIÓN.<br /><em>PASO A PASO.</em></h2><a href="#contacto" className="ec-text-link">REVISEMOS TU OPERACIÓN <Icon /></a></div><ol className="ec-steps">{steps.map(([title, copy], index) => <li key={title}><span className="ec-step-number">0{index + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol></div></section>
        <section className="ec-quoter" aria-labelledby="ec-quoter-title"><img className="ec-quoter-image" src={asset("hero")} alt="" loading="lazy" width="1536" height="1024" /><div className="ec-wrap ec-quoter-content"><span className="ec-quoter-badge"><Icon kind="document" /> COTIZADOR DE VEHÍCULOS</span><h2 id="ec-quoter-title">ANTES DE IMPORTAR,<br /><em>HACÉ TUS NÚMEROS.</em></h2><p>Consultá una estimación de tributos y flete.<br />Un primer paso para decidir con información.</p><a href="/cotizador" className="ec-button ec-button-orange">ABRIR COTIZADOR <Icon /></a><small>Valores estimados sujetos a revisión.</small></div></section>
        <section className="ec-section ec-faq" aria-labelledby="ec-faq-title"><div className="ec-wrap ec-faq-grid"><div><p className="ec-eyebrow">HABLEMOS CLARO</p><h2 id="ec-faq-title">TUS DUDAS.<br /><em>NUESTRO PUNTO<br />DE PARTIDA.</em></h2><a {...contactProps} className="ec-text-link">CONSULTANOS <Icon /></a></div><div className="ec-questions">{questions.map(([title, answer], index) => <details key={title} open={index === 0 ? true : undefined}><summary>{title}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></div></section>
        <section id="contacto" className="ec-contact ec-section" aria-labelledby="ec-contact-title"><div className="ec-wrap ec-contact-grid"><div className="ec-contact-copy"><p className="ec-eyebrow">EL SIGUIENTE PASO ES TUYO</p><h2 id="ec-contact-title">HAGAMOS QUE<br />TU IMPORTACIÓN<br /><em>EMPIECE AQUÍ.</em></h2><p>Contanos qué necesitás y en qué etapa estás. Revisemos juntos cómo podemos acompañarte.</p><a {...contactProps} className="ec-button ec-button-outline"><Icon kind="chat" /> ESCRIBIR POR WHATSAPP</a><AgencyContactDetails whatsappUrl={whatsappUrl} whatsappReady={whatsappReady} number={number} /><div className="ec-contact-signature"><img src={logo} alt="E&R Solutions" width="180" height="73" /><span>Transporte de vehículos.<br />Logística internacional.<br />Gestión aduanal.</span></div></div>
            <form className="ec-contact-form" onSubmit={submitConsultation}>
              <div className="ec-form-row"><label htmlFor="ec-name">Nombre<input id="ec-name" name="name" autoComplete="name" placeholder="Tu nombre completo" required minLength={2} maxLength={100} /></label><label htmlFor="ec-phone">WhatsApp<input id="ec-phone" name="phone" type="tel" autoComplete="tel" placeholder="Tu número de WhatsApp" required maxLength={25} /></label></div>
              <label htmlFor="ec-service">Servicio de interés<select id="ec-service" name="service" value={service} onChange={(event) => setService(event.target.value)} required><option value="">Seleccioná un servicio</option>{services.map((item) => <option key={item.name}>{item.name}</option>)}<option>Importación integral</option><option>Necesito orientación</option></select></label>
              <label htmlFor="ec-operation">Contanos sobre tu operación <span>(opcional)</span><textarea id="ec-operation" name="operation" placeholder="Tipo de vehículo, ubicación actual o servicio que necesitás…" rows={3} maxLength={1000} /></label>
              <label className="ec-consent"><input type="checkbox" required /> <span>He leído la <a href="/politica-de-privacidad">Política de Privacidad</a> y acepto compartir estos datos con E&R por WhatsApp.</span></label>
              <button className="ec-button ec-button-orange" type="submit" disabled={!whatsappReady}>Continuar en WhatsApp <Icon /></button><small>Revisá y enviá el mensaje en WhatsApp para completar tu consulta.</small>
              {!whatsappReady && <p className="ec-form-notice" role="status">{settingsLoading ? "Cargando el contacto de E&R…" : settingsError ? "No pudimos cargar el contacto. Recargá la página o consultá nuestro cotizador." : "El contacto de WhatsApp está temporalmente no disponible. Podés usar el cotizador mientras tanto."} {!settingsLoading && <a href="/cotizador">Abrir cotizador</a>}</p>}
              {formMessage && <p className="ec-form-notice" role="status">{formMessage}</p>}
            </form>
          </div></section>
      </main>
      <footer className="ec-footer"><div className="ec-wrap"><div className="ec-footer-top"><a href="/" className="ec-brand"><img src={logo} alt="E&R Solutions · Agencia Aduanal" loading="lazy" width="180" height="73" /></a><p>De Estados Unidos a Guatemala.<br /><strong>Con E&R Solutions.</strong></p><a href="#inicio" className="ec-back-top">VOLVER ARRIBA ↑</a></div><div className="ec-footer-bottom"><nav aria-label="Enlaces del sitio"><a href="/cotizador">Cotizador</a><a href="/portal">Portal de clientes</a><a href="/app">Acceso administrativo</a><a href="/politica-de-privacidad">Política de Privacidad</a><a href="/eliminacion-de-datos">Eliminación de Datos</a></nav><p className="ec-photo-note">Imágenes ilustrativas de servicios logísticos.</p></div></div></footer>
      <a {...contactProps} className="ec-floating-chat" aria-label={whatsappReady ? "Contactar a E&R por WhatsApp" : "Ver opciones de contacto"}><Icon kind="chat" /></a>
    </div>
  );
}
