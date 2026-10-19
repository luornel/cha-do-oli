-- Chá do Oli: identificação do presente na descrição Pix, editável apenas por administradores.
-- Não modifica pagamentos existentes.
begin;
alter table public.oli_gifts
  add column if not exists pix_label text;
-- 38 bytes de rótulo + prefixo "Chá do Oli! - " respeitam o limite da descrição BR Code.
alter table public.oli_gifts
  drop constraint if exists oli_gifts_pix_label_limit;
alter table public.oli_gifts
  add constraint oli_gifts_pix_label_limit
  check (pix_label is null or
    (octet_length(pix_label) between 1 and 38 and pix_label = btrim(pix_label)));

-- Os apelidos dos presentes não são dados pessoais e podem ser lidos por convidados.
create or replace function public.oli_pix_labels()
returns table(gift_id integer, pix_label text)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.pix_label
  from public.oli_gifts g where g.active order by g.id;
$$;

-- Somente administradores autorizados podem alterar a descrição.
create or replace function public.oli_admin_set_pix_label(p_gift_id integer, p_pix_label text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  cleaned text := nullif(btrim(coalesce(p_pix_label,'')), '');
  updated_id integer;
begin
  if auth.uid() is null or not exists(
    select 1 from public.oli_admins a where a.user_id=auth.uid()
  ) then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  if cleaned is not null and octet_length(cleaned)>38 then
    raise exception 'A identificação do Pix deve ter no máximo 38 bytes UTF-8.';
  end if;
  update public.oli_gifts g set pix_label=cleaned
    where g.id=p_gift_id and g.active returning g.id into updated_id;
  if updated_id is null then
    raise exception 'Presente não encontrado.';
  end if;
  return jsonb_build_object('gift_id',updated_id,'pix_label',cleaned);
end;
$$;

revoke all on function public.oli_pix_labels() from public, anon, authenticated;
revoke all on function public.oli_admin_set_pix_label(integer,text) from public, anon, authenticated;
grant execute on function public.oli_pix_labels() to anon, authenticated;
grant execute on function public.oli_admin_set_pix_label(integer,text) to authenticated;
commit;
