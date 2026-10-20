/* Convidados: Pix e solicitações; o progresso fica apenas no painel administrativo. */
(function () {
  'use strict';
  const api=window.OliBackend;
  if (!api || !api.configured) return;  // convite atual continua funcionando sem banco
  const $=(id)=>document.getElementById(id);
  const moneyCents=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
  const state={requesting:false};
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
  function ensureAllGiftsAvailable(){
    // O progresso e a meta de cada presente são privados ao painel administrativo.
    document.querySelectorAll('#gift-grid .gift').forEach(card=>{
      card.querySelector('.gift-progress')?.remove();
      const trigger=card.querySelector('[data-gift]');
      if(!trigger)return;
      trigger.removeAttribute('aria-disabled');
      trigger.classList.remove('gift-closed');
    });
  }
  async function refresh(){
    try{
      const pixLabels=await api.rpc('oli_pix_labels');
      window.OliInvite?.setPixLabels(pixLabels||[]);
      ensureAllGiftsAvailable();
      progressBox.textContent='';progressBox.hidden=true;
    }catch(e){progressBox.hidden=false;progressBox.textContent='O acompanhamento está temporariamente indisponível. O Pix continua funcionando.';}
  }
  window.addEventListener('oli:gift-opened',reset);
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