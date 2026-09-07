import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.resolve(root, "src/App.jsx");
const cssPath = path.resolve(root, "src/App.css");

function fail(message) {
  console.error("❌ " + message);
  process.exit(1);
}

if (!fs.existsSync(appPath)) fail("No encontré src/App.jsx. Ejecutá este instalador desde la raíz del proyecto.");
if (!fs.existsSync(cssPath)) fail("No encontré src/App.css.");

const backupApp = path.resolve(root, "src/App.jsx.backup-v39.7.1.1-logo");
const backupCss = path.resolve(root, "src/App.css.backup-v39.7.1.1-logo");
fs.copyFileSync(appPath, backupApp);
fs.copyFileSync(cssPath, backupCss);

let app = fs.readFileSync(appPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");

const recoveredLogoBlock = "const VEHICLE_BRAND_LOGO_SLUGS = {\n  acura: \"acura\",\n  \"alfa romeo\": \"alfa-romeo\",\n  \"aston martin\": \"aston-martin\",\n  audi: \"audi\",\n  bentley: \"bentley\",\n  bmw: \"bmw\",\n  buick: \"buick\",\n  byd: \"byd\",\n  cadillac: \"cadillac\",\n  chevrolet: \"chevrolet\",\n  chevy: \"chevrolet\",\n  chrysler: \"chrysler\",\n  dodge: \"dodge\",\n  ferrari: \"ferrari\",\n  fiat: \"fiat\",\n  ford: \"ford\",\n  genesis: \"genesis\",\n  gmc: \"gmc\",\n  honda: \"honda\",\n  hyundai: \"hyundai\",\n  infiniti: \"infiniti\",\n  jaguar: \"jaguar\",\n  jeep: \"jeep\",\n  kia: \"kia\",\n  lamborghini: \"lamborghini\",\n  \"land rover\": \"land-rover\",\n  landrover: \"land-rover\",\n  lexus: \"lexus\",\n  lincoln: \"lincoln\",\n  lotus: \"lotus\",\n  lucid: \"lucid\",\n  maserati: \"maserati\",\n  mazda: \"mazda\",\n  mclaren: \"mclaren\",\n  \"mc laren\": \"mclaren\",\n  \"mercedes benz\": \"mercedes-benz\",\n  \"mercedes-benz\": \"mercedes-benz\",\n  mercedes: \"mercedes-benz\",\n  mini: \"mini\",\n  \"mini cooper\": \"mini\",\n  mitsubishi: \"mitsubishi\",\n  nissan: \"nissan\",\n  polestar: \"polestar\",\n  porsche: \"porsche\",\n  ram: \"ram\",\n  \"ram trucks\": \"ram\",\n  rivian: \"rivian\",\n  \"rolls royce\": \"rolls-royce\",\n  \"rolls-royce\": \"rolls-royce\",\n  subaru: \"subaru\",\n  tesla: \"tesla\",\n  toyota: \"toyota\",\n  vinfast: \"vinfast\",\n  \"vin fast\": \"vinfast\",\n  volkswagen: \"volkswagen\",\n  vw: \"volkswagen\",\n  volvo: \"volvo\",\n};\n\nfunction normalizeVehicleBrandName(make) {\n  return String(make || \"\")\n    .trim()\n    .toLowerCase()\n    .replace(/&/g, \"and\")\n    .replace(/[._/]+/g, \" \")\n    .replace(/\\s+/g, \" \")\n    .trim();\n}\n\nfunction officialVehicleLogoUrl(make) {\n  const normalized = normalizeVehicleBrandName(make);\n  const slug = VEHICLE_BRAND_LOGO_SLUGS[normalized];\n\n  if (!slug) return \"\";\n\n  return `https://raw.githubusercontent.com/diegojasso/car-logos-SVG/main/logos/${slug}.svg`;\n}\n\nfunction VehicleMakeLogo({ make }) {\n  const [pngDataUrl, setPngDataUrl] = useState(\"\");\n  const [logoError, setLogoError] = useState(false);\n\n  useEffect(() => {\n    let cancelled = false;\n\n    const url = officialVehicleLogoUrl(make);\n\n    setPngDataUrl(\"\");\n    setLogoError(false);\n\n    if (!url) {\n      setLogoError(true);\n      return () => {\n        cancelled = true;\n      };\n    }\n\n    async function loadAndRasterizeOfficialLogo() {\n      try {\n        const response = await fetch(url, {\n          mode: \"cors\",\n          cache: \"force-cache\",\n        });\n\n        if (!response.ok) {\n          throw new Error(`Logo HTTP ${response.status}`);\n        }\n\n        const svgText = await response.text();\n\n        // Normalizamos el SVG antes de rasterizarlo.\n        // Algunos logos traen width/height que no coinciden con su viewBox\n        // y eso hace que el navegador los estire al convertirlos a PNG.\n        const parser = new DOMParser();\n        const svgDocument = parser.parseFromString(\n          svgText,\n          \"image/svg+xml\"\n        );\n\n        const svgElement = svgDocument.documentElement;\n\n        if (\n          !svgElement ||\n          String(svgElement.nodeName).toLowerCase() !== \"svg\"\n        ) {\n          throw new Error(\"El archivo del fabricante no es un SVG v\u00e1lido.\");\n        }\n\n        const viewBoxRaw =\n          svgElement.getAttribute(\"viewBox\") ||\n          svgElement.getAttribute(\"viewbox\") ||\n          \"\";\n\n        const viewBox = viewBoxRaw\n          .trim()\n          .split(/[,\\s]+/)\n          .map(Number);\n\n        let sourceWidth = 512;\n        let sourceHeight = 256;\n\n        if (\n          viewBox.length === 4 &&\n          viewBox.every(Number.isFinite) &&\n          viewBox[2] > 0 &&\n          viewBox[3] > 0\n        ) {\n          sourceWidth = viewBox[2];\n          sourceHeight = viewBox[3];\n        } else {\n          const parsedWidth = Number.parseFloat(\n            String(svgElement.getAttribute(\"width\") || \"\")\n          );\n\n          const parsedHeight = Number.parseFloat(\n            String(svgElement.getAttribute(\"height\") || \"\")\n          );\n\n          if (\n            Number.isFinite(parsedWidth) &&\n            parsedWidth > 0 &&\n            Number.isFinite(parsedHeight) &&\n            parsedHeight > 0\n          ) {\n            sourceWidth = parsedWidth;\n            sourceHeight = parsedHeight;\n\n            svgElement.setAttribute(\n              \"viewBox\",\n              `0 0 ${sourceWidth} ${sourceHeight}`\n            );\n          }\n        }\n\n        // Muy importante: quitamos dimensiones r\u00edgidas del archivo original.\n        svgElement.removeAttribute(\"width\");\n        svgElement.removeAttribute(\"height\");\n        svgElement.setAttribute(\"width\", String(sourceWidth));\n        svgElement.setAttribute(\"height\", String(sourceHeight));\n        svgElement.setAttribute(\n          \"preserveAspectRatio\",\n          \"xMidYMid meet\"\n        );\n\n        const serializer = new XMLSerializer();\n        const normalizedSvgText =\n          serializer.serializeToString(svgElement);\n\n        const svgBlob = new Blob([normalizedSvgText], {\n          type: \"image/svg+xml;charset=utf-8\",\n        });\n\n        const objectUrl = URL.createObjectURL(svgBlob);\n\n        try {\n          const image = await new Promise((resolve, reject) => {\n            const img = new Image();\n\n            img.onload = () => resolve(img);\n            img.onerror = () =>\n              reject(\n                new Error(\n                  `No se pudo rasterizar el logo de ${make}.`\n                )\n              );\n\n            img.src = objectUrl;\n          });\n\n          // Conservamos SIEMPRE la proporci\u00f3n real del viewBox.\n          const ratio = sourceWidth / sourceHeight;\n\n          const maxWidth = 900;\n          const maxHeight = 480;\n\n          let targetWidth = maxWidth;\n          let targetHeight = targetWidth / ratio;\n\n          if (targetHeight > maxHeight) {\n            targetHeight = maxHeight;\n            targetWidth = targetHeight * ratio;\n          }\n\n          const canvas = document.createElement(\"canvas\");\n\n          canvas.width = Math.max(\n            1,\n            Math.round(targetWidth)\n          );\n\n          canvas.height = Math.max(\n            1,\n            Math.round(targetHeight)\n          );\n\n          const ctx = canvas.getContext(\"2d\", {\n            alpha: true,\n          });\n\n          if (!ctx) {\n            throw new Error(\n              \"No se pudo preparar el canvas del logo.\"\n            );\n          }\n\n          ctx.clearRect(0, 0, canvas.width, canvas.height);\n\n          ctx.drawImage(\n            image,\n            0,\n            0,\n            canvas.width,\n            canvas.height\n          );\n\n          const dataUrl = canvas.toDataURL(\"image/png\");\n\n          if (!cancelled) {\n            setPngDataUrl(dataUrl);\n          }\n        } finally {\n          URL.revokeObjectURL(objectUrl);\n        }\n      } catch (err) {\n        console.warn(\"VEHICLE BRAND LOGO RASTER ERROR:\", make, err);\n\n        if (!cancelled) {\n          setLogoError(true);\n        }\n      }\n    }\n\n    loadAndRasterizeOfficialLogo();\n\n    return () => {\n      cancelled = true;\n    };\n  }, [make]);\n\n  if (pngDataUrl) {\n    return (\n      <img\n        className={`quote-make-official-logo brand-${normalizeVehicleBrandName(make)\n          .replace(/[^a-z0-9]+/g, \"-\")\n          .replace(/^-+|-+$/g, \"\")}`}\n        data-quote-vehicle-logo=\"ready\"\n        src={pngDataUrl}\n        alt={`Logo ${make || \"veh\u00edculo\"}`}\n      />\n    );\n  }\n\n  return (\n    <div\n      className={`quote-make-logo-loading${logoError ? \" error\" : \"\"}`}\n      data-quote-vehicle-logo={logoError ? \"error\" : \"loading\"}\n    >\n      {logoError\n        ? String(make || \"MARCA\").toUpperCase()\n        : \"Cargando logo...\"}\n    </div>\n  );\n}\n\nasync function waitForVehicleLogoRaster(root) {\n  if (!root) return;\n\n  for (let attempt = 0; attempt < 50; attempt += 1) {\n    const state = root\n      .querySelector(\"[data-quote-vehicle-logo]\")\n      ?.getAttribute(\"data-quote-vehicle-logo\");\n\n    if (!state || state === \"ready\" || state === \"error\") {\n      break;\n    }\n\n    await new Promise((resolve) => setTimeout(resolve, 100));\n  }\n\n  const logo = root.querySelector(\n    'img[data-quote-vehicle-logo=\"ready\"]'\n  );\n\n  if (logo && !(logo.complete && logo.naturalWidth > 0)) {\n    await new Promise((resolve) => {\n      const done = () => resolve();\n\n      logo.addEventListener(\"load\", done, { once: true });\n      logo.addEventListener(\"error\", done, { once: true });\n\n      setTimeout(done, 1500);\n    });\n  }\n\n  await new Promise((resolve) =>\n    requestAnimationFrame(() =>\n      requestAnimationFrame(resolve)\n    )\n  );\n}\n\n";
const recoveredCss = "/* =========================================================\n   E&R V39.6.16 \u00b7 LOGO FABRICANTE RASTERIZADO PARA PNG\n   ========================================================= */\n\n.quote-preview.tenant-quote-preview .quote-make-official-logo{\n  display:block!important;\n  width:auto!important;\n  height:auto!important;\n  max-width:132px!important;\n  max-height:80px!important;\n  object-fit:contain!important;\n  object-position:center!important;\n  margin:auto!important;\n  transform:none!important;\n}\n\n.quote-preview.tenant-quote-preview .quote-make-logo-loading{\n  width:125px!important;\n  min-height:44px!important;\n  display:flex!important;\n  align-items:center!important;\n  justify-content:center!important;\n  color:#8a98a5!important;\n  font-size:8px!important;\n  font-weight:800!important;\n  text-align:center!important;\n}\n\n.quote-preview.tenant-quote-preview .quote-make-logo-loading.error{\n  color:#536372!important;\n  font-size:12px!important;\n  font-weight:950!important;\n}\n\n\n\n/* =========================================================\n   E&R V39.6.17 \u00b7 PROPORCI\u00d3N REAL DE LOGOS\n   Evita que marcas anchas/altas se vean estiradas\n   ========================================================= */\n\n.quote-preview.tenant-quote-preview .quote-make-official-logo{\n  width:auto!important;\n  height:auto!important;\n  max-width:124px!important;\n  max-height:72px!important;\n  object-fit:contain!important;\n  object-position:center!important;\n}\n\n/* Wordmarks naturalmente muy anchos */\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-toyota,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-nissan,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-hyundai,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-volkswagen,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-mercedes-benz{\n  max-width:116px!important;\n  max-height:64px!important;\n}\n\n/* Emblemas m\u00e1s cuadrados */\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-honda,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-chevrolet,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-bmw,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-audi,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-ram,\n.quote-preview.tenant-quote-preview .quote-make-official-logo.brand-jeep{\n  max-width:110px!important;\n  max-height:74px!important;\n}\n";

// 1) Recuperar el motor completo de logos V39.6.17.
// Reemplazamos SOLO desde el mapa de marcas hasta antes de QuoteWhatsAppIcon.
const startMarker = "const VEHICLE_BRAND_LOGO_SLUGS";
const endMarker = "function QuoteWhatsAppIcon";
const start = app.indexOf(startMarker);
const end = app.indexOf(endMarker, Math.max(0, start));

if (start >= 0 && end > start) {
  app = app.slice(0, start) + recoveredLogoBlock + app.slice(end);
} else {
  // Si una versión posterior eliminó completamente el bloque, lo insertamos antes de QuoteWhatsAppIcon.
  const iconAt = app.indexOf(endMarker);
  if (iconAt < 0) fail("No encontré function QuoteWhatsAppIcon; no modificaré App.jsx a ciegas.");
  app = app.slice(0, iconAt) + recoveredLogoBlock + app.slice(iconAt);
}

// 2) Asegurar que el diseño use el componente rasterizado.
if (!app.includes("<VehicleMakeLogo make={vehicle?.make} />")) {
  const badgeRegex = /<div className="quote-pro-make-badge">[\s\S]*?<\/div>/;
  if (!badgeRegex.test(app)) fail("No encontré quote-pro-make-badge para colocar el logo.");
  app = app.replace(
    badgeRegex,
    `<div className="quote-pro-make-badge">\n                      <VehicleMakeLogo make={vehicle?.make} />\n                    </div>`
  );
}

// 3) html2canvas DEBE esperar a que el SVG haya sido convertido a PNG.
if (!app.includes("await waitForVehicleLogoRaster(quoteRef.current);")) {
  const canvasAnchor = "const canvas = await html2canvas(quoteRef.current";
  const canvasAt = app.indexOf(canvasAnchor);
  if (canvasAt < 0) fail("No encontré la captura html2canvas de la cotización.");
  app =
    app.slice(0, canvasAt) +
    "await waitForVehicleLogoRaster(quoteRef.current);\n\n      " +
    app.slice(canvasAt);
}

// 4) Restaurar CSS de V39.6.16/17 sin tocar el resto.
const cssMarker = "/* V39.7.1.1 · RESTORE LOGO FABRICANTE */";
if (!css.includes(cssMarker)) {
  css += "\n\n" + cssMarker + "\n" + recoveredCss + "\n";
}

fs.writeFileSync(appPath, app, "utf8");
fs.writeFileSync(cssPath, css, "utf8");

console.log("");
console.log("✅ V39.7.1.1 aplicada.");
console.log("✅ Motor V39.6.17 de logos oficiales restaurado.");
console.log("✅ SVG -> PNG rasterizado antes de html2canvas.");
console.log("✅ Proporción real de logos restaurada.");
console.log("✅ No se reemplazó tu App.jsx por una versión vieja.");
console.log("✅ Backups:");
console.log("   " + backupApp);
console.log("   " + backupCss);
console.log("");
console.log("➡️ Ejecutá: npm run build");
