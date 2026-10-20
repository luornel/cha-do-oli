/* Chá do Oli — Web Push real (Supabase + service worker), inclusive com o PWA fechado.
   O usuário precisa autorizar as notificações uma vez neste aparelho. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const backend=window.OliBackend;
  const install=$('pwa-install'),notify=$('pwa-notify'),test=$('pwa-notification-test');
  const installHelp=$('pwa-install-help'),status=$('pwa-notification-status');
  if(!install||!notify||!test||!status||!backend)return;

  const cfg=window.OLI_SUPABASE_CONFIG||{};
  const FUNCTION_URL=cfg.url+'/functions/v1/oli-web-push';
  let installPrompt=null,loggedIn=false,busy=false,registrationPromise=null;
  let enabled=false;
  try{enabled=localStorage.getItem('oli-admin-webpush')==='enabled'}catch(_){enabled=false;}
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const permission=()=>('Notification' in window?Notification.permission:'unsupported');
  const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&permission()!=='unsupported';
  function say(text){status.textContent=text;}
  function updateUI(){
    install.hidden=standalone()||!installPrompt;
    installHelp.textContent=standalone()?'Aplicativo instalado neste aparelho.':'No Chrome do Android, use ⋮ → Instalar aplicativo ou Adicionar à tela inicial.';
    const p=permission();
    notify.disabled=busy||!loggedIn||!supported()||p==='denied';
    notify.textContent=busy?'Aguarde…':enabled?'Desativar Web Push':'Ativar Web Push';
    test.hidden=!loggedIn||!enabled||p!=='granted'||!supported();
    test.disabled=busy;
    if(p==='denied')say('Notificações bloqueadas. Permita-as nas configurações do Android ou do Chrome.');
    else if(!supported())say('Este navegador não suporta notificações Web Push. Use o Chrome atualizado no Android.');
    else if(!loggedIn) say('Entre com sua conta administrativa para configurar os alertas.');
    else if(!busy) say(enabled?'Alertas em segundo plano ativados neste aparelho.':'Ative para receber solicitações mesmo com o aplicativo fechado.');
  }
  function setEnabled(v){enabled=v;try{if(v)localStorage.setItem('oli-admin-webpush','enabled');else localStorage.removeItem('oli-admin-webpush');}catch(_){}updateUI();}
  if('serviceWorker' in navigator){
    registrationPromise=navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready);
    registrationPromise.catch(()=>say('Erro ao registrar o serviço de notificações. Atualize o aplicativo.'));
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;updateUI();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;updateUI();});
  install.addEventListener('click',async()=>{
    if(!installPrompt)return;
    const e=installPrompt;installPrompt=null;updateUI();
    try{await e.prompt();await e.userChoice;}catch(_){}
  });

  async function request(action,extras={}){
    const {data:{session},error}=await backend.getClient().auth.getSession();
    if(error||!session?.access_token)throw Error('Sua sessão expirou. Entre novamente para configurar notificações.');
    const res=await fetch(FUNCTION_URL,{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':cfg.publishableKey},
      body:JSON.stringify({action,...extras})
    });
    const payload=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(payload.error||'Erro no serviço de notificações.');
    return payload;
  }
  async function publicKey(){
    const res=await fetch(FUNCTION_URL+'?action=key',{cache:'no-store'});
    const body=await res.json().catch(()=>({}));
    if(!res.ok||!body.publicKey)throw Error('Não foi possível consultar a chave de notificações.');
    return body.publicKey;
  }
  function vapidBytes(key){
    const padded=key.replace(/-/g,'+').replace(/_/g,'/');
    const str=atob(padded+'='.repeat((4-padded.length%4)%4));
    return Uint8Array.from(str,x=>x.charCodeAt(0));
  }
  async function subscribe(repair=false){
    const sw=await registrationPromise;
    if(!sw)throw Error('Service worker indisponível.');
    let sub=await sw.pushManager.getSubscription();
    if(!sub){const key=await publicKey();sub=await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidBytes(key)});}
    await request('subscribe',{subscription:sub.toJSON()});
    setEnabled(true);
    if(!repair)say('Web Push ativado! O Supabase poderá avisar mesmo com o app fechado.');
  }
  async function unsubscribe(){
    const sw=await registrationPromise;
    const sub=await sw?.pushManager.getSubscription();
    if(sub){await request('unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}
    setEnabled(false);say('Web Push desativado neste aparelho.');
  }
  notify.addEventListener('click',async()=>{
    if(busy||!loggedIn)return;
    // Solicitar permissão no clique do usuário, antes de qualquer consulta de rede.
    if(!enabled&&permission()!=='granted'){
      try{const p=await Notification.requestPermission();if(p!=='granted'){updateUI();return;}}catch(e){say('Não foi possível pedir autorização ao Android.');return;}
    }
    busy=true;updateUI();say('Configurando as notificações…');
    try{if(enabled)await unsubscribe();else await subscribe();}
    catch(e){say(e.message||'Falha ao configurar Web Push.');}
    finally{busy=false;updateUI();}
  });
  test.addEventListener('click',async()=>{
    if(busy||!loggedIn)return;
    busy=true;updateUI();say('Enviando teste pelo Supabase…');
    try{
      const r=await request('test');
      say(r.sent>0?'Teste enviado ao serviço de notificações. Confira o Android.':'Nenhum dispositivo recebeu o teste. Desative e ative o Web Push novamente.');
    }catch(e){say(e.message||'Falha ao enviar o teste.');}
    finally{busy=false;updateUI();}
  });
  window.addEventListener('oli:admin-ready',()=>{
    loggedIn=true;updateUI();
    // Restaura a assinatura no Supabase quando a pessoa abre o aplicativo novamente.
    if(enabled&&permission()==='granted'&&supported()){
      subscribe(true).catch(e=>say('Não foi possível reconectar o Web Push: '+e.message));
    }
  });
  window.addEventListener('oli:admin-logout',()=>{loggedIn=false;updateUI();});
  updateUI();
})();