import { createClient } from "npm:@supabase/supabase-js@2";

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret faltante: ${name}`);
  return value;
}

function adminClient() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyMetaSignature(req: Request, raw: string) {
  const header = req.headers.get("x-hub-signature-256") || "";
  if (!header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env("META_WHATSAPP_APP_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected = "sha256=" + Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(header.toLowerCase(), expected.toLowerCase());
}

async function findContact(admin: any, organizationId: string, phone: string) {
  const candidates = [phone];
  if (phone.startsWith("502") && phone.length === 11) candidates.push(phone.slice(3));

  const { data, error } = await admin
    .from("crm_contacts")
    .select("id,phone,whatsapp_phone,updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return (data || []).find((c: any) => {
    const a = normalizePhone(c.whatsapp_phone);
    const b = normalizePhone(c.phone);
    return candidates.includes(a) || candidates.includes(b) ||
      (a && (phone.endsWith(a) || a.endsWith(phone))) ||
      (b && (phone.endsWith(b) || b.endsWith(phone)));
  }) || null;
}

async function findLead(admin: any, organizationId: string, contactId: string | null) {
  if (!contactId) return null;
  const { data, error } = await admin
    .from("crm_leads")
    .select("id,assigned_to,stage_code,updated_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = data || [];
  return rows.find((x: any) => !["WON", "LOST"].includes(x.stage_code)) || rows[0] || null;
}

async function getConversation(admin: any, organizationId: string, phone: string, contact: any, lead: any) {
  const { data: existing, error } = await admin
    .from("crm_whatsapp_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    const patch: any = {};
    if (!existing.contact_id && contact?.id) patch.contact_id = contact.id;
    if (!existing.lead_id && lead?.id) patch.lead_id = lead.id;
    if (!existing.assigned_to && lead?.assigned_to) patch.assigned_to = lead.assigned_to;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { data, error: updateError } = await admin
        .from("crm_whatsapp_conversations").update(patch).eq("id", existing.id).select().single();
      if (updateError) throw updateError;
      return data;
    }
    return existing;
  }

  const { data, error: insertError } = await admin
    .from("crm_whatsapp_conversations")
    .insert({
      organization_id: organizationId,
      contact_id: contact?.id || null,
      lead_id: lead?.id || null,
      assigned_to: lead?.assigned_to || null,
      phone,
      status: "OPEN",
      unread_count: 0,
      external_wa_id: phone,
    }).select().single();
  if (insertError) throw insertError;
  return data;
}

async function processMessage(admin: any, organizationId: string, msg: any, contactProfile: any) {
  const from = normalizePhone(msg?.from);
  if (!from || !msg?.id) return;

  const contact = await findContact(admin, organizationId, from);
  const lead = await findLead(admin, organizationId, contact?.id || null);
  const conv = await getConversation(admin, organizationId, from, contact, lead);

  const type = String(msg.type || "unknown").toUpperCase();
  let body = "";
  if (msg.type === "text") body = msg.text?.body || "";
  else if (msg.type === "button") body = msg.button?.text || "[Botón]";
  else if (msg.type === "interactive") body = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "[Interactivo]";
  else if (msg.type === "image") body = msg.image?.caption || "[Imagen]";
  else if (msg.type === "document") body = msg.document?.caption || msg.document?.filename || "[Documento]";
  else if (msg.type === "audio") body = "[Audio]";
  else if (msg.type === "video") body = msg.video?.caption || "[Video]";
  else if (msg.type === "sticker") body = "[Sticker]";
  else if (msg.type === "location") body = "[Ubicación]";
  else body = `[${msg.type || "Mensaje"}]`;

  const messageAt = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const { error: messageError } = await admin.from("crm_whatsapp_messages").upsert({
    organization_id: organizationId,
    conversation_id: conv.id,
    direction: "IN",
    message_type: type,
    body,
    status: "RECEIVED",
    external_message_id: msg.id,
    message_at: messageAt,
    metadata: { meta: msg, contact_profile: contactProfile || null },
  }, { onConflict: "external_message_id", ignoreDuplicates: true });
  if (messageError) throw messageError;

  const { error: convError } = await admin.from("crm_whatsapp_conversations").update({
    unread_count: Number(conv.unread_count || 0) + 1,
    last_message_preview: body.slice(0, 240),
    last_message_at: messageAt,
    external_wa_id: from,
    updated_at: new Date().toISOString(),
  }).eq("id", conv.id);
  if (convError) throw convError;
}

async function processStatus(admin: any, organizationId: string, st: any) {
  if (!st?.id || !st?.status) return;
  const map: Record<string, string> = {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
  };
  const status = map[String(st.status).toLowerCase()] || String(st.status).toUpperCase();
  const { error } = await admin.from("crm_whatsapp_messages")
    .update({ status, metadata: { meta_status: st } })
    .eq("organization_id", organizationId)
    .eq("external_message_id", st.id);
  if (error) throw error;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token") || "";
      const challenge = url.searchParams.get("hub.challenge") || "";
      if (mode === "subscribe" && safeEqual(token, env("META_WHATSAPP_VERIFY_TOKEN"))) {
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const raw = await req.text();
    if (!(await verifyMetaSignature(req, raw))) return new Response("Invalid signature", { status: 401 });

    const payload = JSON.parse(raw);
    if (payload?.object !== "whatsapp_business_account") {
      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    const admin = adminClient();

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change?.field !== "messages") continue;
        const value = change.value || {};
        const phoneNumberId = String(value?.metadata?.phone_number_id || "").trim();
        if (!phoneNumberId) continue;

        const { data: channel, error: channelError } = await admin
          .from("crm_whatsapp_channels")
          .select("organization_id,phone_number_id,status")
          .eq("phone_number_id", phoneNumberId)
          .eq("status", "ACTIVE")
          .maybeSingle();
        if (channelError) throw channelError;
        if (!channel) continue;

        for (const msg of value.messages || []) {
          const profile = (value.contacts || [])
            .find((x: any) => normalizePhone(x.wa_id) === normalizePhone(msg.from))?.profile;
          await processMessage(admin, channel.organization_id, msg, profile);
        }
        for (const st of value.statuses || []) {
          await processStatus(admin, channel.organization_id, st);
        }
      }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("WHATSAPP WEBHOOK ERROR", error);
    return new Response("Webhook processing error", { status: 500 });
  }
});
