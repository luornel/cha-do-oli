/* Administração: login Supabase Auth + RPC restritas ao UID autorizado na migration. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const api=window.OliBackend;
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
  let entries=[], balances=[],history=[], filter='pending', busy=false;
  function show(id,value=true){$(id).hidden=!value;}
  function message(id,text){$(id).textContent=text||'';}
  function render(){
    const paid=entries.filter(e=>e.status==='confirmed');
    const pending=entries.filter(e=>e.status==='pending');
    $('paid-units').textContent=String(balances.reduce((a,g)=>a+Number(g.confirmed_quotas),0));
    $('paid-amount').textContent=money(balances.reduce((a,g)=>a+Number(g.confirmed_quotas)*Number(g.unit_price_cents),0));
    $('pending-count').textContent=String(pending.length);
    $('pending-amount').textContent=money(pending.reduce((a,e)=>a+Number(e.amount_cents),0));
    $('total-count').textContent=`${entries.length} registros`;
    const selected=entries.filter(e=>filter==='all'||e.status===filter);
    const container=$('entries');container.replaceChildren();
    if (!selected.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Nenhuma contribuição nesta situação.';container.append(empty);return;}
    for(const e of selected){
      const card=document.createElement('article');card.className='entry';
      const header=document.createElement('div');header.className='entry-head';
      const title=document.createElement('h3');title.textContent=e.payer_name;
      const tag=document.createElement('span');tag.className='tag '+e.status;tag.textContent=({pending:'A conferir',confirmed:'Confirmada',rejected:'Rejeitada'})[e.status]||e.status;
      header.append(title,tag);
      const gift=document.createElement('p');gift.className='gift-name';gift.textContent=e.gift_name;
      const data=document.createElement('div');data.className='entry-data';
      const strong=document.createElement('strong');strong.textContent=money(e.amount_cents);
      const label=document.createElement('div');label.textContent=`${e.units} ${e.units===1?'cota':'cotas'}`;
      data.append(strong,label);
      const meta=document.createElement('div');meta.className='entry-meta';
      const received=new Date(e.created_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
      const ref=String(e.id||'').split('-')[0].toUpperCase();
      meta.textContent=`Contato: ${e.payer_contact||'Não informado'} · Referência: ${ref} · Pedido: ${received}`;
      card.append(header,gift,data,meta);
      if (e.status==='pending'){
        const actions=document.createElement('div');actions.className='entry-actions';
        const confirm=document.createElement('button');confirm.type='button';confirm.className='primary';confirm.textContent='Confirmar Pix recebido';confirm.addEventListener('click',()=>review(e,'confirmed'));
        const reject=document.createElement('button');reject.type='button';reject.className='outline';reject.textContent='Rejeitar';reject.addEventListener('click',()=>review(e,'rejected'));
        actions.append(confirm,reject);card.append(actions);
      }
      container.append(card);
    }
  }
  async function load(){
    try{
      message('dashboard-message','Atualizando contribuições…');
      [entries,balances,history]=await Promise.all([
        api.rpc('oli_admin_list'),api.rpc('oli_admin_gift_balances'),api.rpc('oli_admin_adjustment_history')
      ]);
      entries=entries||[];balances=balances||[];history=history||[];
      render();renderManager();message('dashboard-message','');
    }catch(e){message('dashboard-message','Falha ao carregar: '+e.message);throw e;}
  }

  function renderManager(){
    const picker=$('manage-gift'),old=picker.value;
    picker.replaceChildren();
    for(const g of balances){
      const option=document.createElement('option');option.value=String(g.gift_id);
      option.textContent=g.gift_name;picker.append(option);
    }
    if(balances.some(g=>String(g.gift_id)===old))picker.value=old;
    paintManager();
    const historyList=$('adjustment-history-list');historyList.replaceChildren();
    if(!history.length){const p=document.createElement('p');p.textContent='Nenhum ajuste manual realizado.';historyList.append(p);}
    for(const e of history){
      const p=document.createElement('p');
      const count=Math.abs(Number(e.delta_units));
      const verb=({add:'Adicionadas',remove:'Removidas',reset:'Zeradas'})[e.action]||'Ajustadas';
      p.textContent=`${new Date(e.created_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})} · ${e.gift_name} · ${verb}: ${count} ${count===1?'cota':'cotas'}${e.note?' · '+e.note:''}`;
      historyList.append(p);
    }
  }
  function paintManager(){
    const g=balances.find(v=>String(v.gift_id)===$('manage-gift').value);
    const mode=$('manage-action').value;
    const box=$('manage-units-box'),input=$('manage-units');
    box.hidden=mode==='reset';input.required=mode!=='reset';
    if(!g){$('manage-balance').textContent='Selecione um presente.';return;}
    const paid=Number(g.confirmed_quotas),unit=money(g.unit_price_cents);
    const total=g.is_unlimited?'disponibilidade ilimitada':`de ${g.total_quotas} cotas totais`;
    $('manage-balance').textContent=`${paid} ${paid===1?'cota contabilizada':'cotas contabilizadas'} · ${unit} por cota · ${total}.`;
    const submit=$('manage-submit');submit.textContent=mode==='reset'?'Zerar cotas deste presente':mode==='remove'?'Remover cotas':'Adicionar cotas';
    submit.classList.toggle('danger',mode==='reset');
  }
  $('manage-gift').addEventListener('change',paintManager);
  $('manage-action').addEventListener('change',paintManager);
  $('quota-adjust-form').addEventListener('submit',async ev=>{
    ev.preventDefault();if(busy)return;
    const form=ev.currentTarget,selected=balances.find(g=>String(g.gift_id)===form.elements.gift_id.value);
    if(!selected||!form.reportValidity())return;
    const action=form.elements.action.value;
    const count=action==='reset'?null:Number(form.elements.units.value);
    const before=Number(selected.confirmed_quotas);
    const after=action==='reset'?0:action==='add'?before+count:before-count;
    if(!Number.isInteger(after)||after<0||(!selected.is_unlimited&&after>Number(selected.total_quotas))){
      message('manage-message','Quantidade inválida ou superior ao disponível neste presente.');return;
    }
    const verb=action==='reset'?'ZERAR todas as cotas contabilizadas':action==='remove'?'REMOVER cotas contabilizadas':'ADICIONAR cotas contabilizadas';
    if(!window.confirm(`${verb} de ${selected.gift_name}?\n\nAntes: ${before} cotas\nDepois: ${after} cotas\n\nO histórico de pagamentos será preservado.`))return;
    busy=true;$('manage-submit').disabled=true;message('manage-message','Salvando ajuste…');
    try{
      await api.rpc('oli_admin_adjust_quotas',{
        p_gift_id:Number(selected.gift_id),p_action:action,p_units:count,p_note:form.elements.note.value.trim()||null
      });
      form.elements.note.value='';await load();message('manage-message','Ajuste realizado e registrado no histórico.');
    }catch(err){message('manage-message',err.message||'Não foi possível ajustar as cotas.');}
    finally{busy=false;$('manage-submit').disabled=false;}
  });
  async function review(e,status){
    if(busy)return;
    const label=status==='confirmed'?'CONFIRMAR como pago':'REJEITAR';
    const confirmation=`${label}: ${e.payer_name}\n${e.gift_name}\n${e.units} cotas · ${money(e.amount_cents)}\n\n${status==='confirmed'?'Confira primeiro o recebimento no Nubank.':'A solicitação não poderá ser confirmada depois.'}`;
    if(!window.confirm(confirmation))return;
    busy=true;
    try{message('dashboard-message','Salvando decisão…');await api.rpc('oli_admin_review',{p_id:e.id,p_status:status});await load();}
    catch(err){message('dashboard-message','Não foi possível concluir: '+err.message);}
    finally{busy=false;}
  }
  async function loggedIn(){
    show('login-panel',false);
    show('dashboard',true);
    try{
      await load();
      message('login-error','');
    }catch(e){
      const reason=String(e?.message||'Erro temporário ao carregar os dados.');
      const unauthorized=/acesso administrativo não autorizado|permission denied|não autorizado|unauthorized/i.test(reason);
      if(unauthorized){
        show('dashboard',false);
        show('login-panel',true);
        message('login-error','Sua conta está autenticada, mas ainda não possui permissão administrativa.');
      }else{
        // Erros de SQL, conexão e carregamento não invalidam a sessão.
        // O administrador pode usar "Atualizar" depois da recuperação.
        message('dashboard-message','Falha ao carregar os dados: '+reason+' Use Atualizar para tentar novamente.');
      }
    }
  }
  async function start(){
    if(!api||!api.configured){show('admin-unconfigured',true);return;}
    show('login-panel',true);
    try{const {data,error}=await api.getClient().auth.getSession();if(!error&&data.session)await loggedIn();}
    catch(e){message('login-error','Falha de conexão. Confira sua internet.');}
  }
  $('login-form').addEventListener('submit',async ev=>{
    ev.preventDefault();const f=ev.currentTarget;
    if(!f.reportValidity())return;
    const btn=f.querySelector('button[type=submit]');btn.disabled=true;message('login-error','Entrando…');
    try{
      const {error}=await api.getClient().auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});
      if(error)throw error;
      f.elements.password.value='';message('login-error','');await loggedIn();
    }catch(e){message('login-error',e.message||'Não foi possível entrar.');}
    finally{btn.disabled=false;}
  });
  $('refresh').addEventListener('click',()=>load().catch(()=>{}));
  $('logout').addEventListener('click',async()=>{await api.getClient().auth.signOut();entries=[];show('dashboard',false);show('login-panel',true);message('login-error','Sessão encerrada.');});
  document.querySelectorAll('.filters button').forEach(button=>button.addEventListener('click',()=>{
    filter=button.dataset.filter;
    document.querySelectorAll('.filters button').forEach(b=>{const yes=b===button;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
    render();
  }));
  start();
})();