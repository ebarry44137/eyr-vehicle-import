import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.resolve(root, "src/App.jsx");

function fail(message) {
  console.error("❌ " + message);
  process.exit(1);
}

if (!fs.existsSync(appPath)) {
  fail("No encontré src/App.jsx. Ejecutá este instalador desde la raíz del proyecto.");
}

const backupPath = path.resolve(root, "src/App.jsx.backup-v39.7.2-notificaciones");
fs.copyFileSync(appPath, backupPath);

let source = fs.readFileSync(appPath, "utf8");

const functionStart = source.indexOf("async function saveCustomsDetail()");
if (functionStart < 0) {
  fail("No encontré saveCustomsDetail(). No modificaré App.jsx a ciegas.");
}

const updateSuccessAnchor = "if (updateError) throw updateError;";
const updatePos = source.indexOf(updateSuccessAnchor, functionStart);
if (updatePos < 0) {
  fail("No encontré el guardado de customs_cases dentro de saveCustomsDetail().");
}

const snapshotCode = `
      // V39.7.2 · snapshot para detectar hitos que ACABAN de ocurrir.
      const previousCustomsDetail = selectedCustomsCase
        ? { ...selectedCustomsCase }
        : null;

`;

const tryAnchor = "    try {";
const tryPos = source.indexOf(tryAnchor, functionStart);
if (tryPos < 0) fail("No encontré try dentro de saveCustomsDetail().");

if (!source.includes("const previousCustomsDetail = selectedCustomsCase")) {
  source =
    source.slice(0, tryPos + tryAnchor.length) +
    snapshotCode +
    source.slice(tryPos + tryAnchor.length);
}

const notifyCode = `

      // V39.7.2 · notificamos solamente hitos NUEVOS.
      // Un fallo de Firebase nunca bloquea el guardado del expediente.
      try {
        const before = previousCustomsDetail || {};
        const after = data || {};

        const events = [];

        if (
          !before.office_portal_client_id &&
          after.office_portal_client_id
        ) {
          events.push("CASE_LINKED");
        }

        const milestoneFields = [
          ["docs_collected_at", "DOCS_COLLECTED"],
          ["declaration_signed_at", "DECLARATION_SIGNED"],
          ["iva_form_sent_at", "IVA_FORM_SENT"],
          ["iva_paid_at", "IVA_PAID"],
          ["port_exit_at", "PORT_EXIT"],
          ["envelope_ready_at", "ENVELOPE_READY"],
          ["delivered_at", "DELIVERED"],
        ];

        for (const [field, eventType] of milestoneFields) {
          if (!before[field] && after[field]) {
            events.push(eventType);
          }
        }

        const beforeSelective = String(before.selective_type || "")
          .trim()
          .toUpperCase();
        const afterSelective = String(after.selective_type || "")
          .trim()
          .toUpperCase();

        const selectiveJustHappened =
          Boolean(after.selective_at) &&
          (
            !before.selective_at ||
            beforeSelective !== afterSelective
          );

        if (selectiveJustHappened) {
          if (
            afterSelective.includes("ROJO") ||
            afterSelective === "RED"
          ) {
            events.push("SELECTIVE_RED");
          } else if (
            afterSelective.includes("VERDE") ||
            afterSelective === "GREEN"
          ) {
            events.push("SELECTIVE_GREEN");
          }
        }

        for (const eventType of [...new Set(events)]) {
          const { error: pushError } = await supabase.functions.invoke(
            "send-fcm-notification",
            {
              body: {
                action: "customs_case_milestone",
                case_id: after.id,
                event_type: eventType,
              },
            }
          );

          if (pushError) {
            console.warn(
              "CUSTOMS CLIENT PUSH WARNING:",
              eventType,
              pushError.message
            );
          }
        }
      } catch (pushErr) {
        console.warn(
          "CUSTOMS CLIENT PUSH WARNING:",
          pushErr?.message
        );
      }
`;

const afterUpdateError = updatePos + updateSuccessAnchor.length;
if (!source.includes('action: "customs_case_milestone"')) {
  source =
    source.slice(0, afterUpdateError) +
    notifyCode +
    source.slice(afterUpdateError);
}

fs.writeFileSync(appPath, source, "utf8");

console.log("");
console.log("✅ V39.7.2 aplicada.");
console.log("✅ Hitos aduanales -> Push al cliente del Portal.");
console.log("✅ Solo dispara cuando el hito acaba de cambiar.");
console.log("✅ Un fallo de Firebase NO bloquea el expediente.");
console.log("✅ Backup:");
console.log("   src/App.jsx.backup-v39.7.2-notificaciones");
console.log("");
console.log("➡️ Ejecutá: npm run build");
