-- Chá do Oli: presentes permanecem abertos para contribuições após a meta.
-- Preserva cotas e preços por solicitação, histórico e conferência manual.
-- O total de cotas é referência de valor, não teto acumulado.

create or replace function public.oli_request_contribution(
  p_gift_id integer, p_units integer, p_payer_name text,
  p_payer_contact text, p_request_nonce uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  g public.oli_gifts%rowtype;
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

  select * into g from public.oli_gifts where id=p_gift_id and active;
  if not found then raise exception 'Presente indisponível.'; end if;
  -- Limite apenas por solicitação (não por total histórico confirmado).
  if p_units is null or p_units < 1 or
     p_units > (case when g.is_unlimited then 10000 else g.total_quotas end) then
    raise exception 'Quantidade de cotas inválida.';
  end if;
  -- Presentes abaixo de R$ 500 continuam com opção integral apenas.
  if not g.is_unlimited and g.price_cents < 50000
     and p_units <> g.total_quotas then
    raise exception 'Este presente só aceita o pagamento integral.';
  end if;

  amount := p_units * (g.price_cents / g.total_quotas);
  insert into public.oli_contributions
    (gift_id,payer_name,payer_contact,units,amount_cents,request_nonce)
  values (g.id,clean_name,clean_contact,p_units,amount,p_request_nonce)
  returning id into receipt;
  return pg_catalog.jsonb_build_object(
    'id',receipt,'status','pending','units',p_units,'amount_cents',amount);
exception when unique_violation then
  raise exception 'Esta solicitação já foi registrada.';
end;
$function$;

create or replace function public.oli_admin_review(p_id uuid, p_status text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  c public.oli_contributions%rowtype;
  g public.oli_gifts%rowtype;
  target_gift_id integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.oli_admins a where a.user_id=auth.uid()
  ) then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_status not in ('confirmed','rejected') or p_status is null then
    raise exception 'Decisão inválida.';
  end if;
  -- Mantém a ordem de travas: presente, depois contribuição.
  select gift_id into target_gift_id from public.oli_contributions where id=p_id;
  if target_gift_id is null then raise exception 'Solicitação inexistente.'; end if;
  select * into g from public.oli_gifts where id=target_gift_id for update;
  select * into c from public.oli_contributions where id=p_id for update;
  if c.status <> 'pending' then raise exception 'Esta solicitação já foi analisada.'; end if;
  -- Confirmações não são bloqueadas quando a meta simbólica já foi atingida.
  update public.oli_contributions
  set status=p_status,reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_id;
  return pg_catalog.jsonb_build_object('id',p_id,'status',p_status);
end;
$function$;

create or replace function public.oli_admin_adjust_quotas(
  p_gift_id integer, p_action text, p_units integer, p_note text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $function$
declare
  g public.oli_gifts%rowtype;
  current_units bigint;
  delta integer;
  note_text text := nullif(btrim(coalesce(p_note,'')),'');
begin
  if auth.uid() is null or not exists (
    select 1 from public.oli_admins where user_id=auth.uid()
  ) then raise exception 'Acesso administrativo não autorizado.'; end if;
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
      + coalesce((select sum(delta_units) from public.oli_manual_adjustments
      where gift_id=g.id),0)
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
  if current_units+delta<0 then
    raise exception 'Não é possível remover mais cotas do que as confirmadas.';
  end if;

  insert into public.oli_manual_adjustments(gift_id,delta_units,action,note,actor)
  values(g.id,delta,p_action,note_text,auth.uid());
  return pg_catalog.jsonb_build_object(
    'gift_id',g.id,'new_total',current_units+delta,'delta',delta);
end;
$function$;
