import * as db from './db.js';
import { esc, money, r2, uid, today, addMonths, daysBetween, fmtDateY } from './util.js';
import { S, savePurchase, gcFiles } from './state.js';
import { modal, mountAttach, attachHtml } from './ui.js';
import { icon } from './icons.js';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function warranty(p) {
  if (!p.warrantyMonths) return '';
  const end = addMonths(p.date, p.warrantyMonths);
  const days = daysBetween(today(), end);
  if (days < 0) return `<small class="neg">Garantía vencida el ${fmtDateY(end)}</small>`;
  const left = days > 60 ? `${Math.round(days / 30.4)} meses` : `${days} ${days === 1 ? 'día' : 'días'}`;
  return `<small class="${days <= 60 ? 'warn' : 'pos'}">Garantía hasta ${fmtDateY(end)} · quedan ${left}</small>`;
}

export function purchaseList() {
  const terms = norm(S.search).split(/\s+/).filter(Boolean);
  const items = S.purchases
    .filter(p => {
      const hay = norm([p.name, p.store, p.tag, p.notes, p.price || '', fmtDateY(p.date)].join(' '));
      return terms.every(t => hay.includes(t));
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const shown = items.slice(0, S.purchaseLimit), left = items.length - shown.length;
  if (!items.length) return `<div class="card empty"><p>${S.purchases.length ? 'No hay compras que coincidan.' : 'Guarda aquí lo que valga la pena recordar: equipos, electrodomésticos, garantías…'}</p>
    ${S.purchases.length ? '' : '<button class="btn primary" data-act="new-purchase">Registrar una compra</button>'}</div>`;
  return `<ul class="plist">${shown.map(p => `
    <li><button class="card purchase" data-act="edit-purchase" data-id="${p.id}">
      <span class="p-main"><b>${esc(p.name)}</b>
        <small>${fmtDateY(p.date)}${p.price ? ` · ${money(p.price)}` : ''}${p.store ? ` · ${esc(p.store)}` : ''}</small>
        ${warranty(p)}
        ${p.tag ? `<small class="tag">${esc(p.tag)}</small>` : ''}</span>
      ${p.files?.length ? `<span class="p-files">${icon('clip')} ${p.files.length}</span>` : ''}
    </button></li>`).join('')}</ul>
    ${left > 0 ? `<button class="btn ghost block" data-act="more-purchases">Ver más (${Math.min(40, left)} de ${left} restantes)</button>` : ''}`;
}

export function purchasesView() {
  return `<input type="search" id="psearch" class="search" placeholder="Buscar por nombre, tienda, etiqueta…" value="${esc(S.search)}" autocomplete="off">
    <div id="plist">${purchaseList()}</div>`;
}

export function purchaseForm(p) {
  const files = [...(p?.files ?? [])];
  const tags = [...new Set(S.purchases.map(x => x.tag).filter(Boolean))];
  modal(p ? 'Editar compra' : 'Nueva compra', `
    <label>Qué compré <input name="name" required maxlength="80" value="${esc(p?.name ?? '')}" placeholder="Ej. Laptop, Refrigeradora…"></label>
    <label>Fecha de compra <input name="date" type="date" required value="${p?.date ?? today()}"></label>
    <label>Precio (opcional) <input name="price" type="number" inputmode="decimal" step="0.01" min="0" value="${p?.price || ''}"></label>
    <label>Tienda (opcional) <input name="store" maxlength="60" value="${esc(p?.store ?? '')}"></label>
    <label>Etiqueta (opcional) <input name="tag" maxlength="30" list="tags" value="${esc(p?.tag ?? '')}" placeholder="Ej. Tecnología, Hogar…">
      <datalist id="tags">${tags.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    <label>Garantía en meses (opcional) <input name="months" type="number" inputmode="numeric" min="0" max="240" value="${p?.warrantyMonths || ''}"></label>
    <label>Notas (opcional) <textarea name="notes" rows="3" maxlength="500">${esc(p?.notes ?? '')}</textarea></label>
    ${attachHtml}`, {
    afterOpen: f => mountAttach(f.querySelector('#attach'), files),
    async onSubmit(fd) {
      const data = {
        name: fd.get('name').trim(), date: fd.get('date'), price: r2(+fd.get('price')) || 0,
        store: fd.get('store').trim(), tag: fd.get('tag').trim(), warrantyMonths: Math.max(0, Math.round(+fd.get('months'))) || 0,
        notes: fd.get('notes').trim(), files: [...files],
      };
      if (p) Object.assign(p, data); else S.purchases.push({ id: uid(), ...data });
      await savePurchase(p ?? S.purchases.at(-1));
    },
    onDelete: p && (async () => {
      S.purchases = S.purchases.filter(x => x.id !== p.id);
      await db.commit({ remove: { purchases: [p.id] } });
      await gcFiles();
    }),
  });
}

export const actions = {
  'more-purchases': () => { S.purchaseLimit += 40; },
  'new-purchase': () => purchaseForm(),
  'edit-purchase': el => purchaseForm(S.purchases.find(x => x.id === el.dataset.id)),
};
