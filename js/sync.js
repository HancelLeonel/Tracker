// Sincronización con Google Drive: un solo archivo (`tracker-sync.json`) en la carpeta privada de la app (appDataFolder).
// No se fusiona nada: «Enviar» sube una copia completa y «Traer» reemplaza todo lo local (igual que importar un respaldo).
// Para no pisar cambios por descuido se comparan dos huellas guardadas en este dispositivo (localStorage, no viajan con los datos):
//   · md5 de la nube en la última sincronización  -> si cambió, la nube tiene cambios que este dispositivo no ha traído
//   · huella de los datos locales en la última sincronización -> si cambió, hay cambios locales sin enviar
import { S } from './state.js';
import { buildExport, validateImport, restore, download } from './data.js';
import { esc, toast, uid, today, $ } from './util.js';
import { icon } from './icons.js';
import { modal } from './ui.js';

// ID de cliente OAuth de Google (público, no es un secreto). Si queda vacío se pide en Configuración y se guarda en este dispositivo.
const CLIENT_ID = '854142650562-f9h34j8tsmmr6bvs0df0tun3kh08qif9.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'tracker-sync.json';
const KEY = 'tracker-sync';
// Ajustes propios de cada dispositivo: no viajan ni cuentan como «cambios» (tema, fuente, estado del Pomodoro y del descanso, etc.).
const DEVICE_KEYS = ['font', 'theme', 'includeFiles', 'lastExport', 'pomo', 'gym', 'collapsed'];

// ---------- estado local de la sincronización ----------
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = patch => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch })); } catch { /* sin almacenamiento: se pedirá de nuevo */ } };
const clientId = () => CLIENT_ID || load().clientId || '';
const when = iso => new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

// ---------- huella de los datos ----------
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v) ?? 'null';

async function digest(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function snapshot(withFiles) {
  const data = await buildExport(withFiles);
  data.settings = Object.fromEntries(Object.entries(data.settings).filter(([k]) => !DEVICE_KEYS.includes(k)));
  return data;
}

const hashOf = ({ exportedAt, includesFiles, files, ...rest }) => digest(stable(rest));
async function localHash() { return hashOf(await snapshot(false)); }

// 'never' (nunca sincronizado), 'clean' (igual que la última vez) o 'dirty' (hay cambios sin enviar)
async function localState() {
  const st = load();
  if (!st.hash) return 'never';
  return (await localHash()) === st.hash ? 'clean' : 'dirty';
}

// ---------- Google: sesión y Drive ----------
let token = null; // { value, exp }

function loadGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.'));
    document.head.append(s);
  });
}

async function accessToken() {
  if (token && token.exp > Date.now() + 60000) return token.value;
  const id = clientId();
  if (!id) throw new Error('Falta el ID de cliente de Google. Configúralo en Sincronización.');
  await loadGsi();
  return new Promise((resolve, reject) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: id, scope: SCOPE,
      callback: r => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        token = { value: r.access_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 };
        resolve(token.value);
      },
      error_callback: e => reject(new Error(e?.type === 'popup_closed' ? 'Se cerró la ventana de Google sin autorizar.' : e?.message || e?.type || 'No se pudo iniciar sesión con Google.')),
    }).requestAccessToken();
  });
}

async function drive(path, { upload = false, ...opts } = {}) {
  const base = upload ? 'https://www.googleapis.com/upload/drive/v3/' : 'https://www.googleapis.com/drive/v3/';
  const res = await fetch(base + path, { ...opts, headers: { Authorization: `Bearer ${await accessToken()}`, ...opts.headers } });
  if (res.status === 401) { token = null; throw new Error('La sesión de Google expiró. Inténtalo de nuevo.'); }
  if (!res.ok) throw new Error(`Google Drive respondió con el error ${res.status}.`);
  return res;
}

const INFO = 'id,md5Checksum,modifiedTime';

async function remoteInfo() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${FILE_NAME}'`, orderBy: 'modifiedTime desc', fields: `files(${INFO})` });
  return (await (await drive(`files?${q}`)).json()).files?.[0] ?? null;
}

const remoteText = async id => (await drive(`files/${id}?alt=media`)).text();

async function upload(id, json) {
  const b = 'trk' + uid().replaceAll('-', '');
  const meta = id ? {} : { name: FILE_NAME, parents: ['appDataFolder'] };
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
  const res = await drive(`files${id ? '/' + id : ''}?uploadType=multipart&fields=${INFO}`, {
    upload: true, method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body,
  });
  return res.json();
}

// ---------- acciones ----------
let busy = false;

const guarded = fn => async () => {
  if (busy) return toast('Ya hay una sincronización en curso');
  busy = true;
  try { await fn(); } catch (err) { alert(err.message || String(err)); } finally { busy = false; }
};

// Descarga una copia de seguridad antes de reemplazar algo, para que nada se pierda por una decisión equivocada.
const keepCopy = (text, label) => download(new File([text], `tracker-${label}-${today()}.json`, { type: 'application/json' }));

async function push() {
  await accessToken(); // primero: abrir la ventana de Google mientras sigue vigente el toque
  toast('Revisando la nube…');
  const st = load();
  const info = await remoteInfo();
  const dirty = (await localState()) !== 'clean';
  if (info && info.md5Checksum === st.md5 && !dirty) return toast('Todo está sincronizado: no hay nada que enviar');
  if (info && info.md5Checksum !== st.md5) {
    const msg = st.md5
      ? `La nube tiene cambios (${when(info.modifiedTime)}) que este dispositivo no ha traído.`
      : `La nube ya tiene datos (${when(info.modifiedTime)}) y este dispositivo no se ha sincronizado antes.`;
    if (!confirm(`${msg}\n\nSi continúas, se reemplazan por los datos de este dispositivo. Antes se descargará una copia de lo que hay en la nube.\n\n¿Reemplazar la nube?`)) return;
    keepCopy(await remoteText(info.id), 'nube-antes-de-enviar');
  }
  toast('Enviando…');
  const data = await snapshot(S.settings.includeFiles);
  const hash = await hashOf(data);
  const done = await upload(info?.id, JSON.stringify(data));
  save({ md5: done.md5Checksum, hash, at: new Date().toISOString() });
  toast('Enviado a Google Drive');
}

async function pull() {
  await accessToken();
  toast('Revisando la nube…');
  const st = load();
  const info = await remoteInfo();
  if (!info) return toast('Todavía no hay nada en la nube. Usa «Enviar a la nube» primero.');
  const state = await localState();
  if (info.md5Checksum === st.md5 && state === 'clean') return toast('Ya tienes lo último de la nube');
  const dirty = state !== 'clean';
  const warn = dirty
    ? (state === 'never' ? 'Este dispositivo no se ha sincronizado antes: sus datos actuales se reemplazarán.' : 'Hay cambios en este dispositivo que no se han enviado y se perderían.') + ' Antes se descargará una copia.'
    : '';
  if (!confirm(`Se reemplazarán TODOS los datos de este dispositivo por los de la nube (${when(info.modifiedTime)}). ${warn}\n\n¿Traer de la nube?`)) return;
  toast('Descargando…');
  const text = await remoteText(info.id);
  const data = validateImport(JSON.parse(text)); // si la nube trae algo dañado se detiene aquí, sin tocar nada
  if (dirty) keepCopy(JSON.stringify(await buildExport(false)), 'local-antes-de-traer');
  await restore(data);
  save({ md5: info.md5Checksum, hash: await localHash(), at: new Date().toISOString() });
  toast('Datos traídos de Google Drive');
}

function setupForm() {
  const st = load();
  const fixed = !!CLIENT_ID;
  modal('Google Drive', `
    ${fixed ? '<p class="muted">El ID de cliente viene incluido en la app.</p>' : `
    <label>ID de cliente de Google <input name="clientId" required value="${esc(st.clientId ?? '')}" placeholder="123456-abc.apps.googleusercontent.com" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
    <small class="muted">Se crea una vez en Google Cloud (ver «Sincronización» en la documentación) y se escribe en cada dispositivo.</small>`}
    <small class="muted">La app solo ve su propia carpeta privada de Drive: no puede leer tus demás archivos.</small>`, {
    submit: 'Guardar',
    onSubmit: fd => { if (!fixed) save({ clientId: fd.get('clientId').trim() }); token = null; },
    onDelete: st.hash || st.clientId ? () => { try { localStorage.removeItem(KEY); } catch { /* nada */ } token = null; } : undefined,
    deleteLabel: 'Desconectar',
    confirmText: 'Se olvida la conexión de este dispositivo (los datos y la nube no cambian). ¿Desconectar?',
  });
}

// ---------- vista ----------
async function refreshState() {
  const el = $('#sync-state');
  if (!el) return;
  const s = await localState();
  if (!$('#sync-state')) return;
  $('#sync-state').textContent = s === 'never' ? 'Sin sincronizar' : s === 'clean' ? 'Sin cambios pendientes' : 'Cambios sin enviar';
  $('#sync-state').dataset.state = s;
}

export function syncView() {
  const st = load();
  const ready = !!clientId();
  setTimeout(() => { refreshState(); if (ready) loadGsi().catch(() => {}); }, 0);
  return `
    <section class="card stack" id="sync">
      <h3>Sincronización con Google Drive</h3>
      <p class="muted">Para pasar los datos entre el teléfono y la PC: «Enviar» sube todo a tu Drive y «Traer» reemplaza lo de este dispositivo por lo de la nube. Úsalo por turnos, no en los dos a la vez.</p>
      ${ready ? `
      <div class="kv"><span class="muted">Última sincronización</span><span>${st.at ? when(st.at) : 'nunca'}</span></div>
      <div class="kv"><span class="muted">Este dispositivo</span><span id="sync-state">…</span></div>
      <button class="btn primary block" data-act="sync-push">${icon('up')} Enviar a la nube</button>
      <button class="btn block" data-act="sync-pull">${icon('down')} Traer de la nube</button>
      <button class="btn ghost block" data-act="sync-setup">Cuenta de Google…</button>`
      : '<button class="btn primary block" data-act="sync-setup">Conectar con Google Drive</button>'}
    </section>`;
}

export const actions = {
  'sync-push': guarded(push),
  'sync-pull': guarded(pull),
  'sync-setup': setupForm,
};
