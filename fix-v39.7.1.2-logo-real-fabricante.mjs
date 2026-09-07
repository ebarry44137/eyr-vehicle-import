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

const backupPath = path.resolve(root, "src/App.jsx.backup-v39.7.1.2-logo-real");
fs.copyFileSync(appPath, backupPath);

let source = fs.readFileSync(appPath, "utf8");

const replacement = `function vehicleMakeLogoUrl(make) {
  const normalized = String(make || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

  const slugs = {
    "acura": "acura",
    "alfa romeo": "alfa-romeo",
    "aston martin": "aston-martin",
    "audi": "audi",
    "bentley": "bentley",
    "bmw": "bmw",
    "buick": "buick",
    "byd": "byd",
    "cadillac": "cadillac",
    "chevrolet": "chevrolet",
    "chevy": "chevrolet",
    "chrysler": "chrysler",
    "dodge": "dodge",
    "ferrari": "ferrari",
    "fiat": "fiat",
    "ford": "ford",
    "genesis": "genesis",
    "gmc": "gmc",
    "honda": "honda",
    "hyundai": "hyundai",
    "infiniti": "infiniti",
    "isuzu": "isuzu",
    "jaguar": "jaguar",
    "jeep": "jeep",
    "kia": "kia",
    "lamborghini": "lamborghini",
    "land rover": "land-rover",
    "landrover": "land-rover",
    "lexus": "lexus",
    "lincoln": "lincoln",
    "lotus": "lotus",
    "mazda": "mazda",
    "mercedes benz": "mercedes-benz",
    "mercedes-benz": "mercedes-benz",
    "mercedes": "mercedes-benz",
    "mini": "mini",
    "mini cooper": "mini",
    "mitsubishi": "mitsubishi",
    "nissan": "nissan",
    "porsche": "porsche",
    "ram": "ram",
    "ram trucks": "ram",
    "subaru": "subaru",
    "suzuki": "suzuki",
    "tesla": "tesla",
    "toyota": "toyota",
    "volkswagen": "volkswagen",
    "vw": "volkswagen",
    "volvo": "volvo",
  };

  const slug = slugs[normalized];
  if (!slug) return "";

  // V39.7.1.2:
  // Dejamos Simple Icons porque su "Toyota" es un símbolo monocromático
  // que no es el logo visual que usamos en las cotizaciones.
  // Esta colección contiene logos automotrices preparados para fondo blanco.
  return \`https://cdn.jsdelivr.net/gh/vehiclespecs/brand-logos@v1.0.0/\${slug}-logo.svg\`;
}`;

function replaceFunction(name, body) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return false;

  let braceStart = source.indexOf("{", start);
  if (braceStart < 0) return false;

  let depth = 0;
  let i = braceStart;
  let inString = null;
  let escaped = false;

  for (; i < source.length; i++) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  if (depth !== 0) return false;

  source = source.slice(0, start) + body + source.slice(i);
  return true;
}

let changed = false;

// Esta es la función que usa la cotización que actualmente se ve en la captura.
if (source.includes("function vehicleMakeLogoUrl(")) {
  changed = replaceFunction("vehicleMakeLogoUrl", replacement) || changed;
}

// Si además existe el motor posterior de logos, cambiamos únicamente su URL
// para que ambos caminos usen la misma colección correcta.
source = source.replace(
  /return `https:\/\/raw\.githubusercontent\.com\/diegojasso\/car-logos-SVG\/main\/logos\/\$\{slug\}\.svg`;/g,
  'return `https://cdn.jsdelivr.net/gh/vehiclespecs/brand-logos@v1.0.0/${slug}-logo.svg`;'
);

if (source !== fs.readFileSync(appPath, "utf8")) changed = true;

if (!changed) {
  fail("No encontré vehicleMakeLogoUrl ni la URL anterior de logos. No modifiqué App.jsx.");
}

fs.writeFileSync(appPath, source, "utf8");

console.log("");
console.log("✅ V39.7.1.2 aplicada.");
console.log("✅ Cotización desconectada de Simple Icons.");
console.log("✅ Logos ahora salen de la colección automotriz VehicleSpecs.");
console.log("✅ Toyota deja de usar el símbolo negro que estabas viendo.");
console.log("✅ Backup creado:");
console.log("   src/App.jsx.backup-v39.7.1.2-logo-real");
console.log("");
console.log("➡️ Ejecutá: npm run build");
