begin;
create schema if not exists eyr_finance_private;
revoke all on schema eyr_finance_private from public,anon,authenticated;
grant usage on schema eyr_finance_private to authenticated;
create table eyr_finance_private.freight_net_settlements(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 period_month date not null check(extract(day from period_month)=1),
 amount_gtq numeric(16,2) not null check(amount_gtq>0),
 concept text not null check(length(btrim(concept)) between 1 and 300),
 source_reference text not null check(length(source_reference) between 1 and 180),
 note text not null,
 recorded_via text not null,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 voided_at timestamptz,
 void_reason text,
 unique(organization_id,source_reference),
 check((voided_at is null and void_reason is null) or (voided_at is not null and length(btrim(void_reason))>0))
);
create index freight_net_settlement_period_idx on eyr_finance_private.freight_net_settlements(organization_id,period_month) where voided_at is null;
alter table eyr_finance_private.freight_net_settlements enable row level security;
revoke all on eyr_finance_private.freight_net_settlements from public,anon,authenticated;

-- Same organization lock used by create_finance_closing: prevent a concurrent late entry.
create function eyr_finance_private.guard_freight_settlement() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_day date;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance_closing:'||new.organization_id::text,0));
 if tg_op='UPDATE' and (new.organization_id,new.period_month,new.amount_gtq,new.concept,new.source_reference,new.note,new.recorded_via,new.created_at,new.created_by)
  is distinct from (old.organization_id,old.period_month,old.amount_gtq,old.concept,old.source_reference,old.note,old.recorded_via,old.created_at,old.created_by) then
  raise exception 'La liquidación es inmutable. Una corrección requiere anulación documentada.';
 end if;
 v_day:=(new.period_month+interval '1 month'-interval '1 day')::date;
 if exists(select 1 from public.finance_closings c where c.organization_id=new.organization_id and c.status='ACTIVE'
  and c.bank_cutoff_to is not null and v_day between c.period_start and c.period_end) then
  raise exception 'El mes ya está incluido en un cierre activo. Se requiere revisión del cierre antes de ajustar la utilidad.';
 end if;
 return new;
end $$;
revoke all on function eyr_finance_private.guard_freight_settlement() from public,anon,authenticated;
create trigger guard_freight_settlement before insert or update on eyr_finance_private.freight_net_settlements for each row execute function eyr_finance_private.guard_freight_settlement();

create function eyr_finance_private.read_freight_settlements(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_total numeric;v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Sesión requerida' using errcode='42501';end if;
 perform public.assert_finance_admin();
 select p.organization_id into v_org from public.profiles p join public.organizations o on o.id=p.organization_id and o.active where p.id=auth.uid() and p.active;
 if v_org is null then raise exception 'Organización financiera no autorizada' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Rango de fechas inválido';end if;
 select coalesce(sum(s.amount_gtq),0) into v_total from eyr_finance_private.freight_net_settlements s
 where s.organization_id=v_org and s.voided_at is null and (s.period_month+interval '1 month'-interval '1 day')::date between p_from and p_to;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.period_month desc,x.created_at desc),'[]'::jsonb) into v_rows from(
  select s.id,s.period_month,s.amount_gtq,s.concept,s.note,s.created_at,
   ((s.period_month+interval '1 month'-interval '1 day')::date between p_from and p_to) as in_selected_period
  from eyr_finance_private.freight_net_settlements s where s.organization_id=v_org and s.voided_at is null order by s.period_month desc,s.created_at desc limit 20
 )x;
 return jsonb_build_object('period_total_gtq',v_total,'entries',v_rows,'bank_effect_gtq',0);
end $$;
revoke all on function eyr_finance_private.read_freight_settlements(date,date) from public,anon,authenticated;
grant execute on function eyr_finance_private.read_freight_settlements(date,date) to authenticated;
create function public.finance_freight_settlements_v1(p_from date,p_to date) returns jsonb
language sql security invoker set search_path='' as $$ select eyr_finance_private.read_freight_settlements(p_from,p_to); $$;
revoke all on function public.finance_freight_settlements_v1(date,date) from public,anon,authenticated;
grant execute on function public.finance_freight_settlements_v1(date,date) to authenticated;

alter table public.finance_closings add column freight_net_profit_gtq numeric not null default 0;
comment on column public.finance_closings.freight_net_profit_gtq is 'Utilidad neta de fletes liquidada por imputación al último día del mes. No representa entrada bancaria.';

CREATE OR REPLACE FUNCTION eyr_finance_private.period_summary_with_freight(p_from date, p_to date)
 RETURNS TABLE(billed_gtq numeric, collected_gtq numeric, receivable_gtq numeric, direct_costs_gtq numeric, gross_profit_gtq numeric, general_expenses_gtq numeric, net_result_gtq numeric, supplier_payments_gtq numeric, duca_accrued_cost_gtq numeric, cash_direct_outflows_gtq numeric, cash_result_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid:=null;
  v_role text:='';
  v_active boolean:=false;
  v_case_billed numeric:=0;
  v_case_direct numeric:=0;
  v_dec_billed numeric:=0;
  v_dec_direct numeric:=0;
  v_collected numeric:=0;
  v_expenses numeric:=0;
  v_supplier_payments numeric:=0;
  v_duca_accrued numeric:=0;
  v_dispatch_accrued numeric:=0;
  v_direct_total numeric:=0;
  v_cash_direct numeric:=0;
  v_freight_net numeric:=0;
begin
  select p.organization_id, upper(coalesce(p.role::text,'')), coalesce(p.active,false)
  into v_org,v_role,v_active
  from public.profiles p
  where p.id=auth.uid();

  if not coalesce(v_active,false) or v_role <> 'ADMIN' then
    v_org:=public.current_organization_id_v3821();

    if v_org is null
       or not public.is_tenant_admin_v3821()
       or not public.can_full_office_v3821() then
      raise exception 'Finanzas no autorizadas para este usuario.'
        using errcode='42501';
    end if;
  end if;

  if v_org is null or not exists(select 1 from public.organizations o where o.id=v_org and o.active) then
    raise exception 'Organización financiera no autorizada' using errcode='42501';
  end if;
  select coalesce(sum(s.amount_gtq),0) into v_freight_net
  from eyr_finance_private.freight_net_settlements s
  where s.organization_id=v_org and s.voided_at is null
    and (s.period_month+interval '1 month'-interval '1 day')::date between p_from and p_to;

  select
    coalesce(sum(coalesce(f.client_charge_gtq,0)),0),
    coalesce(sum(
      coalesce(f.corroboration_cost_gtq,0)
      + case when coalesce(f.includes_duca,false) then coalesce(f.duca_cost_gtq,0) else 0 end
      + coalesce(f.document_collection_cost_gtq,0)
      + coalesce(f.dispatch_management_cost_gtq,0)
      + coalesce(f.other_direct_cost_gtq,0)
    ),0)
  into v_case_billed,v_case_direct
  from public.customs_case_finance f
  join public.customs_cases c on c.id=f.customs_case_id
  where f.organization_id=v_org
    and c.organization_id=v_org
    and c.notice_date between p_from and p_to;

  select
    coalesce(sum(coalesce(d.charge_gtq,0)),0),
    coalesce(sum(coalesce(b.unit_cost_gtq,0)),0)
  into v_dec_billed,v_dec_direct
  from public.declaration_services d
  left join public.duca_correlatives dc on dc.id=d.duca_correlative_id
  left join public.duca_correlative_batches b on b.id=dc.batch_id
  where d.organization_id=v_org
    and d.declaration_date between p_from and p_to
    and coalesce(d.status,'') <> 'ANULADA';

  select
    coalesce((
      select sum(coalesce(p.amount_gtq,0))
      from public.finance_case_payments p
      where p.organization_id=v_org
        and p.payment_date between p_from and p_to
    ),0)
    +
    coalesce((
      select sum(coalesce(p.amount_gtq,0))
      from public.declaration_service_payments p
      where p.organization_id=v_org
        and p.payment_date between p_from and p_to
    ),0)
  into v_collected;

  select coalesce(sum(coalesce(e.amount_gtq,0)),0)
  into v_expenses
  from public.finance_expenses e
  where e.organization_id=v_org
    and e.expense_date between p_from and p_to;

  select coalesce(sum(pp.amount_gtq),0)
  into v_supplier_payments
  from public.finance_accounts_payable_payments pp
  join public.finance_accounts_payable ap on ap.id=pp.payable_id
  where pp.payment_date between p_from and p_to
    and (ap.organization_id=v_org or ap.organization_id is null);

  select coalesce(sum(
    case when coalesce(f.includes_duca,false)
      then coalesce(f.duca_cost_gtq,0)
      else 0 end
  ),0)
  into v_duca_accrued
  from public.customs_case_finance f
  join public.customs_cases c on c.id=f.customs_case_id
  where f.organization_id=v_org
    and c.organization_id=v_org
    and c.notice_date between p_from and p_to;

  select v_duca_accrued + coalesce(sum(coalesce(b.unit_cost_gtq,0)),0)
  into v_duca_accrued
  from public.declaration_services d
  left join public.duca_correlatives dc on dc.id=d.duca_correlative_id
  left join public.duca_correlative_batches b on b.id=dc.batch_id
  where d.organization_id=v_org
    and d.declaration_date between p_from and p_to
    and coalesce(d.status,'') <> 'ANULADA';

  select coalesce(sum(coalesce(f.dispatch_management_cost_gtq,0)),0)
  into v_dispatch_accrued
  from public.customs_case_finance f
  join public.customs_cases c on c.id=f.customs_case_id
  where f.organization_id=v_org
    and c.organization_id=v_org
    and c.notice_date between p_from and p_to;

  v_direct_total:=v_case_direct+v_dec_direct;

  v_cash_direct:=
    greatest(0, v_direct_total-v_duca_accrued-v_dispatch_accrued)
    + v_supplier_payments;

  return query
  select
    v_case_billed+v_dec_billed,
    v_collected,
    greatest((v_case_billed+v_dec_billed)-v_collected,0),
    v_direct_total,
    (v_case_billed+v_dec_billed)-v_direct_total,
    v_expenses,
    (v_case_billed+v_dec_billed)-v_direct_total-v_expenses+v_freight_net,
    v_supplier_payments,
    v_duca_accrued,
    v_cash_direct,
    v_collected-v_cash_direct-v_expenses;
end;
$function$;

revoke all on function eyr_finance_private.period_summary_with_freight(date,date) from public,anon,authenticated;
grant execute on function eyr_finance_private.period_summary_with_freight(date,date) to authenticated;
CREATE OR REPLACE FUNCTION public.finance_period_summary(p_from date, p_to date)
 RETURNS TABLE(billed_gtq numeric, collected_gtq numeric, receivable_gtq numeric, direct_costs_gtq numeric, gross_profit_gtq numeric, general_expenses_gtq numeric, net_result_gtq numeric, supplier_payments_gtq numeric, duca_accrued_cost_gtq numeric, cash_direct_outflows_gtq numeric, cash_result_gtq numeric)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO ''
AS $$ SELECT * FROM eyr_finance_private.period_summary_with_freight(p_from,p_to); $$;

revoke all on function public.finance_period_summary(date,date) from public,anon;
grant execute on function public.finance_period_summary(date,date) to authenticated;

CREATE OR REPLACE FUNCTION public.create_finance_closing(p_type text, p_from date, p_to date, p_opening_cash numeric DEFAULT 0)
 RETURNS TABLE(id uuid, closing_code text, closing_cash_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;

    v_reconciliation record;
    v_previous_checkpoint record;
    v_previous_active record;
    v_bank_move record;
    v_summary record;

    v_cutoff_from timestamptz;
    v_cutoff_to timestamptz;

    v_opening numeric := 0;
    v_closing numeric := 0;
    v_pending numeric := 0;
    v_available numeric := 0;

    v_checkpoint_mode text;
    v_next_number integer := 1;
    v_code text;

    v_new_id uuid;

begin

    -- ========================================================
    -- SEGURIDAD
    -- ========================================================

    perform public.assert_finance_admin();

    select p.organization_id
      into v_org
    from public.profiles p
    where p.id = auth.uid();

    if v_org is null then
        v_org := public.current_organization_id_v3821();
    end if;

    if v_org is null then
        raise exception
            'No fue posible determinar la organización financiera.';
    end if;


    -- ========================================================
    -- V39.9.18.10F.5
    -- BLOQUEO ANTI-DOBLE-CIERRE
    --
    -- Dos solicitudes de cierre de la misma organización
    -- no pueden calcular el checkpoint simultáneamente.
    -- ========================================================

    perform pg_advisory_xact_lock(
        hashtextextended(
            'finance_closing:' || v_org::text,
            0
        )
    );


    -- ========================================================
    -- VALIDACIONES
    -- ========================================================

    if p_type not in ('QUINCENAL', 'MENSUAL') then
        raise exception
            'Tipo de cierre no válido: %',
            p_type;
    end if;

    if p_from is null or p_to is null then
        raise exception
            'El período del cierre es obligatorio.';
    end if;

    if p_from > p_to then
        raise exception
            'La fecha inicial no puede ser posterior a la fecha final.';
    end if;


    -- ========================================================
    -- CONCILIACIÓN BANCARIA ACTIVA
    -- ========================================================

    select r.*
      into v_reconciliation
    from public.finance_bank_reconciliations r
    where r.organization_id = v_org
      and r.status = 'ACTIVE'
    order by
        r.effective_at desc,
        r.created_at desc
    limit 1;

    if v_reconciliation.id is null then
        raise exception
            'No existe una conciliación bancaria activa.';
    end if;


    -- No permitimos un período completamente anterior
    -- al inicio del nuevo control bancario.

    if p_to <
       (v_reconciliation.effective_at at time zone 'America/Guatemala')::date
    then
        raise exception
            'El período seleccionado termina antes de la conciliación bancaria activa.';
    end if;


    -- ========================================================
    -- ÚLTIMO CIERRE ACTIVO
    -- Incluye cierres históricos únicamente para auditoría /
    -- previous_closing_id. NO lo usamos como apertura bancaria
    -- si no tiene bank_cutoff_to.
    -- ========================================================

    select c.*
      into v_previous_active
    from public.finance_closings c
    where c.organization_id = v_org
      and c.status = 'ACTIVE'
    order by
        c.closed_at desc nulls last,
        c.created_at desc
    limit 1;


    -- ========================================================
    -- ÚLTIMO CHECKPOINT DEL MOTOR NUEVO
    -- ========================================================

    select c.*
      into v_previous_checkpoint
    from public.finance_closings c
    where c.organization_id = v_org
      and c.status = 'ACTIVE'
      and c.bank_cutoff_to is not null
    order by
        c.bank_cutoff_to desc,
        c.created_at desc
    limit 1;


    -- ========================================================
    -- EVITAR SOLAPAMIENTO CONTABLE ENTRE CIERRES NUEVOS
    -- Los cierres históricos no bloquean el nuevo motor.
    -- ========================================================

    if exists (
        select 1
        from public.finance_closings c
        where c.organization_id = v_org
          and c.status = 'ACTIVE'
          and c.bank_cutoff_to is not null
          and daterange(
                c.period_start,
                c.period_end,
                '[]'
              )
              &&
              daterange(
                p_from,
                p_to,
                '[]'
              )
    ) then
        raise exception
            'El período seleccionado se superpone con un cierre activo del nuevo control financiero.';
    end if;


    -- ========================================================
    -- PUNTO DE PARTIDA BANCARIO
    -- ========================================================

    if v_previous_checkpoint.id is not null
       and v_previous_checkpoint.bank_cutoff_to
           >= v_reconciliation.effective_at
    then

        v_checkpoint_mode := 'PREVIOUS_CLOSING';

        v_cutoff_from :=
            v_previous_checkpoint.bank_cutoff_to;

        v_opening :=
            coalesce(
                v_previous_checkpoint.closing_cash_gtq,
                0
            );

    else

        v_checkpoint_mode := 'RECONCILIATION';

        v_cutoff_from :=
            v_reconciliation.effective_at;

        v_opening :=
            coalesce(
                v_reconciliation.balance_gtq,
                0
            );

    end if;


    -- El parámetro p_opening_cash se conserva por compatibilidad
    -- con el frontend antiguo, pero NO gobierna el cálculo.

    v_cutoff_to := clock_timestamp();

    if v_cutoff_to <= v_cutoff_from then
        raise exception
            'No existe una ventana bancaria válida para generar el cierre.';
    end if;


    -- ========================================================
    -- MOVIMIENTOS BANK
    -- ========================================================

    select *
      into v_bank_move
    from public.finance_bank_movement_between(
        v_cutoff_from,
        v_cutoff_to
    );


    v_closing :=
        v_opening
        + coalesce(
            v_bank_move.net_bank_movement_gtq,
            0
        );


    -- ========================================================
    -- COMPROMISOS PENDIENTES AL CORTE
    -- No reducen el saldo bancario.
    -- Sí reducen el disponible no comprometido.
    -- ========================================================

    select coalesce(
        sum(
            greatest(
                coalesce(ap.original_amount_gtq, 0)
                -
                coalesce(
                    (
                        select sum(pp.amount_gtq)
                        from public.finance_accounts_payable_payments pp
                        where pp.payable_id = ap.id
                          and pp.created_at <= v_cutoff_to
                    ),
                    0
                ),
                0
            )
        ),
        0
    )
      into v_pending
    from public.finance_accounts_payable ap
    where (
            ap.organization_id = v_org
            or ap.organization_id is null
          )
      and ap.created_at <= v_cutoff_to;


    v_available :=
        v_closing - v_pending;


    -- ========================================================
    -- SNAPSHOT CONTABLE DEL PERÍODO
    -- Se mantiene separado del flujo BANK.
    -- ========================================================

    select *
      into v_summary
    from public.finance_period_summary(
        p_from,
        p_to
    );


    -- ========================================================
    -- V39.9.18.10F.5
    -- CORRELATIVO SEGURO
    --
    -- FIN-2026-0001 -> 1
    -- FIN-2026-0002 -> 2
    -- próximo       -> FIN-2026-0003
    --
    -- IMPORTANTE:
    -- Ya no extraemos "20260001".
    -- Solo tomamos los dígitos posteriores al último guion.
    -- ========================================================

    select
        coalesce(
            max(
                case
                    when c.closing_code ~
                         ('^FIN-' ||
                          extract(year from p_to)::integer ||
                          '-[0-9]+$')
                    then
                        substring(
                            c.closing_code
                            from '([0-9]+)$'
                        )::integer
                    else null
                end
            ),
            0
        ) + 1
      into v_next_number
    from public.finance_closings c
    where c.organization_id = v_org;


    v_code :=
        'FIN-' ||
        extract(year from p_to)::integer ||
        '-' ||
        lpad(v_next_number::text, 4, '0');


    -- Defensa adicional ante cualquier correlativo existente.

    if exists (
        select 1
        from public.finance_closings c
        where c.organization_id = v_org
          and c.closing_code = v_code
    ) then
        raise exception
            'El correlativo de cierre % ya existe. No se generó ningún cierre.',
            v_code;
    end if;


    -- ========================================================
    -- INSERT DEL CHECKPOINT
    -- ========================================================

    insert into public.finance_closings (
        organization_id,
        closing_code,
        closing_type,
        period_start,
        period_end,

        opening_cash_gtq,
        closing_cash_gtq,

        billed_gtq,
        collected_gtq,
        receivable_gtq,
        direct_costs_gtq,
        gross_profit_gtq,
        general_expenses_gtq,
        net_result_gtq,
        freight_net_profit_gtq,

        supplier_payments_gtq,
        duca_accrued_cost_gtq,
        cash_direct_outflows_gtq,

        status,
        previous_closing_id,
        closed_at,

        bank_checkpoint_mode,
        bank_cutoff_from,
        bank_cutoff_to,
        bank_reconciliation_id,

        bank_collections_gtq,
        bank_outflows_gtq,
        pending_commitments_gtq,
        available_bank_gtq
    )
    values (
        v_org,
        v_code,
        p_type,
        p_from,
        p_to,

        v_opening,
        v_closing,

        coalesce(v_summary.billed_gtq, 0),
        coalesce(v_summary.collected_gtq, 0),
        coalesce(v_summary.receivable_gtq, 0),
        coalesce(v_summary.direct_costs_gtq, 0),
        coalesce(v_summary.gross_profit_gtq, 0),
        coalesce(v_summary.general_expenses_gtq, 0),
        coalesce(v_summary.net_result_gtq, 0),
        coalesce(v_summary.net_result_gtq,0)-coalesce(v_summary.gross_profit_gtq,0)+coalesce(v_summary.general_expenses_gtq,0),

        coalesce(v_summary.supplier_payments_gtq, 0),
        coalesce(v_summary.duca_accrued_cost_gtq, 0),

        -- Campo legacy.
        -- Para cierres nuevos guarda salidas BANK reales
        -- y NO costos devengados.
        coalesce(v_bank_move.total_bank_outflows_gtq, 0),

        'ACTIVE',
        v_previous_active.id,
        v_cutoff_to,

        v_checkpoint_mode,
        v_cutoff_from,
        v_cutoff_to,
        v_reconciliation.id,

        coalesce(v_bank_move.total_collections_gtq, 0),
        coalesce(v_bank_move.total_bank_outflows_gtq, 0),
        v_pending,
        v_available
    )
    returning finance_closings.id
      into v_new_id;


    -- ========================================================
    -- RESPUESTA COMPATIBLE CON EL FRONTEND
    -- ========================================================

    return query
    select
        v_new_id,
        v_code,
        v_closing;

end;
$function$;

commit;
