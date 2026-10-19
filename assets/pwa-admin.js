/* Instalação PWA e alertas de novas solicitações enquanto o painel está em execução.
   Push com o app completamente fechado requer backend de Web Push/FCM (não incluído aqui). */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const backend=window.OliBackend;
  const install=$('pwa-install'),notify=$('pwa-notify'),test=$('pwa-notification-test');
  const installHelp=$('pwa-install-help'),status=$('pwa-notification-status');
  if(!install||!notify||!status||!backend)return;
  const APP_URL = new URL('./admin.html',location.href).href;
  const MONEY = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  let installPrompt=null, loggedIn=false, initialized=false, knownIds=new Set(), checking=false;
  let wantNotices=false, registrationPromise=null;
  try{wantNotices=localStorage.getItem('oli-admin-notifications')==='enabled'}catch(_){wantNotices=false}

  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  const permission=()=>('Notification' in window ? Notification.permission : 'unsupported');
  const readyToNotify=()=>loggedIn&&wantNotices&&permission()==='granted';
  function updateUI(){
    install.hidden=standalone()||!installPrompt;
    installHelp.textContent=standalone()
      ?'Instalado no seu aparelho.'
      :'No Chrome do Android, abra o menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.';
    const p=permission();
    notify.disabled=p==='unsupported'||p==='denied';
    notify.textContent=p==='unsupported'?'Notificações indisponíveis':p==='denied'?'Notificações bloqueadas':readyToNotify()?'Desativar notificações':'Ativar notificações';
    status.textContent=p==='denied'
      ?'Permita notificações nas configurações do Chrome ou do Android.'
      :p==='unsupported'?'Este navegador não oferece notificações do sistema.'
      :readyToNotify()?'Alertas ativados enquanto o painel estiver em execução.':
       'Receba avisos enquanto o painel estiver aberto. Alertas com o app fechado exigem push em segundo plano.';
    test.hidden=!readyToNotify();
  }

  if('serviceWorker' in navigator){
    registrationPromise=navigator.serviceWorker.register('./sw.js',{scope:'./'})
      .then(()=>navigator.serviceWorker.ready)
      .catch(()=>null);
  }
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();installPrompt=e;updateUI();
  });
  window.addEventListener('appinstalled',()=>{installPrompt=null;updateUI();});
  install.addEventListener('click',async()=>{
    if(!installPrompt)return;
    const e=installPrompt;installPrompt=null;updateUI();
    try{await e.prompt();await e.userChoice}catch(_){/* Browser may decline installation. */}
  });

  async function showNotification(title,body,tag){
    if(!readyToNotify())return;
    const options={body,tag,icon:'./icons/oli-192.png',badge:'./icons/oli-badge-96.png',data:{url:APP_URL}};
    try{
      const sw=registrationPromise&&await registrationPromise;
      if(sw&&typeof sw.showNotification==='function'){
        await sw.showNotification(title,options);return;
      }
      if('Notification' in window)new Notification(title,options);
    }catch(e){status.textContent='Não foi possível mostrar a notificação. Confira as permissões do Android.';}
  }
  notify.addEventListener('click',async()=>{
    if(readyToNotify()){
      wantNotices=false;
      try{localStorage.removeItem('oli-admin-notifications')}catch(_){}
      updateUI();return;
    }
    if(!('Notification' in window))return;
    try{
      if(Notification.permission!=='granted'){
        const p=await Notification.requestPermission();
        if(p!=='granted'){updateUI();return}
      }
      wantNotices=true;
      try{localStorage.setItem('oli-admin-notifications','enabled')}catch(_){}
      updateUI();
    }catch(_){status.textContent='Não foi possível solicitar permissão para notificações.';}
  });
  test.addEventListener('click',()=>showNotification('Chá do Oli 🧸','Notificações funcionando neste aparelho.','oli-pwa-test'));

  function absorb(rows,emit){
    const pending=(rows||[]).filter(x=>x&&x.status==='pending'&&x.id);
    if(!initialized){knownIds=new Set(pending.map(x=>x.id));initialized=true;return}
    const newEntries=pending.filter(x=>!knownIds.has(x.id));
    pending.forEach(x=>knownIds.add(x.id));
    if(emit&&readyToNotify()){
      for(const item of newEntries.slice(0,4)){
        // Não mostramos nome nem contato do pagador na tela bloqueada.
        const details=`${item.gift_name||'Novo presente'} · ${MONEY.format((Number(item.amount_cents)||0)/100)}`;
        showNotification('Nova contribuição — Chá do Oli',details,`oli-${item.id}`);
      }
    }
  }
  window.addEventListener('oli:admin-loaded',e=>{
    if(loggedIn)absorb(e.detail?.entries,false);
    else absorb(e.detail?.entries,false); // Sem alertar sobre pedidos antigos ao entrar.
  });
  window.addEventListener('oli:admin-ready',()=>{loggedIn=true;updateUI();});
  window.addEventListener('oli:admin-logout',()=>{loggedIn=false;initialized=false;knownIds.clear();updateUI();});
  async function poll(){
    if(checking||!loggedIn||!readyToNotify()||!navigator.onLine)return;
    checking=true;
    try{const rows=await backend.rpc('oli_admin_list');absorb(rows,true)}catch(_){/* Sessão expirada ou rede instável. */}
    finally{checking=false}
  }
  setInterval(poll,20000);
  window.addEventListener('focus',poll);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
  updateUI();
})();