-- Chá do Oli: cotas com confirmação manual; execute pelo Supabase migrations.
create table if not exists public.gifts (
 id integer primary key,
 name text not null,
 price_cents integer not null check (price_cents>0),
 total_quotas integer not null check(total_quotas>0),
 active boolean not null default true,
 constraint exact_quotas check (price_cents % total_quotas = 0)
);
create table if not exists public.app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.contributions (
 id uuid primary key default gen_random_uuid(),
 gift_id integer not null references public.gifts(id),
 quota_count integer not null check(quota_count>0),
 amount_cents integer not null check(amount_cents>0),
 guest_name text not null check (char_length(trim(guest_name)) between 2 and 100),
 guest_contact text check (char_length(guest_contact)<=160),
 reference text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
create index if not exists contributions_gift_status on public.contributions(gift_id,status);
create index if not exists contributions_created_at on public.contributions(created_at desc);
alter table public.gifts enable row level security;
alter table public.contributions enable row level security;
alter table public.app_admins enable row level security;
revoke all on public.gifts,public.contributions,public.app_admins from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;

-- Não expõe dados pessoais nem permite atualização pública de status.
create or replace function public.gift_progress()
returns table(gift_id integer,paid_quotas bigint,pending_quotas bigint,remaining_quotas bigint)
language sql security definer set search_path = ''
as $$
 select g.id,coalesce(sum(c.quota_count) filter(where c.status='approved'),0)::bigint,
 coalesce(sum(c.quota_count) filter(where c.status='pending'),0)::bigint,
 (g.total_quotas-coalesce(sum(c.quota_count) filter(where c.status='approved'),0))::bigint
 from public.gifts g left join public.contributions c on c.gift_id=g.id
 where g.active group by g.id,g.total_quotas order by g.id
$$;

create or replace function public.request_contribution(p_gift_id integer,p_quota_count integer,p_guest_name text,p_guest_contact text default null)
returns table(request_id uuid,request_reference text,amount_cents integer)
language plpgsql security definer set search_path = ''
as $$
declare v_gift public.gifts%rowtype;v_paid bigint;v_id uuid;v_ref text;
begin
 if p_guest_name is null or char_length(trim(p_guest_name)) not between 2 and 100 then raise exception 'Informe o nome do convidado';end if;
 if p_guest_contact is not null and char_length(p_guest_contact)>160 then raise exception 'Contato inválido';end if;
 select * into v_gift from public.gifts where id=p_gift_id and active=true for update;
 if not found then raise exception 'Presente não encontrado';end if;
 if p_quota_count is null or p_quota_count<1 or p_quota_count>v_gift.total_quotas then raise exception 'Quantidade inválida';end if;
 select coalesce(sum(quota_count),0) into v_paid from public.contributions where gift_id=p_gift_id and status='approved';
 if v_paid+p_quota_count>v_gift.total_quotas then raise exception 'Cotas insuficientes';end if;
 insert into public.contributions(gift_id,quota_count,amount_cents,guest_name,guest_contact)
 values(p_gift_id,p_quota_count,(v_gift.price_cents/v_gift.total_quotas)*p_quota_count,trim(p_guest_name),nullif(trim(coalesce(p_guest_contact,'')),''))
 returning id,reference into v_id,v_ref;
 return query select v_id,v_ref,(v_gift.price_cents/v_gift.total_quotas)*p_quota_count;
end $$;

create or replace function public.is_app_admin()
returns boolean language sql security definer set search_path = '' stable
as $$select exists(select 1 from public.app_admins where user_id=(select auth.uid()))$$;

create or replace function public.admin_list_contributions()
returns table(id uuid,reference text,gift_id integer,gift_name text,quota_count integer,amount_cents integer,guest_name text,guest_contact text,status text,created_at timestamptz,reviewed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not public.is_app_admin() then raise exception 'Acesso negado';end if;
 return query select c.id,c.reference,c.gift_id,g.name,c.quota_count,c.amount_cents,c.guest_name,c.guest_contact,c.status,c.created_at,c.reviewed_at from public.contributions c join public.gifts g on g.id=c.gift_id order by c.created_at desc limit 1000;
end $$;

create or replace function public.admin_review_contribution(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_c public.contributions%rowtype;v_g public.gifts%rowtype;v_paid bigint;
begin
 if not public.is_app_admin() then raise exception 'Acesso negado';end if;
 select * into v_c from public.contributions where id=p_request_id for update;
 if not found or v_c.status<>'pending' then raise exception 'Solicitação já processada ou inexistente';end if;
 select * into v_g from public.gifts where id=v_c.gift_id for update;
 if p_approve then
  select coalesce(sum(quota_count),0) into v_paid from public.contributions where gift_id=v_c.gift_id and status='approved';
  if v_paid+v_c.quota_count>v_g.total_quotas then raise exception 'Cotas insuficientes para aprovação';end if;
 end if;
 update public.contributions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid() where id=p_request_id;
end $$;

revoke all on function public.gift_progress() from public;
revoke all on function public.request_contribution(integer,integer,text,text) from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.admin_list_contributions() from public;
revoke all on function public.admin_review_contribution(uuid,boolean) from public;
grant execute on function public.gift_progress() to anon,authenticated;
grant execute on function public.request_contribution(integer,integer,text,text) to anon,authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.admin_list_contributions() to authenticated;
grant execute on function public.admin_review_contribution(uuid,boolean) to authenticated;