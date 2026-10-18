/* Administração: login Supabase Auth + RPC restritas ao UID autorizado na migration. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const api=window.OliBackend;
  const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
  let entries=[], filter='pending', busy=false;
  function show(id,value=true){$(id).hidden=!value;}
  function message(id,text){$(id).textContent=text||'';}
  function render(){
    const paid=entries.filter(e=>e.status==='approved');
    const pending=entries.filter(e=>e.status==='pending');
    $('paid-units').textContent=String(paid.reduce((a,e)=>a+Number(e.quota_count),0));
    $('paid-amount').textContent=money(paid.reduce((a,e)=>a+Number(e.amount_cents),0));
    $('pending-count').textContent=String(pending.length);
    $('pending-amount').textContent=money(pending.reduce((a,e)=>a+Number(e.amount_cents),0));
    $('total-count').textContent=`${entries.length} registros`;
    const selected=entries.filter(e=>filter==='all'||e.status===filter);
    const container=$('entries');container.replaceChildren();
    if (!selected.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Nenhuma contribuição nesta situação.';container.append(empty);return;}
    for(const e of selected){
      const card=document.createElement('article');card.className='entry';
      const header=document.createElement('div');header.className='entry-head';
      const title=document.createElement('h3');title.textContent=e.guest_name;
      const tag=document.createElement('span');tag.className='tag '+e.status;tag.textContent=({pending:'A conferir',approved:'Confirmada',rejected:'Rejeitada'})[e.status]||e.status;
      header.append(title,tag);
      const gift=document.createElement('p');gift.className='gift-name';gift.textContent=e.gift_name;
      const data=document.createElement('div');data.className='entry-data';
      const strong=document.createElement('strong');strong.textContent=money(e.amount_cents);
      const label=document.createElement('div');label.textContent=`${e.quota_count} ${e.quota_count===1?'cota':'cotas'}`;
      data.append(strong,label);
      const meta=document.createElement('div');meta.className='entry-meta';
      const received=new Date(e.created_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
      const ref=String(e.id||'').split('-')[0].toUpperCase();
      meta.textContent=`Contato: ${e.guest_contact||'Não informado'} · Referência: ${ref} · Pedido: ${received}`;
      card.append(header,gift,data,meta);
      if (e.status==='pending'){
        const actions=document.createElement('div');actions.className='entry-actions';
        const confirm=document.createElement('button');confirm.type='button';confirm.className='primary';confirm.textContent='Confirmar Pix recebido';confirm.addEventListener('click',()=>review(e,'approved'));
        const reject=document.createElement('button');reject.type='button';reject.className='outline';reject.textContent='Rejeitar';reject.addEventListener('click',()=>review(e,'rejected'));
        actions.append(confirm,reject);card.append(actions);
      }
      container.append(card);
    }
  }
  async function load(){
    try{message('dashboard-message','Atualizando contribuições…');entries=(await api.rpc('admin_list_contributions'))||[];render();message('dashboard-message','');}
    catch(e){message('dashboard-message','Falha ao carregar: '+e.message);throw e;}
  }
  async function review(e,status){
    if(busy)return;
    const label=status==='approved'?'CONFIRMAR como pago':'REJEITAR';
    const confirmation=`${label}: ${e.guest_name}\n${e.gift_name}\n${e.quota_count} cotas · ${money(e.amount_cents)}\n\n${status==='approved'?'Confira primeiro o recebimento no Nubank.':'A solicitação não poderá ser confirmada depois.'}`;
    if(!window.confirm(confirmation))return;
    busy=true;
    try{message('dashboard-message','Salvando decisão…');await api.rpc('admin_review_contribution',{p_request_id:e.id,p_approve:status==='approved'});await load();}
    catch(err){message('dashboard-message','Não foi possível concluir: '+err.message);}
    finally{busy=false;}
  }
  async function loggedIn(){
    try{await load();show('login-panel',false);show('dashboard',true);}
    catch(e){await api.getClient().auth.signOut();show('dashboard',false);show('login-panel',true);message('login-error','Usuário autenticado, mas sem autorização de administrador.');}
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