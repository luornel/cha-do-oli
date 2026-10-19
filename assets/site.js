
(function(){
 'use strict';
 const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
 const bootstrap=JSON.parse($('#app-data').textContent);
 const storageKey='cha-do-oli-editor-2026-v3';
 let data=bootstrap;
 if(!bootstrap.guestMode){try{const saved=localStorage.getItem(storageKey);if(saved)data={...bootstrap,...JSON.parse(saved),guestMode:false};}catch(e){}}
 const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cents=n=>Math.round((Number(n)||0)*100);
 const isMobile=()=>/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
 const pad=n=>String(n).padStart(2,'0');
 const toFloatingICS=value=>{const d=new Date(value);return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;};
 const toUTCICS=value=>{const d=new Date(value);return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;};
 const escapeICS=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 function buildICS(){
  const start=data.calendarStart||'2026-11-14T15:00:00-03:00';
  const end=data.calendarEnd||'2026-11-14T20:00:00-03:00';
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OpenAI//Cha do Oli//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:cha-do-oli-${toFloatingICS(start)}@offline`, `DTSTAMP:${toUTCICS(new Date())}`, `DTSTART:${toUTCICS(start)}`, `DTEND:${toUTCICS(end)}`, `SUMMARY:${escapeICS(data.calendarTitle||data.title||'Chá do Oli')}`, `DESCRIPTION:${escapeICS(data.calendarDescription||data.subtitle||'')}`, `LOCATION:${escapeICS(data.place||'')}`,'END:VEVENT','END:VCALENDAR'];
  return lines.join('\r\n');
 }
 function openCalendarEvent(ev){
  if(ev)ev.preventDefault();
  const ics=buildICS();
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='cha-do-oli.ics';
  if(isMobile()){link.target='_self';}
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
  toast(isMobile()?'Evento da agenda gerado! Abra/importe no app de calendário.':'Arquivo de agenda baixado.');
 }
 let gift=null,mode='quotas',quantity=1,filter='all',pixPayload='',previousFocus=null,toastTimer;
 function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3200);}
 function titleHtml(txt){const m=txt.match(/^(.*?)\s+(está a caminho)$/i);return m?`${safe(m[1])}<span class="highlight">${safe(m[2])}</span>`:safe(txt);}
 function giftQuotas(g){return Math.max(1,Math.floor(Number(g.quotas)||1));}
 function unlimitedGift(g){return !!(g && g.unlimited === true);}
 const MAX_FREE_PER_REQUEST=10000;
 function quotaCents(g){return Math.round(cents(g.price)/giftQuotas(g));}
 function render(){
  $('#hero-title').innerHTML=titleHtml(data.title||'O chá do Oli está chegando!');
  $('#hero-subtitle').textContent=data.subtitle||'';
  $('#event-date').textContent=data.date||'Data a definir';$('#event-time').textContent=data.time||'Horário a definir';
  $('#event-place').textContent=data.place||'Local a definir';
  const mapsLink=$('#maps-link'); if(mapsLink){mapsLink.href=data.mapsLink||'https://maps.app.goo.gl/vyRMy49puk8KgtbaA';mapsLink.target='_blank';mapsLink.rel='noopener';}
  const calendarLink=$('#calendar-link'); if(calendarLink){calendarLink.href=data.calendarWebUrl||'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Ch%C3%A1+do+Oli&dates=20261114T180000Z%2F20261114T230000Z&details=O+ch%C3%A1+do+Oli+est%C3%A1+chegando%21+Venha+escrever+esse+cap%C3%ADtulo+com+a+gente.&location=Fontoura+Xavier%2C+550%2C+Porto+Alegre%2C+RS&ctz=America%2FSao_Paulo';calendarLink.title='Adicionar à agenda';calendarLink.setAttribute('aria-label',`Adicionar ${data.date||'o evento'} à agenda`);}
  document.title='Chá do Oli!';
  const editTrigger=$('#edit-trigger');if(editTrigger)editTrigger.hidden=!!data.guestMode;
  renderGifts();
 }
 function renderGifts(){
  const items=(data.gifts||[]).slice().sort((a,b)=>(a.id===23?-1:b.id===23?1:a.price-b.price));
  $('#gift-grid').innerHTML=items.length?items.map(g=>{
   const n=giftQuotas(g),one=quotaCents(g)/100,free=unlimitedGift(g),split=!free&&Number(g.price)>=500&&n>1,band=free?'free':Number(g.price)<=100?'low':Number(g.price)<=500?'medium':'high';
   const quotaText=free?`Cotas livres de <strong>${money(g.price)}</strong>`:split?`${n} cotas de <strong>${money(one)}</strong> (opcional)`:'Valor integral';
   return `<article class="gift${free?' gift-unlimited':''}" data-band="${band}"><div class="gift-symbol" aria-hidden="true">${safe(g.emoji||'🎁')}</div><h3>${safe(g.name)}</h3><p class="gift-desc">${safe(g.description)}</p><div class="gift-price-label">${free?'Valor por cota':'Valor total'}</div><div class="gift-price">${money(g.price)}</div><div class="gift-quota">${quotaText}</div><a class="gift-btn" href="#presentear-${Number(g.id)}" data-gift="${Number(g.id)}" aria-label="Escolher ${safe(g.name)}">${free?'Presentear':split?'Ver formas de presentear →':'Presentear →'}</a></article>`;
  }).join(''):'<p class="fineprint" style="grid-column:1/-1">Nenhum presente disponível.</p>';
 }

 function setOverlay(id,open){const el=$('#'+id);el.classList.toggle('open',open);el.setAttribute('aria-hidden',String(!open));document.body.classList.toggle('no-scroll',!!$('.overlay.open,.editor-overlay.open'));if(!open&&previousFocus&&document.contains(previousFocus))previousFocus.focus();}
 function byteLength(value){return new TextEncoder().encode(String(value)).length;}
 function fitUtf8(value,maxBytes){
  let result='',length=0;
  for(const char of String(value)){
   const part=byteLength(char);
   if(length+part>maxBytes)break;
   result+=char;length+=part;
  }
  return result;
 }
 // O padrão BR Code informa o tamanho dos campos em BYTES UTF-8, não em caracteres.
 function tlv(id,value){
  const str=String(value),len=byteLength(str);
  if(len>99)throw Error('Campo Pix muito longo');
  return id+String(len).padStart(2,'0')+str;
 }
 function pixDescription(g){
  const prefix=String(data.pixDescription||'Chá do Oli!').trim()+' - ';
  const label=String((g&&g.pixLabel)||g?.name||'Presente').trim();
  const header=tlv('00','BR.GOV.BCB.PIX')+tlv('01',data.pixKey);
  const maximum=Math.min(60,99-byteLength(header)-4);
  if(maximum<byteLength(prefix)+1)throw Error('Chave Pix excede o limite da descrição.');
  return fitUtf8(prefix+label,maximum);
 }
 function crc16(bytes){let crc=0xffff;for(const b of bytes){crc^=b<<8;for(let i=0;i<8;i++){crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}}return crc.toString(16).toUpperCase().padStart(4,'0');}
 // Mantém os dados fornecidos pelo Nubank e injeta 54 (valor) + recalcula 63 (CRC16-CCITT).
 function buildPix(amount){
  if(!data.pixKey)throw Error('Chave Pix não configurada');
  const description=pixDescription(gift),name=fitUtf8(data.pixName||'RECEBEDOR',25);
  const info=tlv('00','BR.GOV.BCB.PIX')+tlv('01',data.pixKey)+tlv('02',description);
  const content=[tlv('00','01'),tlv('26',info),tlv('52','0000'),tlv('53','986'),tlv('54',Number(amount).toFixed(2)),tlv('58','BR'),tlv('59',name),tlv('60',data.pixCity||'SAO PAULO'),tlv('62',tlv('05',data.pixTxid||'***'))].join('')+'6304';
  return content+crc16(new TextEncoder().encode(content));
 }
 function drawQR(text){
  // A biblioteca recebe bytes como caracteres de 0 a 255; os acentos do Pix são codificados em UTF-8.
  const bytes=new TextEncoder().encode(text);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const qr=new window.OfflineQRCode(-1,0);qr.addData(binary);qr.make();
  const s=qr.getModuleCount(),n=s+8;let path='';
  for(let y=0;y<s;y++)for(let x=0;x<s;x++)if(qr.isDark(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;
  $('#qr-code').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" role="img" aria-label="QR Code do Pix de ${safe(money(pixAmount()))}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#ffffff"/><path fill="#14231d" d="${path}"/></svg>`;
 }
 function pixAmount(){return unlimitedGift(gift)?quantity*Number(gift.price):(mode==='full'?cents(gift.price):Math.min(quantity,giftQuotas(gift))*quotaCents(gift))/100;}
 function syncPay(){
  if(!gift)return;
  const free=unlimitedGift(gift),count=free?MAX_FREE_PER_REQUEST:giftQuotas(gift);
  quantity=Math.max(1,Math.min(count,Math.floor(Number(quantity)||1)));
  $('#quantity').value=String(quantity);$('#quantity').max=String(count);
  $('#minus-qty').disabled=quantity<=1;$('#plus-qty').disabled=quantity>=count;
  const canSplit=!free&&Number(gift.price)>=500&&count>1;
  mode=free?'quotas':(!canSplit?'full':mode);
  $('#gift-overlay .mode-switch').hidden=!canSplit;
  const isFull=!free&&mode==='full';
  $('#quantity-panel').hidden=isFull;
  $$('.mode-btn').forEach(b=>{const active=b.dataset.mode===(isFull?'full':'quotas');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('#detail-selection').textContent=free?`${quantity} ${quantity===1?'cota livre':'cotas livres'} de ${money(gift.price)}`:isFull?'Valor integral':`${quantity} ${quantity===1?'cota':'cotas'} de ${count}`;
  const amount=free?quantity*Number(gift.price):(isFull?cents(gift.price):quantity*quotaCents(gift))/100;
  $('#detail-price').textContent=money(amount);
  $('#detail-pix-description').textContent=pixDescription(gift);
  window.dispatchEvent(new CustomEvent('oli:selection-changed'));
  $('#copy-fallback').hidden=true;
  try{pixPayload=buildPix(amount);drawQR(pixPayload);$('#copy-brcode').disabled=false;$('#copy-status').textContent='';}
  catch(e){pixPayload='';$('#qr-code').textContent='Código indisponível.';$('#copy-brcode').disabled=true;$('#copy-status').textContent='Verifique os dados do Pix.';}
 }
 function openGift(id){
  gift=data.gifts.find(g=>Number(g.id)===Number(id));if(!gift)return;
  previousFocus=document.activeElement;quantity=1;mode=unlimitedGift(gift)?'quotas':'full';
  $('#detail-symbol').textContent=gift.emoji||'🎁';$('#dialog-title').textContent=gift.name;
  $('#detail-base').textContent=unlimitedGift(gift)?`Sua contribuição é livre: cada cota vale ${money(gift.price)}.`:`Valor total do presente: ${money(gift.price)}`;
  $('#quota-unit').textContent=unlimitedGift(gift)?`${money(gift.price)} por cota`:`${money(quotaCents(gift)/100)} cada · ${giftQuotas(gift)} no total`;
  $('#copy-fallback').hidden=true;
  $('#detail-pix').textContent=data.pixKey||'Não configurada';
  syncPay();setOverlay('gift-overlay',true);window.dispatchEvent(new CustomEvent('oli:gift-opened'));$('[data-close="gift"]').focus();
 }
 function selectionCopy(v){
  // O Safari do iPhone exige seleção visível e chamada síncrona durante o toque.
  const t=document.createElement('textarea');
  t.value=v;t.setAttribute('readonly','readonly');t.setAttribute('aria-hidden','true');
  t.style.cssText='position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.01;z-index:-1;font-size:16px;';
  document.body.appendChild(t);
  let success=false;
  try{
   t.focus();t.select();t.setSelectionRange(0,v.length);
   success=!!document.execCommand('copy');
  }catch(e){}
  t.remove();return success;
 }
 function successfulCopy(label){$('#copy-fallback').hidden=true;$('#copy-status').textContent=label+' copiado!';toast(label+' copiado!');}
 function showCopyFallback(v){
  const box=$('#copy-fallback'),input=$('#pix-fallback');
  input.value=v;box.hidden=false;
  input.focus();input.select();try{input.setSelectionRange(0,v.length);}catch(e){}
  $('#copy-status').textContent='Seu visualizador bloqueou a cópia automática. Toque e segure o código para copiar, ou abra o HTML no navegador.';
 }
 function copyText(v,label){
  if(selectionCopy(v)){successfulCopy(label);return;}
  // Não aguarda nada antes de solicitar a permissão; a chamada ainda faz parte do toque.
  if(navigator.clipboard && typeof navigator.clipboard.writeText==='function'){
   try{const operation=navigator.clipboard.writeText(v);
    Promise.resolve(operation).then(()=>successfulCopy(label)).catch(()=>showCopyFallback(v));return;
   }catch(e){}
  }
  showCopyFallback(v);
 }

 // Links Apple usam webcal:// para assinatura de calendário; sem Web Share API.
 const mapsLink=$('#maps-link'); if(mapsLink)mapsLink.addEventListener('click',()=>toast('Abrindo o Google Maps...'));
 $('#gift-grid').addEventListener('click',e=>{const btn=e.target.closest('[data-gift]');if(btn){e.preventDefault();if(btn.getAttribute('aria-disabled')==='true')return;openGift(btn.dataset.gift);}});

 $$('.mode-btn').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;syncPay();}));
 $('#plus-qty').addEventListener('click',()=>{quantity++;mode='quotas';syncPay();});
 $('#minus-qty').addEventListener('click',()=>{quantity--;mode='quotas';syncPay();});
 $('#quantity').addEventListener('input',e=>{quantity=Number(e.target.value)||1;mode='quotas';syncPay();});
 $('#quantity').addEventListener('change',e=>{quantity=Number(e.target.value)||1;syncPay();});
 $('[data-close="gift"]').addEventListener('click',()=>setOverlay('gift-overlay',false));
 $('#gift-overlay').addEventListener('click',e=>{if(e.target.id==='gift-overlay')setOverlay('gift-overlay',false)});
 $('#copy-brcode').addEventListener('click',()=>{if(pixPayload)copyText(pixPayload,'Pix com valor');});
 $('#copy-pix').addEventListener('click',()=>{if(data.pixKey)copyText(data.pixKey,'Chave Pix');});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('#gift-overlay').classList.contains('open'))setOverlay('gift-overlay',false);else if($('#editor-overlay').classList.contains('open'))setOverlay('editor-overlay',false);}});
 const form=$('#config-form');
 function editGiftList(){
  $('#edit-gift-list').innerHTML=data.gifts.map((g,i)=>`<div class="edit-gift" data-index="${i}"><div class="edit-gift-top"><strong>Presente ${i+1}</strong><button type="button" class="danger-btn" data-remove="${i}">Remover</button></div><div class="fields-2"><label class="field"><span>Emoji</span><input data-field="emoji" maxlength="8" value="${safe(g.emoji||'🎁')}"></label><label class="field"><span>Valor total (R$)</span><input data-field="price" type="number" min="1" max="99999" step="0.01" required value="${Number(g.price)||0}"></label></div><div class="fields-2"><label class="field"><span>Nome</span><input data-field="name" required maxlength="70" value="${safe(g.name)}"></label><label class="field"><span>Quantidade de cotas</span><input data-field="quotas" type="number" min="1" max="999" step="1" required value="${giftQuotas(g)}"></label></div><label class="field"><span>Descrição</span><input data-field="description" maxlength="120" value="${safe(g.description||'')}"></label></div>`).join('');
 }
 function hydrate(){for(const key of ['title','subtitle','date','time','place','note','pixKey','pixName','pixDescription'])form.elements.namedItem(key).value=data[key]||'';editGiftList();}
 function collect(){
  const next={...data};for(const key of ['title','subtitle','date','time','place','note','pixKey','pixName','pixDescription'])next[key]=form.elements.namedItem(key).value.trim();
  const gifts=$$('.edit-gift').map((row,i)=>{
   const val=Number($('[data-field="price"]',row).value),count=Number($('[data-field="quotas"]',row).value);
   return {id:i+1,emoji:$('[data-field="emoji"]',row).value.trim()||'🎁',name:$('[data-field="name"]',row).value.trim(),description:$('[data-field="description"]',row).value.trim(),price:val,quotas:count};
  });
  for(const g of gifts){if(!(g.price>0&&g.quotas>0&&Number.isInteger(g.quotas)&&cents(g.price)%g.quotas===0)){alert(`Confira as cotas de “${g.name}”: o valor total precisa ser dividido exatamente em centavos pelo número de cotas.`);return false;}}
  next.gifts=gifts;data=next;
  if(!data.guestMode){try{localStorage.setItem(storageKey,JSON.stringify(data));}catch(e){}}
  render();return true;
 }
 if($('#edit-trigger'))$('#edit-trigger').addEventListener('click',()=>{previousFocus=document.activeElement;hydrate();setOverlay('editor-overlay',true);$('#close-editor').focus();});
 $('#close-editor').addEventListener('click',()=>setOverlay('editor-overlay',false));
 $('#editor-overlay').addEventListener('click',e=>{if(e.target.id==='editor-overlay')setOverlay('editor-overlay',false);});
 $('#edit-gift-list').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;if(!collect())return;data.gifts.splice(Number(b.dataset.remove),1);editGiftList();});
 $('#add-gift').addEventListener('click',()=>{if(!collect())return;data.gifts.push({id:Date.now(),emoji:'🎁',name:'Novo presente',description:'',price:100,quotas:4});editGiftList();$$('.edit-gift').at(-1)?.scrollIntoView({behavior:'smooth',block:'center'});});
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity()||!collect())return;toast('Alterações salvas neste aparelho. Exporte para compartilhar.');setOverlay('editor-overlay',false);});
 $('#export-btn').addEventListener('click',()=>{
  if(!form.reportValidity()||!collect())return;
  if(!data.pixKey||!data.pixName){alert('Preencha a chave Pix e o titular antes de enviar.');return;}
  const clone=document.documentElement.cloneNode(true);
  clone.querySelector('#app-data').textContent=JSON.stringify({...data,guestMode:true}).replace(/</g,'\\u003c');
  clone.querySelector('#gift-overlay').classList.remove('open');clone.querySelector('#editor-overlay').classList.remove('open');
  clone.querySelector('#gift-overlay').setAttribute('aria-hidden','true');clone.querySelector('#editor-overlay').setAttribute('aria-hidden','true');
  clone.querySelector('body').classList.remove('no-scroll');
  const blob=new Blob(['<!DOCTYPE html>\n'+clone.outerHTML],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='cha-do-oli-convite.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Arquivo dos convidados gerado! Confira e envie como documento.');
 });
 window.OliInvite={
  getSelection:()=>gift ? {giftId:Number(gift.id),giftName:gift.name,units:unlimitedGift(gift)?quantity:(mode==='full'||Number(gift.price)<500?giftQuotas(gift):quantity),amountCents:Math.round(pixAmount()*100)} : null,
  setPixLabels:rows=>{
    for(const g of data.gifts){
      const row=(rows||[]).find(x=>Number(x.gift_id)===Number(g.id));
      if(row)g.pixLabel=row.pix_label||null;
    }
    if(gift)syncPay();
  }
 };
 render();
})();