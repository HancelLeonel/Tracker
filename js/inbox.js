import * as db from './db.js';
import { $, esc, uid, toast, pl } from './util.js';
import { S, saveInbox, saveNote, saveList, saveSettings } from './state.js';
import { modal } from './ui.js';
import { icon } from './icons.js';
import { safeUrl } from './notes.js';

// Bandeja de notas rápidas (Inicio): se anota algo al vuelo y después se archiva donde corresponde
// (una nota de un grupo de Notas o un elemento de una lista) o se elimina.
const SHOWN = 5;

const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

export const quickNoteForm = () => `
  <form class="quick-note" data-noform>
    <input name="text" id="qn-new" maxlength="2000" placeholder="Nota rápida…" autocomplete="off" enterkeyhint="done" aria-label="Nota rápida">
    <button class="btn" data-act="qn-add" aria-label="Guardar nota rápida">${icon('plus')}</button>
  </form>`;

// Selección de varias notas rápidas (para archivarlas o eliminarlas juntas): un Set de ids, o null fuera de ese modo.
const picking = () => S.inboxSel instanceof Set;

export function inboxSection() {
  if (!S.inbox.length) { S.inboxSel = null; return ''; }
  const sel = picking() ? S.inboxSel : null;
  // Plegada por defecto (una línea con el conteo); se recuerda en `settings.collapsed.inboxOpen` (ajuste del dispositivo). Al seleccionar siempre se ve.
  if (!sel && !S.settings.collapsed?.inboxOpen) {
    return `<button class="inbox-fold" data-act="inbox-fold" aria-expanded="false"><span class="home-h">Bandeja</span><span class="muted">${pl(S.inbox.length, 'pendiente')}</span>${icon('right')}</button>`;
  }
  if (sel) [...sel].forEach(id => { if (!S.inbox.some(q => q.id === id)) sel.delete(id); });
  const shown = sel || S.inboxAll ? S.inbox : S.inbox.slice(0, SHOWN), extra = S.inbox.length - shown.length;
  const row = q => sel
    ? `<button class="qn pick ${sel.has(q.id) ? 'on' : ''}" data-act="qn-pick" data-id="${q.id}" aria-pressed="${sel.has(q.id)}">
        <span class="qn-box">${sel.has(q.id) ? icon('check') : ''}</span><span class="qn-body"><span class="qn-text">${esc(q.text)}</span><small class="muted">${ago(q.t)}</small></span></button>`
    : `<button class="qn" data-act="qn-open" data-id="${q.id}"><span class="qn-text">${esc(q.text)}</span><small class="muted">${ago(q.t)}</small></button>`;
  return `
    <section class="today inbox">
      <div class="inbox-h"><h3 class="home-h">Bandeja <span class="count">${S.inbox.length}</span></h3>
        ${sel ? '' : `<span class="inbox-tools">${S.inbox.length > 1 ? '<button class="btn ghost sm" data-act="qn-select">Seleccionar</button>' : ''}<button class="btn ghost sm" data-act="inbox-fold">Ocultar</button></span>`}</div>
      <div class="trows">${shown.map(row).join('')}</div>
      ${sel ? `<div class="qn-bar"><button class="btn sm ghost" data-act="qn-cancel">Cancelar</button><span class="spacer"></span>
          <button class="btn sm" data-act="qn-pick-all">${sel.size === S.inbox.length ? 'Ninguna' : 'Todas'}</button>
          <button class="btn sm primary" data-act="qn-batch" ${sel.size ? '' : 'disabled'} aria-label="Archivar ${pl(sel.size, 'nota seleccionada', 'notas seleccionadas')}">Archivar (${sel.size})</button></div>`
        : extra > 0 ? `<button class="btn ghost block" data-act="qn-more">Ver ${extra} más</button>`
        : S.inboxAll && S.inbox.length > SHOWN ? '<button class="btn ghost block" data-act="qn-less">Ver menos</button>' : ''}
    </section>`;
}

// Tras repintar, devuelve el foco al campo para seguir anotando.
export function restoreFocus() {
  if (!S.focusQn) return;
  S.focusQn = false;
  $('#qn-new')?.focus();
}

// ---------- archivar ----------
const oneLine = s => s.replace(/\s+/g, ' ').trim();
const hostOf = u => new URL(u).hostname.replace(/^www\./, '');

// Título sugerido: la primera línea (o el dominio si es solo un enlace).
function suggestTitle(text) {
  const first = text.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const u = safeUrl(first);
  return (u ? hostOf(u) : first).slice(0, 120);
}

// Arma la nota para un grupo sin perder nada del texto: el enlace va al campo de enlace (si hay), el resto al primer campo de
// texto largo/corto/código. Devuelve { error } si el grupo no tiene dónde guardar lo que no cabe en el título.
function noteFor(g, title, text) {
  const fields = g.fields ?? [];
  const values = {};
  const url = text.match(URL_RE)?.[0];
  const urlField = url && fields.find(f => f.type === 'url');
  if (urlField) values[urlField.id] = url;
  const rest = urlField && text.trim() === url ? '' : text.trim();
  if (rest && rest !== title) {
    const body = fields.find(f => f.type === 'long') ?? fields.find(f => f.type === 'markdown') ?? fields.find(f => f.type === 'text') ?? fields.find(f => f.type === 'code');
    if (!body) return { error: 'Ese grupo no tiene un campo de texto para guardar el resto de la nota. Elige otro grupo o agrega un campo en su configuración.' };
    values[body.id] = rest;
  }
  const now = Date.now();
  return { note: { id: uid(), group: g.id, title, values, tags: [], created: now, updated: now } };
}

// Grupo sugerido: si lo que se archiva trae enlaces, el primer grupo con campo de enlace; si no, el primero.
const URL_RE = /https?:\/\/[^\s<>"']+/i;
function suggestGroup(texts) {
  const g = texts.some(t => URL_RE.test(t)) && S.noteGroups.find(x => (x.fields ?? []).some(f => f.type === 'url'));
  return (g || S.noteGroups[0])?.id ?? '';
}
const groupOptions = selected => S.noteGroups.map(g => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

function quickNoteModal(q) {
  const lists = S.lists.filter(l => !l.archived);
  modal('Nota rápida', `
    <label>Texto <textarea name="text" rows="4" maxlength="2000" required>${esc(q.text)}</textarea></label>
    <label>Qué hacer con ella
      <select name="dest">
        <option value="keep">Dejarla en la bandeja</option>
        <option value="note" ${S.noteGroups.length ? '' : 'disabled'}>Archivar como nota…</option>
        <option value="list" ${lists.length ? '' : 'disabled'}>Agregar a una lista…</option>
      </select></label>
    <div id="d-note" hidden class="stack">
      <label>Grupo de notas <select name="group">${groupOptions(suggestGroup([q.text]))}</select></label>
      <label>Título <input name="title" maxlength="120" value="${esc(suggestTitle(q.text))}"></label>
    </div>
    <label id="d-list" hidden>Lista <select name="list">${lists.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>
    ${S.noteGroups.length || lists.length ? '' : '<small class="muted">Crea un grupo en Notas o una lista para poder archivarla.</small>'}`, {
    submit: 'Aplicar',
    deleteLabel: 'Eliminar',
    confirmText: '¿Eliminar esta nota rápida?',
    afterOpen(f) {
      const sync = () => {
        f.querySelector('#d-note').hidden = f.elements.dest.value !== 'note';
        f.querySelector('#d-list').hidden = f.elements.dest.value !== 'list';
      };
      let titled = false;
      f.elements.title.addEventListener('input', () => { titled = true; });
      f.elements.text.addEventListener('input', () => { if (!titled) f.elements.title.value = suggestTitle(f.elements.text.value); });
      f.elements.dest.addEventListener('change', sync);
      sync();
    },
    async onSubmit(fd) {
      const text = fd.get('text').trim(), dest = fd.get('dest');
      if (!text) return false;
      if (dest === 'note') {
        const g = S.noteGroups.find(x => x.id === fd.get('group'));
        const title = fd.get('title').trim() || suggestTitle(text);
        const r = noteFor(g, title, text);
        if (r.error) { alert(r.error); return false; }
        S.notes.push(r.note);
        await saveNote(r.note);
        await remove(q);
        toast(`Archivada en ${g.name}`);
      } else if (dest === 'list') {
        const l = lists.find(x => x.id === fd.get('list'));
        l.items.push({ id: uid(), text: oneLine(text).slice(0, 200), done: false, extra: true });
        await saveList(l);
        await remove(q);
        toast(`Agregada a ${l.name}`);
      } else {
        q.text = text;
        await saveInbox(q);
      }
    },
    onDelete: () => remove(q),
  });
}

// Varias a la vez: todas como notas de un grupo, todas a una lista, o eliminarlas. Si alguna no cabe en el grupo elegido no se
// archiva ninguna (todo o nada, en una sola transacción).
function batchModal() {
  const picked = S.inbox.filter(q => S.inboxSel.has(q.id));
  if (!picked.length) return;
  const lists = S.lists.filter(l => !l.archived);
  modal(`Archivar ${pl(picked.length, 'nota rápida', 'notas rápidas')}`, `
    <label>Qué hacer con ellas
      <select name="dest">
        <option value="note" ${S.noteGroups.length ? '' : 'disabled'}>Archivarlas como notas…</option>
        <option value="list" ${lists.length ? '' : 'disabled'}>Agregarlas a una lista…</option>
        <option value="delete">Eliminarlas</option>
      </select></label>
    <div id="d-note" class="stack">
      <label>Grupo de notas <select name="group">${groupOptions(suggestGroup(picked.map(q => q.text)))}</select></label>
      <small class="muted">Cada una será una nota; su título es la primera línea (o el sitio, si es un enlace).</small>
    </div>
    <label id="d-list" hidden>Lista <select name="list">${lists.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>`, {
    submit: 'Aplicar',
    afterOpen(f) {
      const d = f.elements.dest;
      if (d.options[d.selectedIndex]?.disabled) d.value = [...d.options].find(o => !o.disabled).value;
      const sync = () => { f.querySelector('#d-note').hidden = d.value !== 'note'; f.querySelector('#d-list').hidden = d.value !== 'list'; };
      d.addEventListener('change', sync);
      sync();
    },
    async onSubmit(fd) {
      const dest = fd.get('dest'), ids = picked.map(q => q.id);
      if (dest === 'note') {
        const g = S.noteGroups.find(x => x.id === fd.get('group'));
        const made = picked.map(q => noteFor(g, suggestTitle(q.text) || 'Nota', q.text));
        const bad = made.find(r => r.error);
        if (bad) { alert(bad.error); return false; }
        S.notes.push(...made.map(r => r.note));
        await db.commit({ put: { notes: made.map(r => r.note) }, remove: { inbox: ids } });
        toast(`${pl(made.length, 'nota archivada', 'notas archivadas')} en ${g.name}`);
      } else if (dest === 'list') {
        const l = lists.find(x => x.id === fd.get('list'));
        picked.forEach(q => l.items.push({ id: uid(), text: oneLine(q.text).slice(0, 200), done: false, extra: true }));
        await db.commit({ put: { lists: [l] }, remove: { inbox: ids } });
        toast(`${pl(picked.length, 'agregada', 'agregadas')} a ${l.name}`);
      } else {
        if (!confirm(`¿Eliminar ${pl(picked.length, 'nota rápida', 'notas rápidas')}?`)) return false;
        await db.commit({ remove: { inbox: ids } });
        toast(pl(picked.length, 'nota eliminada', 'notas eliminadas'));
      }
      S.inbox = S.inbox.filter(q => !S.inboxSel.has(q.id));
      S.inboxSel = null;
    },
  });
}

async function remove(q) {
  S.inbox = S.inbox.filter(x => x.id !== q.id);
  await db.commit({ remove: { inbox: [q.id] } });
}

// Crea una nota rápida desde fuera (por ejemplo, lo que se comparte desde otra app).
export async function addQuick(text) {
  const q = { id: uid(), text: text.trim(), t: Date.now() };
  if (!q.text) return null;
  S.inbox.unshift(q);
  await saveInbox(q);
  return q;
}

export const actions = {
  async 'inbox-fold'() {
    const c = S.settings.collapsed ??= {};
    if (c.inboxOpen) delete c.inboxOpen; else c.inboxOpen = true;
    await saveSettings();
  },
  async 'qn-add'(el) {
    const input = el.closest('form').elements.text;
    S.focusQn = true; // el repintado devuelve el foco para seguir anotando
    await addQuick(input.value);
  },
  'qn-open': el => quickNoteModal(S.inbox.find(x => x.id === el.dataset.id)),
  'qn-more': () => { S.inboxAll = true; },
  'qn-select': () => { S.inboxSel = new Set(); },
  'qn-cancel': () => { S.inboxSel = null; },
  'qn-pick': el => { const s = S.inboxSel; if (s) { if (s.has(el.dataset.id)) s.delete(el.dataset.id); else s.add(el.dataset.id); } },
  'qn-pick-all': () => { const s = S.inboxSel; if (s) S.inboxSel = s.size === S.inbox.length ? new Set() : new Set(S.inbox.map(q => q.id)); },
  'qn-batch': () => { if (S.inboxSel?.size) batchModal(); },
  'qn-less': () => { S.inboxAll = false; },
};
