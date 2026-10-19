/* Convidados: status público agregado e solicitação após Pix. */
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
  function progressRows(){
    // Os presentes abaixo de R$ 500 podem ser presenteados repetidas vezes,
    // sem barra de cotas e sem esgotamento no convite.
    const catalog=new Map(JSON.parse(document.getElementById('app-data').textContent).gifts.map(g=>[Number(g.id),g]));
    document.querySelectorAll('#gift-grid .gift').forEach(card=>{
      const trigger=card.querySelector('[data-gift]');if(!trigger)return;
      const giftId=Number(trigger.dataset.gift),item=catalog.get(giftId);
      if(!item||item.unlimited||Number(item.price)<500){card.querySelector('.gift-progress')?.remove();trigger.removeAttribute('aria-disabled');trigger.classList.remove('gift-closed');return;}
      const row=state.progress.get(giftId);if(!row)return;
      const confirmed=Number(row.confirmed_quotas)||0;
      const free=Number(trigger.dataset.gift)===23;
      const total=Number(row.total_quotas)||0;
      const remaining=Math.max(0,total-confirmed);
      let el=card.querySelector('.gift-progress');
      if(!el){el=document.createElement('div');el.className='gift-progress';card.insertBefore(el,trigger);}
      el.replaceChildren();
      const label=document.createElement('span');label.textContent=free?`${confirmed} cotas livres confirmadas`:`${confirmed} de ${total} cotas confirmadas`;
      if(free){
        const remain=document.createElement('small');remain.textContent='';
        el.append(label,remain);
      }else{
        const track=document.createElement('div');track.className='gift-progress-track';track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(total));track.setAttribute('aria-valuenow',String(confirmed));
        const fill=document.createElement('span');fill.style.width=`${total?Math.min(100,Math.round(100*confirmed/total)):0}%`;track.append(fill);
        el.append(label,track);
        const soldOut=remaining===0;
        trigger.textContent=soldOut?'✅':Number(trigger.dataset.gift)<=7?'Presentear →':'Ver formas de presentear →';
        trigger.setAttribute('aria-disabled',String(soldOut));trigger.classList.toggle('gift-closed',soldOut);
      }
    });
  }
  async function refresh(){
    try{
      const rows=await api.rpc('oli_progress');
      state.progress=new Map((rows||[]).map(r=>[Number(r.gift_id),r]));
      progressRows();
      progressBox.textContent='';progressBox.hidden=true;
    }catch(e){progressBox.hidden=false;progressBox.textContent='O acompanhamento está temporariamente indisponível. O Pix continua funcionando.';}
  }
  function isOverLimit(){
    if(!current)return false;
    if(current.giftId===23||Number(JSON.parse(document.getElementById('app-data').textContent).gifts.find(g=>g.id===current.giftId)?.price)<500)return false;
    const row=state.progress.get(current.giftId);if(!row)return false;
    return current.units>Math.max(0,Number(row.total_quotas)-Number(row.confirmed_quotas));
  }
  window.addEventListener('oli:gift-opened',reset);
  window.addEventListener('oli:selection-changed',()=>{paintSelection();if(!confirmation.hidden)return;status.textContent='';});
  openButton.addEventListener('click',()=>{
    paintSelection();
    if(isOverLimit()){status.textContent='Quantidade indisponível. Escolha menos cotas ou outro presente.';return;}
    form.hidden=false;openButton.hidden=true;
    form.querySelector('input[name=payer_name]').focus();
  });
  window.addEventListener('oli:gift-opened',()=>{openButton.hidden=false;});
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(state.requesting)return;
    paintSelection();
    if(!current||isOverLimit()){status.textContent='Verifique a quantidade de cotas disponíveis.';return;}
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