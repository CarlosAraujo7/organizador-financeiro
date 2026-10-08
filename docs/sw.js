/* Service worker: deixa o app abrir sem internet e instalar na tela inicial.
 * Estratégia "rede primeiro": quando há internet, sempre busca a versão mais nova (revalidando
 * o cache do navegador); só usa a cópia guardada quando está offline. Assim, publicar uma
 * atualização no GitHub Pages aparece na hora, sem ficar preso numa versão velha.
 * Chamadas à API do Gemini são de outra origem e nunca passam por aqui. */
const CACHE = 'livro-caixa-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/app.js', 'js/assistant.js', 'js/charts.js', 'js/defs.js', 'js/gemini.js', 'js/icons.js',
  'js/modal.js', 'js/store.js', 'js/ui.js', 'js/util.js', 'js/views.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
