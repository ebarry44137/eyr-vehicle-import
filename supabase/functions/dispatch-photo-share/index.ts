import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3@3.883.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.883.0";

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-portal-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const unavailable = () => json({ error: "Este enlace ya no está disponible." }, 404);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Método inválido." }, 405);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Solicitud inválida." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bucket = Deno.env.get("R2_BUCKET_NAME") || "eyr-operation-files";
  const shares = () => admin.from("dispatch_photo_shares");
  const photos = (caseId: string, orgId: string, ids: string[]) =>
    admin.from("operation_files")
      .select("id, storage_path, mime_type")
      .eq("source_type", "CUSTOMS_CASE")
      .eq("source_id", caseId)
      .eq("organization_id", orgId)
      .eq("category", "PHOTO")
      .eq("visible_to_client", true)
      .eq("storage_provider", "R2")
      .eq("storage_bucket", bucket)
      .like("storage_path", `${orgId}/customs_case/${caseId}/photo/%`)
      .in("mime_type", imageTypes)
      .in("id", ids)
      .order("created_at")
      .order("id");

  try {
    if (body.action === "view") {
      if (!uuid.test(body.token)) return unavailable();
      const { data: share, error } = await shares().select("case_id, organization_id, photo_ids, expires_at")
        .eq("token", body.token).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) throw error;
      if (!share) return unavailable();

      const { data: operation, error: caseError } = await admin.from("customs_cases")
        .select("organization_id").eq("id", share.case_id).maybeSingle();
      if (caseError) throw caseError;
      if (!operation || operation.organization_id !== share.organization_id) return unavailable();
      const { data: files, error: photoError } = await photos(share.case_id, operation.organization_id, share.photo_ids);
      if (photoError) throw photoError;

      const expiresIn = Math.min(300, Math.floor((Date.parse(share.expires_at) - Date.now()) / 1000));
      if (expiresIn < 1) return unavailable();
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
          secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
        },
      });
      const images = await Promise.all(files.map(async (file) => ({
        url: await getSignedUrl(s3, new GetObjectCommand({
          Bucket: bucket,
          Key: file.storage_path,
          ResponseContentType: file.mime_type,
          ResponseContentDisposition: "inline",
          ResponseCacheControl: "private, no-store",
        }), { expiresIn }),
      })));
      return json({ images });
    }

    if (!["status", "create", "revoke"].includes(body.action) || !uuid.test(body.case_id)) {
      return json({ error: "Solicitud inválida." }, 400);
    }
    const accessToken = request.headers.get("x-portal-access-token");
    if (!accessToken) return json({ error: "Iniciá sesión para gestionar enlaces." }, 401);
    const scoped = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user } } = await scoped.auth.getUser(accessToken);
    if (!user) return json({ error: "Iniciá sesión para gestionar enlaces." }, 401);

    const { data: operation, error: caseError } = await scoped.from("customs_cases")
      .select("id, organization_id").eq("id", body.case_id).maybeSingle();
    if (caseError) throw caseError;
    if (!operation) return json({ error: "Sin permiso para gestionar este expediente." }, 403);

    const [profile, membership] = await Promise.all([
      admin.from("profiles").select("role, active").eq("id", user.id).maybeSingle(),
      admin.from("organization_members").select("member_role")
        .eq("organization_id", operation.organization_id).eq("user_id", user.id)
        .eq("active", true).maybeSingle(),
    ]);
    if (profile.error || membership.error) throw profile.error || membership.error;
    const internal = profile.data?.active && ["ADMIN", "OPERADOR"].includes(String(profile.data.role).toUpperCase());
    const office = ["OWNER", "ADMIN", "GESTOR", "DIGITADOR"].includes(String(membership.data?.member_role).toUpperCase());
    if (!internal && !office) return json({ error: "Sin permiso para compartir fotos." }, 403);

    const now = new Date().toISOString();
    if (body.action === "status") {
      const { data, error } = await shares().select("token, expires_at, photo_ids")
        .eq("case_id", operation.id).eq("organization_id", operation.organization_id).gt("expires_at", now).maybeSingle();
      if (error) throw error;
      return json({ share: data });
    }
    if (body.action === "revoke") {
      if (!uuid.test(body.token)) return json({ error: "Enlace inválido." }, 400);
      const { error } = await shares().delete().eq("case_id", operation.id).eq("organization_id", operation.organization_id).eq("token", body.token);
      if (error) throw error;
      return json({ share: null });
    }

    const ids: string[] = Array.isArray(body.photo_ids) ? [...new Set<string>(body.photo_ids)] : [];
    if (!ids.length || ids.length > 100 || !ids.every((id) => typeof id === "string" && uuid.test(id))) {
      return json({ error: "Seleccioná entre 1 y 100 fotos." }, 400);
    }
    const { data: files, error: photoError } = await photos(operation.id, operation.organization_id, ids);
    if (photoError) throw photoError;
    if (files.length !== ids.length) return json({ error: "Hay fotos que ya no se pueden compartir. Actualizá el expediente." }, 400);

    const { error: cleanupError } = await shares().delete().eq("case_id", operation.id)
      .or(`expires_at.lte.${now},organization_id.neq.${operation.organization_id}`);
    if (cleanupError) throw cleanupError;
    const { data, error } = await shares().insert({ case_id: operation.id, organization_id: operation.organization_id, photo_ids: ids })
      .select("token, expires_at, photo_ids").single();
    if (error?.code === "23505") return json({ error: "Ya existe un enlace activo. Actualizá el expediente para copiarlo." }, 409);
    if (error) throw error;
    return json({ share: data });
  } catch (error) {
    console.error("dispatch-photo-share", error instanceof Error ? error.name : "database error");
    return json({ error: "No pudimos procesar el enlace de fotos. Volvé a intentar." }, 500);
  }
});
