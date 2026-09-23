-- E&R Solutions CRM PRO · V39.9.12.1
-- Lectura segura del estado de cobro de flete + monto de Gestión

begin;

create or replace function public.crm_get_freight_payment_v399121(p_lead_id uuid)
returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_handoff public.crm_handoffs%rowtype;
  v_management public.import_managements%rowtype;
  v_payment public.crm_freight_payments%rowtype;
  v_amount numeric;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;

  select * into v_lead
  from public.crm_leads
  where id=p_lead_id
    and (organization_id=public.current_organization_id_v3821() or public.is_platform_admin_v381());
  if not found then raise exception 'Lead no encontrado o no autorizado'; end if;

  select * into v_payment
  from public.crm_freight_payments
  where lead_id=p_lead_id and organization_id=v_lead.organization_id
  limit 1;

  select * into v_handoff
  from public.crm_handoffs
  where lead_id=p_lead_id
    and organization_id=v_lead.organization_id
    and status in ('READY','DELIVERED','ACCEPTED')
  order by created_at desc
  limit 1;

  if v_handoff.import_management_id is not null then
    select * into v_management
    from public.import_managements
    where id=v_handoff.import_management_id
      and organization_id=v_lead.organization_id;
  end if;

  v_amount := coalesce(v_payment.amount_usd, v_management.freight_usd);

  return jsonb_build_object(
    'ok', true,
    'exists', v_payment.id is not null,
    'status', coalesce(v_payment.status,'PENDING'),
    'amount_usd', v_amount,
    'requested_at', v_payment.requested_at,
    'paid_at', v_payment.paid_at,
    'receipt_reference', coalesce(v_payment.receipt_reference,''),
    'notes', coalesce(v_payment.notes,''),
    'import_management_id', coalesce(v_payment.import_management_id,v_handoff.import_management_id),
    'management_code', v_management.management_code
  );
end;$$;

grant execute on function public.crm_get_freight_payment_v399121(uuid) to authenticated;

commit;
