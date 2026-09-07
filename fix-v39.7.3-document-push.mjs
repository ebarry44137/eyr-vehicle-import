import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const panelPath = path.resolve(
  root,
  "src/modules/operation-files/OperationFilesPanel.jsx"
);
const backupPath = path.resolve(
  root,
  "src/modules/operation-files/OperationFilesPanel.jsx.backup-v39.7.3-document-push"
);

if (!fs.existsSync(panelPath)) {
  console.error("❌ No encontré:", panelPath);
  process.exit(1);
}

let source = fs.readFileSync(panelPath, "utf8");

if (source.includes("V39.7.3 · PUSH DOCUMENTO PUBLICADO")) {
  console.log("ℹ️ V39.7.3 ya estaba aplicada en OperationFilesPanel.jsx.");
  process.exit(0);
}

fs.copyFileSync(panelPath, backupPath);
console.log("✅ Backup creado:", backupPath);

const functionStart = source.indexOf("async function uploadOneFile");
if (functionStart < 0) {
  console.error("❌ No encontré uploadOneFile(). No se modificó el archivo.");
  process.exit(1);
}

const registerAction = source.indexOf('action: "register"', functionStart);
if (registerAction < 0) {
  console.error('❌ No encontré action: "register" dentro de uploadOneFile().');
  process.exit(1);
}

const invokeStart = source.lastIndexOf("await invoke({", registerAction);
if (invokeStart < functionStart) {
  console.error("❌ No encontré el invoke de registro.");
  process.exit(1);
}

const invokeEnd = source.indexOf("\n      });", registerAction);
if (invokeEnd < 0) {
  console.error("❌ No pude determinar el final del registro del archivo.");
  process.exit(1);
}

source =
  source.slice(0, invokeStart) +
  "const registered = await invoke({" +
  source.slice(invokeStart + "await invoke({".length);

const adjustedRegisterAction = source.indexOf('action: "register"', functionStart);
const adjustedInvokeEnd = source.indexOf("\n      });", adjustedRegisterAction);
const insertPos = adjustedInvokeEnd + "\n      });".length;

const notifyBlock = `

      // V39.7.3 · PUSH DOCUMENTO PUBLICADO
      // Solo documentos visibles al cliente. Las fotos no generan Push para evitar spam.
      if (
        visible &&
        String(category || "").toUpperCase() !== "PHOTO" &&
        registered?.file?.id
      ) {
        try {
          const { error: pushError } = await supabase.functions.invoke(
            "send-fcm-notification",
            {
              body: {
                action: "operation_document_published",
                file_id: registered.file.id,
              },
            }
          );

          if (pushError) {
            console.warn(
              "DOCUMENT CLIENT PUSH WARNING:",
              pushError.message
            );
          }
        } catch (pushErr) {
          console.warn(
            "DOCUMENT CLIENT PUSH WARNING:",
            pushErr?.message
          );
        }
      }`;

source =
  source.slice(0, insertPos) +
  notifyBlock +
  source.slice(insertPos);

fs.writeFileSync(panelPath, source, "utf8");

console.log("");
console.log("✅ V39.7.3 aplicada en OperationFilesPanel.jsx.");
console.log("✅ Nuevo documento visible -> Push automático al cliente.");
console.log("✅ Fotografías NO generan Push.");
console.log("✅ Error de Firebase NO bloquea la carga a Cloudflare R2.");
console.log("✅ No se modificó App.jsx ni la cotización estable.");
console.log("");
console.log("➡️ Ahora reemplazá/publicá send-fcm-notification y ejecutá: npm run build");
