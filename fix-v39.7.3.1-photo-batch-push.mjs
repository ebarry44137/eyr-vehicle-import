import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const panelPath = path.resolve(
  root,
  "src/modules/operation-files/OperationFilesPanel.jsx"
);
const backupPath = path.resolve(
  root,
  "src/modules/operation-files/OperationFilesPanel.jsx.backup-v39.7.3.1-photo-batch-push"
);

if (!fs.existsSync(panelPath)) {
  console.error("❌ No encontré:", panelPath);
  process.exit(1);
}

let source = fs.readFileSync(panelPath, "utf8");

if (source.includes("V39.7.3.1 · PUSH LOTE DE FOTOGRAFÍAS")) {
  console.log("ℹ️ V39.7.3.1 ya estaba aplicada en OperationFilesPanel.jsx.");
  process.exit(0);
}

if (!source.includes("V39.7.3 · PUSH DOCUMENTO PUBLICADO")) {
  console.error("❌ No detecté V39.7.3 aplicada. No se modificó el archivo.");
  console.error("➡️ Aplicá primero V39.7.3 y luego ejecutá este instalador.");
  process.exit(1);
}

fs.copyFileSync(panelPath, backupPath);
console.log("✅ Backup creado:", backupPath);

// 1) Hacer que uploadOneFile devuelva el id del archivo ya registrado.
const uploadOneStart = source.indexOf("async function uploadOneFile");
const uploadFilesStart = source.indexOf("async function uploadFiles", uploadOneStart);
if (uploadOneStart < 0 || uploadFilesStart < 0) {
  console.error("❌ No encontré uploadOneFile()/uploadFiles(). No se modificó el archivo.");
  fs.copyFileSync(backupPath, panelPath);
  process.exit(1);
}

const returnNeedle = `      return {\n        ok: true,\n        name: file.name,\n      };`;
const returnPos = source.indexOf(returnNeedle, uploadOneStart);
if (returnPos < 0 || returnPos > uploadFilesStart) {
  console.error("❌ No encontré el retorno exitoso esperado de uploadOneFile().");
  fs.copyFileSync(backupPath, panelPath);
  process.exit(1);
}

const returnReplacement = `      return {\n        ok: true,\n        name: file.name,\n        fileId: registered?.file?.id || null,\n      };`;
source =
  source.slice(0, returnPos) +
  returnReplacement +
  source.slice(returnPos + returnNeedle.length);

// 2) Disparar UN Push al finalizar el lote, nunca uno por fotografía.
const refreshedUploadFilesStart = source.indexOf("async function uploadFiles");
const loadNeedle = `    if (success > 0) {\n      await load();\n    }`;
const loadPos = source.indexOf(loadNeedle, refreshedUploadFilesStart);
if (loadPos < 0) {
  console.error("❌ No encontré el cierre de carga exitosa en uploadFiles().");
  fs.copyFileSync(backupPath, panelPath);
  process.exit(1);
}

const insertPos = loadPos + loadNeedle.length;
const notifyBlock = `\n\n    // V39.7.3.1 · PUSH LOTE DE FOTOGRAFÍAS\n    // Se envía UNA sola notificación al finalizar toda la carga, usando\n    // únicamente la cantidad de fotos que realmente se registraron.\n    if (\n      success > 0 &&\n      visible &&\n      String(category || \"\").toUpperCase() === \"PHOTO\"\n    ) {\n      const representativeFileId =\n        [...results]\n          .reverse()\n          .find((item) => item?.ok && item?.fileId)?.fileId || null;\n\n      if (representativeFileId) {\n        try {\n          const { error: pushError } = await supabase.functions.invoke(\n            \"send-fcm-notification\",\n            {\n              body: {\n                action: \"operation_photo_batch_published\",\n                file_id: representativeFileId,\n                photo_count: success,\n              },\n            }\n          );\n\n          if (pushError) {\n            console.warn(\n              \"PHOTO BATCH CLIENT PUSH WARNING:\",\n              pushError.message\n            );\n          }\n        } catch (pushErr) {\n          console.warn(\n            \"PHOTO BATCH CLIENT PUSH WARNING:\",\n            pushErr?.message\n          );\n        }\n      }\n    }`;

source = source.slice(0, insertPos) + notifyBlock + source.slice(insertPos);

fs.writeFileSync(panelPath, source, "utf8");

console.log("");
console.log("✅ V39.7.3.1 aplicada en OperationFilesPanel.jsx.");
console.log("✅ Fotografías visibles -> 1 Push por lote completado.");
console.log("✅ El Push usa la cantidad REAL de fotos cargadas correctamente.");
console.log("✅ Un lote de 1 foto también genera solamente 1 Push.");
console.log("✅ Un fallo de Firebase NO bloquea R2 ni la carga del lote.");
console.log("✅ No se modificó App.jsx ni la cotización estable.");
console.log("");
console.log("➡️ Ahora reemplazá/publicá send-fcm-notification y ejecutá: npm run build");
