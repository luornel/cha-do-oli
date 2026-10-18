-- Chá do Oli: presentes com valor inferior a R$ 500 sempre disponíveis.
-- Aplica-se após 20261018_contribuicao_livre_ajustes.sql.
-- Mantém o total_quotas anterior para preservar o cálculo de solicitações antigas.
-- Registros de Pix, aprovações e ajustes manuais existentes não são alterados.
begin;

update public.oli_gifts
   set is_unlimited = true
 where id <> 23 and price_cents < 50000 and active;

update public.oli_gifts
   set price_cents = 1000, total_quotas = 1, is_unlimited = true
 where id = 23;

-- Para presentes baratos, permite contribuições repetidas,
-- mas cada solicitação deve corresponder ao valor integral do item.
do $migration$
declare
  definition text;
begin
  select pg_catalog.pg_get_functiondef(
      'public.oli_request_contribution(integer,integer,text,text,uuid)'::pg_catalog.regprocedure)
  into definition;

  if definition is null then
    raise exception 'Função de registro não encontrada.';
  end if;

  if pg_catalog.strpos(definition, 'if g.id <> 23 and g.price_cents < 50000') = 0 then
    if pg_catalog.strpos(definition, 'if not g.is_unlimited then') = 0 then
      raise exception 'Definição de função inesperada. Revisão necessária.';
    end if;

    definition := pg_catalog.replace(
      definition,
      'if not g.is_unlimited then',
      'if g.id <> 23 and g.price_cents < 50000 and p_units <> g.total_quotas then
        raise exception ''Este presente so aceita o pagamento integral.'';
      end if;
      if not g.is_unlimited then'
    );
    execute definition;
  end if;
end;
$migration$;

commit;
