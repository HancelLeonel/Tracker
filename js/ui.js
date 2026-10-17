import * as db from './db.js';
import { $, esc, money, sum, toast, uid } from './util.js';
import { icon } from './icons.js';
import { S, hooks, isCredit, addFile, saveSettings, sortedKinds } from './state.js';

const dlg = $('#dlg');
const viewer = $('#viewer');
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
// Con el teclado abierto la hoja se encoge (ver `interactive-widget` en index.html): el campo enfocado se acerca al centro para que no quede tapado.
dlg.addEventListener('focusin', e => { if (e.target.matches('input, textarea, select')) setTimeout(() => e.target.isConnected && e.target.scrollIntoView({ block: 'center' }), 300); });
viewer.addEventListener('click', e => { if (e.target === viewer || e.target.closest('[data-close]')) viewer.close(); });

// URLs de vista previa creadas por el diálogo; se liberan al cerrarlo.
const urls = [];
dlg.addEventListener('close', () => urls.splice(0).forEach(u => URL.revokeObjectURL(u)));
viewer.addEventListener('close', () => { viewer.innerHTML = ''; });

// Fuente de la interfaz: 'system' (la del teléfono) o 'jetbrains' (JetBrains Mono, incluida en fonts/). También se guarda en
// localStorage para aplicarla desde el primer pintado (index.html), antes de que carguen los datos.
export function applyFont(name) {
  const f = name === 'jetbrains' ? 'jetbrains' : 'system';
  document.documentElement.dataset.font = f;
  try { localStorage.setItem('tracker-font', f); } catch { /* sin almacenamiento local: se aplica al abrir con los ajustes */ }
}

// Tema: 'dark', 'light' o 'auto' (sigue al sistema y cambia solo si el sistema cambia). En <html> queda el tema efectivo
// (data-theme="dark|light"); la preferencia se copia a localStorage para que index.html la aplique desde el primer pintado.
export const THEMES = ['dark', 'light', 'auto'];
const BARS = { dark: '#111317', light: '#f3f4f6' }; // color de la barra del sistema (theme-color), igual a --base
const lightMq = window.matchMedia?.('(prefers-color-scheme: light)');
let themePref = 'dark';
function paintTheme() {
  const eff = themePref === 'auto' ? (lightMq?.matches ? 'light' : 'dark') : themePref;
  document.documentElement.dataset.theme = eff;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', BARS[eff]);
}
lightMq?.addEventListener?.('change', () => { if (themePref === 'auto') paintTheme(); });
export function applyTheme(pref) {
  themePref = THEMES.includes(pref) ? pref : 'dark';
  paintTheme();
  try { localStorage.setItem('tracker-theme', themePref); } catch { /* sin almacenamiento local: se aplica al abrir con los ajustes */ }
}

export const isOpen = () => dlg.open || viewer.open;

// onSubmit puede devolver false para mantener el diálogo abierto.
export function modal(title, body, { submit = 'Guardar', onSubmit, onDelete, deleteLabel = 'Eliminar', confirmText = '¿Eliminar? Esta acción no se puede deshacer.', afterOpen } = {}) {
  if (dlg.open) dlg.close(); // permite abrir un formulario desde otro diálogo (p. ej. editar desde la lista de movimientos)
  dlg.innerHTML = `
    <form id="f" method="dialog">
      <h2>${esc(title)}</h2>
      ${body}
      <div class="actions">
        ${onDelete ? `<button type="button" class="btn danger" id="del">${esc(deleteLabel)}</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ${onSubmit ? 'ghost' : ''}" id="cancel">${onSubmit ? 'Cancelar' : 'Cerrar'}</button>
        ${onSubmit ? `<button class="btn primary">${esc(submit)}</button>` : ''}
      </div>
    </form>`;
  const f = $('#f', dlg);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if ((await onSubmit?.(new FormData(f))) === false) return;
    dlg.close();
    hooks.render();
  });
  $('#cancel', dlg).onclick = () => dlg.close();
  if (onDelete) $('#del', dlg).onclick = async () => {
    if (!confirm(confirmText)) return;
    await onDelete();
    dlg.close();
    hooks.render();
  };
  afterOpen?.(f);
  dlg.showModal();
}

// ---------- selector propio ----------
// El <select> nativo de Android abre una lista del sistema que no sigue el tema. Cada <select> de un diálogo se conserva (valor,
// `change`, validación, `f.elements.nombre`) pero queda invisible sobre un botón que abre una hoja inferior con el diseño de la app.
// `data-label` / `data-sub` de una <option> separan el nombre del monto en la lista; `syncSelect()` repinta el botón tras un cambio por código.
const picker = $('#picker');
picker.addEventListener('click', e => { if (e.target === picker) picker.close(); });
dlg.addEventListener('close', () => picker.close());

const plain = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function syncSelect(sel) {
  const btn = sel.parentElement?.querySelector('.sel-btn');
  if (!btn) return;
  const o = sel.options[sel.selectedIndex];
  btn.querySelector('.sel-t').textContent = o && !o.disabled && 'nest' in sel.dataset ? `${o.parentElement.label} · ${o.dataset.label ?? o.text}` : o?.text ?? '';
  btn.classList.toggle('ph', !!o?.disabled);
  btn.disabled = sel.disabled;
}

function openPicker(sel, title) {
  const optRow = o => {
    const on = o.value === sel.value;
    return `<button type="button" class="pk-o ${on ? 'on' : ''}" role="option" aria-selected="${on}" data-v="${esc(o.value)}" data-q="${esc(plain(o.text))}">
      <span class="pk-t">${esc(o.dataset.label ?? o.text)}</span>${o.dataset.sub ? `<small>${esc(o.dataset.sub)}</small>` : ''}${on ? icon('check') : ''}</button>`;
  };
  // Pinta una pantalla de la hoja. `back`: botón para volver a la lista de cuentas; `search`: buscador (muchas opciones).
  const paint = (head, body, { back = false, search = false } = {}) => {
    picker.innerHTML = `<div class="pk">
      <div class="pk-h">${back ? `<button type="button" class="icon" data-back aria-label="Volver a las cuentas">${icon('left')}</button>` : ''}<h2>${esc(head)}</h2></div>
      ${search ? '<input type="search" class="pk-q" placeholder="Buscar" autocomplete="off" aria-label="Buscar">' : ''}
      <div class="pk-list" role="listbox">${body || '<p class="muted">No hay opciones.</p>'}</div>
    </div>`;
    const list = $('.pk-list', picker);
    $('[data-back]', picker)?.addEventListener('click', showGroups);
    $('.pk-q', picker)?.addEventListener('input', e => {
      const q = plain(e.target.value.trim());
      list.querySelectorAll('.pk-o').forEach(b => { b.hidden = !!q && !b.dataset.q.includes(q); });
      list.querySelectorAll('.pk-g').forEach(g => {
        let n = g.nextElementSibling, any = false;
        while (n && !n.classList.contains('pk-g')) { any ||= !n.hidden; n = n.nextElementSibling; }
        g.hidden = !any;
      });
    });
    list.onclick = e => {
      const grp = e.target.closest('.pk-grp');
      if (grp) return showOptions(groups[+grp.dataset.g], true);
      const b = e.target.closest('.pk-o');
      if (!b) return;
      const changed = sel.value !== b.dataset.v;
      sel.value = b.dataset.v;
      picker.close();
      syncSelect(sel);
      if (changed) for (const type of ['input', 'change']) sel.dispatchEvent(new Event(type, { bubbles: true }));
      sel.parentElement.querySelector('.sel-btn')?.focus({ preventScroll: true });
    };
    return list;
  };

  // Selectores de cuenta/categoría (`data-nest`): primero se elige la cuenta y luego una categoría de esa cuenta.
  const groups = 'nest' in sel.dataset
    ? [...sel.querySelectorAll('optgroup')].map(g => ({ g, list: [...g.children].filter(o => !o.disabled) })).filter(x => x.list.length) : null;
  const showOptions = (grp, back) => {
    const list = paint(grp.g.label, grp.list.map(optRow).join(''), { back, search: grp.list.length > 12 });
    list.querySelector('.on')?.scrollIntoView({ block: 'center' });
  };
  const showGroups = () => paint(title && title !== 'Categoría' ? `${title}: elegir cuenta` : 'Elegir cuenta', groups.map((x, i) => {
    const cur = x.list.some(o => o.value === sel.value);
    return `<button type="button" class="pk-o pk-grp ${cur ? 'on' : ''}" data-g="${i}">
      <span class="pk-t">${esc(x.g.label)}</span>${x.g.dataset.sub ? `<small>${esc(x.g.dataset.sub)}</small>` : ''}${icon('right')}</button>`;
  }).join(''));

  if (groups?.length === 1) showOptions(groups[0], false);
  else if (groups) showGroups();
  else {
    const opts = [...sel.options].filter(o => !o.disabled);
    let group = null, rows = '';
    for (const o of opts) {
      const g = o.parentElement.label ?? '';
      if (g !== group) { group = g; if (g) rows += `<div class="pk-g overline">${esc(g)}</div>`; }
      rows += optRow(o);
    }
    paint(title || 'Elegir', rows, { search: opts.length > 12 });
  }
  picker.showModal();
  picker.querySelector('.pk-list .on')?.scrollIntoView({ block: 'center' });
}

function enhanceSelect(sel) {
  if (sel.dataset.pk || sel.multiple || sel.size > 1) return;
  sel.dataset.pk = '1';
  const wrap = document.createElement('span');
  wrap.className = 'sel';
  wrap.innerHTML = `<button type="button" class="sel-btn"><span class="sel-t"></span>${icon('down')}</button>`;
  sel.before(wrap);
  wrap.append(sel);
  sel.tabIndex = -1;
  const btn = $('.sel-btn', wrap);
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  btn.onclick = () => {
    const lab = sel.closest('label')?.cloneNode(true);
    lab?.querySelectorAll('.sel').forEach(x => x.remove());
    openPicker(sel, lab?.textContent.trim() || sel.getAttribute('aria-label'));
  };
  sel.addEventListener('change', () => syncSelect(sel));
  new MutationObserver(() => syncSelect(sel)).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected', 'disabled'] });
  syncSelect(sel);
}

// Los formularios se pintan (y repintan por filas) con innerHTML: se mejora cada <select> nuevo que aparezca en el diálogo.
new MutationObserver(() => dlg.querySelectorAll('select:not([data-pk])').forEach(enhanceSelect)).observe(dlg, { childList: true, subtree: true });

// ---------- selects ----------
// <select> con las categorías agrupadas por cuenta y su saldo. `bal(key)` devuelve el saldo a mostrar.
// opts: credit (incluir tarjetas), only (Set de claves permitidas), placeholder (texto si no hay selección).
export function catSelect(name, selected, bal, attrs = '', { credit = true, only = null, placeholder = '' } = {}) {
  const groups = S.accounts.filter(a => credit || !isCredit(a)).map(a => {
    const cats = a.cats.filter(c => !only || only.has(`${a.id}|${c.id}`));
    if (!cats.length) return '';
    const sub = isCredit(a) ? '' : `data-sub="${esc(money(sum(cats, c => bal(`${a.id}|${c.id}`))))}"`;
    return `
    <optgroup label="${esc(isCredit(a) ? a.name + ' (tarjeta)' : a.name)}" ${sub}>
      ${cats.map(c => {
        const k = `${a.id}|${c.id}`, b = bal(k);
        const text = isCredit(a) ? (b < 0 ? `Deuda ${money(-b)}` : `A favor ${money(b)}`) : `${c.name} · ${money(b)}`;
        const parts = isCredit(a) ? '' : `data-label="${esc(c.name)}" data-sub="${esc(money(b))}"`;
        return `<option value="${k}" ${parts} ${k === selected ? 'selected' : ''}>${esc(text)}</option>`;
      }).join('')}
    </optgroup>`;
  }).join('');
  const ph = placeholder ? `<option value="" disabled ${selected ? '' : 'selected'}>${esc(placeholder)}</option>` : '';
  return `<select name="${name}" data-nest ${attrs}>${ph}${groups}</select>`;
}

export function kindSelect(name, selected) {
  return `<select name="${name}">
    ${sortedKinds().map(t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
    <option value="__new">+ Nuevo tipo…</option></select>`;
}

// Hace que la opción «Nuevo tipo» del select cree el tipo al vuelo.
export function wireKindSelect(select) {
  let prev = select.value;
  select.addEventListener('change', async () => {
    if (select.value !== '__new') { prev = select.value; return; }
    const name = prompt('Nombre del nuevo tipo de gasto')?.trim();
    if (!name) { select.value = prev; syncSelect(select); return; }
    const t = { id: uid(), name };
    S.settings.types.push(t);
    await saveSettings();
    const opt = new Option(name, t.id);
    select.add(opt, select.options[select.options.length - 1]);
    select.value = t.id;
    syncSelect(select);
    prev = t.id;
  });
}

// ---------- archivos adjuntos ----------
const MAX_FILE = 10 * 1024 * 1024;

// Las imágenes se reducen a 1600 px y JPEG: una factura ocupa ~200 KB en vez de varios MB.
async function prepareFile(file) {
  if (file.type.startsWith('image/')) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close?.();
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      if (blob) return { blob, mime: 'image/jpeg', name: (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg' };
    } catch { /* si el navegador no puede decodificarla, se guarda tal cual */ }
  }
  if (file.size > MAX_FILE) throw new Error(`«${file.name}» pesa más de 10 MB.`);
  return { blob: file, mime: file.type || 'application/octet-stream', name: file.name };
}

export function fileSize(n) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

// Campo de adjuntos. `ids` es un arreglo que se modifica en sitio; el formulario lo lee al guardar.
export function mountAttach(el, ids) {
  const paint = () => {
    el.innerHTML = `
      <div class="chips">${ids.map(id => {
        const m = S.files.get(id);
        const thumb = m?.mime.startsWith('image/') ? `<img data-thumb="${id}" alt="">` : icon('file');
        return `<span class="chip"><button type="button" class="chip-open" data-open="${id}">${thumb}<span>${esc(m?.name ?? 'archivo')}</span></button>
          <button type="button" class="chip-x" data-rm="${id}" aria-label="Quitar">${icon('close')}</button></span>`;
      }).join('')}</div>
      <button type="button" class="btn sm" data-add>${icon('clip')} Adjuntar foto o archivo</button>`;
    el.querySelectorAll('img[data-thumb]').forEach(async img => {
      const rec = await db.get('files', img.dataset.thumb);
      if (rec) { const u = URL.createObjectURL(rec.blob); urls.push(u); img.src = u; }
    });
  };
  el.onclick = e => {
    const rm = e.target.closest('[data-rm]'), open = e.target.closest('[data-open]');
    if (rm) { ids.splice(ids.indexOf(rm.dataset.rm), 1); paint(); }
    else if (open) openFile(open.dataset.open);
    else if (e.target.closest('[data-add]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'image/*,application/pdf';
      input.onchange = async () => {
        for (const file of input.files) {
          try { ids.push(await addFile(await prepareFile(file))); }
          catch (err) { alert(err.message); }
        }
        paint();
      };
      input.click();
    }
  };
  paint();
}

export const attachHtml = '<div><small class="muted">Archivos adjuntos</small><div id="attach" class="attach"></div></div>';

export async function openFile(id) {
  const rec = await db.get('files', id);
  if (!rec) return toast('Archivo no disponible (el respaldo se hizo sin adjuntos)');
  const url = URL.createObjectURL(rec.blob);
  if (rec.mime.startsWith('image/')) {
    viewer.innerHTML = `<div class="viewer"><img src="${url}" alt="${esc(rec.name)}"><button class="btn" data-close>Cerrar</button></div>`;
    viewer.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
    viewer.showModal();
  } else {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
}

// Lista de adjuntos de solo lectura (para tarjetas y detalles).
export function fileLinks(ids = []) {
  return ids.map(id => {
    const m = S.files.get(id);
    return `<button type="button" class="btn sm" data-act="open-file" data-id="${id}">${icon(m?.mime.startsWith('image/') ? 'image' : 'file')} ${esc(m?.name ?? 'archivo')}</button>`;
  }).join(' ');
}
