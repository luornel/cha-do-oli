-- Chá do Oli — esquema para Supabase (executar em SQL Editor)
-- Segurança: todos os registros pessoais são privados; acesso público só por funções RPC.
-- Nunca publicar service_role / sb_secret no GitHub Pages.

begin;

create table if not exists public.oli_gifts (
  id integer primary key,
  name text not null,
  price_cents integer not null check(price_cents > 0),
  total_quotas integer not null check(total_quotas between 1 and 1000),
  active boolean not null default true,
  check(price_cents % total_quotas = 0)
);

create table if not exists public.oli_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.oli_contributions (
  id uuid primary key default gen_random_uuid(),
  gift_id integer not null references public.oli_gifts(id),
  payer_name text not null check(char_length(btrim(payer_name)) between 2 and 90),
  payer_contact text check(payer_contact is null or char_length(payer_contact) <= 100),
  units integer not null check(units > 0),
  amount_cents integer not null check(amount_cents > 0),
  status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
  request_nonce uuid not null unique,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists oli_contributions_gift_status_idx
  on public.oli_contributions (gift_id, status);
create index if not exists oli_contributions_created_idx
  on public.oli_contributions (created_at desc);

alter table public.oli_gifts enable row level security;
alter table public.oli_admins enable row level security;
alter table public.oli_contributions enable row level security;

revoke all on table public.oli_gifts, public.oli_admins, public.oli_contributions from public, anon, authenticated;

-- Inserts iniciais idempotentes. Não altera preços de presentes já cadastrados.
insert into public.oli_gifts (id,name,price_cents,total_quotas,active) values
  (1,'Um carinho para o Oli',2000,1,true),
  (2,'Lenços umedecidos',3000,1,true),
  (3,'Pomada preventiva',4000,2,true),
  (4,'Mordedor e chocalho',5000,2,true),
  (5,'Fraldas RN',6000,3,true),
  (6,'Body de algodão',7500,3,true),
  (7,'Kit de banho',9000,3,true),
  (8,'Kit de mamadeiras',12000,4,true),
  (9,'Kit de roupinhas',15000,5,true),
  (10,'Manta aconchegante',18000,6,true),
  (11,'Estoque de fraldas P',22000,4,true),
  (12,'Estoque de fraldas M',30000,6,true),
  (13,'Enxoval de banho',35000,7,true),
  (14,'Canguru ergonômico',45000,9,true),
  (15,'Cadeira de descanso',60000,12,true),
  (16,'Tapete de atividades',75000,15,true),
  (17,'Bebê conforto',90000,18,true),
  (18,'Berço do Oli',120000,24,true),
  (19,'Cômoda com trocador',150000,30,true),
  (20,'Poltrona de amamentação',180000,36,true),
  (21,'Enxoval completo',250000,50,true),
  (22,'Carrinho de bebê 3 em 1',500000,100,true)
on conflict (id) do nothing;

-- Resultado agregado público: nunca expõe nomes, contatos, IDs de contribuições.
create or replace function public.oli_progress()
returns table (gift_id integer, total_quotas integer, confirmed_quotas bigint, pending_quotas bigint)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.total_quotas,
    coalesce(sum(c.units) filter (where c.status = 'confirmed'), 0)::bigint,
    coalesce(sum(c.units) filter (where c.status = 'pending'), 0)::bigint
  from public.oli_gifts g
  left join public.oli_contributions c on c.gift_id = g.id
  where g.active
  group by g.id, g.total_quotas
  order by g.id;
$$;

-- O convidado só pode criar solicitações pendentes; valor sempre calculado no servidor.
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
  if p_units is null or p_units < 1 or p_units > g.total_quotas then
    raise exception 'Quantidade de cotas inválida.';
  end if;
  if g.price_cents <= 10000 and p_units <> g.total_quotas then
    raise exception 'Este presente só aceita o pagamento integral.';
  end if;
  select coalesce(sum(units),0) into used_units
    from public.oli_contributions where gift_id = p_gift_id and status = 'confirmed';
  if p_units > g.total_quotas - used_units then
    raise exception 'Quantidade indisponível. Atualize o convite.';
  end if;
  insert into public.oli_contributions
    (gift_id,payer_name,payer_contact,units,amount_cents,request_nonce)
  values
    (g.id,clean_name,clean_contact,p_units,p_units*(g.price_cents/g.total_quotas),p_request_nonce)
  returning id into receipt;
  return pg_catalog.jsonb_build_object(
    'id',receipt,'status','pending', 'units',p_units,
    'amount_cents',p_units*(g.price_cents/g.total_quotas));
exception when unique_violation then
  raise exception 'Esta solicitação já foi registrada.';
end;
$$;

-- Só membros autorizados podem visualizar nomes e aprovar/rejeitar.
create or replace function public.oli_admin_list()
returns table (
  id uuid, gift_id integer, gift_name text, payer_name text, payer_contact text,
  units integer, amount_cents integer, status text, created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.oli_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  return query
  select c.id,c.gift_id,g.name,c.payer_name,c.payer_contact,
         c.units,c.amount_cents,c.status,c.created_at,c.reviewed_at
  from public.oli_contributions c
  join public.oli_gifts g on g.id=c.gift_id
  order by case when c.status='pending' then 0 else 1 end, c.created_at desc;
end;
$$;

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
    select 1 from public.oli_admins a where a.user_id = auth.uid()
  ) then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_status not in ('confirmed','rejected') or p_status is null then
    raise exception 'Decisão inválida.';
  end if;
  -- Ordem de travas consistente: presente, depois contribuição.
  select gift_id into target_gift_id from public.oli_contributions where id=p_id;
  if target_gift_id is null then raise exception 'Solicitação inexistente.'; end if;
  select * into g from public.oli_gifts where id=target_gift_id for update;
  select * into c from public.oli_contributions where id=p_id for update;
  if c.status <> 'pending' then raise exception 'Esta solicitação já foi analisada.'; end if;
  if p_status='confirmed' then
    select coalesce(sum(units),0) into used_units
      from public.oli_contributions where gift_id=c.gift_id and status='confirmed';
    if used_units + c.units > g.total_quotas then
      raise exception 'Não há cotas suficientes. Rejeite a solicitação excedente e faça a conferência com o convidado.';
    end if;
  end if;
  update public.oli_contributions set status=p_status,
    reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_id;
  return pg_catalog.jsonb_build_object('id',p_id,'status',p_status);
end;
$$;

-- Evita privilégios executáveis implícitos e acesso direto às tabelas.
revoke all on function public.oli_progress() from public, anon, authenticated;
revoke all on function public.oli_request_contribution(integer,integer,text,text,uuid) from public, anon, authenticated;
revoke all on function public.oli_admin_list() from public, anon, authenticated;
revoke all on function public.oli_admin_review(uuid,text) from public, anon, authenticated;
grant execute on function public.oli_progress() to anon, authenticated;
grant execute on function public.oli_request_contribution(integer,integer,text,text,uuid) to anon, authenticated;
grant execute on function public.oli_admin_list() to authenticated;
grant execute on function public.oli_admin_review(uuid,text) to authenticated;

commit;

-- APÓS criar sua conta em Authentication -> Users, autorize SOMENTE seu UID:
-- INSERT INTO public.oli_admins(user_id) VALUES ('COLE-AQUI-O-UID-DO-ADMINISTRADOR');
