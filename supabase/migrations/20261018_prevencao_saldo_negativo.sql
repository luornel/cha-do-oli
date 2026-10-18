-- Chá do Oli: proteção contra saldos negativos na exclusão de contribuições.
-- Capturado após migração aplicada e teste transacional.
-- Não modifica nem exclui pagamentos, ajustes ou histórico preexistentes.
BEGIN;

CREATE OR REPLACE FUNCTION public.oli_admin_delete_contribution(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_gift_id integer;
  v_record public.oli_contributions%rowtype;
  v_balance bigint;
  v_auto_reset integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.oli_admins a WHERE a.user_id=v_actor
  ) THEN RAISE EXCEPTION 'Acesso administrativo não autorizado.'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Informe a contribuição a excluir.'; END IF;

  SELECT c.gift_id INTO v_gift_id FROM public.oli_contributions c WHERE c.id=p_id;
  IF v_gift_id IS NULL THEN RAISE EXCEPTION 'Registro não encontrado ou já excluído.'; END IF;

  PERFORM 1 FROM public.oli_gifts g WHERE g.id=v_gift_id FOR UPDATE;
  SELECT * INTO v_record FROM public.oli_contributions c WHERE c.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado ou já excluído.'; END IF;

  INSERT INTO public.oli_deleted_contribution_audit
    (contribution_id,gift_id,units,amount_cents,former_status,deleted_by)
  VALUES
    (v_record.id,v_record.gift_id,v_record.units,
     v_record.amount_cents,v_record.status,v_actor);

  DELETE FROM public.oli_contributions c WHERE c.id=v_record.id;

  SELECT
    COALESCE((SELECT SUM(c.units) FROM public.oli_contributions c
              WHERE c.gift_id=v_gift_id AND c.status='confirmed'),0)
    + COALESCE((SELECT SUM(a.delta_units) FROM public.oli_manual_adjustments a
                WHERE a.gift_id=v_gift_id),0)
  INTO v_balance;

  IF v_balance < 0 THEN
    IF -v_balance > 2147483647 THEN
      RAISE EXCEPTION 'Saldo de ajustes fora do limite. Consulte o administrador.';
    END IF;
    v_auto_reset := (-v_balance)::integer;
    INSERT INTO public.oli_manual_adjustments
      (gift_id,delta_units,action,note,actor)
    VALUES (
      v_gift_id,v_auto_reset,'add',
      'Correção automática de saldo negativo após exclusão ' ||
        LEFT(v_record.id::text,8),
      v_actor
    );
    v_balance := 0;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_record.id,'deleted',true,'former_status',v_record.status,
    'gift_id',v_record.gift_id,'amount_cents',v_record.amount_cents,
    'auto_reset_units',v_auto_reset,'new_confirmed_quotas',v_balance
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.oli_admin_gift_balances()
 RETURNS TABLE(gift_id integer, gift_name text, total_quotas integer, is_unlimited boolean, confirmed_quotas bigint, manual_quotas bigint, unit_price_cents integer, pending_quotas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.oli_admins oa WHERE oa.user_id=auth.uid()
  ) THEN RAISE EXCEPTION 'Acesso administrativo não autorizado.'; END IF;
  RETURN QUERY
    SELECT g.id,g.name,g.total_quotas,g.is_unlimited,
      greatest(0::bigint,(COALESCE(c.confirmed,0)+COALESCE(a.adjusted,0))::bigint)::bigint,
      COALESCE(a.adjusted,0)::bigint,
      (g.price_cents/g.total_quotas)::integer,
      COALESCE(c.pending,0)::bigint
    FROM public.oli_gifts g
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oc.units) FILTER(WHERE oc.status='confirmed'),0) AS confirmed,
             COALESCE(SUM(oc.units) FILTER(WHERE oc.status='pending'),0) AS pending
      FROM public.oli_contributions oc WHERE oc.gift_id=g.id
    ) c ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oma.delta_units),0) AS adjusted
      FROM public.oli_manual_adjustments oma WHERE oma.gift_id=g.id
    ) a ON TRUE
    WHERE g.active ORDER BY g.id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.oli_progress()
 RETURNS TABLE(gift_id integer, total_quotas integer, confirmed_quotas bigint, pending_quotas bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT g.id,g.total_quotas,
    greatest(0::bigint,(COALESCE(c.confirmed,0)+COALESCE(a.adjusted,0))::bigint)::bigint,
    COALESCE(c.pending,0)::bigint
  FROM public.oli_gifts g
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(oc.units) FILTER(WHERE oc.status='confirmed'),0) AS confirmed,
           COALESCE(SUM(oc.units) FILTER(WHERE oc.status='pending'),0) AS pending
    FROM public.oli_contributions oc WHERE oc.gift_id=g.id
  ) c ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.delta_units),0) AS adjusted
    FROM public.oli_manual_adjustments a WHERE a.gift_id=g.id
  ) a ON TRUE
  WHERE g.active ORDER BY g.id;
$function$
;

REVOKE ALL ON FUNCTION public.oli_admin_delete_contribution(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oli_admin_delete_contribution(uuid) TO authenticated;
COMMIT;
