-- Chá do Oli — contribuição livre + ajustes auditáveis de cotas (2026-10-18)
-- Requer: 20261018_cotas_manuais.sql. Não remove registros nem altera autorizações existentes.
begin;

alter table public.oli_gifts add column if not exists is_unlimited boolean not null default false;
insert into public.oli_gifts(id, name, price_cents, total_quotas, is_unlimited, active)
values (23, 'Contribuição livre', 5000, 1, true, true)
on conflict (id) do update set is_unlimited = true, price_cents = 5000, total_quotas = 1,
  name = excluded.name, active = true;

create table if not exists public.oli_manual_adjustments (
  id bigint generated always as identity primary key,
  gift_id integer not null references public.oli_gifts(id),
  delta_units integer not null check(delta_units <> 0),
  action text not null check(action in ('add', 'remove', 'reset')),
  note text check(note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  actor uuid not null references auth.users(id)
);
create index if not exists oli_manual_adjustments_gift_idx on public.oli_manual_adjustments(gift_id);
alter table public.oli_manual_adjustments enable row level security;
revoke all on public.oli_manual_adjustments from public, anon, authenticated;

-- Contagens públicas agregadas; dados pessoais nunca são retornados.
create or replace function public.oli_progress()
returns table (gift_id integer, total_quotas integer, confirmed_quotas bigint, pending_quotas bigint)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.total_quotas,
    (coalesce(c.confirmed, 0) + coalesce(a.adjusted, 0))::bigint as confirmed_quotas,
    coalesce(c.pending,0)::bigint as pending_quotas
  from public.oli_gifts g
  left join lateral (
    select coalesce(sum(units) filter (where status='confirmed'),0) as confirmed,
           coalesce(sum(units) filter (where status='pending'),0) as pending
    from public.oli_contributions where gift_id=g.id
  ) c on true
  left join lateral (
    select coalesce(sum(delta_units),0) as adjusted
    from public.oli_manual_adjustments where gift_id=g.id
  ) a on true
  where g.active
  order by g.id;
$$;

-- Valor da solicitação é computado no banco; contribuição livre = R$50 x unidades.
create or replace function public.oli_request_contribution(
  p_gift_id integer,
  p_units integer,
  p_payer_name text,
  p_payer_contact text,
  p_request_nonce uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  g public.oli_gifts%rowtype;
  used_units bigint;
  receipt uuid;
  clean_name text := btrim(coalesce(p_payer_name,''));
  clean_contact text := nullif(btrim(coalesce(p_payer_contact,'')),'');
  amount integer;
begin
  if char_length(clean_name) not between 2 and 90 then
    raise exception 'Informe seu nome (2 a 90 caracteres).';
  end if;
  if clean_contact is not null and char_length(clean_contact) > 100 then
    raise exception 'Contato muito longo.';
  end if;
  if p_request_nonce is null then
    raise exception 'Identificador de solicitação obrigatório.';
  end if;
  select * into g from public.oli_gifts where id = p_gift_id and active;
  if not found then raise exception 'Presente indisponível.'; end if;
  -- Não há limite acumulado de cotas livres; 10.000 é apenas limite por solicitação,
  -- que protege o valor inteiro e o QR Pix contra números excessivos.
  if p_units is null or p_units < 1 or p_units > (case when g.is_unlimited then 10000 else g.total_quotas end) then
    raise exception 'Quantidade de cotas inválida.';
  end if;
  if not g.is_unlimited then
    if g.price_cents <= 10000 and p_units <> g.total_quotas then
      raise exception 'Este presente só aceita o pagamento integral.';
    end if;
    select coalesce((select sum(units) from public.oli_contributions
      where gift_id=g.id and status='confirmed'), 0)
      + coalesce((select sum(delta_units) from public.oli_manual_adjustments where gift_id=g.id),0)
      into used_units;
    if p_units > g.total_quotas - used_units then
      raise exception 'Quantidade indisponível. Atualize o convite.';
    end if;
  end if;
  amount := p_units * (g.price_cents / g.total_quotas);
  insert into public.oli_contributions
    (gift_id,payer_name,payer_contact,units,amount_cents,request_nonce)
  values (g.id,clean_name,clean_contact,p_units,amount,p_request_nonce)
  returning id into receipt;
  return pg_catalog.jsonb_build_object('id',receipt,'status','pending','units',p_units,'amount_cents',amount);
exception when unique_violation then
  raise exception 'Esta solicitação já foi registrada.';
end;
$$;

-- Aprovação sempre verifica o saldo consolidado sob trava do presente.
create or replace function public.oli_admin_review(p_id uuid, p_status text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c public.oli_contributions%rowtype;
  g public.oli_gifts%rowtype;
  used_units bigint;
  target_gift_id integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.oli_admins a where a.user_id=auth.uid()
  ) then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_status not in ('confirmed','rejected') or p_status is null then
    raise exception 'Decisão inválida.';
  end if;
  select gift_id into target_gift_id from public.oli_contributions where id=p_id;
  if target_gift_id is null then raise exception 'Solicitação inexistente.'; end if;
  select * into g from public.oli_gifts where id=target_gift_id for update;
  select * into c from public.oli_contributions where id=p_id for update;
  if c.status <> 'pending' then raise exception 'Esta solicitação já foi analisada.'; end if;
  if p_status='confirmed' and not g.is_unlimited then
    select coalesce((select sum(units) from public.oli_contributions
      where gift_id=g.id and status='confirmed'), 0)
      + coalesce((select sum(delta_units) from public.oli_manual_adjustments where gift_id=g.id),0)
      into used_units;
    if used_units + c.units > g.total_quotas then
      raise exception 'Não há cotas suficientes. Rejeite a solicitação excedente e confira com o convidado.';
    end if;
  end if;
  update public.oli_contributions set status=p_status,
    reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
  return pg_catalog.jsonb_build_object('id',p_id,'status',p_status);
end;
$$;

-- Resumo exclusivamente administrativo, incluindo ajustes de cotas.
create or replace function public.oli_admin_gift_balances()
returns table (
  gift_id integer, gift_name text, total_quotas integer, is_unlimited boolean,
  confirmed_quotas bigint, manual_quotas bigint, unit_price_cents integer, pending_quotas bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.oli_admins where user_id=auth.uid()) then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  return query
  select g.id,g.name,g.total_quotas,g.is_unlimited,
    (coalesce(c.confirmed,0)+coalesce(a.adjusted,0))::bigint,
    coalesce(a.adjusted,0)::bigint,
    (g.price_cents/g.total_quotas)::integer,
    coalesce(c.pending,0)::bigint
  from public.oli_gifts g
  left join lateral (
    select coalesce(sum(units) filter (where status='confirmed'),0) as confirmed,
           coalesce(sum(units) filter (where status='pending'),0) as pending
    from public.oli_contributions where gift_id=g.id
  ) c on true
  left join lateral (
    select coalesce(sum(delta_units),0) as adjusted
    from public.oli_manual_adjustments where gift_id=g.id
  ) a on true
  where g.active order by g.id;
end;
$$;

-- Histórico dos ajustes; apenas administradores autorizados podem consultá-lo.
create or replace function public.oli_admin_adjustment_history()
returns table (
  id bigint, gift_id integer, gift_name text, delta_units integer,
  action text, note text, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.oli_admins where user_id=auth.uid()) then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  return query
    select a.id,a.gift_id,g.name,a.delta_units,a.action,a.note,a.created_at
    from public.oli_manual_adjustments a join public.oli_gifts g on g.id=a.gift_id
    order by a.created_at desc,a.id desc limit 30;
end;
$$;

-- Adição, redução e zeragem; nunca apaga ou modifica os comprovantes registrados.
create or replace function public.oli_admin_adjust_quotas(
  p_gift_id integer, p_action text, p_units integer, p_note text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  g public.oli_gifts%rowtype;
  current_units bigint;
  delta integer;
  note_text text := nullif(btrim(coalesce(p_note,'')),'');
begin
  if auth.uid() is null or not exists(select 1 from public.oli_admins where user_id=auth.uid()) then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  if p_action is null or p_action not in ('add','remove','reset') then
    raise exception 'Ação inválida.';
  end if;
  if note_text is not null and char_length(note_text)>200 then
    raise exception 'Observação muito longa.';
  end if;
  select * into g from public.oli_gifts where id=p_gift_id and active for update;
  if not found then raise exception 'Presente não encontrado.'; end if;
  select coalesce((select sum(units) from public.oli_contributions
      where gift_id=g.id and status='confirmed'), 0)
      + coalesce((select sum(delta_units) from public.oli_manual_adjustments where gift_id=g.id),0)
    into current_units;
  if p_action='reset' then
    if current_units=0 then raise exception 'As cotas deste presente já estão zeradas.'; end if;
    if current_units>2147483647 then raise exception 'Limite de cotas excedido.'; end if;
    delta:=-current_units::integer;
  else
    if p_units is null or p_units<1 or p_units>10000 then
      raise exception 'Informe de 1 a 10.000 cotas por ajuste.';
    end if;
    delta:=case when p_action='add' then p_units else -p_units end;
  end if;
  if current_units+delta<0 then raise exception 'Não é possível remover mais cotas do que as confirmadas.'; end if;
  if not g.is_unlimited and current_units+delta>g.total_quotas then
    raise exception 'O ajuste ultrapassaria a quantidade total do presente.';
  end if;
  insert into public.oli_manual_adjustments(gift_id,delta_units,action,note,actor)
    values(g.id,delta,p_action,note_text,auth.uid());
  return pg_catalog.jsonb_build_object('gift_id',g.id,'new_total',current_units+delta,'delta',delta);
end;
$$;

-- Funções SECURITY DEFINER com grants explícitos: nenhuma alteração anônima.
revoke all on function public.oli_progress() from public,anon,authenticated;
revoke all on function public.oli_request_contribution(integer,integer,text,text,uuid) from public,anon,authenticated;
revoke all on function public.oli_admin_review(uuid,text) from public,anon,authenticated;
revoke all on function public.oli_admin_gift_balances() from public,anon,authenticated;
revoke all on function public.oli_admin_adjustment_history() from public,anon,authenticated;
revoke all on function public.oli_admin_adjust_quotas(integer,text,integer,text) from public,anon,authenticated;
grant execute on function public.oli_progress() to anon,authenticated;
grant execute on function public.oli_request_contribution(integer,integer,text,text,uuid) to anon,authenticated;
grant execute on function public.oli_admin_review(uuid,text) to authenticated;
grant execute on function public.oli_admin_gift_balances() to authenticated;
grant execute on function public.oli_admin_adjustment_history() to authenticated;
grant execute on function public.oli_admin_adjust_quotas(integer,text,integer,text) to authenticated;

commit;