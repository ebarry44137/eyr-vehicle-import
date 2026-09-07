import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.resolve(root, "src/App.jsx");

function fail(message) {
  console.error("❌ " + message);
  process.exit(1);
}

if (!fs.existsSync(appPath)) {
  fail("No encontré src/App.jsx. Ejecutá este archivo desde la raíz del proyecto.");
}

const backupPath = path.resolve(root, "src/App.jsx.backup-v39.7.1.3-descarga");
fs.copyFileSync(appPath, backupPath);

let source = fs.readFileSync(appPath, "utf8");

if (!source.includes("async function waitForQuoteImages(root)")) {
  const helper = `
async function waitForQuoteImages(root) {
  if (!root) return;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pendingVehicleLogo = root.querySelector(
      '[data-quote-vehicle-logo="true"].quote-make-logo-loading:not(.error), ' +
      '[data-quote-vehicle-logo="loading"]'
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

  await new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(resolve)
    )
  );
}

`;

  const anchor = "function QuoteWhatsAppIcon";
  const index = source.indexOf(anchor);

  if (index < 0) {
    fail("No encontré function QuoteWhatsAppIcon para insertar el helper sin riesgo.");
  }

  source = source.slice(0, index) + helper + source.slice(index);
}

fs.writeFileSync(appPath, source, "utf8");

console.log("");
console.log("✅ V39.7.1.3 aplicada.");
console.log("✅ Restaurada waitForQuoteImages().");
console.log("✅ La descarga PNG vuelve a esperar las imágenes antes de html2canvas.");
console.log("✅ No se tocó el logo del fabricante.");
console.log("✅ Backup creado:");
console.log("   src/App.jsx.backup-v39.7.1.3-descarga");
console.log("");
console.log("➡️ Ejecutá: npm run build");
