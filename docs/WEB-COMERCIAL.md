# Portada comercial E&R Solutions

La ruta `/` presenta transporte de vehículos, logística internacional y gestión aduanal con una dirección visual basada en la referencia pública de La Familia de Dios: fondo oscuro continuo, tipografía fuerte, navegación fija, acentos naranja del logo original y mosaico fotográfico asimétrico. Incluye servicios, proceso, acceso al cotizador, preguntas frecuentes y consulta por WhatsApp. Usa el logo original del proyecto.

## Alcance

- Componente: `src/modules/commercial-landing/CommercialLanding.jsx`.
- Estilos limitados a `.eyr-commercial`. Se oculta en esta portada el chat interno que el sistema monta globalmente; las otras rutas conservan ese chat.
- Imágenes WebP locales en `public/commercial/`. Tres imágenes fueron generadas para esta propuesta (vehículos en puerto, transporte y documentos); la imagen del puerto reutiliza `public/branding/eyr-account-port-hero.png`. Todas son ilustrativas.
- `App.jsx` cambia únicamente la importación del componente y el bloque `siteMode === "landing"`.
- `index.html` actualiza metadatos comerciales; mantiene el mecanismo de identidad del sistema y de las oficinas.
- Se mantienen `/cotizador`, `/portal`, `/app`, `/o/:slug` y las páginas legales. No se cambian cálculos, SQL, funciones Edge ni permisos.

## Rediseño a partir de la referencia

- Portada con tres escenas seleccionables de vehículos, logística y aduanas, sin reproducción automática.
- Se mantiene un único `h1`, controles con estado accesible y soporte de movimiento reducido.
- Franja de origen y destino conectada al cotizador; no muestra horarios, estados operativos ni conteos inventados.
- Las imágenes ilustrativas no se presentan como una galería documental de operaciones propias.
- No se modificaron el sitio ni el repositorio de la Iglesia; solo se observó su página pública como referencia visual.

## Contacto y límite de esta etapa

El contacto usa `app_settings.whatsapp_number`, cargado por el flujo existente. No contiene teléfonos de demostración ni claves nuevas. Cuando no hay un contacto válido, se desactiva el envío y se ofrece el cotizador.

El formulario valida nombre, teléfono, servicio y aceptación de privacidad. Prepara una nueva pestaña de WhatsApp con los datos; el visitante debe enviar allí el mensaje. No confirma entrega ni escribe una oportunidad en el CRM. La captura pública en CRM requiere una etapa posterior que valide endpoint, permisos, duplicados y tratamiento de datos.

## Correos y redes sociales

`agencyContact.js` centraliza los correos corporativos usados por el sistema. Se muestran enlaces `mailto:` de Edgar Barrientos (Logística) y Ronaldo Barrientos (Aduanas), únicamente en la sección Contacto. El número de WhatsApp se presenta solo si hay configuración válida. La ubicación se limita a Puerto Barrios, Izabal, Guatemala; no se añadió dirección exacta sin datos confirmados.

`agencySocialLinks` contiene los enlaces oficiales de Facebook, Instagram y TikTok compartidos por el usuario. Se abren en otra pestaña con `noopener noreferrer`. LinkedIn no se muestra porque no se proporcionó un enlace.

El horario confirmado, mostrado únicamente en la sección Contacto, es de lunes a viernes de 08:00 a 12:00 y de 14:00 a 18:00; sábados de 08:00 a 12:00. No se agregó un horario dominical.

Verificación adicional: enlaces de correo, WhatsApp condicional, redes confirmadas y horario y anchos 320, 390, 768 y 1440 px sin desbordamiento.

El pie de página conserva marca, navegación y enlaces legales. No repite el bloque de correos, redes ni horarios de la sección Contacto.

## Verificación realizada

- `npm ci --ignore-scripts` y `npm run build`: correctos; sigue el aviso previo de tamaño del bundle general.
- `npx oxlint src/modules/commercial-landing/CommercialLanding.jsx`: correcto.
- Prueba automatizada con Chromium en 320, 390, 768, 1280 y 1440 px: sin desbordamiento horizontal; menú móvil abre y cierra; formulario valida y prepara mensaje correctamente codificado; selección de servicio llega al formulario.
- Estados de configuración ausente y error de API: aviso visible y envío desactivado.
- Pantallas de cotizador, acceso, portal, identidad de oficina y páginas legales: renderizadas sin errores JavaScript con respuestas simuladas de Supabase.
- Revisión visual de capturas de escritorio y celular.

Estas pruebas usan configuración y respuestas simuladas. No verifican autenticación, cálculos, datos reales, entrega de WhatsApp ni operación del backend en producción. No enviaron mensajes ni modificaron datos de clientes.

## Revisión local

En una copia actualizada de `feat/web-comercial` con las variables locales habituales del proyecto:

```powershell
git pull --ff-only origin feat/web-comercial
npm run dev
```

Abrir la dirección que indique Vite y comprobar el contacto real configurado, navegación y apariencia en celular. Verificar que WhatsApp apunta al número de E&R antes de enviar mensajes reales.

## Publicación

La rama conserva `git.deploymentEnabled["feat/web-comercial"] = false` en `vercel.json`, por lo que la integración Git de Vercel no debe desplegarla automáticamente. No se modificó esta regla, no se fusionó en `main` y no se ejecutó un despliegue. La revisión y la autorización de publicación siguen pendientes. No activar despliegues, fusionar ni promover la rama como parte de la revisión local.
