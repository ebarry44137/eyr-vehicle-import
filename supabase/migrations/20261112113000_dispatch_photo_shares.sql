create table public.dispatch_photo_shares (
  case_id uuid primary key references public.customs_cases(id) on delete cascade,
  organization_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  photo_ids uuid[] not null check (cardinality(photo_ids) between 1 and 100),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.dispatch_photo_shares enable row level security;
revoke all on public.dispatch_photo_shares from public, anon, authenticated;
grant select, insert, update, delete on public.dispatch_photo_shares to service_role;
