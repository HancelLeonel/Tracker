import * as db from './db.js';
import { esc, uid, today, addDays, addMonths, daysBetween, fmtDate, fmtDateY, parseYmd, toast, $ } from './util.js';
import { S, saveTemplate, saveList, isListDone } from './state.js';
import { modal } from './ui.js';
import { icon } from './icons.js';
import { COLORS } from './habits.js';

// Cada cuánto se repite una plantilla: [clave, texto, función que da la fecha de la próxima vez a partir de la última].
export const FREQS = [
  ['', 'Sin periodo', null],
  ['weekly', 'Cada semana', d => addDays(d, 7)],
  ['biweekly', 'Cada 15 días', d => addDays(d, 15)],
  ['monthly', 'Cada mes', d => addMonths(d, 1)],
];
const freqOf = t => FREQS.find(f => f[0] === t.freq) ?? FREQS[0];

const real = l => l.items.filter(i => !i.head);
const progress = l => { const r = real(l); return { done: r.filter(i => i.done).length, total: r.length }; };
const isDone = isListDone;
const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export const current = () => S.lists.find(l => l.id === S.listId) ?? null;

// ---------- plantillas ----------
// Último día en que se creó una lista a partir de la plantilla (o null).
const lastUsed = t => S.lists.filter(l => l.tplId === t.id).map(l => l.created).sort().at(-1) ?? null;

// Aviso de cuándo toca repetirla: { late, text } o null si no tiene periodo o nunca se ha usado.
function dueInfo(t) {
  const next = freqOf(t)[2], last = lastUsed(t);
  if (!next || !last) return null;
  const left = daysBetween(today(), next(last));
  if (left <= 0) return { late: true, text: 'Ya toca' };
  return { late: false, text: `Toca en ${pl(left, 'día')}` };
}

// El texto de la plantilla se edita como una línea por elemento; las que empiezan con # son encabezados de sección.
const parseItems = text => text.split('\n').map(l => l.trim()).filter(Boolean).map(l =>
  (l.startsWith('#') ? { text: l.replace(/^#+\s*/, ''), head: true } : { text: l })).filter(i => i.text);
const itemsText = items => items.map(i => (i.head ? `# ${i.text}` : i.text)).join('\n');

// `seed` (solo al crear) rellena el formulario con datos de partida, por ejemplo los de una lista.
function templateForm(t, seed) {
  const src = t ?? seed;
  const color = src?.color ?? 'mauve', freq = src?.freq ?? '';
  modal(t ? 'Editar plantilla' : 'Nueva plantilla', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(src?.name ?? '')}" placeholder="Ej. Súper quincenal, Limpieza semanal…"></label>
    <label>Se repite
      <select name="freq">${FREQS.map(([k, name]) => `<option value="${k}" ${k === freq ? 'selected' : ''}>${name}</option>`).join('')}</select>
    </label>
    <label>Elementos (uno por línea)
      <textarea name="items" rows="10" placeholder="# Frutas y verduras&#10;Tomate&#10;Cebolla&#10;# Lácteos&#10;Leche">${esc(itemsText(src?.items ?? []))}</textarea>
      <small>Empieza una línea con # para separar por secciones.</small>
    </label>
    <div><small class="muted">Color</small>
      <div class="swatches" role="radiogroup" aria-label="Color">
        ${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--c:var(--${c})"></span></label>`).join('')}
      </div>
    </div>`, {
    async onSubmit(fd) {
      const data = { name: fd.get('name').trim(), freq: fd.get('freq'), color: fd.get('color'), items: parseItems(fd.get('items')) };
      if (t) Object.assign(t, data); else S.templates.push(t = { id: uid(), ...data });
      await saveTemplate(t);
      if (seed) toast('Plantilla guardada');
    },
    onDelete: t && (async () => {
      S.templates = S.templates.filter(x => x.id !== t.id);
      await db.commit({ remove: { templates: [t.id] } });
    }),
    confirmText: '¿Eliminar esta plantilla? Las listas que ya creaste con ella no se borran.',
  });
}

function templateCard(t) {
  const n = t.items.filter(i => !i.head).length, due = dueInfo(t), last = lastUsed(t);
  return `
    <section class="card habit" style="--c:var(--${t.color})">
      <div class="habit-h">
        <span class="h-ic">${icon('checklist')}</span>
        <button class="name" data-act="edit-tpl" data-id="${t.id}">${esc(t.name)}</button>
      </div>
      <p class="muted tpl-meta">${pl(n, 'elemento')}${t.freq ? ` · ${freqOf(t)[1]}` : ''}${last ? ` · última vez ${fmtDate(last)}` : ''}
        ${due ? `<span class="${due.late ? 'warn' : 'pos'}"> · ${due.text}</span>` : ''}</p>
      <button class="btn primary block" data-act="use-tpl" data-id="${t.id}">${icon('copy')} Crear lista</button>
    </section>`;
}

function templatesView() {
  if (!S.templates.length) {
    return `<div class="card empty"><p>Aún no tienes plantillas.</p>
      <small>Una plantilla es una lista que repites (el súper, la limpieza semanal…). De ahí creas una lista nueva cada vez y le agregas lo extra.</small>
      <button class="btn primary" data-act="new-tpl">Crear la primera</button></div>`;
  }
  return S.templates.map(templateCard).join('');
}

// ---------- listas ----------
const defaultName = tpl => `${tpl ? tpl.name : 'Lista'} · ${fmtDate(today())}`;

async function createList(tpl, name) {
  const l = {
    id: uid(), name: name || defaultName(tpl), tplId: tpl?.id ?? null, color: tpl?.color ?? 'mauve', created: today(), t: Date.now(),
    items: (tpl?.items ?? []).map(i => ({ id: uid(), text: i.text, ...(i.head ? { head: true } : { done: false }) })),
  };
  S.lists.push(l);
  await saveList(l);
  S.listSub = 'lists';
  S.listId = l.id;
  S.listEdit = false;
  window.scrollTo(0, 0);
}

function newListForm() {
  modal('Nueva lista', `
    <label>Basada en
      <select name="tpl"><option value="">Lista vacía</option>
        ${S.templates.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
    </label>
    <label>Nombre <input name="name" required maxlength="60" value="${esc(defaultName(null))}"></label>`, {
    submit: 'Crear',
    afterOpen(f) {
      const name = f.elements.name, sel = f.elements.tpl;
      let touched = false;
      name.addEventListener('input', () => { touched = true; });
      sel.addEventListener('change', () => { if (!touched) name.value = defaultName(S.templates.find(t => t.id === sel.value)); });
    },
    onSubmit: fd => createList(S.templates.find(t => t.id === fd.get('tpl')), fd.get('name').trim()),
  });
}

function listOptions(l) {
  modal('Opciones de la lista', `
    <label>Nombre <input name="name" required maxlength="60" value="${esc(l.name)}"></label>
    <button type="button" class="btn block" data-act="list-to-tpl">${icon('copy')} Guardar como plantilla</button>`, {
    async onSubmit(fd) { l.name = fd.get('name').trim(); await saveList(l); },
    onDelete: async () => {
      S.lists = S.lists.filter(x => x.id !== l.id);
      S.listId = null;
      await db.commit({ remove: { lists: [l.id] } });
    },
    confirmText: '¿Eliminar esta lista?',
  });
}

// Fecha corta: sin año si es de este año.
const dshort = d => (parseYmd(d).getFullYear() === new Date().getFullYear() ? fmtDate(d) : fmtDateY(d));

// Cuándo vence una tarea pendiente (o cuándo se hizo una terminada): { cls, text } o null.
function metaOf(i) {
  if (i.done) return i.doneAt ? { cls: 'muted', text: `Hecho el ${dshort(i.doneAt)}` } : null;
  if (!i.due) return null;
  const n = daysBetween(today(), i.due);
  if (n < 0) return { cls: 'neg', text: `Venció el ${dshort(i.due)} (hace ${pl(-n, 'día')})` };
  if (n === 0) return { cls: 'warn', text: 'Vence hoy' };
  if (n === 1) return { cls: 'warn', text: 'Vence mañana' };
  return { cls: 'muted', text: `Vence el ${dshort(i.due)} (en ${n} días)` };
}

// Resumen de fechas de una lista para su tarjeta: tareas vencidas o la próxima por vencer.
function dueSummary(l) {
  const dated = real(l).filter(i => !i.done && i.due).map(i => i.due).sort();
  if (!dated.length) return '';
  const late = dated.filter(d => d < today()).length;
  if (late) return `<small class="neg">${pl(late, 'vencida')}</small>`;
  return `<small class="muted">Próxima: ${dshort(dated[0])}</small>`;
}

function listCard(l, archived = false) {
  const p = progress(l);
  const meta = archived ? `<small class="muted">Finalizada el ${dshort(l.archived)}</small>`
    : isDone(l) ? '<small class="pos">Lista para finalizar</small>' : dueSummary(l);
  return `
    <button class="card list-card ${archived ? 'compact' : ''}" style="--c:var(--${l.color})" data-act="open-list" data-id="${l.id}">
      <span class="lc-top"><b>${esc(l.name)}</b><small>${p.done}/${p.total}</small></span>
      ${archived ? '' : `<span class="bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></i></span>`}
      ${meta}
    </button>`;
}

const byNewest = (a, b) => b.created.localeCompare(a.created) || b.t - a.t;

function listsOverview() {
  const active = S.lists.filter(l => !l.archived).sort(byNewest);
  const late = S.templates.filter(t => dueInfo(t)?.late);

  if (!S.lists.filter(l => !l.archived).length && !late.length) {
    return `<div class="card empty"><p>No tienes listas activas.</p>
      <small>${S.templates.length ? 'Crea una a partir de una de tus plantillas o una lista vacía.' : 'Empieza creando una plantilla con lo que repites seguido, o una lista vacía.'}</small>
      <button class="btn primary" data-act="new-list">Crear una lista</button>
      ${S.templates.length ? '' : '<button class="btn" data-act="new-tpl">Crear una plantilla</button>'}</div>`;
  }
  return `
    ${late.map(t => `
      <section class="card alert due" style="--c:var(--${t.color})">
        <div><b>${esc(t.name)}</b><br><small class="warn">Ya toca (${freqOf(t)[1].toLowerCase()})</small></div>
        <button class="btn primary sm" data-act="use-tpl" data-id="${t.id}">Crear lista</button>
      </section>`).join('')}
    ${active.map(l => listCard(l)).join('')}`;
}

// Listas finalizadas, de la más reciente a la más antigua.
function archiveView() {
  const all = S.lists.filter(l => l.archived).sort((a, b) => b.archived.localeCompare(a.archived) || byNewest(a, b));
  if (!all.length) return '<div class="card empty"><p>Aquí aparecen las listas que finalices.</p><small>Cuando marques todo, la lista muestra el botón «Finalizar lista» y se guarda en el archivo.</small></div>';
  const shown = all.slice(0, S.listLimit), left = all.length - shown.length;
  return `${shown.map(l => listCard(l, true)).join('')}
    ${left > 0 ? `<button class="btn ghost block" data-act="more-lists">Ver más (${Math.min(10, left)} de ${left} restantes)</button>` : ''}`;
}

export function listsView() {
  const archived = S.lists.filter(l => l.archived).length;
  const seg = `<div class="seg" role="tablist">${[['lists', 'Listas'], ['templates', 'Plantillas'], ['archive', 'Archivo']].map(([k, name]) =>
    `<button class="${k === S.listSub ? 'on' : ''}" data-act="list-sub" data-sub="${k}">${name}${k === 'archive' && archived ? ` <small>${archived}</small>` : ''}</button>`).join('')}</div>`;
  return seg + (S.listSub === 'templates' ? templatesView() : S.listSub === 'archive' ? archiveView() : listsOverview());
}

// ---------- detalle de una lista ----------
// Los elementos hechos bajan al final de su sección (por orden en que se marcaron); los pendientes conservan su orden.
// El orden guardado no cambia: al desmarcar, el elemento vuelve a su lugar.
function sink(items) {
  const pending = items.filter(i => !i.done);
  const done = items.filter(i => i.done).map((i, k) => [i, k]).sort((a, b) => (a[0].doneAt ?? '').localeCompare(b[0].doneAt ?? '') || a[1] - b[1]).map(x => x[0]);
  return [...pending, ...done];
}

// Parte los elementos en secciones, una por encabezado (la primera puede no tener).
function sections(items) {
  const out = [{ head: null, items: [] }];
  for (const i of items) { if (i.head) out.push({ head: i, items: [] }); else out.at(-1).items.push(i); }
  return out.filter(s => s.head || s.items.length);
}

function itemRow(i, mode) {
  const m = metaOf(i);
  const body = `<span class="li-body"><span class="li-t">${esc(i.text)}</span>${m ? `<small class="li-meta ${m.cls}">${m.text}</small>` : ''}</span>`;
  const dot = `<span class="dot ${i.done ? 'on' : ''}">${i.done ? icon('check') : ''}</span>`;
  if (mode === 'archived') return `<div class="li static ${i.done ? 'done' : ''}">${dot}${body}</div>`;
  if (mode === 'edit') {
    return `<div class="li editing">${dot}${body}
      <button class="icon sm" data-act="li-edit-item" data-id="${i.id}" aria-label="Editar ${esc(i.text)}">${icon('edit')}</button>
      <button class="icon sm" data-act="li-del" data-id="${i.id}" aria-label="Quitar ${esc(i.text)}">${icon('close')}</button></div>`;
  }
  // Calendario: el campo de fecha va transparente encima del icono, así tocarlo abre el selector de fechas del teléfono.
  const cal = i.done ? '' : `<label class="li-cal ${i.due ? 'has' : ''} ${i.due && i.due < today() ? 'late' : ''}" aria-label="Fecha límite de ${esc(i.text)}">${icon('calendar')}
      <input type="date" data-change="li-due" data-id="${i.id}" value="${i.due ?? ''}" aria-label="Fecha límite de ${esc(i.text)}"></label>`;
  return `<div class="li ${i.done ? 'done' : ''}">
    <button class="li-main" data-act="li-toggle" data-id="${i.id}" aria-pressed="${!!i.done}">${dot}${body}</button>${cal}</div>`;
}

export function listDetail(l) {
  const p = progress(l), edit = S.listEdit && !l.archived;
  const mode = l.archived ? 'archived' : edit ? 'edit' : 'normal';
  const base = l.items.filter(i => !i.extra), extras = l.items.filter(i => i.extra);
  const body = items => sections(items).map(sec =>
    `${sec.head ? `<h2 class="slot-h">${esc(sec.head.text)}</h2>` : ''}<div class="li-list">${sink(sec.items).map(i => itemRow(i, mode)).join('')}</div>`).join('');
  const complete = isDone(l);
  return `
    <div class="slot" style="--c:var(--${l.color})">
    <section class="card progress-ring">
      <b>${p.done}/${p.total}</b>
      <div class="bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></i></div>
      ${l.archived ? '' : `<button class="btn sm" data-act="list-edit" aria-pressed="${edit}">${icon(edit ? 'check' : 'edit')} ${edit ? 'Listo' : 'Editar'}</button>`}
    </section>
    ${l.archived ? `<section class="card archived-note"><p>${icon('done')} Lista finalizada el ${dshort(l.archived)}</p>
        <button class="btn block" data-act="list-restore">${icon('reset')} Restaurar lista</button></section>`
      : complete ? `<section class="card finish"><p class="pos">${icon('done')} Todo listo</p>
        <button class="btn primary block" data-act="list-finish">${icon('check')} Finalizar lista</button></section>` : ''}
    ${l.archived ? '' : `<form class="add-row" data-noform>
      <input name="text" id="li-new" maxlength="80" placeholder="Agregar algo adicional…" autocomplete="off" enterkeyhint="done">
      <button class="btn primary" data-act="li-add" aria-label="Agregar">${icon('plus')}</button>
    </form>`}
    ${edit ? '<p class="muted note">Toca el lápiz para cambiar el texto o la fecha de un elemento, o la X para quitarlo de esta lista. La plantilla no cambia.</p>' : ''}
    ${body(base)}
    ${extras.length ? `<h2 class="slot-h">${icon('plus')}<span>Adicionales</span><small>${extras.filter(i => i.done).length}/${extras.length}</small></h2>${body(extras)}` : ''}
    ${!l.items.length ? '<div class="card empty"><p>La lista está vacía.</p><small>Agrega elementos con el campo de arriba.</small></div>' : ''}
    </div>`;
}

// Edita el texto y la fecha límite de un elemento.
function itemForm(l, i) {
  modal('Editar elemento', `
    <label>Texto <input name="text" required maxlength="80" value="${esc(i.text)}"></label>
    <label>Fecha límite (opcional) <input name="due" type="date" value="${i.due ?? ''}"></label>
    <button type="button" class="btn sm" id="clear-due">Quitar fecha</button>
    ${i.done && i.doneAt ? `<small class="muted">Hecho el ${dshort(i.doneAt)}</small>` : ''}`, {
    afterOpen: f => { f.querySelector('#clear-due').onclick = () => { f.elements.due.value = ''; }; },
    async onSubmit(fd) {
      const text = fd.get('text').trim();
      if (!text) return false;
      i.text = text;
      if (fd.get('due')) i.due = fd.get('due'); else delete i.due;
      await saveList(l);
    },
    onDelete: async () => { l.items = l.items.filter(x => x.id !== i.id); await saveList(l); },
    deleteLabel: 'Quitar',
    confirmText: '¿Quitar este elemento de la lista?',
  });
}

// Elementos pendientes con fecha límite de hoy o anterior, de las listas activas (para «Tareas de hoy» en Inicio).
export function todayTasks() {
  const t = today();
  return S.lists.filter(l => !l.archived)
    .flatMap(l => l.items.filter(i => !i.head && !i.done && i.due && i.due <= t).map(i => ({ list: l, item: i })))
    .sort((a, b) => a.item.due.localeCompare(b.item.due) || a.list.created.localeCompare(b.list.created));
}
export { metaOf as dueMeta };

export const actions = {
  // Desde Inicio: marcar una tarea como hecha, o abrir su lista.
  async 'agenda-toggle'(el) {
    const l = S.lists.find(x => x.id === el.dataset.list), i = l?.items.find(x => x.id === el.dataset.id);
    if (!i) return;
    i.done = true;
    i.doneAt = today();
    await saveList(l);
    toast('Tarea hecha');
  },
  'agenda-open': el => { S.tab = 'lists'; S.listSub = 'lists'; S.listId = el.dataset.list; S.listEdit = false; window.scrollTo(0, 0); },
  'list-sub': el => { S.listSub = el.dataset.sub; S.listLimit = 10; },
  'more-lists': () => { S.listLimit += 10; },
  'new-tpl': () => { S.listSub = 'templates'; templateForm(); },
  'edit-tpl': el => templateForm(S.templates.find(t => t.id === el.dataset.id)),
  'use-tpl': el => createList(S.templates.find(t => t.id === el.dataset.id)),
  'new-list': () => newListForm(),
  'open-list': el => { S.listId = el.dataset.id; S.listEdit = false; window.scrollTo(0, 0); },
  'list-back': () => { S.listId = null; S.listEdit = false; },
  'list-opts': () => listOptions(current()),
  // Abre el formulario de plantilla con los elementos fijos de la lista (sin los adicionales, que no son periódicos).
  'list-to-tpl': () => {
    const l = current();
    templateForm(null, { name: l.name.replace(/ · \d{1,2} [a-z]{3}$/, ''), color: l.color, items: l.items.filter(i => !i.extra).map(({ text, head }) => ({ text, ...(head ? { head } : {}) })) });
  },
  'list-edit': () => { S.listEdit = !S.listEdit; },
  'li-edit-item': el => { const l = current(); itemForm(l, l.items.find(x => x.id === el.dataset.id)); },
  // Al marcar se guarda el día; al desmarcar se borra.
  async 'li-toggle'(el) {
    const l = current(), i = l.items.find(x => x.id === el.dataset.id);
    i.done = !i.done;
    if (i.done) i.doneAt = today(); else delete i.doneAt;
    await saveList(l);
  },
  async 'li-del'(el) {
    const l = current();
    l.items = l.items.filter(x => x.id !== el.dataset.id);
    await saveList(l);
  },
  async 'li-add'(el) {
    const input = el.closest('form').elements.text, text = input.value.trim();
    S.focusNew = true; // el repintado devuelve el foco al campo para seguir agregando
    if (!text) return;
    const l = current();
    l.items.push({ id: uid(), text, done: false, extra: true });
    await saveList(l);
  },
  // Finalizar: la lista completa se archiva con la fecha de hoy y se vuelve a la vista general.
  async 'list-finish'() {
    const l = current();
    if (!isDone(l)) return;
    l.archived = today();
    await saveList(l);
    S.listId = null;
    S.listEdit = false;
    window.scrollTo(0, 0);
    toast('Lista finalizada y archivada');
  },
  async 'list-restore'() {
    const l = current();
    delete l.archived;
    await saveList(l);
    toast('Lista restaurada');
  },
};

// Cambios en campos (la fecha límite de un elemento): app.js los busca por data-change.
export const changes = {
  async 'li-due'(el) {
    const l = current(), i = l.items.find(x => x.id === el.dataset.id);
    if (el.value) i.due = el.value; else delete i.due;
    await saveList(l);
  },
};

// Tras repintar, devuelve el foco al campo de agregar si se acaba de usar.
export function restoreFocus() {
  if (!S.focusNew) return;
  S.focusNew = false;
  $('#li-new')?.focus();
}
