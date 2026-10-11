import * as db from './db.js';
import { $, esc, uid, ymd, fmtDateY, norm, byName, byText, toast, pl } from './util.js';
import { S, saveNoteGroup, saveNote } from './state.js';
import { modal } from './ui.js';
import { icon, NOTE_ICONS } from './icons.js';
import { COLORS } from './habits.js';

// Un grupo de notas define sus propios campos; cada nota tiene un título fijo y un valor por campo.
// Tipos de campo: [clave, nombre].
export const FIELD_TYPES = [
  ['text', 'Texto corto'], ['long', 'Texto largo'], ['code', 'Código o comando'], ['url', 'Enlace'], ['number', 'Número'],
  ['date', 'Fecha'], ['choice', 'Opciones'], ['check', 'Casilla (sí/no)'], ['rating', 'Calificación (1–5)'],
];
const PAGE = 40;

// Grupos de ejemplo para empezar; se pueden cambiar a gusto después.
const f = (name, type, extra = {}) => ({ id: uid(), name, type, ...extra });
const PRESETS = [
  ['links', 'Enlaces', 'link', 'blue', () => [f('Enlace', 'url', { list: true }), f('Descripción', 'long')]],
  ['cmds', 'Comandos', 'terminal', 'green', () => [f('Comando', 'code', { list: true }), f('Plataforma', 'text', { list: true }), f('Qué hace', 'long')]],
  ['books', 'Libros', 'book', 'peach', () => [
    f('Autor', 'text', { list: true }), f('Estado', 'choice', { list: true, options: ['Por leer', 'Leyendo', 'Leído'] }),
    f('Calificación', 'rating', { list: true }), f('Notas', 'long')]],
  ['free', 'Notas libres', 'note', 'mauve', () => [f('Contenido', 'long')]],
];

export const currentGroup = () => S.noteGroups.find(g => g.id === S.noteGroup) ?? null;
const groupNotes = g => S.notes.filter(n => n.group === g.id);
const fieldsOf = g => g.fields ?? [];

// ---------- valores ----------
const val = (n, fl) => n.values?.[fl.id];
const has = (fl, v) => {
  if (v === undefined || v === null || v === '') return false;
  if (fl.type === 'check') return v === true;
  if (fl.type === 'rating') return Number(v) >= 1;
  return true;
};

// Solo se abren enlaces http(s): un `javascript:` pegado en una nota nunca se vuelve clicable.
export function safeUrl(v) {
  try { const u = new URL(String(v).trim()); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}
// Si escribes «ejemplo.com/pagina» se guarda con https://; cualquier otro esquema se deja tal cual (y no se enlaza).
const normUrl = v => {
  v = v.trim();
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return /^[^\s/]+\.[^\s]+/.test(v) ? 'https://' + v : v;
};
const host = v => { const u = safeUrl(v); return u ? new URL(u).hostname.replace(/^www\./, '') : String(v); };
const stars = n => `<span class="stars-ro" aria-label="${n} de 5">${[1, 2, 3, 4, 5].map(i => `<span class="star ${i <= n ? 'on' : ''}">${icon('star')}</span>`).join('')}</span>`;
const rate = v => Math.min(5, Math.max(0, Math.round(Number(v)) || 0));

// Texto corto de un valor, para la lista.
function short(fl, v) {
  switch (fl.type) {
    case 'url': return host(v);
    case 'number': return Number.isFinite(+v) ? (+v).toLocaleString('es-GT') : String(v);
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDateY(v) : String(v);
    case 'check': return fl.name;
    case 'rating': return `${rate(v)}/5`;
    default: return String(v).split('\n')[0];
  }
}

// Valor completo, para el detalle de la nota.
function full(n, fl, v) {
  switch (fl.type) {
    case 'long': return `<div class="pre-wrap">${esc(v)}</div>`;
    case 'code': return `<div class="code-wrap"><pre class="code">${esc(v)}</pre>
      <button type="button" class="btn sm" data-act="note-copy" data-id="${n.id}" data-f="${fl.id}">${icon('copy')} Copiar</button></div>`;
    case 'url': { const u = safeUrl(v); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v); }
    case 'rating': return stars(rate(v));
    case 'check': return `${icon('check')} Sí`;
    default: return esc(short(fl, v));
  }
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = document.createElement('textarea'); // respaldo para navegadores sin permiso de portapapeles
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0';
    (document.querySelector('dialog[open]') ?? document.body).append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* sin respaldo posible */ }
    ta.remove();
  }
  toast('Copiado');
}

// ---------- vistas ----------
export function notesHome() {
  if (!S.noteGroups.length) {
    return `<div class="card empty"><p>Aún no tienes grupos de notas.</p>
      <small>Un grupo es una colección con sus propios campos: enlaces guardados, comandos, libros, recetas… Tú decides qué datos lleva cada nota.</small>
      <button class="btn primary" data-act="new-ngroup">Crear el primer grupo</button></div>`;
  }
  const counts = new Map();
  S.notes.forEach(n => counts.set(n.group, (counts.get(n.group) ?? 0) + 1));
  return S.noteGroups.map(g => `
    <button class="card ngroup" style="--c:var(--${g.color})" data-act="open-ngroup" data-id="${g.id}">
      <span class="h-ic">${icon(NOTE_ICONS.includes(g.icon) ? g.icon : NOTE_ICONS[0])}</span>
      <span class="ng-main"><b>${esc(g.name)}</b><small>${pl(counts.get(g.id) ?? 0, 'nota')}</small></span>
    </button>`).join('');
}

// Notas del grupo que cumplen la etiqueta y la búsqueda actuales, de la más reciente a la más antigua.
function visible(g) {
  const terms = norm(S.noteSearch).split(/\s+/).filter(Boolean);
  const tag = S.noteTag.toLowerCase();
  return groupNotes(g)
    .filter(n => !tag || n.tags.some(t => t.toLowerCase() === tag))
    .filter(n => {
      if (!terms.length) return true;
      const hay = norm([n.title, ...n.tags, ...fieldsOf(g).map(fl => (has(fl, val(n, fl)) ? short(fl, val(n, fl)) + ' ' + (fl.type === 'long' || fl.type === 'code' ? val(n, fl) : '') : ''))].join(' '));
      return terms.every(t => hay.includes(t));
    })
    .sort(g.sort === 'alpha' ? (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true }) : (a, b) => b.updated - a.updated);
}

function noteRow(g, n) {
  const sum = fieldsOf(g).filter(fl => fl.list && has(fl, val(n, fl))).map(fl => short(fl, val(n, fl)));
  const url = fieldsOf(g).find(fl => fl.type === 'url' && safeUrl(val(n, fl) ?? ''));
  const code = fieldsOf(g).find(fl => fl.type === 'code' && has(fl, val(n, fl)));
  const quick = url ? `<a class="icon" href="${esc(safeUrl(val(n, url)))}" target="_blank" rel="noopener noreferrer" aria-label="Abrir enlace de ${esc(n.title)}">${icon('link')}</a>`
    : code ? `<button class="icon" data-act="note-copy" data-id="${n.id}" data-f="${code.id}" aria-label="Copiar ${esc(code.name.toLowerCase())} de ${esc(n.title)}">${icon('copy')}</button>` : '';
  return `
    <li class="note-row">
      <button class="card note" data-act="open-note" data-id="${n.id}">
        <b>${esc(n.title)}</b>
        ${sum.length ? `<span class="n-sum">${esc(sum.join(' · '))}</span>` : ''}
        ${n.tags.length ? `<span class="n-sum tag">${esc(n.tags.map(t => '#' + t).join(' '))}</span>` : ''}
      </button>${quick}
    </li>`;
}

export function noteList(g) {
  const all = visible(g), shown = all.slice(0, S.noteLimit), left = all.length - shown.length;
  if (!all.length) {
    return groupNotes(g).length
      ? '<div class="card empty"><p>No hay notas que coincidan.</p></div>'
      : `<div class="card empty"><p>Aún no hay notas en este grupo.</p><button class="btn primary" data-act="new-note">Crear la primera</button></div>`;
  }
  return `<ul class="note-list">${shown.map(n => noteRow(g, n)).join('')}</ul>
    ${left > 0 ? `<button class="btn ghost block" data-act="more-notes">Ver más (${Math.min(PAGE, left)} de ${left} restantes)</button>` : ''}`;
}

export function groupView(g) {
  const tags = [...new Set(groupNotes(g).flatMap(n => n.tags))].sort(byText);
  if (S.noteTag && !tags.some(t => t.toLowerCase() === S.noteTag.toLowerCase())) S.noteTag = '';
  return `
    <div class="note-bar">
      <input type="search" id="nsearch" class="search" placeholder="Buscar en ${esc(g.name)}…" value="${esc(S.noteSearch)}" autocomplete="off">
      <button class="icon" data-act="edit-ngroup" aria-label="Configurar el grupo ${esc(g.name)}">${icon('sliders')}</button>
    </div>
    ${tags.length ? `<div class="chips">${tags.map(t => `<button class="chip-tag ${t.toLowerCase() === S.noteTag.toLowerCase() ? 'on' : ''}" data-act="note-tag" data-tag="${esc(t)}" aria-pressed="${t.toLowerCase() === S.noteTag.toLowerCase()}">#${esc(t)}</button>`).join('')}</div>` : ''}
    <div id="nlist">${noteList(g)}</div>`;
}

// La búsqueda solo repinta la lista para no perder el foco del campo.
export function onSearch(text) {
  const g = currentGroup();
  if (!g) return;
  S.noteSearch = text;
  S.noteLimit = PAGE;
  $('#nlist').innerHTML = noteList(g);
}

// ---------- detalle y formulario de una nota ----------
function noteDetail(n) {
  const g = currentGroup();
  const rows = fieldsOf(g).filter(fl => has(fl, val(n, fl))).map(fl => `<div><dt>${esc(fl.name)}</dt><dd>${full(n, fl, val(n, fl))}</dd></div>`).join('');
  modal(n.title, `
    ${rows ? `<dl class="note-fields">${rows}</dl>` : '<p class="muted">Esta nota solo tiene título.</p>'}
    ${n.tags.length ? `<div class="chips">${n.tags.map(t => `<span class="chip-tag static">#${esc(t)}</span>`).join('')}</div>` : ''}
    <small class="muted">${esc(g.name)} · actualizada el ${fmtDateY(ymd(new Date(n.updated)))}</small>
    <button type="button" class="btn primary block" data-act="note-edit" data-id="${n.id}">${icon('edit')} Editar</button>`);
}

function fieldInput(fl, v) {
  const nm = `f_${fl.id}`, label = esc(fl.name);
  switch (fl.type) {
    case 'long': return `<label>${label} <textarea name="${nm}" rows="4" maxlength="5000">${esc(v ?? '')}</textarea></label>`;
    case 'code': return `<label>${label} <textarea class="code-in" name="${nm}" rows="3" maxlength="5000" spellcheck="false" autocapitalize="none" autocomplete="off">${esc(v ?? '')}</textarea></label>`;
    case 'url': return `<label>${label} <input name="${nm}" inputmode="url" autocapitalize="none" autocomplete="off" maxlength="500" placeholder="https://…" value="${esc(v ?? '')}"></label>`;
    case 'number': return `<label>${label} <input name="${nm}" type="number" step="any" inputmode="decimal" value="${v ?? ''}"></label>`;
    case 'date': return `<label>${label} <input name="${nm}" type="date" value="${esc(v ?? '')}"></label>`;
    case 'choice': {
      const opts = [...(fl.options ?? [])];
      if (v && !opts.includes(v)) opts.push(v); // un valor que ya no está en las opciones no se pierde al editar
      return `<label>${label} <select name="${nm}"><option value="">—</option>${opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    }
    case 'check': return `<label class="check"><input type="checkbox" name="${nm}" ${v === true ? 'checked' : ''}><span>${label}</span></label>`;
    case 'rating': {
      const r = rate(v);
      return `<div><small class="muted">${label}</small><div class="stars-in" role="group" aria-label="${label}">
        <input type="hidden" name="${nm}" value="${r}">
        ${[1, 2, 3, 4, 5].map(i => `<button type="button" class="star ${i <= r ? 'on' : ''}" data-star="${i}" aria-label="${i} de 5">${icon('star')}</button>`).join('')}</div></div>`;
    }
    default: return `<label>${label} <input name="${nm}" maxlength="200" value="${esc(v ?? '')}"></label>`;
  }
}

// «a, #b ,A» -> ['a', 'b'] (sin repetir, sin importar mayúsculas)
const parseTags = s => {
  const seen = new Set();
  return s.split(',').map(t => t.trim().replace(/^#+/, '').trim()).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 12);
};

function noteForm(g, n) {
  const allTags = [...new Set(groupNotes(g).flatMap(x => x.tags))].sort(byText);
  modal(n ? 'Editar nota' : `Nueva nota en ${g.name}`, `
    <label>Título <input name="title" required maxlength="120" value="${esc(n?.title ?? '')}" placeholder="Ej. ${esc(g.name)}…"></label>
    ${fieldsOf(g).map(fl => fieldInput(fl, n ? val(n, fl) : undefined)).join('')}
    <label>Etiquetas (separadas por coma, opcional) <input name="tags" maxlength="120" list="ntags" autocomplete="off" value="${esc((n?.tags ?? []).join(', '))}">
      <datalist id="ntags">${allTags.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>`, {
    afterOpen(form) {
      // Calificación: tocar una estrella la fija; tocar la misma otra vez la quita.
      form.addEventListener('click', e => {
        const b = e.target.closest('[data-star]');
        if (!b) return;
        const box = b.parentElement, input = box.querySelector('input'), v = +b.dataset.star;
        input.value = +input.value === v ? 0 : v;
        box.querySelectorAll('[data-star]').forEach(s => s.classList.toggle('on', +s.dataset.star <= +input.value));
      });
      if (!n) form.elements.title.focus();
    },
    async onSubmit(fd) {
      const title = fd.get('title').trim();
      if (!title) { alert('La nota necesita un título.'); return false; }
      const values = {};
      for (const fl of fieldsOf(g)) {
        const raw = fd.get(`f_${fl.id}`);
        let v;
        if (fl.type === 'check') v = raw === 'on';
        else if (fl.type === 'rating') v = rate(raw);
        else if (fl.type === 'number') v = raw === '' || raw === null || !Number.isFinite(+raw) ? undefined : +raw;
        else if (fl.type === 'url') v = normUrl(raw ?? '');
        else v = (raw ?? '').trim();
        if (has(fl, v)) values[fl.id] = v;
      }
      const now = Date.now(), tags = parseTags(fd.get('tags'));
      if (n) Object.assign(n, { title, values, tags, updated: now });
      else S.notes.push(n = { id: uid(), group: g.id, title, values, tags, created: now, updated: now });
      await saveNote(n);
    },
    onDelete: n && (async () => {
      S.notes = S.notes.filter(x => x.id !== n.id);
      await db.commit({ remove: { notes: [n.id] } });
    }),
  });
}

// ---------- formulario de un grupo (nombre, icono, color y campos) ----------
function groupForm(g) {
  const st = g
    ? { name: g.name, fields: fieldsOf(g).map(x => ({ ...x, options: [...(x.options ?? [])] })) }
    : { name: '', fields: [] };
  const color = g?.color ?? 'mauve', ic = g && NOTE_ICONS.includes(g.icon) ? g.icon : NOTE_ICONS[0];
  const typeOpts = t => FIELD_TYPES.map(([k, name]) => `<option value="${k}" ${k === t ? 'selected' : ''}>${name}</option>`).join('');

  modal(g ? 'Configurar grupo' : 'Nuevo grupo de notas', `
    ${g ? '' : `<label>Empezar con
      <select name="preset"><option value="">Grupo en blanco</option>${PRESETS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('')}</select></label>`}
    <label>Nombre del grupo <input name="name" required maxlength="40" value="${esc(st.name)}" placeholder="Ej. Enlaces, Comandos, Libros…"></label>
    <label>Orden de las notas
      <select name="sort"><option value="recent" ${g?.sort === 'alpha' ? '' : 'selected'}>Más recientes primero</option>
        <option value="alpha" ${g?.sort === 'alpha' ? 'selected' : ''}>Alfabético por título</option></select></label>
    <div><small class="muted">Icono</small>
      <div class="icon-grid" role="radiogroup" aria-label="Icono">
        ${NOTE_ICONS.map(n => `<label><input type="radio" name="icon" value="${n}" ${n === ic ? 'checked' : ''} aria-label="${n}"><span>${icon(n)}</span></label>`).join('')}
      </div></div>
    <div><small class="muted">Color</small>
      <div class="swatches" role="radiogroup" aria-label="Color">
        ${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--c:var(--${c})"></span></label>`).join('')}
      </div></div>
    <div><small class="muted">Campos de cada nota</small>
      <p class="muted note">Toda nota tiene un título; aquí eliges qué más lleva. «En la lista» muestra ese dato debajo del título.</p>
      <div id="fields" class="fields-ed"></div>
      <button type="button" class="btn sm" id="addf">${icon('plus')} Agregar campo</button></div>`, {
    afterOpen(form) {
      const box = form.querySelector('#fields');
      const paint = () => {
        box.innerHTML = st.fields.length ? st.fields.map((fl, i) => `
          <div class="frow" data-i="${i}">
            <input data-k="name" maxlength="30" value="${esc(fl.name)}" placeholder="Nombre del campo" aria-label="Nombre del campo ${i + 1}">
            <select data-k="type" aria-label="Tipo del campo ${i + 1}">${typeOpts(fl.type)}</select>
            ${fl.type === 'choice' ? `<input data-k="options" maxlength="200" value="${esc((fl.options ?? []).join(', '))}" placeholder="Opciones separadas por coma" aria-label="Opciones del campo ${i + 1}">` : ''}
            <div class="frow-tools">
              <label class="check"><input type="checkbox" data-k="list" ${fl.list ? 'checked' : ''}><span>En la lista</span></label>
              <button type="button" class="icon sm" data-mv="-1" aria-label="Subir campo ${i + 1}" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
              <button type="button" class="icon sm" data-mv="1" aria-label="Bajar campo ${i + 1}" ${i === st.fields.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
              <button type="button" class="icon sm" data-rm aria-label="Quitar campo ${i + 1}">${icon('close')}</button>
            </div>
          </div>`).join('') : '<p class="muted">Sin campos: las notas solo tendrán título.</p>';
      };
      box.addEventListener('input', e => {
        const k = e.target.dataset.k, i = +e.target.closest('.frow')?.dataset.i;
        if (!k || Number.isNaN(i)) return;
        if (k === 'name') st.fields[i].name = e.target.value;
        else if (k === 'options') st.fields[i].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
      });
      box.addEventListener('change', e => {
        const k = e.target.dataset.k, i = +e.target.closest('.frow')?.dataset.i;
        if (k === 'type') { st.fields[i].type = e.target.value; if (e.target.value === 'choice') st.fields[i].options ??= []; paint(); }
        else if (k === 'list') st.fields[i].list = e.target.checked;
      });
      box.addEventListener('click', e => {
        const row = e.target.closest('.frow'), i = +row?.dataset.i, b = e.target.closest('button');
        if (!b || !row) return;
        if (b.dataset.mv) {
          const j = i + +b.dataset.mv;
          if (st.fields[j]) { [st.fields[i], st.fields[j]] = [st.fields[j], st.fields[i]]; paint(); }
        } else if ('rm' in b.dataset) { st.fields.splice(i, 1); paint(); }
      });
      form.querySelector('#addf').onclick = () => { st.fields.push(f('', 'text')); paint(); box.querySelector('.frow:last-child input')?.focus(); };
      // Al elegir un grupo de ejemplo se rellenan nombre, icono, color y campos (el nombre solo si no lo has escrito tú).
      let named = false;
      form.elements.name.addEventListener('input', () => { named = true; });
      form.elements.preset?.addEventListener('change', () => {
        const p = PRESETS.find(x => x[0] === form.elements.preset.value);
        st.fields = p ? p[4]() : [];
        if (p) {
          if (!named) form.elements.name.value = p[1];
          form.querySelector(`input[name=icon][value=${p[2]}]`).checked = true;
          form.querySelector(`input[name=color][value=${p[3]}]`).checked = true;
        }
        paint();
      });
      paint();
    },
    async onSubmit(fd) {
      const name = fd.get('name').trim();
      if (!name) return false;
      const fields = st.fields.map(x => ({ ...x, name: x.name.trim(), options: (x.options ?? []).filter(Boolean) }));
      if (fields.some(x => !x.name)) { alert('Todos los campos necesitan un nombre.'); return false; }
      if (fields.some(x => x.type === 'choice' && !x.options.length)) { alert('Escribe las opciones de cada campo de tipo «Opciones».'); return false; }
      const clean = fields.map(({ id, name: nm, type, list, options }) => ({ id, name: nm, type, ...(list ? { list: true } : {}), ...(type === 'choice' ? { options } : {}) }));
      const data = { name, color: fd.get('color'), icon: fd.get('icon'), fields: clean, ...(fd.get('sort') === 'alpha' ? { sort: 'alpha' } : {}) };
      if (g) {
        // Los datos de los campos que se quitaron se borran de las notas.
        const gone = fieldsOf(g).filter(old => !clean.some(x => x.id === old.id)).map(x => x.id);
        delete g.sort;
        Object.assign(g, data);
        const touched = gone.length ? groupNotes(g).filter(n => gone.some(id => id in n.values)) : [];
        touched.forEach(n => gone.forEach(id => delete n.values[id]));
        await db.commit({ put: { noteGroups: [g], ...(touched.length ? { notes: touched } : {}) } });
        S.noteGroups.sort(byName);
      } else {
        const ng = { id: uid(), ...data };
        S.noteGroups.push(ng);
        await saveNoteGroup(ng);
        openGroup(ng.id); // el grupo nuevo se abre listo para llenarlo
      }
    },
    onDelete: g && (async () => {
      const ids = groupNotes(g).map(n => n.id);
      S.noteGroups = S.noteGroups.filter(x => x.id !== g.id);
      S.notes = S.notes.filter(n => n.group !== g.id);
      S.noteGroup = null;
      await db.commit({ remove: { noteGroups: [g.id], notes: ids } });
    }),
    confirmText: g ? `¿Eliminar el grupo «${g.name}»${groupNotes(g).length ? ` y sus ${pl(groupNotes(g).length, 'nota')}` : ''}? Esta acción no se puede deshacer.` : undefined,
  });
}

function openGroup(id) {
  S.noteGroup = id;
  S.noteSearch = '';
  S.noteTag = '';
  S.noteLimit = PAGE;
  window.scrollTo(0, 0);
}

export const actions = {
  'new-ngroup': () => groupForm(),
  'edit-ngroup': () => groupForm(currentGroup()),
  'open-ngroup': el => openGroup(el.dataset.id),
  'note-back': () => { S.noteGroup = null; },
  'new-note': () => noteForm(currentGroup()),
  'open-note': el => noteDetail(S.notes.find(n => n.id === el.dataset.id)),
  'note-edit': el => { const n = S.notes.find(x => x.id === el.dataset.id); noteForm(S.noteGroups.find(g => g.id === n.group), n); },
  'note-tag': el => { S.noteTag = S.noteTag.toLowerCase() === el.dataset.tag.toLowerCase() ? '' : el.dataset.tag; S.noteLimit = PAGE; },
  'more-notes': () => { S.noteLimit += PAGE; },
  async 'note-copy'(el) {
    const n = S.notes.find(x => x.id === el.dataset.id);
    const v = n?.values?.[el.dataset.f];
    if (v) await copyText(String(v));
  },
};
