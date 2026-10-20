/* Administração: login Supabase Auth + RPC restritas ao UID autorizado na migration. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const api=window.OliBackend;
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
  let entries=[], balances=[],history=[],pixLabels=[], filter='pending', busy=false;
  function show(id,value=true){$(id).hidden=!value;}
  function message(id,text){$(id).textContent=text||'';}
  function render(){
    const paid=entries.filter(e=>e.status==='confirmed');
    const pending=entries.filter(e=>e.status==='pending');
    $('paid-units').textContent=String(balances.reduce((a,g)=>a+Number(g.confirmed_quotas),0));
    $('paid-amount').textContent=money(balances.reduce((a,g)=>a+Number(g.confirmed_quotas)*Number(g.unit_price_cents),0));
    $('pending-count').textContent=String(pending.length);
    $('pending-filter-count').textContent=pending.length ? String(pending.length) : '';
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
      if(e.status==='confirmed'){
        const corrections=document.createElement('div');corrections.className='entry-actions';
        const shortcut=document.createElement('button');shortcut.type='button';shortcut.className='outline';
        shortcut.textContent='Remover cotas deste presente';
        shortcut.title='Abre a gestão de cotas com este presente selecionado; mantém o histórico do Pix';
        shortcut.addEventListener('click',()=>openRemoval(e));corrections.append(shortcut);card.append(corrections);
      }
      const deleteRow=document.createElement('div');deleteRow.className='entry-remove';
      const deleteButton=document.createElement('button');deleteButton.type='button';
      deleteButton.className='entry-remove-btn';deleteButton.textContent='Excluir registro';
      deleteButton.setAttribute('aria-label','Excluir registro de '+e.payer_name+' para '+e.gift_name);
      deleteButton.addEventListener('click',()=>deleteContribution(e));
      deleteRow.append(deleteButton);card.append(deleteRow);
      container.append(card);
    }
  }
  async function load(){
    try{
      message('dashboard-message','Atualizando contribuições…');
      [entries,balances,history,pixLabels]=await Promise.all([
        api.rpc('oli_admin_list'),api.rpc('oli_admin_gift_balances'),api.rpc('oli_admin_adjustment_history'),api.rpc('oli_pix_labels')
      ]);
      entries=entries||[];balances=balances||[];history=history||[];pixLabels=pixLabels||[];
      render();renderManager();renderPixLabels();message('dashboard-message','');
      window.dispatchEvent(new CustomEvent('oli:admin-loaded',{detail:{
        entries:entries.map(e=>({id:e.id,status:e.status,gift_name:e.gift_name,amount_cents:e.amount_cents}))
      }}));
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
    for(const btn of document.querySelectorAll('[data-manage-action]')){
      const yes=btn.dataset.manageAction===mode;
      btn.classList.toggle('active',yes);btn.setAttribute('aria-pressed',String(yes));
    }
    const submit=$('manage-submit');
    submit.textContent=mode==='reset'?'Zerar cotas deste presente':mode==='remove'?'Remover cotas':'Adicionar cotas';
    submit.classList.toggle('danger',mode!=='add');
    if(!g){
      $('manage-balance').textContent='Selecione um presente.';
      $('manage-balance-count').textContent='—';
      $('manage-preview').textContent='—';
      $('manage-preview-caption').textContent='Selecione o presente.';
      submit.disabled=true;return;
    }
    const paid=Number(g.confirmed_quotas),unit=money(g.unit_price_cents);
    const total=g.is_unlimited?'Contribuição livre · disponibilidade ilimitada':`${Math.max(0,Number(g.total_quotas)-paid)} cotas ainda disponíveis de ${g.total_quotas}`;
    $('manage-balance-count').textContent=`${paid} ${paid===1?'cota':'cotas'}`;
    $('manage-balance').textContent=`${unit} por cota · ${total}`;
    const units=mode==='reset'?0:Number(input.value);
    const after=mode==='reset'?0:mode==='add'?paid+units:paid-units;
    const valid=mode==='reset'?paid>0:
      Number.isInteger(units)&&units>=1&&units<=10000&&after>=0&&
      (g.is_unlimited||after<=Number(g.total_quotas));
    const preview=$('manage-preview'),caption=$('manage-preview-caption');
    preview.textContent=valid?`${after} ${after===1?'cota':'cotas'}`:'Quantidade inválida';
    caption.textContent=mode==='reset'?'O saldo contabilizado ficará zerado.':
      mode==='remove'?'Cotas descontadas do saldo público.':'Cotas acrescentadas ao saldo público.';
    preview.parentElement.classList.toggle('invalid',!valid);
    submit.disabled=!valid||busy;
  }
  function openRemoval(e){
    document.getElementById('manage-gift').value=String(e.gift_id);
    document.getElementById('manage-action').value='remove';
    document.getElementById('manage-units').value=String(e.units);
    document.getElementById('manage-note').value=`Revisão do registro ${String(e.id||'').split('-')[0].toUpperCase()}`;
    paintManager();
    message('manage-message','Confira a quantidade e o saldo antes de salvar. O registro original permanece no histórico.');
    document.getElementById('gerenciar-cotas').scrollIntoView({behavior:'smooth',block:'start'});
    document.getElementById('manage-units').focus({preventScroll:true});
  }
  $('manage-gift').addEventListener('change',()=>{message('manage-message','');paintManager();});
  $('manage-units').addEventListener('input',paintManager);
  document.querySelectorAll('[data-manage-action]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      $('manage-action').value=btn.dataset.manageAction;
      message('manage-message','');paintManager();
    });
  });
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
  async function deleteContribution(e){
    if(busy)return;
    const ref=String(e.id||'').split('-')[0].toUpperCase();
    const confirmed=e.status==='confirmed';
    const impact=confirmed
      ?'Este Pix está marcado como confirmado: o valor e as cotas serão descontados dos totais do site.'
      :'O registro desaparecerá da lista de contribuições.';
    const warning='EXCLUIR DEFINITIVAMENTE esta contribuição?'
      +'\n\n'+e.payer_name+' · '+e.gift_name
      +'\n'+money(e.amount_cents)+' · Referência '+ref
      +'\n\n'+impact
      +'\n\nEsta operação não cancela nem devolve o Pix no Nubank.'
      +'\nCaso o saldo fique negativo, será ajustado automaticamente para zero.'
      +'\nSerá mantido apenas um histórico técnico sem dados pessoais.';
    if(!window.confirm(warning))return;
    busy=true;
    message('dashboard-message','Excluindo registro…');
    try{
      const result=await api.rpc('oli_admin_delete_contribution',{p_id:e.id});
      await load();
      const corrected=Number(result?.auto_reset_units)||0;
      message('dashboard-message',corrected>0
        ?`Registro excluído. O saldo negativo foi corrigido automaticamente para zero (+${corrected} ${corrected===1?'cota':'cotas'} de compensação).`
        :'Registro excluído. Os totais foram atualizados.');
    }catch(err){
      message('dashboard-message','Não foi possível excluir o registro: '+(err?.message||'Erro de conexão.'));
    }finally{busy=false;}
  }
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

  const pixLabelForm=$('pix-label-form');
  function selectedPixGift(){return balances.find(g=>String(g.gift_id)===$('pix-label-gift').value);}
  function pixLabelValue(g){return pixLabels.find(x=>Number(x.gift_id)===Number(g.gift_id))?.pix_label||'';}
  function pixByteLength(v){return new TextEncoder().encode(String(v)).length;}
  function paintPixPreview(){
    const g=selectedPixGift(),input=$('pix-label-input');
    const val=input.value.trim();
    $('pix-label-preview-text').textContent=g?'Chá do Oli! - '+(val||g.gift_name):'Selecione um presente.';
    const len=pixByteLength(val);
    const valid=len<=38;
    $('pix-label-save').disabled=!g||!valid;
    $('pix-label-message').textContent=valid?'':`A identificação tem ${len} bytes; o limite é de 38 bytes (acentos ocupam mais de um byte).`;
  }
  function renderPixLabels(){
    const selector=$('pix-label-gift'),selected=selector.value;
    selector.replaceChildren();
    for(const g of balances){
      const option=document.createElement('option');option.value=String(g.gift_id);option.textContent=g.gift_name;selector.appendChild(option);
    }
    if(balances.some(g=>String(g.gift_id)===selected))selector.value=selected;
    loadPixInput();
  }
  function loadPixInput(){
    const g=selectedPixGift();
    $('pix-label-input').value=g?pixLabelValue(g):'';
    $('pix-label-message').textContent='';
    paintPixPreview();
  }
  $('pix-label-gift').addEventListener('change',loadPixInput);
  $('pix-label-input').addEventListener('input',paintPixPreview);
  pixLabelForm.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const g=selectedPixGift(),label=$('pix-label-input').value.trim();
    if(!g||pixByteLength(label)>38)return;
    busy=true;$('pix-label-save').disabled=true;message('pix-label-message','Salvando…');
    try{
      const result=await api.rpc('oli_admin_set_pix_label',{p_gift_id:Number(g.gift_id),p_pix_label:label||null});
      const idx=pixLabels.findIndex(x=>Number(x.gift_id)===Number(g.gift_id));
      if(idx>=0)pixLabels[idx].pix_label=result.pix_label;
      else pixLabels.push({gift_id:Number(g.gift_id),pix_label:result.pix_label});
      message('pix-label-message','Descrição salva. Os próximos Pix deste presente usarão a identificação atualizada.');
      paintPixPreview();
    }catch(error){message('pix-label-message',error.message||'Não foi possível salvar.');}
    finally{busy=false;paintPixPreview();}
  });
  $('pix-label-reset').addEventListener('click',()=>{
    const g=selectedPixGift();
    if(!g||busy)return;
    $('pix-label-input').value='';
    paintPixPreview();
    pixLabelForm.requestSubmit();
  });

  async function loggedIn(){
    show('login-panel',false);
    show('dashboard',true);
    show('logout',false);
    try{
      await load();
      show('logout',true);
      window.dispatchEvent(new Event('oli:admin-ready'));
      message('login-error','');
    }catch(e){
      const reason=String(e?.message||'Erro temporário ao carregar os dados.');
      const unauthorized=/acesso administrativo não autorizado|permission denied|não autorizado|unauthorized/i.test(reason);
      if(unauthorized){
        show('dashboard',false);show('login-panel',true);show('logout',false);
        message('login-error','Sua conta está autenticada, mas ainda não possui permissão administrativa.');
      }else{
        show('logout',true);
        window.dispatchEvent(new Event('oli:admin-ready'));
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
  $('logout').addEventListener('click',async()=>{await api.getClient().auth.signOut();entries=[];show('dashboard',false);show('logout',false);show('login-panel',true);message('login-error','Sessão encerrada.');window.dispatchEvent(new Event('oli:admin-logout'));});
  document.querySelectorAll('.filters button').forEach(button=>button.addEventListener('click',()=>{
    filter=button.dataset.filter;
    document.querySelectorAll('.filters button').forEach(b=>{const yes=b===button;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});
    render();
  }));
  start();
})();