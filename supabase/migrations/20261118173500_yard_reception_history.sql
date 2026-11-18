begin;
alter table public.usa_yard_receptions
  add column archived_at timestamptz,
  add column archived_by uuid,
  add column archive_reason text check (archive_reason in ('MANUAL','CUSTOMS_HANDOFF'));
create index usa_yard_receptions_list_idx on public.usa_yard_receptions
  (organization_id, (archived_at is not null), created_at desc, id desc);

-- Confirmation is written in the same transaction as the customs case.
create function eyr_tracking_private.archive_confirmed_reception()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.usa_yard_receptions
     set archived_at=new.confirmed_at, archived_by=new.confirmed_by, archive_reason='CUSTOMS_HANDOFF'
   where id=new.reception_id and archived_at is null;
  return new;
end $$;
revoke all on function eyr_tracking_private.archive_confirmed_reception() from public, anon, authenticated;
create trigger archive_after_customs_handoff after update of confirmed_at
  on eyr_tracking_private.yard_contacts for each row
  when (old.confirmed_at is null and new.confirmed_at is not null)
  execute function eyr_tracking_private.archive_confirmed_reception();
commit;
