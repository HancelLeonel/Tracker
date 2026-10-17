// Abre al instante con la copia guardada y busca la versión nueva en segundo plano (si la hay, la app ofrece «Actualizar»).
// Cada versión completa de la app vive en su propia caché (`tracker-<huella>`, la huella sale del contenido de los archivos), así que
// nunca se mezclan módulos de versiones distintas ni hace falta versionar nada a mano. En META se guarda cuál es la vigente.
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

const PREFIX = 'tracker-';
const META = PREFIX + 'meta';
const PTR = 'vigente';

// Descarga todos los archivos revalidando con el servidor (sin esto la caché HTTP de GitHub Pages, 10 min, puede traer archivos viejos).
// Devuelve null si algo falla (sin red, archivo que no existe): no se cambia nada.
async function fetchShell() {
  try {
    return await Promise.all(SHELL.map(async url => {
      const res = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(20000) }); // sin tope, una red colgada bloquearía las comprobaciones siguientes
      if (!res.ok) throw new Error(url);
      return [url, res];
    }));
  } catch { return null; }
}

async function digest(entries) {
  const bufs = await Promise.all(entries.map(([, res]) => res.clone().arrayBuffer()));
  const all = new Uint8Array(bufs.reduce((n, b) => n + b.byteLength, 0));
  let at = 0;
  for (const b of bufs) { all.set(new Uint8Array(b), at); at += b.byteLength; }
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function readPtr() {
  const r = await (await caches.open(META)).match(PTR);
  return r ? r.json() : null;
}
let ptr; // promesa de la versión vigente { name, hash }
const current = () => (ptr ??= readPtr());

// Guarda una versión completa en su caché y la deja como vigente (un solo cambio, así nunca queda a medias).
async function store(entries, hash) {
  const name = PREFIX + hash.slice(0, 12);
  const old = await current();
  const c = await caches.open(name);
  await Promise.all(entries.map(([url, res]) => c.put(url, res)));
  if (old && old.name !== name) { // lo que se guardó al usarlo (tipografías) pasa a la versión nueva
    const oc = await caches.open(old.name);
    for (const req of await oc.keys()) if (!(await c.match(req))) await c.put(req, await oc.match(req));
  }
  const vigente = { name, hash };
  await (await caches.open(META)).put(PTR, new Response(JSON.stringify(vigente)));
  ptr = Promise.resolve(vigente);
}

// Qué versión sirvió cada pestaña al abrirse (por id de cliente). Sirve para dos cosas: que una pestaña siga recibiendo TODOS sus archivos de
// la versión con la que abrió aunque la nueva termine de bajar a mitad de carga (nunca se mezclan), y avisar solo a las que quedaron viejas
// (la pestaña también pregunta al cargar, por si la versión nueva estuvo lista antes de que ella existiera para recibir el mensaje).
const served = new Map(); // id -> { name, t }
const gen = (id, fallback) => (id && served.get(id)?.name) || fallback;
const stale = (id, name) => served.has(id) && served.get(id).name !== name;

async function prune() {
  const live = new Set((await self.clients.matchAll({ type: 'window' })).map(w => w.id));
  for (const [id, v] of served) if (!live.has(id) && Date.now() - v.t > 60000) served.delete(id);
  const keep = new Set([META, (await current())?.name, ...[...served.values()].map(v => v.name)]);
  for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
}

let checking;
function checkUpdate() {
  checking ??= (async () => {
    const entries = await fetchShell();
    if (!entries) return;
    const hash = await digest(entries);
    if ((await current())?.hash !== hash) {
      await store(entries, hash);
      const { name } = await current();
      for (const w of await self.clients.matchAll({ type: 'window' })) if (served.get(w.id)?.name !== name) w.postMessage({ type: 'update-ready' });
    }
    await prune(); // borra las versiones que ya nadie usa
  })().catch(() => {}).finally(() => { checking = null; });
  return checking;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const entries = await fetchShell();
    if (!entries) throw new Error('sin red'); // no se instala a medias: sigue la versión anterior
    await store(entries, await digest(entries));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(prune().then(() => self.clients.claim()));
});

// Lo que sale de la copia se entrega con «no-cache»: así Chrome no reutiliza de su memoria interna (por las cabeceras de GitHub Pages,
// «fresco 10 min») una hoja de estilos o imagen de la versión anterior tras actualizar; siempre pregunta aquí, que responde al instante.
const fresh = res => {
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

async function respond(req, e) {
  const p = await current();
  const nav = req.mode === 'navigate';
  if (nav) { // al abrir la app: busca la versión nueva sin hacer esperar a nadie
    served.set(e.resultingClientId || e.clientId, { name: p?.name, t: Date.now() });
    e.waitUntil(checkUpdate());
  }
  // Una pestaña ya abierta sigue con la versión que cargó; una navegación nueva usa la vigente.
  const cacheName = nav ? p?.name : gen(e.clientId || e.resultingClientId, p?.name);
  if (cacheName) {
    const hit = (await caches.match(req, { cacheName, ignoreSearch: nav })) ?? (nav ? await caches.match('index.html', { cacheName }) : undefined);
    if (hit) return fresh(hit);
  }
  try { // lo que no está en la copia (tipografías, primera visita) sale de la red y se guarda
    const res = await fetch(req);
    if (res.ok && p) caches.open(p.name).then(c => c.put(req, res.clone())).catch(() => {});
    return res;
  } catch { return Response.error(); }
}

// La página pregunta al terminar de cargar si lo que muestra ya quedó viejo.
self.addEventListener('message', e => {
  if (e.data?.type !== 'ver') return;
  e.waitUntil((async () => {
    await checking;
    if (stale(e.source.id, (await current())?.name)) e.source.postMessage({ type: 'update-ready' });
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(respond(req, e));
});
