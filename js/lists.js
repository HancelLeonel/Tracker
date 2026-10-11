import * as db from './db.js';
import { esc, uid, today, addDays, addMonths, daysBetween, fmtDate, fmtDateY, parseYmd, toast, $, pl } from './util.js';
import { S, saveTemplate, saveList, saveSettings, isListDone } from './state.js';
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
// Una línea que termina en « @3» vence 3 días después de crear la lista (fecha relativa).
const parseItems = text => text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  if (l.startsWith('#')) return { text: l.replace(/^#+\s*/, ''), head: true };
  const m = l.match(/^(.*?)\s+@(\d{1,3})$/);
  return m && m[1].trim() ? { text: m[1].trim(), dueIn: +m[2] } : { text: l };
}).filter(i => i.text);
const itemsText = items => items.map(i => (i.head ? `# ${i.text}` : i.dueIn != null ? `${i.text} @${i.dueIn}` : i.text)).join('\n');

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
      <small>Empieza una línea con # para separar por secciones. Termina una línea con @3 para que ese elemento venza 3 días después de crear la lista.</small>
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
    items: (tpl?.items ?? []).map(i => ({
      id: uid(), text: i.text,
      ...(i.head ? { head: true } : { done: false, ...(i.dueIn != null ? { due: addDays(today(), i.dueIn) } : {}) }),
    })),
    order: Math.min(0, ...S.lists.map(x => x.order ?? 0)) - 1, // en orden manual, la lista nueva queda arriba
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
    <label class="check"><input type="checkbox" name="pinned" ${l.pinned ? 'checked' : ''}><span>Fijar arriba<small>Aparece antes que las demás en la vista de listas.</small></span></label>
    <label class="check"><input type="checkbox" name="sortDue" ${l.sortDue ? 'checked' : ''}><span>Ordenar los pendientes por fecha límite<small>Los que tienen fecha van primero, de la más próxima a la más lejana.</small></span></label>
    <button type="button" class="btn block" data-act="list-to-tpl">${icon('copy')} Guardar como plantilla</button>`, {
    async onSubmit(fd) {
      l.name = fd.get('name').trim();
      if (fd.get('pinned')) l.pinned = true; else delete l.pinned;
      if (fd.get('sortDue')) l.sortDue = true; else delete l.sortDue;
      await saveList(l);
    },
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

const byNewest = (a, b) => b.created.localeCompare(a.created) || b.t - a.t;

// Orden de la vista de listas: recientes, por la próxima fecha límite pendiente o manual. Las fijadas siempre van primero.
const SORTS = [['recent', 'Recientes'], ['due', 'Por fecha'], ['manual', 'Manual']];
const sortMode = () => (SORTS.some(x => x[0] === S.settings.listSort) ? S.settings.listSort : 'recent');
const nextDue = l => real(l).filter(i => !i.done && i.due).map(i => i.due).sort()[0] ?? null;
function comparator(mode) {
  if (mode === 'due') return (a, b) => (nextDue(a) ?? '9999').localeCompare(nextDue(b) ?? '9999') || byNewest(a, b);
  if (mode === 'manual') return (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || byNewest(a, b);
  return byNewest;
}
function orderedActive() {
  const cmp = comparator(sortMode()), act = S.lists.filter(l => !l.archived);
  return [...act.filter(l => l.pinned).sort(cmp), ...act.filter(l => !l.pinned).sort(cmp)];
}

// Da un `order` único (en el orden que se ve ahora) a las listas activas; se usa al pasar a manual y al reordenar.
async function seedOrder(act = orderedActive()) {
  act.forEach((l, i) => { l.order = i; });
  await db.commit({ put: { lists: act } });
}
async function normalizeOrder() {
  const orders = S.lists.filter(l => !l.archived).map(l => l.order);
  if (orders.every(o => Number.isFinite(o)) && new Set(orders).size === orders.length) return;
  await seedOrder();
}

async function moveList(id, dir) {
  await normalizeOrder();
  const l = S.lists.find(x => x.id === id);
  const peers = orderedActive().filter(x => !!x.pinned === !!l.pinned);
  const other = peers[peers.indexOf(l) + dir];
  if (!other) return;
  [l.order, other.order] = [other.order, l.order];
  await db.commit({ put: { lists: [l, other] } });
}

function listCard(l, archived = false, pos = null) {
  const p = progress(l);
  const meta = archived ? `<small class="muted">Finalizada el ${dshort(l.archived)}</small>`
    : isDone(l) ? '<small class="pos">Lista para finalizar</small>' : dueSummary(l);
  const card = `
    <button class="card list-card ${archived ? 'compact' : ''}" style="--c:var(--${l.color})" data-act="open-list" data-id="${l.id}">
      <span class="lc-top"><b>${l.pinned ? `<span class="pin-mark">${icon('pin')}</span>` : ''}${esc(l.name)}</b><small>${p.done}/${p.total}</small></span>
      ${archived ? '' : `<span class="bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></i></span>`}
      ${meta}
    </button>`;
  if (archived) return card;
  const manual = sortMode() === 'manual';
  return `<div class="list-row">${card}<div class="list-tools">
    ${manual ? `<button class="icon sm" data-act="list-up" data-id="${l.id}" aria-label="Subir ${esc(l.name)}" ${pos?.first ? 'disabled' : ''}>${icon('up')}</button>
      <button class="icon sm" data-act="list-down" data-id="${l.id}" aria-label="Bajar ${esc(l.name)}" ${pos?.last ? 'disabled' : ''}>${icon('down')}</button>` : ''}
    <button class="icon sm ${l.pinned ? 'on' : ''}" data-act="list-pin" data-id="${l.id}" aria-pressed="${!!l.pinned}" aria-label="${l.pinned ? 'Quitar de fijadas' : 'Fijar'} ${esc(l.name)}">${icon('pin')}</button></div></div>`;
}

function listsOverview() {
  const active = orderedActive();
  const late = S.templates.filter(t => dueInfo(t)?.late);

  if (!active.length && !late.length) {
    return `<div class="card empty"><p>No tienes listas activas.</p>
      <small>${S.templates.length ? 'Crea una a partir de una de tus plantillas o una lista vacía.' : 'Empieza creando una plantilla con lo que repites seguido, o una lista vacía.'}</small>
      <button class="btn primary" data-act="new-list">Crear una lista</button>
      ${S.templates.length ? '' : '<button class="btn" data-act="new-tpl">Crear una plantilla</button>'}</div>`;
  }
  const peers = l => active.filter(x => !!x.pinned === !!l.pinned);
  const mode = sortMode();
  return `
    ${late.map(t => `
      <section class="card alert due" style="--c:var(--${t.color})">
        <div><b>${esc(t.name)}</b><br><small class="warn">Ya toca (${freqOf(t)[1].toLowerCase()})</small></div>
        <button class="btn primary sm" data-act="use-tpl" data-id="${t.id}">Crear lista</button>
      </section>`).join('')}
    ${active.length > 1 ? `<div class="sortbar"><small class="muted">Orden</small><div class="seg small" role="tablist">${SORTS.map(([k, name]) =>
      `<button class="${k === mode ? 'on' : ''}" data-act="list-order" data-mode="${k}">${name}</button>`).join('')}</div></div>` : ''}
    ${active.map(l => { const ps = peers(l); return listCard(l, false, { first: ps[0] === l, last: ps.at(-1) === l }); }).join('')}`;
}

// Listas finalizadas, de la más reciente a la más antigua.
function archiveView() {
  const all = S.lists.filter(l => l.archived).sort((a, b) => b.archived.localeCompare(a.archived) || byNewest(a, b));
  if (!all.length) return '<div class="card empty"><p>Aquí aparecen las listas que finalices.</p><small>Cuando marques todo, la lista muestra el botón «Finalizar lista» y se guarda en el archivo.</small></div>';
  const shown = all.slice(0, S.listLimit), left = all.length - shown.length;
  return `${shown.map(l => listCard(l, true)).join('')}
    ${left > 0 ? `<button class="btn ghost block" data-act="more-lists">Ver más (${Math.min(10, left)} de ${left} restantes)</button>` : ''}`;
}

// Fila de una tarea con fecha: casilla para marcarla, y el texto abre su lista (la usan Inicio y la Agenda).
export function taskRow(list, item) {
  const m = metaOf(item);
  return `
    <div class="trow">
      <button class="chk" data-act="agenda-toggle" data-list="${list.id}" data-id="${item.id}" aria-label="Marcar como hecha: ${esc(item.text)}"><span></span></button>
      <button class="t-main" data-act="agenda-open" data-list="${list.id}">
        <span class="t-text">${esc(item.text)}</span>
        <small class="${m?.cls ?? 'muted'}">${m ? esc(m.text) + ' · ' : ''}${esc(list.name)}</small>
      </button>
    </div>`;
}

// Agenda: todas las tareas pendientes con fecha límite de las listas activas, agrupadas por cuándo vencen.
function agendaView() {
  const T = today(), tomorrow = addDays(T, 1), week = addDays(T, 7);
  const all = S.lists.filter(l => !l.archived).flatMap(l => real(l).filter(i => !i.done && i.due).map(i => ({ list: l, item: i })))
    .sort((a, b) => a.item.due.localeCompare(b.item.due) || a.list.created.localeCompare(b.list.created));
  if (!all.length) {
    return `<div class="card empty"><p>No hay tareas con fecha.</p><small>Toca el icono de calendario de un elemento de cualquier lista para ponerle una fecha límite y aquí las verás juntas.</small></div>`;
  }
  const buckets = [['Vencidas', e => e.item.due < T], ['Hoy', e => e.item.due === T], ['Mañana', e => e.item.due === tomorrow],
    ['Esta semana', e => e.item.due <= week], ['Más adelante', () => true]];
  const groups = buckets.map(() => []);
  for (const e of all) groups[buckets.findIndex(([, test]) => test(e))].push(e);
  return buckets.map(([name], i) => groups[i].length ? `
    <section class="today"><h3 class="overline ${i === 0 ? 'neg' : ''}">${name} <span class="count">${groups[i].length}</span></h3>
      <div class="trows card-rows">${groups[i].map(e => taskRow(e.list, e.item)).join('')}</div></section>` : '').join('');
}

export function listsView() {
  const archived = S.lists.filter(l => l.archived).length;
  const seg = `<div class="seg" role="tablist">${[['lists', 'Listas'], ['agenda', 'Agenda'], ['templates', 'Plantillas'], ['archive', 'Archivo']].map(([k, name]) =>
    `<button class="${k === S.listSub ? 'on' : ''}" data-act="list-sub" data-sub="${k}">${name}${k === 'archive' && archived ? ` <small>${archived}</small>` : ''}</button>`).join('')}</div>`;
  return seg + (S.listSub === 'templates' ? templatesView() : S.listSub === 'archive' ? archiveView() : S.listSub === 'agenda' ? agendaView() : listsOverview());
}

// ---------- detalle de una lista ----------
// Los elementos hechos bajan al final de su sección (por orden en que se marcaron); los pendientes conservan su orden.
// El orden guardado no cambia: al desmarcar, el elemento vuelve a su lugar.
function sink(items, byDue = false) {
  let pending = items.filter(i => !i.done);
  if (byDue) pending = [...pending.filter(i => i.due).sort((a, b) => a.due.localeCompare(b.due)), ...pending.filter(i => !i.due)];
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
    `${sec.head ? `<h2 class="slot-h">${esc(sec.head.text)}</h2>` : ''}<div class="li-list">${sink(sec.items, l.sortDue).map(i => itemRow(i, mode)).join('')}</div>`).join('');
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
  async 'list-order'(el) {
    const before = orderedActive(); // lo que se ve ahora
    S.settings.listSort = el.dataset.mode;
    // La primera vez que se usa el modo manual arranca desde el orden que se estaba viendo; después se respeta lo que acomodaste.
    if (el.dataset.mode === 'manual' && !S.settings.listManualSeeded) { await seedOrder(before); S.settings.listManualSeeded = true; }
    await saveSettings();
  },
  async 'list-pin'(el) {
    const l = S.lists.find(x => x.id === el.dataset.id);
    if (l.pinned) delete l.pinned; else l.pinned = true;
    await saveList(l);
  },
  'list-up': el => moveList(el.dataset.id, -1),
  'list-down': el => moveList(el.dataset.id, 1),
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
