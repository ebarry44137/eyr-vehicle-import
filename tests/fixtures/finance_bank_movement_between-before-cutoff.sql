CREATE OR REPLACE FUNCTION public.finance_bank_movement_between(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(case_collections_gtq numeric, declaration_collections_gtq numeric, total_collections_gtq numeric, general_expenses_gtq numeric, supplier_payments_gtq numeric, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_case numeric:=0; v_declarations numeric:=0; v_expenses numeric:=0; v_suppliers numeric:=0; v_customs numeric:=0;
BEGIN
 PERFORM public.assert_finance_admin();
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=auth.uid();
 IF v_org IS NULL THEN v_org:=public.current_organization_id_v3821(); END IF;
 IF v_org IS NULL THEN RAISE EXCEPTION 'No fue posible determinar la organización financiera.'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from THEN RAISE EXCEPTION 'Rango técnico bancario inválido.'; END IF;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_case FROM public.finance_case_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND x.created_at>p_from AND x.created_at<=p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_declarations FROM public.declaration_service_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND x.created_at>p_from AND x.created_at<=p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_expenses FROM public.finance_expenses x WHERE x.organization_id=v_org AND x.money_account='BANK' AND x.created_at>p_from AND x.created_at<=p_to;
 SELECT COALESCE(SUM(pp.amount_gtq),0) INTO v_suppliers FROM public.finance_accounts_payable_payments pp JOIN public.finance_accounts_payable ap ON ap.id=pp.payable_id WHERE (ap.organization_id=v_org OR ap.organization_id IS NULL) AND pp.money_account='BANK' AND pp.created_at>p_from AND pp.created_at<=p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_customs FROM public.finance_customs_bank_outflows_v3991814 x WHERE x.organization_id=v_org AND x.created_at>p_from AND x.created_at<=p_to;
 RETURN QUERY SELECT v_case,v_declarations,v_case+v_declarations,v_expenses,v_suppliers,v_expenses+v_suppliers+v_customs,(v_case+v_declarations)-(v_expenses+v_suppliers+v_customs);
END;
$function$
