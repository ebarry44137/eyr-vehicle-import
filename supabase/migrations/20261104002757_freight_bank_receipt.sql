begin;
alter table eyr_finance_private.freight_net_settlements
 add column bank_received_on date,
 add column bank_recorded_at timestamptz,
 add column bank_recorded_via text,
 add column bank_note text,
 add constraint freight_bank_receipt_complete check(
  (bank_received_on is null and bank_recorded_at is null and bank_recorded_via is null and bank_note is null)
  or (bank_received_on is not null and bank_recorded_at is not null and bank_recorded_via is not null and bank_note is not null and length(btrim(bank_recorded_via))>0 and length(btrim(bank_note))>0)
 );
comment on column eyr_finance_private.freight_net_settlements.bank_received_on is 'Fecha de recepción bancaria confirmada, sin inventar una hora. La auditoría real se conserva en bank_recorded_at. El importe ya está incluido en la utilidad.';

create function eyr_finance_private.guard_freight_bank_receipt() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_reconciled_on date;
begin
 perform pg_advisory_xact_lock(hashtextextended('finance_closing:'||new.organization_id::text,0));
 if tg_op='UPDATE' and old.bank_received_on is not null then
  if (new.bank_received_on,new.bank_recorded_at,new.bank_recorded_via,new.bank_note,new.voided_at,new.void_reason)
   is distinct from (old.bank_received_on,old.bank_recorded_at,old.bank_recorded_via,old.bank_note,old.voided_at,old.void_reason) then
   raise exception 'La recepción bancaria ya registrada es inmutable. Se requiere una corrección documentada.';
  end if;
  return new;
 end if;
 if new.bank_received_on is null then return new;end if;
 if new.voided_at is not null then raise exception 'Una liquidación anulada no puede recibir un ingreso bancario.';end if;
 if new.bank_received_on>(clock_timestamp() at time zone 'America/Guatemala')::date then raise exception 'La recepción bancaria no puede ser futura.';end if;
 select (r.effective_at at time zone 'America/Guatemala')::date into v_reconciled_on
 from public.finance_bank_reconciliations r where r.organization_id=new.organization_id and r.status='ACTIVE'
 order by r.effective_at desc,r.created_at desc limit 1;
 if v_reconciled_on is null then raise exception 'No hay conciliación bancaria activa.';end if;
 if new.bank_received_on<=v_reconciled_on then raise exception 'La fecha coincide con o precede a la conciliación: revisar el saldo antes de registrar.';end if;
 if exists(select 1 from public.finance_closings c where c.organization_id=new.organization_id and c.status='ACTIVE' and c.bank_cutoff_to is not null
  and (new.bank_received_on<=c.period_end or new.bank_received_on<(c.bank_cutoff_to at time zone 'America/Guatemala')::date
   or (new.bank_received_on=(c.bank_cutoff_to at time zone 'America/Guatemala')::date and not(c.bank_cutoff_exclusive and (c.bank_cutoff_to at time zone 'America/Guatemala')::time=time '00:00')))) then
  raise exception 'La recepción bancaria afectaría un cierre activo: se requiere revisión del cierre.';
 end if;
 if new.bank_recorded_at is null or new.bank_recorded_at>clock_timestamp() then raise exception 'Falta la auditoría real de recepción bancaria.';end if;
 return new;
end $$;
revoke all on function eyr_finance_private.guard_freight_bank_receipt() from public,anon,authenticated;
create trigger guard_freight_bank_receipt before insert or update on eyr_finance_private.freight_net_settlements for each row execute function eyr_finance_private.guard_freight_bank_receipt();

-- Internal only. Called under the existing authorized financial functions.
-- Legacy timestamps keep their existing rules; these confirmed date-only receipts use Guatemala calendar days.
create function eyr_finance_private.freight_bank_between(p_org uuid,p_from timestamptz,p_to timestamptz)
returns table(amount_gtq numeric,entry_count bigint) language sql security invoker set search_path='' as $$
 select coalesce(sum(s.amount_gtq),0),count(*)
 from eyr_finance_private.freight_net_settlements s
 where s.organization_id=p_org and s.voided_at is null and s.bank_received_on is not null
 and s.bank_received_on >= (p_from at time zone 'America/Guatemala')::date + case
  when (p_from at time zone 'America/Guatemala')::time=time '00:00' and exists(select 1 from public.finance_closings c where c.organization_id=p_org and c.status='ACTIVE' and c.bank_cutoff_to=p_from and c.bank_cutoff_exclusive) then 0 else 1 end
 and s.bank_received_on <= (coalesce(p_to,clock_timestamp()) at time zone 'America/Guatemala')::date - case
  when p_to is not null and (p_to at time zone 'America/Guatemala')::time=time '00:00' then 1 else 0 end;
$$;
revoke all on function eyr_finance_private.freight_bank_between(uuid,timestamptz,timestamptz) from public,anon,authenticated;


CREATE OR REPLACE FUNCTION public.finance_bank_movement_between(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(case_collections_gtq numeric, declaration_collections_gtq numeric, total_collections_gtq numeric, general_expenses_gtq numeric, supplier_payments_gtq numeric, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_case numeric:=0; v_declarations numeric:=0; v_expenses numeric:=0; v_suppliers numeric:=0; v_customs numeric:=0; v_lower_inclusive boolean:=false; v_freight numeric:=0;
BEGIN
 PERFORM public.assert_finance_admin();
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=auth.uid();
 IF v_org IS NULL THEN v_org:=public.current_organization_id_v3821(); END IF;
 IF v_org IS NULL THEN RAISE EXCEPTION 'No fue posible determinar la organización financiera.'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from THEN RAISE EXCEPTION 'Rango técnico bancario inválido.'; END IF;
 SELECT coalesce(bool_or(c.bank_cutoff_exclusive),false) INTO v_lower_inclusive FROM public.finance_closings c WHERE c.organization_id=v_org AND c.status='ACTIVE' AND c.bank_cutoff_to=p_from;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_case FROM public.finance_case_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_declarations FROM public.declaration_service_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_expenses FROM public.finance_expenses x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(pp.amount_gtq),0) INTO v_suppliers FROM public.finance_accounts_payable_payments pp JOIN public.finance_accounts_payable ap ON ap.id=pp.payable_id WHERE (ap.organization_id=v_org OR ap.organization_id IS NULL) AND pp.money_account='BANK' AND (pp.created_at>p_from OR (v_lower_inclusive AND pp.created_at=p_from)) AND pp.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_customs FROM public.finance_customs_bank_outflows_v3991814 x WHERE x.organization_id=v_org AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT f.amount_gtq INTO v_freight FROM eyr_finance_private.freight_bank_between(v_org,p_from,p_to) f;
 RETURN QUERY SELECT v_case,v_declarations,v_case+v_declarations+v_freight,v_expenses,v_suppliers,v_expenses+v_suppliers+v_customs,(v_case+v_declarations+v_freight)-(v_expenses+v_suppliers+v_customs);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_bank_dashboard()
 RETURNS TABLE(reconciliation_id uuid, reconciliation_type text, reconciliation_effective_at timestamp with time zone, reconciliation_balance_gtq numeric, case_collections_gtq numeric, declaration_collections_gtq numeric, total_collections_gtq numeric, general_expenses_gtq numeric, supplier_payments_gtq numeric, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, calculated_bank_balance_gtq numeric, pending_commitments_gtq numeric, available_bank_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;
    v_rec record;

    v_case_collections numeric := 0;
    v_declaration_collections numeric := 0;

    v_expenses numeric := 0;
    v_supplier_payments numeric := 0;
    v_customs_outflows numeric := 0;

    v_freight numeric := 0;
    v_collections numeric := 0;
    v_outflows numeric := 0;

    v_net numeric := 0;
    v_bank numeric := 0;

    v_commitments numeric := 0;
begin
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


    -- Última conciliación bancaria activa.
    select
        r.id,
        r.reconciliation_type,
        r.effective_at,
        r.balance_gtq
    into v_rec
    from public.finance_bank_reconciliations r
    where r.organization_id = v_org
      and r.status = 'ACTIVE'
    order by
        r.effective_at desc,
        r.created_at desc
    limit 1;

    if v_rec.id is null then
        raise exception
            'No existe una conciliación bancaria activa.';
    end if;


    -- ========================================================
    -- ENTRADAS BANCARIAS
    -- Únicamente money_account = BANK
    -- ========================================================

    select coalesce(sum(p.amount_gtq), 0)
    into v_case_collections
    from public.finance_case_payments p
    where p.organization_id = v_org
      and p.created_at > v_rec.effective_at
      and p.money_account = 'BANK';


    select coalesce(sum(p.amount_gtq), 0)
    into v_declaration_collections
    from public.declaration_service_payments p
    where p.organization_id = v_org
      and p.created_at > v_rec.effective_at
      and p.money_account = 'BANK';


    -- ========================================================
    -- SALIDAS BANCARIAS
    -- Únicamente money_account = BANK
    -- ========================================================

    select coalesce(sum(e.amount_gtq), 0)
    into v_expenses
    from public.finance_expenses e
    where e.organization_id = v_org
      and e.created_at > v_rec.effective_at
      and e.money_account = 'BANK';


    select coalesce(sum(pp.amount_gtq), 0)
    into v_supplier_payments
    from public.finance_accounts_payable_payments pp
    join public.finance_accounts_payable ap
      on ap.id = pp.payable_id
    where (
            ap.organization_id = v_org
            or ap.organization_id is null
          )
      and pp.created_at > v_rec.effective_at
      and pp.money_account = 'BANK';


    select coalesce(sum(x.amount_gtq),0)
    into v_customs_outflows
    from public.finance_customs_bank_outflows_v3991814 x
    where x.organization_id = v_org
      and x.created_at > v_rec.effective_at;

    select f.amount_gtq into v_freight from eyr_finance_private.freight_bank_between(v_org,v_rec.effective_at,null) f;

    v_collections :=
          v_case_collections
        + v_declaration_collections
        + v_freight;

    v_outflows :=
          v_expenses
        + v_supplier_payments
        + v_customs_outflows;

    v_net :=
          v_collections
        - v_outflows;

    v_bank :=
          coalesce(v_rec.balance_gtq, 0)
        + v_net;


    -- ========================================================
    -- COMPROMISOS
    --
    -- La deuda pendiente NO reduce el saldo bancario.
    -- Solo reduce el dinero disponible/no comprometido.
    -- ========================================================

    select coalesce(
        sum(
            greatest(
                coalesce(ap.original_amount_gtq, 0)
                -
                coalesce((
                    select sum(pp.amount_gtq)
                    from public.finance_accounts_payable_payments pp
                    where pp.payable_id = ap.id
                ), 0),
                0
            )
        ),
        0
    )
    into v_commitments
    from public.finance_accounts_payable ap
    where ap.organization_id = v_org
       or ap.organization_id is null;


    return query
    select
        v_rec.id,
        v_rec.reconciliation_type,
        v_rec.effective_at,
        coalesce(v_rec.balance_gtq, 0),

        v_case_collections,
        v_declaration_collections,
        v_collections,

        v_expenses,
        v_supplier_payments,
        v_outflows,

        v_net,
        v_bank,

        v_commitments,
        v_bank - v_commitments;
end;
$function$;

CREATE OR REPLACE FUNCTION eyr_finance_private.preview_closing_at(p_from date, p_to date)
 RETURNS TABLE(checkpoint_mode text, reconciliation_id uuid, cutoff_from timestamp with time zone, cutoff_to timestamp with time zone, opening_bank_gtq numeric, case_collections_count bigint, case_collections_gtq numeric, declaration_collections_count bigint, declaration_collections_gtq numeric, total_collections_count bigint, total_collections_gtq numeric, general_expenses_count bigint, general_expenses_gtq numeric, supplier_payments_count bigint, supplier_payments_gtq numeric, total_bank_outflows_count bigint, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, projected_bank_balance_gtq numeric, pending_commitments_gtq numeric, projected_available_bank_gtq numeric, calculated_at timestamp with time zone, selected_from date, selected_to date, customs_outflows_count bigint, customs_outflows_gtq numeric, cutoff_is_day_end boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_org uuid;

    v_reconciliation record;
    v_previous_checkpoint record;
    v_bank_move record;

    v_mode text;

    v_from timestamptz;
    v_to timestamptz;
    v_recorded_at timestamptz := clock_timestamp();
    v_selected_from date;
    v_lower_inclusive boolean := false;
    v_customs_count bigint := 0;

    v_opening numeric := 0;
    v_projected numeric := 0;

    v_pending numeric := 0;

    v_freight_count bigint := 0;
    v_case_count bigint := 0;
    v_declaration_count bigint := 0;
    v_expense_count bigint := 0;
    v_supplier_count bigint := 0;

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


    if auth.uid() is null or not exists(select 1 from public.organizations o where o.id=v_org and o.active) then
      raise exception 'Organización financiera no autorizada' using errcode='42501';
    end if;
    if p_to is null or p_to>(v_recorded_at at time zone 'America/Guatemala')::date or (p_from is not null and p_from>p_to) then
      raise exception 'Seleccioná un período válido, sin fechas finales futuras.';
    end if;
    v_to:=least(v_recorded_at,((p_to+1)::timestamp at time zone 'America/Guatemala'));

    -- ========================================================
    -- CONCILIACIÓN ACTIVA
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


    -- ========================================================
    -- ÚLTIMO CHECKPOINT REAL
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
    -- DETERMINAR PUNTO DE PARTIDA
    -- Misma regla que create_finance_closing()
    -- ========================================================

    if v_previous_checkpoint.id is not null
       and v_previous_checkpoint.bank_cutoff_to
           >= v_reconciliation.effective_at
    then

        v_mode := 'PREVIOUS_CLOSING';

        v_from :=
            v_previous_checkpoint.bank_cutoff_to;

        v_opening :=
            coalesce(
                v_previous_checkpoint.closing_cash_gtq,
                0
            );

    else

        v_mode := 'RECONCILIATION';

        v_from :=
            v_reconciliation.effective_at;

        v_opening :=
            coalesce(
                v_reconciliation.balance_gtq,
                0
            );

    end if;


    v_selected_from:=coalesce(p_from,case when v_mode='PREVIOUS_CLOSING' then v_previous_checkpoint.period_end+1 else (v_reconciliation.effective_at at time zone 'America/Guatemala')::date end);
    if v_selected_from>p_to then raise exception 'No hay un período abierto para las fechas seleccionadas.';end if;
    if exists(select 1 from public.finance_closings c where c.organization_id=v_org and c.status='ACTIVE' and c.bank_cutoff_to is not null
      and daterange(c.period_start,c.period_end,'[]') && daterange(v_selected_from,p_to,'[]')) then
      raise exception 'El período seleccionado se superpone con un cierre activo.';
    end if;
    v_lower_inclusive:=v_mode='PREVIOUS_CLOSING' and coalesce(v_previous_checkpoint.bank_cutoff_exclusive,false);

    if v_to <= v_from then
        raise exception
            'No existe una ventana bancaria válida para previsualizar.';
    end if;


    -- ========================================================
    -- MISMO MOTOR MONETARIO DEL CIERRE REAL
    -- ========================================================

    select *
      into v_bank_move
    from public.finance_bank_movement_between(
        v_from,
        v_to
    );


    -- ========================================================
    -- CONTADORES
    -- Únicamente BANK y dentro de la misma ventana.
    -- ========================================================

    select count(*)
      into v_case_count
    from public.finance_case_payments x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and (x.created_at > v_from or (v_lower_inclusive and x.created_at=v_from))
      and x.created_at < v_to;


    select count(*)
      into v_declaration_count
    from public.declaration_service_payments x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and (x.created_at > v_from or (v_lower_inclusive and x.created_at=v_from))
      and x.created_at < v_to;


    select count(*)
      into v_expense_count
    from public.finance_expenses x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and (x.created_at > v_from or (v_lower_inclusive and x.created_at=v_from))
      and x.created_at < v_to;


    select count(*)
      into v_supplier_count
    from public.finance_accounts_payable_payments pp
    join public.finance_accounts_payable ap
      on ap.id = pp.payable_id
    where (
            ap.organization_id = v_org
            or ap.organization_id is null
          )
      and pp.money_account = 'BANK'
      and (pp.created_at > v_from or (v_lower_inclusive and pp.created_at=v_from))
      and pp.created_at < v_to;


    -- ========================================================
    -- SALDO PROYECTADO
    -- ========================================================

    select count(*) into v_customs_count from public.finance_customs_bank_outflows_v3991814 x where x.organization_id=v_org
      and (x.created_at>v_from or (v_lower_inclusive and x.created_at=v_from)) and x.created_at<v_to;

    v_projected :=
        v_opening
        + coalesce(
            v_bank_move.net_bank_movement_gtq,
            0
        );


    -- ========================================================
    -- COMPROMISOS PENDIENTES AL MOMENTO DEL PREVIEW
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
                          and pp.created_at < v_to
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
      and ap.created_at < v_to;


    -- ========================================================
    -- RESULTADO
    -- ========================================================

    select f.entry_count into v_freight_count from eyr_finance_private.freight_bank_between(v_org,v_from,v_to) f;

    return query
    select
        v_mode,

        v_reconciliation.id,

        v_from,
        v_to,

        v_opening,

        v_case_count,
        coalesce(
            v_bank_move.case_collections_gtq,
            0
        ),

        v_declaration_count,
        coalesce(
            v_bank_move.declaration_collections_gtq,
            0
        ),

        v_case_count + v_declaration_count + v_freight_count,
        coalesce(
            v_bank_move.total_collections_gtq,
            0
        ),

        v_expense_count,
        coalesce(
            v_bank_move.general_expenses_gtq,
            0
        ),

        v_supplier_count,
        coalesce(
            v_bank_move.supplier_payments_gtq,
            0
        ),

        v_expense_count + v_supplier_count + v_customs_count,
        coalesce(
            v_bank_move.total_bank_outflows_gtq,
            0
        ),

        coalesce(
            v_bank_move.net_bank_movement_gtq,
            0
        ),

        v_projected,

        v_pending,

        v_projected - v_pending,
        v_recorded_at,v_selected_from,p_to,v_customs_count,
        coalesce(v_bank_move.total_bank_outflows_gtq,0)-coalesce(v_bank_move.general_expenses_gtq,0)-coalesce(v_bank_move.supplier_payments_gtq,0),
        v_to<v_recorded_at;

end;
$function$;

CREATE OR REPLACE FUNCTION eyr_finance_private.read_freight_settlements(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_org uuid;v_total numeric;v_rows jsonb;v_bank numeric;
begin
 if auth.uid() is null then raise exception 'Sesión requerida' using errcode='42501';end if;
 perform public.assert_finance_admin();
 select p.organization_id into v_org from public.profiles p join public.organizations o on o.id=p.organization_id and o.active where p.id=auth.uid() and p.active;
 if v_org is null then raise exception 'Organización financiera no autorizada' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Rango de fechas inválido';end if;
 select coalesce(sum(s.amount_gtq),0) into v_total from eyr_finance_private.freight_net_settlements s
 where s.organization_id=v_org and s.voided_at is null and (s.period_month+interval '1 month'-interval '1 day')::date between p_from and p_to;
 select coalesce(sum(s.amount_gtq),0) into v_bank from eyr_finance_private.freight_net_settlements s where s.organization_id=v_org and s.voided_at is null and s.bank_received_on between p_from and p_to;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.period_month desc,x.created_at desc),'[]'::jsonb) into v_rows from(
  select s.id,s.period_month,s.amount_gtq,s.concept,s.note,s.created_at,s.bank_received_on,s.bank_recorded_at,
   ((s.period_month+interval '1 month'-interval '1 day')::date between p_from and p_to) as in_selected_period
  from eyr_finance_private.freight_net_settlements s where s.organization_id=v_org and s.voided_at is null order by s.period_month desc,s.created_at desc limit 20
 )x;
 return jsonb_build_object('period_total_gtq',v_total,'entries',v_rows,'bank_effect_gtq',v_bank);
end $function$;

commit;
