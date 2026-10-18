/* Convidados: status público agregado e solicitação após Pix. */
(function () {
  'use strict';
  const api=window.OliBackend;
  if (!api || !api.configured) return;  // convite atual continua funcionando sem banco
  const $=(id)=>document.getElementById(id);
  const moneyCents=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
  const state={progress:new Map(),requesting:false,recordedKey:null};
  const flow=$('contribution-flow');
  if (!flow) return;
  flow.hidden=false;
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
  function reset(){form.hidden=true;confirmation.hidden=true;status.textContent='';submit.disabled=false;state.recordedKey=null;current=selection();paintSelection();}
  function paintSelection(){
    current=selection();
    if (!current) return;
    info.textContent=`${current.giftName} · ${current.units} ${current.units===1?'cota':'cotas'} · ${moneyCents(current.amountCents)}`;
  }
  function progressRows(){
    document.querySelectorAll('#gift-grid .gift').forEach(card=>{
      const trigger=card.querySelector('[data-gift]');if(!trigger)return;
      const row=state.progress.get(Number(trigger.dataset.gift));if(!row)return;
      const confirmed=Number(row.paid_quotas)||0;
      const total=Number(row.total_quotas)||0;
      const remaining=Math.max(0,total-confirmed);
      let el=card.querySelector('.gift-progress');
      if(!el){el=document.createElement('div');el.className='gift-progress';card.insertBefore(el,trigger);}
      el.replaceChildren();
      const label=document.createElement('span');label.textContent=`${confirmed} de ${total} cotas confirmadas`;
      const track=document.createElement('div');track.className='gift-progress-track';track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(total));track.setAttribute('aria-valuenow',String(confirmed));
      const fill=document.createElement('span');fill.style.width=`${total?Math.min(100,Math.round(100*confirmed/total)):0}%`;track.append(fill);
      const remain=document.createElement('small');remain.textContent=remaining===0?'Presente completo':`${remaining} cotas ainda não confirmadas`;
      el.append(label,track,remain);
      if(!remaining){trigger.textContent='Presente completo';trigger.setAttribute('aria-disabled','true');trigger.classList.add('gift-closed');}
    });
  }
  async function refresh(){
    try{
      const rows=await api.rpc('gift_progress');
      state.progress=new Map((rows||[]).map(r=>[Number(r.gift_id),{...r,total_quotas:Number(r.paid_quotas)+Number(r.remaining_quotas)}]));
      progressRows();
      progressBox.textContent='Cotas contabilizadas após confirmação manual do Pix.';
    }catch(e){progressBox.textContent='O acompanhamento está temporariamente indisponível. O Pix continua funcionando.';}
  }
  function isOverLimit(){
    if(!current)return false;
    const row=state.progress.get(current.giftId);if(!row)return false;
    return current.units>Math.max(0,Number(row.total_quotas)-Number(row.paid_quotas));
  }
  window.addEventListener('oli:gift-opened',reset);
  window.addEventListener('oli:selection-changed',()=>{paintSelection();if(!confirmation.hidden)return;state.recordedKey=null;status.textContent='';});
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
    state.recordedKey='submitted';
    state.requesting=true;submit.disabled=true;status.textContent='Registrando sua solicitação…';
    try{
      const r=await api.rpc('request_contribution',{
        p_gift_id:current.giftId,p_quota_count:current.units,p_guest_name:name,
        p_guest_contact:contact || null
      });
      form.hidden=true;openButton.hidden=true;confirmation.hidden=false;
      $('contribution-receipt').textContent=String((Array.isArray(r)?r[0]:r)?.request_reference||'').toUpperCase();
      status.textContent='Solicitação enviada. Aguarde a conferência do Pix pelo organizador.';
      await refresh();
    }catch(e){status.textContent=e.message||'Não foi possível registrar. Tente novamente.';submit.disabled=false;}
    finally{state.requesting=false;}
  });
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();},45000);
})();