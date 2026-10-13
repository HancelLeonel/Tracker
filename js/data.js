import * as db from './db.js';
import { esc, uid, today, toast, $, pl } from './util.js';
import { S, loadState, saveSettings, gcFiles, sortedKinds } from './state.js';
import { modal, applyFont, applyTheme, THEMES } from './ui.js';
import { icon, HABIT_ICONS, NOTE_ICONS } from './icons.js';
import { COLORS, SLOT_KEYS } from './habits.js';
import { FREQS as TPL_FREQS } from './lists.js';
import { FIELD_TYPES } from './notes.js';
import { sanitizeRoutines, sanitizeWorkouts, sanitizeExercises } from './gym.js';
import { fileSize } from './ui.js';

const APP_ID = 'tracker';
const LEGACY_IDS = ['mi-quincena']; // nombre anterior de la app: sus respaldos se siguen aceptando
const VERSION = 3;
const FREQS = ['once', 'monthly', 'biweekly'];
const WHENS = ['both', 'q1', 'q2'];


// ---------- vista ----------
// `extra` es HTML ya armado (la tarjeta de Sincronización, de sync.js) que se muestra después del Respaldo.
export function dataView(extra = '') {
  const last = S.settings.lastExport ? new Date(S.settings.lastExport).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca';
  const bytes = [...S.files.values()].reduce((t, f) => t + (f.size ?? 0), 0);
  const filesInfo = S.files.size ? `${pl(S.files.size, 'archivo')} · ${fileSize(bytes)}` : 'ninguno';
  const font = S.settings.font === 'jetbrains' ? 'jetbrains' : 'system';
  const theme = THEMES.includes(S.settings.theme) ? S.settings.theme : 'dark';
  const themeOpt = (k, ic, name, hint) => `<label class="font-opt"><input type="radio" name="theme" value="${k}" data-change="theme" ${theme === k ? 'checked' : ''}>
          <span class="th-sample">${icon(ic)}</span><span class="fo-name">${name}<small>${hint}</small></span></label>`;
  return `
    <section class="card stack">
      <h3>Apariencia</h3>
      <small class="muted">Tema</small>
      <div class="font-opts" role="radiogroup" aria-label="Tema">
        ${themeOpt('dark', 'moon', 'Oscuro', 'Fondo casi negro (el de siempre)')}
        ${themeOpt('light', 'sun', 'Claro', 'Fondo blanco, para usar con mucha luz')}
        ${themeOpt('auto', 'half', 'Automático', 'Sigue el modo claro u oscuro del teléfono')}
      </div>
      <small class="muted">Fuente</small>
      <div class="font-opts" role="radiogroup" aria-label="Fuente">
        <label class="font-opt"><input type="radio" name="font" value="system" data-change="font" ${font === 'system' ? 'checked' : ''}>
          <span class="fo-sample" style="font-family:var(--font-system)">Aa 0123</span>
          <span class="fo-name">Predeterminada del sistema<small>La que trae tu teléfono (en Android normalmente Roboto)</small></span></label>
        <label class="font-opt"><input type="radio" name="font" value="jetbrains" data-change="font" ${font === 'jetbrains' ? 'checked' : ''}>
          <span class="fo-sample" style="font-family:var(--font-jb)">Aa 0123</span>
          <span class="fo-name">JetBrains Mono<small>Monoespaciada, pensada para leer código y números</small></span></label>
      </div>
    </section>
    <section class="card stack">
      <h3>Respaldo</h3>
      <p class="muted">Los datos viven en este dispositivo. Exporta un respaldo de vez en cuando; si borras los datos del navegador se pierden.</p>
      <div class="kv"><span class="muted">Último respaldo</span><span>${last}</span></div>
      <div class="kv"><span class="muted">Contenido</span><span>${pl(S.accounts.length, 'cuenta')} · ${pl(S.moves.length, 'movimiento')} · ${pl(S.habits.length, 'hábito')} · ${pl(S.lists.length, 'lista')} · ${pl(S.notes.length, 'nota')} · ${pl(S.workouts.filter(w => w.end).length, 'entrenamiento')}</span></div>
      <div class="kv"><span class="muted">Adjuntos</span><span>${filesInfo}</span></div>
      <label class="check"><input type="checkbox" data-change="include-files" ${S.settings.includeFiles ? 'checked' : ''}>
        <span>Incluir archivos adjuntos<small>Hace el respaldo más pesado. Sin esto solo se guardan los datos.</small></span></label>
      <button class="btn primary block" data-act="export">Exportar a archivo</button>
      ${navigator.canShare ? '<button class="btn block" data-act="share">Compartir respaldo…</button>' : ''}
      <button class="btn block" data-act="import">Importar desde archivo</button>
    </section>
    ${extra}
    <section class="card stack">
      <div class="card-h"><h3>Tipos de gasto</h3><button class="btn sm" data-act="new-kind">${icon('plus')} Nuevo</button></div>
      <div class="chips">${sortedKinds().map(t => `<button class="chip-tag" data-act="edit-kind" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>
    </section>
    <section class="card stack">
      <h3>Zona de peligro</h3>
      <button class="btn danger block" data-act="wipe">Borrar todos los datos</button>
    </section>`;
}

function kindForm(kind) {
  modal(kind ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto', `
    <label>Nombre <input name="name" required maxlength="30" value="${esc(kind?.name ?? '')}"></label>`, {
    async onSubmit(fd) {
      const name = fd.get('name').trim();
      if (kind) kind.name = name; else S.settings.types.push({ id: uid(), name });
      await saveSettings();
    },
    onDelete: kind && (async () => {
      S.settings.types = S.settings.types.filter(t => t.id !== kind.id);
      await saveSettings();
    }),
    confirmText: '¿Eliminar este tipo? Los gastos que lo usan quedarán como «Sin tipo».',
  });
}

// ---------- exportar ----------
const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function buildExport(withFiles = S.settings.includeFiles) {
  const data = {
    app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(), includesFiles: withFiles,
    settings: S.settings, habits: S.habits, accounts: S.accounts, moves: S.moves, plan: S.plan, bills: S.bills, purchases: S.purchases,
    templates: S.templates, lists: S.lists, noteGroups: S.noteGroups, notes: S.notes, inbox: S.inbox, routines: S.routines, workouts: S.workouts, exercises: S.exercises,
  };
  if (withFiles) {
    const recs = await db.getAll('files');
    data.files = await Promise.all(recs.map(async r => ({ id: r.id, mime: r.mime, name: r.name, data: await blobToDataUrl(r.blob) })));
  }
  return data;
}

async function fileForExport() {
  const suffix = S.settings.includeFiles ? '-con-archivos' : '';
  return new File([JSON.stringify(await buildExport(), null, 2)], `tracker-${today()}${suffix}.json`, { type: 'application/json' });
}

async function markExported() {
  S.settings.lastExport = new Date().toISOString();
  await saveSettings();
}

// Descarga el archivo en el teléfono (carpeta Descargas).
export function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function doExport() {
  toast('Preparando respaldo…');
  const file = await fileForExport();
  download(file);
  await markExported();
  toast(`Respaldo exportado (${fileSize(file.size)})`);
}

// Compartir: los navegadores móviles solo dejan compartir ciertos tipos de archivo (JSON suele no estar en la lista),
// así que se envía como texto plano (.json.txt, que la app también sabe importar). El permiso de compartir se gasta en
// el primer intento, por lo que no se reintenta: si algo falla, el respaldo se descarga para no perderlo.
async function doShare() {
  if (!navigator.share) return toast('Este navegador no puede compartir. Usa «Exportar a archivo».');
  toast('Preparando respaldo…');
  const json = await fileForExport();
  const txt = new File([json], json.name + '.txt', { type: 'text/plain' });
  const file = [txt, json].find(f => navigator.canShare?.({ files: [f] }));
  if (!file) {
    download(json);
    await markExported();
    return toast('Este navegador no permite compartir archivos: se descargó el respaldo.');
  }
  try {
    await navigator.share({ files: [file], title: 'Respaldo Tracker' });
    await markExported();
    toast('Respaldo compartido');
  } catch (err) {
    if (err.name === 'AbortError') return; // la persona cerró el menú de compartir
    download(json);
    await markExported();
    toast(`No se pudo compartir (${err.name}). Se descargó el respaldo.`);
  }
}

// ---------- importar ----------
export function validateImport(d) {
  const bad = msg => { throw new Error(msg); };
  if (!d || (d.app !== APP_ID && !LEGACY_IDS.includes(d.app))) bad('El archivo no es un respaldo de esta app.');
  if (d.version !== 2 && d.version !== VERSION) bad('Este respaldo es de una versión que ya no se puede importar.');
  const arr = (v, name) => (v === undefined ? [] : Array.isArray(v) ? v : bad(`El respaldo está dañado (${name}).`));
  const num = n => Number.isFinite(n) ? n : bad('Hay un monto inválido en el archivo.');
  const ids = v => (Array.isArray(v) ? v.map(String) : []);
  const ref = p => (p?.acc && p?.cat ? { acc: String(p.acc), cat: String(p.cat) } : bad('Hay un movimiento inválido en el archivo.'));

  const habits = arr(d.habits, 'hábitos').map(h => {
    if (!h?.id || typeof h.name !== 'string') bad('Hay un hábito inválido en el archivo.');
    return {
      id: String(h.id), name: h.name, color: COLORS.includes(h.color) ? h.color : 'mauve', dates: h.dates && typeof h.dates === 'object' ? h.dates : {},
      icon: HABIT_ICONS.includes(h.icon) ? h.icon : HABIT_ICONS[0], slot: SLOT_KEYS.includes(h.slot) ? h.slot : '',
      ...(Number.isFinite(h.order) ? { order: h.order } : {}), // sin `order` (respaldos viejos) se asigna al cargar
    };
  });
  const accounts = arr(d.accounts, 'cuentas').map(a => {
    if (!a?.id || typeof a.name !== 'string' || !Array.isArray(a.cats)) bad('Hay una cuenta inválida en el archivo.');
    return {
      id: String(a.id), name: a.name, order: Number(a.order) || 0, type: a.type === 'credit' ? 'credit' : 'normal', limit: Number(a.limit) || 0,
      cats: a.cats.map(c => {
        if (!c?.id || typeof c.name !== 'string') bad('Hay una categoría inválida en el archivo.');
        return { id: String(c.id), name: c.name, balance: num(c.balance) };
      }),
    };
  });
  const moves = arr(d.moves, 'movimientos').map(m => {
    if (!m?.id || !['expense', 'income', 'transfer'].includes(m.type) || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || !Array.isArray(m.parts) || !m.parts.length) bad('Hay un movimiento inválido en el archivo.');
    const out = {
      id: String(m.id), t: Number(m.t) || 0, type: m.type, date: m.date, note: String(m.note ?? ''), total: num(m.total),
      parts: m.parts.map(p => ({ ...ref(p), amount: num(p.amount), ...(p.line ? { line: String(p.line) } : {}) })),
      files: ids(m.files),
    };
    if (m.title) out.title = String(m.title);
    if (m.kind) out.kind = String(m.kind);
    if (m.plan) out.plan = true;
    if (m.bill) out.bill = String(m.bill);
    if (m.card) out.card = String(m.card);
    if (m.type === 'transfer') out.to = ref(m.to);
    return out;
  });
  const plan = arr(d.plan, 'plan').map(l => {
    if (!l?.id || typeof l.name !== 'string' || typeof l.key !== 'string') bad('Hay una línea del plan inválida en el archivo.');
    return { id: String(l.id), name: l.name, amount: num(l.amount), key: l.key, when: WHENS.includes(l.when) ? l.when : 'both' };
  });
  const bills = arr(d.bills, 'pagos').map(b => {
    if (!b?.id || typeof b.title !== 'string' || !FREQS.includes(b.freq)) bad('Hay un pago inválido en el archivo.');
    const paid = {};
    for (const [due, e] of Object.entries(b.paid ?? {})) paid[due] = { on: String(e.on ?? due), amount: Number(e.amount) || 0, moveId: e.moveId ?? null, skipped: !!e.skipped, files: ids(e.files) };
    return {
      id: String(b.id), title: b.title, amount: Number(b.amount) || 0, freq: b.freq, day: b.day ?? null, dueDate: b.dueDate ?? null,
      start: b.start ?? today(), card: b.card ?? null, active: b.active !== false, paid,
    };
  });
  const purchases = arr(d.purchases, 'compras').map(p => {
    if (!p?.id || typeof p.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) bad('Hay una compra inválida en el archivo.');
    return {
      id: String(p.id), name: p.name, date: p.date, price: Number(p.price) || 0, store: String(p.store ?? ''), tag: String(p.tag ?? ''),
      warrantyMonths: Number(p.warrantyMonths) || 0, notes: String(p.notes ?? ''), files: ids(p.files),
    };
  });
  const templates = arr(d.templates, 'plantillas').map(t => {
    if (!t?.id || typeof t.name !== 'string' || !Array.isArray(t.items)) bad('Hay una plantilla inválida en el archivo.');
    return {
      id: String(t.id), name: t.name, color: COLORS.includes(t.color) ? t.color : 'mauve', freq: TPL_FREQS.some(f => f[0] === t.freq) ? t.freq : '',
      items: t.items.filter(i => typeof i?.text === 'string').map(i => ({ text: i.text, ...(i.head ? { head: true } : Number.isInteger(i.dueIn) && i.dueIn >= 0 && i.dueIn <= 365 ? { dueIn: i.dueIn } : {}) })),
    };
  });
  const lists = arr(d.lists, 'listas').map(l => {
    if (!l?.id || typeof l.name !== 'string' || !Array.isArray(l.items)) bad('Hay una lista inválida en el archivo.');
    const ymdOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
    return {
      id: String(l.id), name: l.name, tplId: l.tplId ? String(l.tplId) : null, color: COLORS.includes(l.color) ? l.color : 'mauve',
      created: ymdOk(l.created) ? l.created : today(), t: Number(l.t) || 0, ...(ymdOk(l.archived) ? { archived: l.archived } : {}),
      ...(l.pinned ? { pinned: true } : {}), ...(l.sortDue ? { sortDue: true } : {}), ...(Number.isFinite(l.order) ? { order: l.order } : {}),
      items: l.items.filter(i => i?.id && typeof i.text === 'string').map(i => ({
        id: String(i.id), text: i.text,
        ...(i.head ? { head: true } : { done: !!i.done, ...(ymdOk(i.due) ? { due: i.due } : {}), ...(i.done && ymdOk(i.doneAt) ? { doneAt: i.doneAt } : {}) }),
        ...(i.extra ? { extra: true } : {}),
      })),
    };
  });
  const noteGroups = arr(d.noteGroups, 'grupos de notas').map(g => {
    if (!g?.id || typeof g.name !== 'string' || !Array.isArray(g.fields)) bad('Hay un grupo de notas inválido en el archivo.');
    return {
      id: String(g.id), name: g.name, color: COLORS.includes(g.color) ? g.color : 'mauve', icon: NOTE_ICONS.includes(g.icon) ? g.icon : NOTE_ICONS[0],
      ...(g.sort === 'alpha' ? { sort: 'alpha' } : {}),
      fields: g.fields.filter(f => f?.id && typeof f.name === 'string').map(f => {
        const type = FIELD_TYPES.some(t => t[0] === f.type) ? f.type : 'text';
        return { id: String(f.id), name: f.name, type, ...(f.list ? { list: true } : {}), ...(type === 'choice' ? { options: Array.isArray(f.options) ? f.options.map(String) : [] } : {}) };
      }),
    };
  });
  const groupIds = new Set(noteGroups.map(g => g.id));
  const notes = arr(d.notes, 'notas').map(n => {
    if (!n?.id || typeof n.title !== 'string' || !n.group) bad('Hay una nota inválida en el archivo.');
    const values = {};
    for (const [k, v] of Object.entries(n.values && typeof n.values === 'object' ? n.values : {})) {
      if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) values[k] = v;
    }
    return { id: String(n.id), group: String(n.group), title: n.title, values, tags: Array.isArray(n.tags) ? n.tags.map(String) : [], created: Number(n.created) || 0, updated: Number(n.updated) || 0 };
  }).filter(n => groupIds.has(n.group)); // una nota sin su grupo no se podría ver
  const inbox = arr(d.inbox, 'notas rápidas').map(q => {
    if (!q?.id || typeof q.text !== 'string') bad('Hay una nota rápida inválida en el archivo.');
    return { id: String(q.id), text: q.text, t: Number(q.t) || 0 };
  });
  const routines = sanitizeRoutines(arr(d.routines, 'rutinas'));
  const workouts = sanitizeWorkouts(arr(d.workouts, 'entrenamientos'));
  const exercises = sanitizeExercises(arr(d.exercises, 'catálogo de ejercicios'));
  const settings = { ...S.settings, ...(d.settings ?? {}) };
  // La marca del catálogo solo vale si viene en el respaldo: uno anterior al catálogo no la trae y debe sembrarse al cargar.
  if (!d.settings?.gymCatalogSeeded) delete settings.gymCatalogSeeded;
  if (!Array.isArray(settings.types)) settings.types = S.settings.types;
  if (!['system', 'jetbrains'].includes(settings.font)) settings.font = 'system';
  if (!THEMES.includes(settings.theme)) settings.theme = 'dark';
  return { habits, accounts, moves, plan, bills, purchases, templates, lists, noteGroups, notes, inbox, routines, workouts, exercises, settings, files: d.files };
}

// Reemplaza todos los datos por los de un respaldo ya validado (`validateImport`). Lo usan la importación y la sincronización.
export async function restore(data) {
  if (Array.isArray(data.files)) {
    data.files = await Promise.all(data.files.map(async f => {
      const blob = await (await fetch(f.data)).blob();
      return { id: String(f.id), blob, mime: f.mime || blob.type, name: String(f.name ?? 'archivo'), size: blob.size };
    }));
  }
  await db.replaceAll(data);
  delete S.settings.gymCatalogSeeded; // loadState mezcla los ajustes en memoria con los guardados: que mande el respaldo
  await loadState();
  await gcFiles();
}

async function doImport(file) {
  try {
    const data = validateImport(JSON.parse(await file.text()));
    const withFiles = Array.isArray(data.files);
    const msg = `Se reemplazarán TODOS los datos actuales por los del archivo (${data.accounts.length} cuentas, ${data.moves.length} movimientos, ${data.habits.length} hábitos, ${data.purchases.length} compras, ${data.templates.length} plantillas, ${data.lists.length} listas, ${data.notes.length} notas, ${data.inbox.length} notas rápidas, ${data.routines.length} rutinas, ${data.workouts.length} entrenamientos). ` +
      (withFiles ? `Incluye ${data.files.length} archivos adjuntos. ` : 'El respaldo no trae adjuntos: se conservan los que ya tienes en este teléfono. ') + '¿Continuar?';
    if (!confirm(msg)) return;
    await restore(data);
    toast('Datos importados');
  } catch (err) {
    alert(err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message);
  }
}

export const actions = {
  export: doExport,
  share: doShare,
  import: () => { const f = $('#file'); f.value = ''; f.click(); },
  'new-kind': () => kindForm(),
  'edit-kind': el => kindForm(S.settings.types.find(t => t.id === el.dataset.id)),
  async wipe() {
    if (!confirm('Se borrarán todas las cuentas, movimientos, hábitos, pagos, compras, plantillas, listas, notas, notas rápidas, rutinas, entrenamientos y adjuntos de este dispositivo. ¿Continuar?')) return;
    if (!confirm('¿Seguro? Si no tienes un respaldo exportado no podrás recuperarlos.')) return;
    delete S.settings.gymCatalogSeeded; // el catálogo vuelve a sembrarse con los ejercicios iniciales
    await db.replaceAll({ habits: [], accounts: [], moves: [], plan: [], bills: [], purchases: [], templates: [], lists: [], noteGroups: [], notes: [], inbox: [], routines: [], workouts: [], exercises: [], files: [], settings: S.settings });
    await loadState();
    toast('Datos borrados');
  },
};

export async function onFilePicked(file) { await doImport(file); }

export const changes = {
  async 'include-files'(el) { S.settings.includeFiles = el.checked; await saveSettings(); },
  async font(el) { S.settings.font = el.value === 'jetbrains' ? 'jetbrains' : 'system'; applyFont(S.settings.font); await saveSettings(); },
  async theme(el) { S.settings.theme = THEMES.includes(el.value) ? el.value : 'dark'; applyTheme(S.settings.theme); await saveSettings(); },
};
