import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret faltante: ${name}`);
  return value;
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesión requerida." }, 401);
    const jwt = authorization.slice(7).trim();

    const anon = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim();
    if (!anon) throw new Error("No se encontró la clave pública de Supabase.");

    const userClient = createClient(env("SUPABASE_URL"), anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !user?.id) return json({ error: "Sesión inválida o expirada." }, 401);

    const body = await req.json();
    const conversationId = String(body?.conversation_id || "").trim();
    const message = String(body?.body || "").trim();

    if (!conversationId) return json({ error: "Conversación requerida." }, 400);
    if (!message) return json({ error: "Escribí un mensaje." }, 400);
    if (message.length > 4096) return json({ error: "El mensaje supera 4096 caracteres." }, 400);

    const { data: conv, error: convError } = await userClient
      .from("crm_whatsapp_conversations")
      .select("id,organization_id,phone,status")
      .eq("id", conversationId)
      .single();
    if (convError || !conv) return json({ error: "Conversación no disponible para este usuario." }, 403);

    const admin = adminClient();
    const { data: channel, error: channelError } = await admin
      .from("crm_whatsapp_channels")
      .select("phone_number_id,status")
      .eq("organization_id", conv.organization_id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) return json({ error: "La organización no tiene un canal de WhatsApp activo." }, 409);

    const version = env("META_GRAPH_API_VERSION").replace(/^v/i, "");
    const response = await fetch(
      `https://graph.facebook.com/v${version}/${channel.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env("META_WHATSAPP_ACCESS_TOKEN")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: String(conv.phone).replace(/\D/g, ""),
          type: "text",
          text: { preview_url: false, body: message },
        }),
      },
    );

    const meta = await response.json();
    if (!response.ok) {
      console.error("META SEND ERROR", { status: response.status, data: meta });
      return json({
        error: meta?.error?.message || "Meta rechazó el envío.",
        meta_code: meta?.error?.code || null,
      }, 502);
    }

    const externalMessageId = meta?.messages?.[0]?.id || null;
    const now = new Date().toISOString();

    const { data: saved, error: saveError } = await admin
      .from("crm_whatsapp_messages")
      .insert({
        organization_id: conv.organization_id,
        conversation_id: conv.id,
        direction: "OUT",
        message_type: "TEXT",
        body: message,
        status: "SENT",
        external_message_id: externalMessageId,
        message_at: now,
        metadata: { meta_send_response: meta },
        created_by: user.id,
      })
      .select().single();
    if (saveError) throw saveError;

    const { error: updateError } = await admin
      .from("crm_whatsapp_conversations")
      .update({
        last_message_preview: message.slice(0, 240),
        last_message_at: now,
        updated_by: user.id,
        updated_at: now,
      }).eq("id", conv.id);
    if (updateError) throw updateError;

    return json({ ok: true, message: saved, meta_message_id: externalMessageId });
  } catch (error) {
    console.error("WHATSAPP SEND ERROR", error);
    return json({ error: error instanceof Error ? error.message : "No fue posible enviar el mensaje." }, 500);
  }
});
