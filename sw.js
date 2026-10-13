// Network-first con respaldo en caché: siempre trae la versión nueva si hay red
// y sigue funcionando sin conexión. No hace falta versionar la caché a mano.
const CACHE = 'tracker-v13';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/util.js',
  'js/icons.js',
  'js/state.js',
  'js/ui.js',
  'js/money.js',
  'js/plan.js',
  'js/bills.js',
  'js/reports.js',
  'js/purchases.js',
  'js/habits.js',
  'js/lists.js',
  'js/home.js',
  'js/aviso.js',
  'js/pomodoro.js',
  'js/gym.js',
  'js/catalogo.js',
  'js/notes.js',
  'js/inbox.js',
  'js/data.js',
  'js/sync.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (siempre la versión nueva), con copia guardada de respaldo. Si la apertura tarda más de 3 s y hay copia, la app abre con
// ella y, mientras la red siga lenta (30 s), todo lo demás sale también de la copia para no mezclar versiones; en segundo plano se
// vuelve a descargar para dejar lista la versión nueva.
const SLOW_MS = 3000;
let slowUntil = 0;

async function fromNet(req) {
  // «no-cache» revalida con el servidor: sin esto, la caché HTTP de GitHub Pages (10 min) puede mezclar módulos viejos y nuevos tras publicar.
  const res = await fetch(req, { cache: 'no-cache' });
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
  return res;
}
const fromCache = async req => (await caches.match(req)) ?? (req.mode === 'navigate' ? caches.match('index.html') : undefined);

async function respond(req) {
  if (Date.now() < slowUntil) {
    const cached = await caches.match(req);
    if (cached) { fromNet(req).catch(() => {}); return cached; }
  }
  const net = fromNet(req);
  if (req.mode !== 'navigate') return net.catch(async () => (await fromCache(req)) ?? Response.error());
  net.catch(() => {}); // si la copia ya respondió, un fallo posterior de la red no debe quedar sin capturar
  const slow = new Promise(resolve => setTimeout(async () => {
    const c = await fromCache(req);
    if (c) { slowUntil = Date.now() + 30000; resolve(c); }
  }, SLOW_MS));
  try { return await Promise.race([net, slow]); } catch { return (await fromCache(req)) ?? Response.error(); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(respond(req));
});
