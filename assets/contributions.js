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
  const oldNote=document.querySelector('#presentes .fineprint');
  if(oldNote)oldNote.textContent='Cotas marcadas como pagas somente após conferência manual no Nubank. Pedidos pendentes não reservam cotas, e o site não identifica pagamentos sozinho.';
  const progressBox=$('contributions-general-status');
  progressBox.hidden=false;
  const form=$('contribution-form');
  const openButton=$('contribution-show-form');
  const status=$('contribution-status');
  const info=$('contribution-selection');
  const confirmation=$('contribution-confirmation');
  const submit=form.querySelector('button[type=submit]');
  let current=null;
  function selection(){return window.OliInvite && window.OliInvite.getSelection();}
  function reset(){form.hidden=true;confirmation.hidden=true;status.textContent='';submit.disabled=false;current=selection();paintSelection();}
  function paintSelection(){
    current=selection();
    if (!current) return;
    info.textContent=`${current.giftName} · ${current.units} ${current.units===1?'cota':'cotas'} · ${moneyCents(current.amountCents)}`;
  }
  function progressRows(){
    document.querySelectorAll('#gift-grid .gift').forEach(card=>{
      const trigger=card.querySelector('[data-gift]');if(!trigger)return;
      const row=state.progress.get(Number(trigger.dataset.gift));if(!row)return;
      const confirmed=Number(row.confirmed_quotas)||0;
      const free=Number(trigger.dataset.gift)===23;
      const total=Number(row.total_quotas)||0;
      const remaining=Math.max(0,total-confirmed);
      let el=card.querySelector('.gift-progress');
      if(!el){el=document.createElement('div');el.className='gift-progress';card.insertBefore(el,trigger);}
      el.replaceChildren();
      const label=document.createElement('span');label.textContent=free?`${confirmed} cotas livres confirmadas`:`${confirmed} de ${total} cotas confirmadas`;
      if(free){
        const remain=document.createElement('small');remain.textContent='Sempre disponível · R$ 50 por cota';
        el.append(label,remain);
      }else{
        const track=document.createElement('div');track.className='gift-progress-track';track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(total));track.setAttribute('aria-valuenow',String(confirmed));
        const fill=document.createElement('span');fill.style.width=`${total?Math.min(100,Math.round(100*confirmed/total)):0}%`;track.append(fill);
        const remain=document.createElement('small');remain.textContent=remaining===0?'Presente completo':`${remaining} cotas ainda não confirmadas`;
        el.append(label,track,remain);
        const soldOut=remaining===0;
        trigger.textContent=soldOut?'Presente completo':Number(trigger.dataset.gift)<=7?'Presentear →':'Ver formas de presentear →';
        trigger.setAttribute('aria-disabled',String(soldOut));trigger.classList.toggle('gift-closed',soldOut);
      }
    });
  }
  async function refresh(){
    try{
      const rows=await api.rpc('oli_progress');
      state.progress=new Map((rows||[]).map(r=>[Number(r.gift_id),r]));
      progressRows();
      progressBox.textContent='Cotas contabilizadas após confirmação manual do Pix.';
    }catch(e){progressBox.textContent='O acompanhamento está temporariamente indisponível. O Pix continua funcionando.';}
  }
  function isOverLimit(){
    if(!current)return false;
    if(current.giftId===23)return false;
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
      form.hidden=true;openButton.hidden=true;confirmation.hidden=false;
      $('contribution-receipt').textContent=String((Array.isArray(r)?r[0]:r)?.id||'').split('-')[0].toUpperCase();
      status.textContent='Solicitação enviada. Aguarde a conferência do Pix pelo organizador.';
      await refresh();
    }catch(e){status.textContent=e.message||'Não foi possível registrar. Tente novamente.';submit.disabled=false;}
    finally{state.requesting=false;}
  });
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();},45000);
})();