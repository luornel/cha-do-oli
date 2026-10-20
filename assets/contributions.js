/* Convidados: progresso dos presentes, Pix e confirmação; metas não impedem novas contribuições. */
(function () {
  'use strict';
  const api=window.OliBackend;
  if (!api || !api.configured) return;  // convite atual continua funcionando sem banco
  const $=(id)=>document.getElementById(id);
  const moneyCents=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
  const state={progress:new Map(),requesting:false};
  const flow=$('contribution-flow');
  if (!flow) return;
  flow.hidden=false;
  const progressBox=$('contributions-general-status');
  progressBox.hidden=true;
  const form=$('contribution-form');
  const openButton=$('contribution-show-form');
  const status=$('contribution-status');
  const info=$('contribution-selection');
  const confirmation=$('contribution-confirmation');
  const submit=form.querySelector('button[type=submit]');
  let current=null;
  function showThankYou(receiptId){
    // Mensagem sempre reconstruída com a versão atual, mesmo se o HTML estiver em cache.
    const code=String(receiptId||'').split('-')[0].toUpperCase();
    const heading=document.createElement('strong');
    heading.textContent='Recebemos sua contribuição!';
    const reference=document.createElement('p');
    reference.textContent='Código da contribuição: ';
    const value=document.createElement('span');
    value.id='contribution-receipt';
    value.textContent=code||'—';
    reference.append(value);
    const thanks=document.createElement('p');
    thanks.textContent='Obrigado por contribuir com o nosso chá!';
    confirmation.replaceChildren(heading,reference,thanks);
    flow.classList.add('is-confirmed');
    form.hidden=true;
    openButton.hidden=true;
    confirmation.hidden=false;
    status.textContent='';
  }
  function selection(){return window.OliInvite && window.OliInvite.getSelection();}
  function reset(){flow.classList.remove('is-confirmed');form.hidden=true;confirmation.hidden=true;status.textContent='';submit.disabled=false;current=selection();paintSelection();}
  function paintSelection(){
    current=selection();
    if (!current) return;
    const product=JSON.parse(document.getElementById('app-data').textContent).gifts.find(g=>g.id===current.giftId);
    const label=product&&!product.unlimited&&Number(product.price)<500?'Valor integral':`${current.units} ${current.units===1?'cota':'cotas'}`;
    info.textContent=`${current.giftName} · ${label} · ${moneyCents(current.amountCents)}`;
  }
  function updateCompletionNotice(){
    const notice=$('gift-completion-note');
    if(!notice)return;
    const selected=selection();
    const item=selected&&JSON.parse(document.getElementById('app-data').textContent)
      .gifts.find(g=>Number(g.id)===Number(selected.giftId));
    const row=selected&&state.progress.get(Number(selected.giftId));
    const completed=!!(item&&!item.unlimited&&row&&Number(row.total_quotas)>0&&
      Number(row.confirmed_quotas)>=Number(row.total_quotas));
    notice.hidden=!completed;
  }
  function renderProgress(){
    const catalog=new Map(JSON.parse(document.getElementById('app-data').textContent)
      .gifts.map(g=>[Number(g.id),g]));
    document.querySelectorAll('#gift-grid .gift').forEach(card=>{
      const trigger=card.querySelector('[data-gift]');
      if(!trigger)return;
      const giftId=Number(trigger.dataset.gift),gift=catalog.get(giftId);
      // A meta é indicativa, não bloqueia novas contribuições.
      card.querySelector('.gift-progress')?.remove();
      trigger.removeAttribute('aria-disabled');
      trigger.classList.remove('gift-closed');
      if(!gift||gift.unlimited||Number(gift.price)<500)return;
      const row=state.progress.get(giftId);
      if(!row)return;
      const confirmed=Math.max(0,Number(row.confirmed_quotas)||0);
      const total=Math.max(0,Number(row.total_quotas)||0);
      if(!total)return;
      const progress=document.createElement('div');
      progress.className='gift-progress';
      const label=document.createElement('span');
      label.textContent=confirmed>total
        ?`${confirmed} cotas confirmadas · meta de ${total}`
        :`${confirmed} de ${total} cotas confirmadas`;
      const track=document.createElement('div');
      track.className='gift-progress-track';
      track.setAttribute('role','progressbar');
      track.setAttribute('aria-valuemin','0');
      track.setAttribute('aria-valuemax',String(total));
      track.setAttribute('aria-valuenow',String(Math.min(confirmed,total)));
      track.setAttribute('aria-valuetext',label.textContent);
      const fill=document.createElement('span');
      fill.style.width=`${Math.min(100,Math.round(confirmed/total*100))}%`;
      track.append(fill);
      progress.append(label,track);
      card.insertBefore(progress,trigger);
      trigger.textContent='Ver formas de presentear →';
    });
    updateCompletionNotice();
  }
  async function refresh(){
    try{
      const [rows,pixLabels]=await Promise.all([
        api.rpc('oli_progress'),
        api.rpc('oli_pix_labels')
      ]);
      state.progress=new Map((rows||[]).map(row=>[Number(row.gift_id),row]));
      window.OliInvite?.setPixLabels(pixLabels||[]);
      renderProgress();
      progressBox.textContent='';progressBox.hidden=true;
    }catch(e){progressBox.hidden=false;progressBox.textContent='O acompanhamento está temporariamente indisponível. O Pix continua funcionando.';}
  }
  window.addEventListener('oli:gift-opened',()=>{reset();updateCompletionNotice();});
  window.addEventListener('oli:selection-changed',()=>{paintSelection();if(!confirmation.hidden)return;status.textContent='';});
  openButton.addEventListener('click',()=>{
    paintSelection();
    form.hidden=false;openButton.hidden=true;
    form.querySelector('input[name=payer_name]').focus();
  });
  window.addEventListener('oli:gift-opened',()=>{openButton.hidden=false;});
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(state.requesting)return;
    paintSelection();
    if(!current){status.textContent='Selecione um presente para continuar.';return;}
    if(!form.reportValidity())return;
    const name=form.elements.payer_name.value.trim();
    const contact=form.elements.payer_contact.value.trim();
    
    state.requesting=true;submit.disabled=true;status.textContent='Registrando sua solicitação…';
    try{
      const r=await api.rpc('oli_request_contribution',{
        p_gift_id:current.giftId,p_units:current.units,p_payer_name:name,
        p_payer_contact:contact || null,p_request_nonce:crypto.randomUUID()
      });
      showThankYou((Array.isArray(r)?r[0]:r)?.id);
      await refresh();
    }catch(e){status.textContent=e.message||'Não foi possível registrar. Tente novamente.';submit.disabled=false;}
    finally{state.requesting=false;}
  });
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();},45000);
})();