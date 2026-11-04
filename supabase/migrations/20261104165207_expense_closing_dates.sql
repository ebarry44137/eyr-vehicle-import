begin;
alter table public.finance_expenses
 add column bank_closing_date date,
 add column bank_closing_recorded_at timestamptz,
 add constraint finance_expense_closing_date_complete check((bank_closing_date is null and bank_closing_recorded_at is null) or (bank_closing_date is not null and bank_closing_recorded_at is not null));
comment on column public.finance_expenses.bank_closing_date is 'Fecha del gasto elegida para el cierre bancario. NULL conserva la regla histórica de created_at. No modifica la fecha real de registro ni constituye confirmación adicional de fecha de transferencia.';
comment on column public.finance_expenses.bank_closing_recorded_at is 'Auditoría real de asignación de la fecha para cierre; generada por el servidor.';
create index finance_expenses_closing_date_idx on public.finance_expenses(organization_id,bank_closing_date) where money_account='BANK' and bank_closing_date is not null;

create function eyr_finance_private.guard_expense_closing_date() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_date date;v_changed boolean;v_rec_date date;
begin
 -- Existing rows retain their previous rule unless explicitly assigned or financially edited.
 if tg_op='UPDATE' then
  if new.created_at is distinct from old.created_at then raise exception 'La fecha real de registro del gasto es inmutable.';end if;
  v_changed:=(new.organization_id,new.expense_date,new.amount_gtq,new.money_account,new.bank_closing_date)
    is distinct from (old.organization_id,old.expense_date,old.amount_gtq,old.money_account,old.bank_closing_date);
  if not v_changed then new.bank_closing_recorded_at:=old.bank_closing_recorded_at;return new;end if;
 else v_changed:=true;end if;
 if auth.uid() is null then raise exception 'Sesión financiera requerida' using errcode='42501';end if;
 perform public.assert_finance_admin();
 select p.organization_id into v_org from public.profiles p join public.organizations o on o.id=p.organization_id and o.active where p.id=auth.uid() and p.active;
 if v_org is null or new.organization_id is distinct from v_org then raise exception 'Organización financiera no autorizada' using errcode='42501';end if;
 if tg_op='UPDATE' and old.organization_id is distinct from v_org then raise exception 'No se permite trasladar gastos entre organizaciones' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_closing:'||v_org::text,0));
 if tg_op='UPDATE' and old.money_account='BANK' and exists(select 1 from public.finance_closings c where c.organization_id=v_org and c.status='ACTIVE' and c.bank_cutoff_to is not null
  and ((old.bank_closing_date is null and old.created_at<=c.bank_cutoff_to)
   or (old.bank_closing_date is not null and (old.bank_closing_date<=c.period_end or old.bank_closing_date<(c.bank_cutoff_to at time zone 'America/Guatemala')::date)))) then
  raise exception 'El gasto ya afecta un cierre activo. Se requiere revisión del cierre antes de modificarlo.';
 end if;
 if new.money_account is distinct from 'BANK' then new.bank_closing_date:=null;new.bank_closing_recorded_at:=null;return new;end if;
 v_date:=new.expense_date;
 if v_date is null or v_date>(clock_timestamp() at time zone 'America/Guatemala')::date then raise exception 'Elegí una fecha de gasto válida, sin fechas futuras.';end if;
 select (r.effective_at at time zone 'America/Guatemala')::date into v_rec_date from public.finance_bank_reconciliations r where r.organization_id=v_org and r.status='ACTIVE' order by r.effective_at desc,r.created_at desc limit 1;
 if v_rec_date is null or v_date<=v_rec_date then raise exception 'La fecha del gasto coincide con o precede a la conciliación activa; se requiere revisión.';end if;
 if exists(select 1 from public.finance_closings c where c.organization_id=v_org and c.status='ACTIVE' and c.bank_cutoff_to is not null
   and (v_date<=c.period_end or v_date<(c.bank_cutoff_to at time zone 'America/Guatemala')::date
     or (v_date=(c.bank_cutoff_to at time zone 'America/Guatemala')::date and not(c.bank_cutoff_exclusive and (c.bank_cutoff_to at time zone 'America/Guatemala')::time=time '00:00')))) then
  raise exception 'La fecha elegida afectaría un cierre activo. Se requiere revisión del cierre.';
 end if;
 new.bank_closing_date:=v_date;new.bank_closing_recorded_at:=clock_timestamp();
 return new;
end $$;
revoke all on function eyr_finance_private.guard_expense_closing_date() from public,anon,authenticated;
-- After the existing organization and money-account BEFORE triggers.
create trigger zz_finance_expense_closing_date before insert or update on public.finance_expenses for each row execute function eyr_finance_private.guard_expense_closing_date();

create function eyr_finance_private.dated_expenses_between(p_org uuid,p_from timestamptz,p_to timestamptz)
returns table(amount_gtq numeric,entry_count bigint) language sql security invoker set search_path='' as $$
 select coalesce(sum(e.amount_gtq),0),count(*) from public.finance_expenses e
 where e.organization_id=p_org and e.money_account='BANK' and e.bank_closing_date is not null
 and e.bank_closing_date >= (p_from at time zone 'America/Guatemala')::date + case
  when (p_from at time zone 'America/Guatemala')::time=time '00:00' and exists(select 1 from public.finance_closings c where c.organization_id=p_org and c.status='ACTIVE' and c.bank_cutoff_to=p_from and c.bank_cutoff_exclusive) then 0 else 1 end
 and e.bank_closing_date <= (coalesce(p_to,clock_timestamp()) at time zone 'America/Guatemala')::date - case
  when p_to is not null and (p_to at time zone 'America/Guatemala')::time=time '00:00' then 1 else 0 end;
$$;
revoke all on function eyr_finance_private.dated_expenses_between(uuid,timestamptz,timestamptz) from public,anon,authenticated;


CREATE OR REPLACE FUNCTION public.finance_bank_movement_between(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(case_collections_gtq numeric, declaration_collections_gtq numeric, total_collections_gtq numeric, general_expenses_gtq numeric, supplier_payments_gtq numeric, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_case numeric:=0; v_declarations numeric:=0; v_expenses numeric:=0; v_suppliers numeric:=0; v_customs numeric:=0; v_lower_inclusive boolean:=false; v_freight numeric:=0; v_dated_expenses numeric:=0;
BEGIN
 PERFORM public.assert_finance_admin();
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=auth.uid();
 IF v_org IS NULL THEN v_org:=public.current_organization_id_v3821(); END IF;
 IF v_org IS NULL THEN RAISE EXCEPTION 'No fue posible determinar la organización financiera.'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from THEN RAISE EXCEPTION 'Rango técnico bancario inválido.'; END IF;
 SELECT coalesce(bool_or(c.bank_cutoff_exclusive),false) INTO v_lower_inclusive FROM public.finance_closings c WHERE c.organization_id=v_org AND c.status='ACTIVE' AND c.bank_cutoff_to=p_from;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_case FROM public.finance_case_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_declarations FROM public.declaration_service_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_expenses FROM public.finance_expenses x WHERE x.organization_id=v_org AND x.money_account='BANK' AND x.bank_closing_date IS NULL AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(pp.amount_gtq),0) INTO v_suppliers FROM public.finance_accounts_payable_payments pp JOIN public.finance_accounts_payable ap ON ap.id=pp.payable_id WHERE (ap.organization_id=v_org OR ap.organization_id IS NULL) AND pp.money_account='BANK' AND (pp.created_at>p_from OR (v_lower_inclusive AND pp.created_at=p_from)) AND pp.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_customs FROM public.finance_customs_bank_outflows_v3991814 x WHERE x.organization_id=v_org AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT f.amount_gtq INTO v_freight FROM eyr_finance_private.freight_bank_between(v_org,p_from,p_to) f;
 SELECT f.amount_gtq INTO v_dated_expenses FROM eyr_finance_private.dated_expenses_between(v_org,p_from,p_to) f;
 v_expenses:=v_expenses+v_dated_expenses;
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

    v_dated_expenses numeric := 0;
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
      and e.money_account = 'BANK' and e.bank_closing_date is null;

    select f.amount_gtq into v_dated_expenses from eyr_finance_private.dated_expenses_between(v_org,v_rec.effective_at,null) f;
    v_expenses:=v_expenses+v_dated_expenses;


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
    v_dated_expense_count bigint := 0;
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
      and x.money_account = 'BANK' and x.bank_closing_date is null
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

    select f.entry_count into v_dated_expense_count from eyr_finance_private.dated_expenses_between(v_org,v_from,v_to) f;
    v_expense_count:=v_expense_count+v_dated_expense_count;

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

commit;
