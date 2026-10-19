/* Chá do Oli PWA (admin) — somente recursos públicos estáticos são armazenados.
   HTML, tokens de login, solicitações e dados do Supabase nunca são armazenados aqui. */
const CACHE = 'oli-pwa-icons-v1';
const ICONS = ['./icons/oli-48.png','./icons/oli-192.png','./icons/oli-512.png','./icons/oli-maskable-512.png'];
const ICON_URLS = ICONS.map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ICON_URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('oli-pwa-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !ICON_URLS.includes(event.request.url)) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./admin.html#contribuicoes', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients => {
    const existing=clients.find(c => c.url.startsWith(new URL('./admin.html',self.registration.scope).href));
    if(existing){await existing.focus();return existing.navigate(target)}
    return self.clients.openWindow(target);
  }));
});