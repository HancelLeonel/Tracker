import * as db from './db.js';
import { $, esc, money, toast, uid } from './util.js';
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

// ---------- selects ----------
// <select> con las categorías agrupadas por cuenta y su saldo. `bal(key)` devuelve el saldo a mostrar.
// opts: credit (incluir tarjetas), only (Set de claves permitidas), placeholder (texto si no hay selección).
export function catSelect(name, selected, bal, attrs = '', { credit = true, only = null, placeholder = '' } = {}) {
  const groups = S.accounts.filter(a => credit || !isCredit(a)).map(a => {
    const cats = a.cats.filter(c => !only || only.has(`${a.id}|${c.id}`));
    if (!cats.length) return '';
    return `
    <optgroup label="${esc(isCredit(a) ? a.name + ' (tarjeta)' : a.name)}">
      ${cats.map(c => {
        const k = `${a.id}|${c.id}`, b = bal(k);
        const text = isCredit(a) ? (b < 0 ? `Deuda ${money(-b)}` : `A favor ${money(b)}`) : `${c.name} · ${money(b)}`;
        return `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(text)}</option>`;
      }).join('')}
    </optgroup>`;
  }).join('');
  const ph = placeholder ? `<option value="" disabled ${selected ? '' : 'selected'}>${esc(placeholder)}</option>` : '';
  return `<select name="${name}" ${attrs}>${ph}${groups}</select>`;
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
    if (!name) { select.value = prev; return; }
    const t = { id: uid(), name };
    S.settings.types.push(t);
    await saveSettings();
    const opt = new Option(name, t.id);
    select.add(opt, select.options[select.options.length - 1]);
    select.value = t.id;
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
