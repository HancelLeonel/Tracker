import * as db from './db.js';
import { esc, uid, today, addDays, addMonths, daysBetween, fmtDate, toast, $ } from './util.js';
import { S, saveTemplate, saveList } from './state.js';
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
// Una lista está completa cuando todos sus elementos están marcados (al agregar uno nuevo vuelve a estar activa).
const isDone = l => { const p = progress(l); return p.total > 0 && p.done === p.total; };
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

function listCard(l, compact = false) {
  const p = progress(l);
  return `
    <button class="card list-card ${compact ? 'compact' : ''}" style="--c:var(--${l.color})" data-act="open-list" data-id="${l.id}">
      <span class="lc-top"><b>${esc(l.name)}</b><small>${p.done}/${p.total}</small></span>
      ${compact ? '' : `<span class="bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></i></span>`}
    </button>`;
}

function listsOverview() {
  const active = S.lists.filter(l => !isDone(l)).sort((a, b) => b.created.localeCompare(a.created) || b.t - a.t);
  const done = S.lists.filter(isDone).sort((a, b) => b.created.localeCompare(a.created) || b.t - a.t);
  const late = S.templates.filter(t => dueInfo(t)?.late);
  const shown = done.slice(0, S.listLimit), left = done.length - shown.length;

  if (!S.lists.length && !late.length) {
    return `<div class="card empty"><p>Aún no tienes listas.</p>
      <small>${S.templates.length ? 'Crea una a partir de una de tus plantillas.' : 'Empieza creando una plantilla con lo que repites seguido.'}</small>
      ${S.templates.length ? '<button class="btn primary" data-act="new-list">Crear una lista</button>' : '<button class="btn primary" data-act="new-tpl">Crear una plantilla</button>'}</div>`;
  }
  return `
    ${late.map(t => `
      <section class="card alert due" style="--c:var(--${t.color})">
        <div><b>${esc(t.name)}</b><br><small class="warn">Ya toca (${freqOf(t)[1].toLowerCase()})</small></div>
        <button class="btn primary sm" data-act="use-tpl" data-id="${t.id}">Crear lista</button>
      </section>`).join('')}
    ${active.map(l => listCard(l)).join('')}
    ${done.length ? `<h2 class="slot-h">${icon('done')}<span>Completadas</span><small>${done.length}</small></h2>
      ${shown.map(l => listCard(l, true)).join('')}
      ${left > 0 ? `<button class="btn ghost block" data-act="more-lists">Ver más (${Math.min(10, left)} de ${left} restantes)</button>` : ''}` : ''}`;
}

export function listsView() {
  const seg = `<div class="seg" role="tablist">${[['lists', 'Listas'], ['templates', 'Plantillas']].map(([k, name]) =>
    `<button class="${k === S.listSub ? 'on' : ''}" data-act="list-sub" data-sub="${k}">${name}</button>`).join('')}</div>`;
  return seg + (S.listSub === 'templates' ? templatesView() : listsOverview());
}

// ---------- detalle de una lista ----------
function itemRow(i, edit) {
  const inner = `<span class="dot ${i.done ? 'on' : ''}">${i.done ? icon('check') : ''}</span><span class="li-t">${esc(i.text)}</span>`;
  return edit
    ? `<div class="li editing">${inner}<button class="icon sm" data-act="li-del" data-id="${i.id}" aria-label="Quitar ${esc(i.text)}">${icon('close')}</button></div>`
    : `<button class="li ${i.done ? 'done' : ''}" data-act="li-toggle" data-id="${i.id}" aria-pressed="${!!i.done}">${inner}</button>`;
}

export function listDetail(l) {
  const p = progress(l), edit = S.listEdit;
  const base = l.items.filter(i => !i.extra), extras = l.items.filter(i => i.extra);
  const rows = items => items.map(i => (i.head ? `<h2 class="slot-h">${esc(i.text)}</h2>` : itemRow(i, edit))).join('');
  return `
    <div class="slot" style="--c:var(--${l.color})">
    <section class="card progress-ring">
      <b>${p.done}/${p.total}</b>
      <div class="bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></i></div>
      <button class="btn sm" data-act="list-edit" aria-pressed="${edit}">${icon(edit ? 'check' : 'edit')} ${edit ? 'Listo' : 'Editar'}</button>
    </section>
    ${p.total && p.done === p.total ? `<p class="pos center">${icon('done')} Lista completa</p>` : ''}
    <form class="add-row" data-noform>
      <input name="text" id="li-new" maxlength="80" placeholder="Agregar algo adicional…" autocomplete="off" enterkeyhint="done">
      <button class="btn primary" data-act="li-add" aria-label="Agregar">${icon('plus')}</button>
    </form>
    ${edit ? '<p class="muted note">Toca la X para quitar un elemento de esta lista. La plantilla no cambia.</p>' : ''}
    <div class="li-list">${rows(base)}</div>
    ${extras.length ? `<h2 class="slot-h">${icon('plus')}<span>Adicionales</span><small>${extras.filter(i => i.done).length}/${extras.length}</small></h2>
      <div class="li-list">${rows(extras)}</div>` : ''}
    ${!l.items.length ? '<div class="card empty"><p>La lista está vacía.</p><small>Agrega elementos con el campo de arriba.</small></div>' : ''}
    </div>`;
}

export const actions = {
  'list-sub': el => { S.listSub = el.dataset.sub; },
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
  async 'li-toggle'(el) {
    const l = current(), i = l.items.find(x => x.id === el.dataset.id);
    i.done = !i.done;
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
};

// Tras repintar, devuelve el foco al campo de agregar si se acaba de usar.
export function restoreFocus() {
  if (!S.focusNew) return;
  S.focusNew = false;
  $('#li-new')?.focus();
}
