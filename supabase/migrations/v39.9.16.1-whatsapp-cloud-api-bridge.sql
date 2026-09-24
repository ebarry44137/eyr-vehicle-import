-- E&R Solutions · V39.9.16.1 · WhatsApp Cloud API Bridge

create table if not exists public.crm_whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  phone_number_id text not null,
  waba_id text,
  display_phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number_id)
);

create index if not exists crm_whatsapp_channels_org_idx
  on public.crm_whatsapp_channels (organization_id, status);

create unique index if not exists crm_whatsapp_messages_external_message_uidx
  on public.crm_whatsapp_messages (external_message_id)
  where external_message_id is not null;

create unique index if not exists crm_whatsapp_conversations_org_phone_uidx
  on public.crm_whatsapp_conversations (organization_id, phone);

alter table public.crm_whatsapp_channels enable row level security;

drop policy if exists crm_whatsapp_channels_same_org_select on public.crm_whatsapp_channels;
create policy crm_whatsapp_channels_same_org_select
on public.crm_whatsapp_channels
for select
to authenticated
using (organization_id = public.current_organization_id_v3821());

revoke all on table public.crm_whatsapp_channels from anon;
grant select on table public.crm_whatsapp_channels to authenticated;

-- Registrar el canal únicamente DESPUÉS de obtener Phone Number ID y WABA ID en Meta.
-- Los tokens y App Secret NO se almacenan aquí.
