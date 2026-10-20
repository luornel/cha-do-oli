-- Web Push Chá do Oli. Publique a Edge Function 'oli-web-push' antes desta migration.
-- Nenhuma contribuição nem ajuste existente é alterado.
begin;
create extension if not exists pg_net with schema extensions;

create table if not exists public.oli_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check(char_length(endpoint) between 30 and 2048 and endpoint like 'https://%'),
  p256dh text not null check(char_length(p256dh) between 40 and 256),
  auth_secret text not null check(char_length(auth_secret) between 12 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists oli_push_subscriptions_user_idx on public.oli_push_subscriptions(user_id);
alter table public.oli_push_subscriptions enable row level security;
revoke all on public.oli_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.oli_push_subscriptions to service_role;

-- Chave de autenticação do webhook é gerada dentro do próprio Postgres e armazenada criptografada no Vault.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='oli_push_hook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'), 'oli_push_hook_secret', 'Assinatura interna do webhook de novas contribuições do Chá do Oli');
  end if;
end; $$;

-- Só a Edge Function com a chave de serviço consegue consultar/registrar o VAPID.
create or replace function public.oli_push_vapid_get()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v text;
begin
  select s.decrypted_secret into v from vault.decrypted_secrets s where s.name='oli_push_vapid' limit 1;
  return case when v is null then null else v::jsonb end;
end; $$;

create or replace function public.oli_push_vapid_init(p_keys jsonb)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
begin
  if jsonb_typeof(p_keys) <> 'object'
    or p_keys->>'appServerKey' is null
    or length(p_keys->>'appServerKey') <> 87
    or jsonb_typeof(p_keys->'publicKey') <> 'object'
    or jsonb_typeof(p_keys->'privateKey') <> 'object' then
    raise exception 'Chave VAPID inválida';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('oli_push_vapid'));
  if not exists (select 1 from vault.decrypted_secrets s where s.name='oli_push_vapid') then
    perform vault.create_secret(p_keys::text,'oli_push_vapid','Par VAPID para Web Push do Chá do Oli');
  end if;
  return true;
end; $$;

-- Comprova que o aviso veio de um INSERT real e recente no banco.
create or replace function public.oli_push_verify_hook(p_id uuid,p_epoch bigint,p_signature text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare secret text;expected text;
begin
  if p_epoch is null or abs(extract(epoch from pg_catalog.clock_timestamp())::bigint-p_epoch)>240 then return false;end if;
  if not exists (select 1 from public.oli_contributions c where c.id=p_id and c.status='pending') then return false;end if;
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name='oli_push_hook_secret' limit 1;
  if secret is null or p_signature is null or length(p_signature)<>64 then return false;end if;
  expected := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(p_id::text||':'||p_epoch::text,'UTF8'),pg_catalog.convert_to(secret,'UTF8'),'sha256'),'hex');
  return expected=p_signature;
end; $$;

revoke all on function public.oli_push_vapid_get() from public,anon,authenticated;
revoke all on function public.oli_push_vapid_init(jsonb) from public,anon,authenticated;
revoke all on function public.oli_push_verify_hook(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.oli_push_vapid_get() to service_role;
grant execute on function public.oli_push_vapid_init(jsonb) to service_role;
grant execute on function public.oli_push_verify_hook(uuid,bigint,text) to service_role;

create or replace function public.oli_push_dispatch_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
declare hook_secret text; epoch bigint; signature text;
begin
  select s.decrypted_secret into hook_secret from vault.decrypted_secrets s where s.name='oli_push_hook_secret' limit 1;
  if hook_secret is null then return new;end if;
  epoch:=extract(epoch from pg_catalog.clock_timestamp())::bigint;
  signature:=pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(new.id::text||':'||epoch::text,'UTF8'),pg_catalog.convert_to(hook_secret,'UTF8'),'sha256'),'hex');
  perform net.http_post(
    url:='https://dszxortvohiizpxkypyh.supabase.co/functions/v1/oli-web-push',
    headers:=pg_catalog.jsonb_build_object('Content-Type','application/json'),
    body:=pg_catalog.jsonb_build_object('action','dispatch','id',new.id,'epoch',epoch,'signature',signature),
    timeout_milliseconds:=5000
  );
  return new;
exception when others then
  raise log 'Oli Push: falha ao enfileirar aviso para contribuição %, SQLSTATE %',new.id,sqlstate;
  return new; -- Nunca impedir o pedido do convidado se o Push estiver indisponível.
end; $$;

drop trigger if exists oli_contribution_push_trigger on public.oli_contributions;
create trigger oli_contribution_push_trigger after insert on public.oli_contributions
for each row execute function public.oli_push_dispatch_insert();
commit;