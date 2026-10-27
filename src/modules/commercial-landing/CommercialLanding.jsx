import { useState } from "react";
import "./commercial-landing.css";

const asset = (name) => `/commercial/${name}.webp`;
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
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[kind]}</svg>;
}

export default function CommercialLanding({ logo, whatsappNumber, settingsLoading, settingsError }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [service, setService] = useState("");
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
      <div className="ec-hero-shell">
        <img className="ec-hero-image" src={asset("hero")} alt="" fetchPriority="high" width="1536" height="1024" />
        <header className="ec-header ec-wrap">
          <a href="/" className="ec-brand" aria-label="E&R Solutions, inicio"><img src={logo} alt="E&R Solutions · Agencia Aduanal" width="200" height="81" /></a>
          <button type="button" className="ec-menu-toggle" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="ec-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon kind={menuOpen ? "close" : "menu"} /></button>
          <nav id="ec-navigation" className={menuOpen ? "ec-navigation ec-navigation-open" : "ec-navigation"} aria-label="Navegación principal" onClick={() => setMenuOpen(false)}>
            <a href="#servicios">Servicios</a><a href="#como-importar">Cómo importar</a><a href="/cotizador">Cotizador</a><a href="/portal">Portal de clientes</a><a href="#contacto" className="ec-button ec-button-gold">Contáctanos <Icon /></a>
          </nav>
        </header>
        <main id="contenido-comercial">
          <section className="ec-hero ec-wrap" aria-labelledby="ec-title">
            <p className="ec-eyebrow">De Estados Unidos a Guatemala</p>
            <h1 id="ec-title">Tu próximo vehículo.<br /><em>Más cerca de lo<br className="ec-desktop-break" /> que imaginás.</em></h1>
            <p className="ec-hero-description">Transporte de vehículos, logística internacional y gestión aduanal. Te acompañamos en cada etapa.</p>
            <div className="ec-actions"><a href="#contacto" className="ec-button ec-button-gold">Cotizá tu importación <Icon /></a><a {...contactProps} className="ec-button ec-button-outline"><Icon kind="chat" /> Hablemos por WhatsApp</a></div>
            <a href="/cotizador" className="ec-vin-link">¿Ya tenés el VIN? Usá el cotizador <Icon /></a>
            <ul className="ec-trust"><li>Atención personalizada</li><li>Coordinación integral</li><li>Información clara</li></ul>
          </section>
          <section id="servicios" className="ec-section ec-services" aria-labelledby="ec-services-title">
            <div className="ec-wrap"><p className="ec-eyebrow">Nuestros servicios</p><h2 id="ec-services-title">Una agencia.<br className="ec-mobile-break" /> Toda tu importación.</h2>
              <div className="ec-service-grid">{services.map((item) => <article className="ec-service-card" key={item.name}><div className="ec-card-image"><img src={asset(item.image)} alt="" loading="lazy" width="768" height="512" /></div><div className="ec-card-copy"><h3>{item.name}</h3><p>{item.copy}</p><a href="#contacto" onClick={() => setService(item.name)}>Consultar servicio <Icon /></a></div></article>)}</div>
            </div>
          </section>
          <section id="como-importar" className="ec-section ec-process" aria-labelledby="ec-process-title"><div className="ec-wrap"><p className="ec-eyebrow">Cómo funciona</p><h2 id="ec-process-title">De la primera consulta<br /> al siguiente paso.</h2><ol className="ec-steps">{steps.map(([title, copy], index) => <li key={title}><span className="ec-step-number">0{index + 1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol></div></section>
          <section className="ec-quoter" aria-labelledby="ec-quoter-title"><div className="ec-quoter-visual"><img src={asset("hero")} alt="Vehículos en un puerto, imagen ilustrativa de importación" loading="lazy" width="1536" height="1024" /></div><div className="ec-quoter-copy"><p className="ec-eyebrow">Cotizá con información</p><h2 id="ec-quoter-title">Antes de importar,<br /> hacé tus números.</h2><p>Consultá una estimación de tributos y flete con nuestro cotizador de vehículos.</p><a href="/cotizador" className="ec-button ec-button-gold">Ir al cotizador <Icon /></a><small>Valores estimados sujetos a revisión.</small></div></section>
          <section className="ec-section ec-difference" aria-labelledby="ec-difference-title"><div className="ec-wrap ec-difference-grid"><div><p className="ec-eyebrow">Nuestra diferencia</p><h2 id="ec-difference-title">Importar con claridad<br /> cambia todo.</h2><div className="ec-benefits">{[["person", "Un equipo que te orienta", "Asesoría cercana para entender tu operación."], ["globe", "Servicios según tu operación", "Acompañamiento según la etapa en que estés."], ["document", "Información para decidir", "Conocé los siguientes pasos antes de avanzar."]].map(([icon, title, copy]) => <div key={title}><span className="ec-benefit-icon"><Icon kind={icon} /></span><h3>{title}</h3><p>{copy}</p></div>)}</div></div><img className="ec-difference-photo" src={asset("documents")} alt="Imagen ilustrativa de coordinación de documentos de importación" loading="lazy" width="768" height="512" /></div></section>
          <section className="ec-section ec-faq" aria-labelledby="ec-faq-title"><div className="ec-wrap"><p className="ec-eyebrow">Preguntas frecuentes</p><h2 id="ec-faq-title">Resolvamos tus primeras dudas.</h2><div className="ec-questions">{questions.map(([title, answer], index) => <details key={title} open={index === 0 ? true : undefined}><summary>{title}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></div></section>
          <section id="contacto" className="ec-contact ec-section" aria-labelledby="ec-contact-title"><div className="ec-wrap ec-contact-grid"><div className="ec-contact-copy"><p className="ec-eyebrow">Hablemos de tu importación</p><h2 id="ec-contact-title">Tu importación empieza<br /> con una conversación.</h2><p>Contanos qué necesitás y revisemos juntos el siguiente paso.</p><a {...contactProps} className="ec-button ec-button-outline"><Icon kind="chat" /> Escribir por WhatsApp</a></div>
            <form className="ec-contact-form" onSubmit={submitConsultation}>
              <div className="ec-form-row"><label htmlFor="ec-name">Nombre<input id="ec-name" name="name" autoComplete="name" placeholder="Tu nombre completo" required minLength={2} maxLength={100} /></label><label htmlFor="ec-phone">WhatsApp<input id="ec-phone" name="phone" type="tel" autoComplete="tel" placeholder="Tu número de WhatsApp" required maxLength={25} /></label></div>
              <label htmlFor="ec-service">Servicio de interés<select id="ec-service" name="service" value={service} onChange={(event) => setService(event.target.value)} required><option value="">Seleccioná un servicio</option>{services.map((item) => <option key={item.name}>{item.name}</option>)}<option>Importación integral</option><option>Necesito orientación</option></select></label>
              <label htmlFor="ec-operation">Contanos sobre tu operación <span>(opcional)</span><textarea id="ec-operation" name="operation" placeholder="Tipo de vehículo, ubicación actual o servicio que necesitás…" rows={3} maxLength={1000} /></label>
              <label className="ec-consent"><input type="checkbox" required /> <span>He leído la <a href="/politica-de-privacidad">Política de Privacidad</a> y acepto compartir estos datos con E&R por WhatsApp.</span></label>
              <button className="ec-button ec-button-gold" type="submit" disabled={!whatsappReady}>Continuar en WhatsApp <Icon /></button><small>Revisá y enviá el mensaje en WhatsApp para completar tu consulta.</small>
              {!whatsappReady && <p className="ec-form-notice" role="status">{settingsLoading ? "Cargando el contacto de E&R…" : settingsError ? "No pudimos cargar el contacto. Recargá la página o consultá nuestro cotizador." : "El contacto de WhatsApp está temporalmente no disponible. Podés usar el cotizador mientras tanto."} {!settingsLoading && <a href="/cotizador">Abrir cotizador</a>}</p>}
              {formMessage && <p className="ec-form-notice" role="status">{formMessage}</p>}
            </form>
          </div></section>
        </main>
      </div>
      <footer className="ec-footer"><div className="ec-wrap"><div className="ec-footer-top"><a href="/" className="ec-brand"><img src={logo} alt="E&R Solutions · Agencia Aduanal" loading="lazy" width="200" height="81" /></a><p>Importación de vehículos · Logística internacional · Gestión aduanal</p></div><nav aria-label="Enlaces del sitio"><a href="/cotizador">Cotizador</a><a href="/portal">Portal de clientes</a><a href="/app">Acceso administrativo</a><a href="/politica-de-privacidad">Política de Privacidad</a><a href="/eliminacion-de-datos">Eliminación de Datos</a></nav><p className="ec-photo-note">Imágenes ilustrativas de servicios logísticos.</p></div></footer>
      <a {...contactProps} className="ec-floating-chat" aria-label={whatsappReady ? "Contactar a E&R por WhatsApp" : "Ver opciones de contacto"}><Icon kind="chat" /></a>
    </div>
  );
}
