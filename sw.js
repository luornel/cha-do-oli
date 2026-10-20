/* Chá do Oli PWA — cache exclusivo de ícones públicos; sem credenciais, tokens ou dados pessoais. */
const CACHE='oli-pwa-icons-v5-urso-hq-20261020';
const ICONS=['./icons/oli-48.png','./icons/oli-192.png','./icons/oli-512.png','./icons/oli-maskable-512.png','./icons/oli-badge-96.png'];
const URLS=ICONS.map(path=>new URL(path,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>Promise.all(URLS.map(async url=>{
    const response=await fetch(url,{cache:'reload'});
    if(!response.ok)throw new Error('Ícone indisponível: '+url);
    await cache.put(url,response);
  }))).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('oli-pwa-')&&key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!URLS.includes(event.request.url))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
self.addEventListener('push',event=>{
  let data={title:'Nova contribuição — Chá do Oli',body:'Uma nova contribuição foi registrada.',tag:'oli-new-contribution'};
  try{if(event.data){const incoming=event.data.json();if(incoming&&typeof incoming==='object')data={...data,...incoming};}}catch(_){}
  const safeBody=String(data.body||'Nova contribuição registrada.').slice(0,180);
  const title=String(data.title||'Chá do Oli').slice(0,80);
  const url=new URL('./admin.html#contribuicoes',self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title,{
    body:safeBody,tag:String(data.tag||'oli-contribution'),
    icon:'./icons/oli-192.png',badge:'./icons/oli-badge-96.png',
    data:{url},requireInteraction:false
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL('./admin.html#contribuicoes',self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const existing=clients.find(c=>c.url.startsWith(new URL('./admin.html',self.registration.scope).href));
    if(existing){await existing.navigate(target);return existing.focus();}
    return self.clients.openWindow(target);
  }));
});