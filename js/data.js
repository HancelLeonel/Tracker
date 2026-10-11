import * as db from './db.js';
import { esc, uid, today, toast, $ } from './util.js';
import { S, loadState, saveSettings, gcFiles } from './state.js';
import { modal } from './ui.js';
import { COLORS } from './habits.js';
import { fileSize } from './ui.js';

const APP_ID = 'mi-quincena';
const VERSION = 3;
const FREQS = ['once', 'monthly', 'biweekly'];
const WHENS = ['both', 'q1', 'q2'];

const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------- vista ----------
export function dataView() {
  const last = S.settings.lastExport ? new Date(S.settings.lastExport).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca';
  const bytes = [...S.files.values()].reduce((t, f) => t + (f.size ?? 0), 0);
  const filesInfo = S.files.size ? `${pl(S.files.size, 'archivo')} · ${fileSize(bytes)}` : 'ninguno';
  return `
    <section class="card stack">
      <h3>Respaldo</h3>
      <p class="muted">Los datos viven solo en este teléfono. Exporta un respaldo de vez en cuando; si borras los datos del navegador se pierden.</p>
      <div class="kv"><span class="muted">Último respaldo</span><span>${last}</span></div>
      <div class="kv"><span class="muted">Contenido</span><span>${pl(S.accounts.length, 'cuenta')} · ${pl(S.moves.length, 'movimiento')} · ${pl(S.habits.length, 'hábito')}</span></div>
      <div class="kv"><span class="muted">Adjuntos</span><span>${filesInfo}</span></div>
      <label class="check"><input type="checkbox" data-change="include-files" ${S.settings.includeFiles ? 'checked' : ''}>
        <span>Incluir archivos adjuntos<small>Hace el respaldo más pesado. Sin esto solo se guardan los datos.</small></span></label>
      <button class="btn primary block" data-act="export">Exportar a archivo</button>
      ${navigator.canShare ? '<button class="btn block" data-act="share">Compartir respaldo…</button>' : ''}
      <button class="btn block" data-act="import">Importar desde archivo</button>
    </section>
    <section class="card stack">
      <div class="card-h"><h3>Tipos de gasto</h3><button class="btn sm" data-act="new-kind">＋ Nuevo</button></div>
      <div class="chips">${S.settings.types.map(t => `<button class="chip-tag" data-act="edit-kind" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>
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

async function buildExport() {
  const withFiles = S.settings.includeFiles;
  const data = {
    app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(), includesFiles: withFiles,
    settings: S.settings, habits: S.habits, accounts: S.accounts, moves: S.moves, plan: S.plan, bills: S.bills, purchases: S.purchases,
  };
  if (withFiles) {
    const recs = await db.getAll('files');
    data.files = await Promise.all(recs.map(async r => ({ id: r.id, mime: r.mime, name: r.name, data: await blobToDataUrl(r.blob) })));
  }
  return data;
}

async function fileForExport() {
  const suffix = S.settings.includeFiles ? '-con-archivos' : '';
  return new File([JSON.stringify(await buildExport(), null, 2)], `mi-quincena-${today()}${suffix}.json`, { type: 'application/json' });
}

async function markExported() {
  S.settings.lastExport = new Date().toISOString();
  await saveSettings();
}

async function doExport() {
  toast('Preparando respaldo…');
  const file = await fileForExport();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  await markExported();
  toast(`Respaldo exportado (${fileSize(file.size)})`);
}

async function doShare() {
  const file = await fileForExport();
  if (!navigator.canShare({ files: [file] })) return toast('Este dispositivo no puede compartir archivos');
  try {
    await navigator.share({ files: [file], title: 'Respaldo Mi Quincena' });
    await markExported();
  } catch (err) {
    if (err.name !== 'AbortError') toast('No se pudo compartir');
  }
}

// ---------- importar ----------
function validateImport(d) {
  const bad = msg => { throw new Error(msg); };
  if (!d || d.app !== APP_ID) bad('El archivo no es un respaldo de esta app.');
  if (d.version !== 2 && d.version !== VERSION) bad('Este respaldo es de una versión que ya no se puede importar.');
  const arr = (v, name) => (v === undefined ? [] : Array.isArray(v) ? v : bad(`El respaldo está dañado (${name}).`));
  const num = n => Number.isFinite(n) ? n : bad('Hay un monto inválido en el archivo.');
  const ids = v => (Array.isArray(v) ? v.map(String) : []);
  const ref = p => (p?.acc && p?.cat ? { acc: String(p.acc), cat: String(p.cat) } : bad('Hay un movimiento inválido en el archivo.'));

  const habits = arr(d.habits, 'hábitos').map(h => {
    if (!h?.id || typeof h.name !== 'string') bad('Hay un hábito inválido en el archivo.');
    return { id: String(h.id), name: h.name, color: COLORS.includes(h.color) ? h.color : 'mauve', dates: h.dates && typeof h.dates === 'object' ? h.dates : {} };
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
  const settings = { ...S.settings, ...(d.settings ?? {}) };
  if (!Array.isArray(settings.types)) settings.types = S.settings.types;
  return { habits, accounts, moves, plan, bills, purchases, settings, files: d.files };
}

async function doImport(file) {
  try {
    const data = validateImport(JSON.parse(await file.text()));
    const withFiles = Array.isArray(data.files);
    const msg = `Se reemplazarán TODOS los datos actuales por los del archivo (${data.accounts.length} cuentas, ${data.moves.length} movimientos, ${data.habits.length} hábitos, ${data.purchases.length} compras). ` +
      (withFiles ? `Incluye ${data.files.length} archivos adjuntos. ` : 'El respaldo no trae adjuntos: se conservan los que ya tienes en este teléfono. ') + '¿Continuar?';
    if (!confirm(msg)) return;
    if (withFiles) {
      data.files = await Promise.all(data.files.map(async f => {
        const blob = await (await fetch(f.data)).blob();
        return { id: String(f.id), blob, mime: f.mime || blob.type, name: String(f.name ?? 'archivo'), size: blob.size };
      }));
    }
    await db.replaceAll(data);
    await loadState();
    await gcFiles();
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
    if (!confirm('Se borrarán todas las cuentas, movimientos, hábitos, pagos, compras y adjuntos de este dispositivo. ¿Continuar?')) return;
    if (!confirm('¿Seguro? Si no tienes un respaldo exportado no podrás recuperarlos.')) return;
    await db.replaceAll({ habits: [], accounts: [], moves: [], plan: [], bills: [], purchases: [], files: [], settings: S.settings });
    await loadState();
    toast('Datos borrados');
  },
};

export async function onFilePicked(file) { await doImport(file); }

export const changes = {
  async 'include-files'(el) { S.settings.includeFiles = el.checked; await saveSettings(); },
};
