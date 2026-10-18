-- Corrige referência ambígua em function PL/pgSQL com colunas de retorno nomeadas.
-- Preserva administradores, presentes, contribuições e histórico de ajustes.
create or replace function public.oli_admin_gift_balances()
returns table (
  gift_id integer,
  gift_name text,
  total_quotas integer,
  is_unlimited boolean,
  confirmed_quotas bigint,
  manual_quotas bigint,
  unit_price_cents integer,
  pending_quotas bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.oli_admins oa where oa.user_id = auth.uid()
  ) then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  return query
    select g.id, g.name, g.total_quotas, g.is_unlimited,
      (coalesce(c.confirmed, 0) + coalesce(a.adjusted, 0))::bigint,
      coalesce(a.adjusted, 0)::bigint,
      (g.price_cents / g.total_quotas)::integer,
      coalesce(c.pending, 0)::bigint
    from public.oli_gifts g
    left join lateral (
      select coalesce(sum(oc.units) filter (where oc.status = 'confirmed'), 0) as confirmed,
             coalesce(sum(oc.units) filter (where oc.status = 'pending'), 0) as pending
      from public.oli_contributions oc
      where oc.gift_id = g.id
    ) c on true
    left join lateral (
      select coalesce(sum(oma.delta_units), 0) as adjusted
      from public.oli_manual_adjustments oma
      where oma.gift_id = g.id
    ) a on true
    where g.active
    order by g.id;
end;
$$;
