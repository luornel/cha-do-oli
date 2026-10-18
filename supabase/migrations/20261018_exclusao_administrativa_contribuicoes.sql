-- Chá do Oli: exclusao administrativa auditada de contribuicoes.
-- Registros excluidos deixam de contar nos saldos; historico tecnico nao armazena nome nem contato.
begin;

create table if not exists public.oli_deleted_contribution_audit (
  id bigint generated always as identity primary key,
  contribution_id uuid not null,
  gift_id integer not null references public.oli_gifts(id),
  units integer not null check (units>0),
  amount_cents integer not null check (amount_cents>0),
  former_status text not null check (former_status in ('pending','confirmed','rejected')),
  deleted_by uuid not null references auth.users(id),
  deleted_at timestamptz not null default now()
);
create unique index if not exists oli_deleted_contribution_unique
  on public.oli_deleted_contribution_audit(contribution_id);

alter table public.oli_deleted_contribution_audit enable row level security;
revoke all on public.oli_deleted_contribution_audit from public, anon, authenticated;
revoke all on sequence public.oli_deleted_contribution_audit_id_seq from public, anon, authenticated;

create or replace function public.oli_admin_delete_contribution(p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_id uuid := auth.uid();
  v_gift_id integer;
  v_record public.oli_contributions%rowtype;
begin
  if v_id is null or not exists (
    select 1 from public.oli_admins a where a.user_id=v_id
  ) then raise exception 'Acesso administrativo não autorizado.'; end if;

  if p_id is null then raise exception 'Informe a contribuição a excluir.'; end if;

  select c.gift_id into v_gift_id from public.oli_contributions c where c.id=p_id;
  if v_gift_id is null then raise exception 'Registro não encontrado ou já excluído.'; end if;

  perform 1 from public.oli_gifts g where g.id=v_gift_id for update;
  select * into v_record from public.oli_contributions c where c.id=p_id for update;
  if not found then raise exception 'Registro não encontrado ou já excluído.'; end if;

  insert into public.oli_deleted_contribution_audit
    (contribution_id,gift_id,units,amount_cents,former_status,deleted_by)
  values
    (v_record.id,v_record.gift_id,v_record.units,v_record.amount_cents,v_record.status,v_id);

  delete from public.oli_contributions c where c.id=v_record.id;
  return pg_catalog.jsonb_build_object(
    'id',v_record.id,'deleted',true,'former_status',v_record.status,
    'gift_id',v_record.gift_id,'amount_cents',v_record.amount_cents
  );
end;
$$;

revoke all on function public.oli_admin_delete_contribution(uuid) from public,anon,authenticated;
grant execute on function public.oli_admin_delete_contribution(uuid) to authenticated;

commit;
