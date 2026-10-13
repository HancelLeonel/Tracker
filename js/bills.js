import * as db from './db.js';
import { esc, money, r2, uid, today, addDays, daysBetween, fmtDate, fmtDateY, parseYmd, ymd, lastDayOf, pl } from './util.js';
import {
  S, saveBill, saveMove, deleteMove, gcFiles, normalKeys, hasNormalCats, balanceWithout, isCredit, splitKey, keyOf, findAcc,
  allocatePayment, catLabel,
} from './state.js';
import { modal, catSelect, kindSelect, wireKindSelect, mountAttach, attachHtml, fileLinks } from './ui.js';
import { icon } from './icons.js';

const FREQ = { once: 'Una sola vez', monthly: 'Cada mes', biweekly: 'Cada quincena', yearly: 'Cada año' };
const LOOKAHEAD = 30;
const HISTORY = 15;

// Fechas de vencimiento de un pago hasta `to`. Los periódicos cuentan desde `from`;
// uno de una sola vez siempre existe (aunque su fecha sea anterior a haberlo creado).
function occurrences(b, from, to) {
  if (b.freq === 'once') return b.dueDate <= to ? [b.dueDate] : [];
  const out = [];
  const [y0, m0] = from.split('-').map(Number);
  for (let d = new Date(y0, m0 - 1, 1); ymd(d) <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const last = lastDayOf(d.getFullYear(), d.getMonth());
    if (b.freq === 'yearly' && d.getMonth() + 1 !== b.month) continue; // anual: solo el mes elegido
    const days = b.freq === 'biweekly' ? [b.day, b.day + 15] : [b.day];
    for (const day of days) {
      const s = ymd(new Date(d.getFullYear(), d.getMonth(), Math.min(day, last)));
      if (s >= from && s <= to && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

function pending() {
  const t = today();
  const items = [];
  for (const b of S.bills) {
    if (b?.active === false) continue;
    try {
      for (const due of occurrences(b, b.start ?? '0000-01-01', addDays(t, LOOKAHEAD))) {
        if (!b.paid?.[due]) items.push({ bill: b, due });
      }
    } catch (err) { console.warn('Pago con datos dañados, se omite:', b?.title, err); } // una ficha rota no debe romper Finanzas
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}

// Un pago periódico que se dejó de marcar acumula vencimientos: se agrupan por pago (queda el más antiguo, con `more` = cuántos más)
// para que la lista y los avisos cuenten pagos, no meses atrasados.
function byBill(items) {
  const out = new Map();
  for (const it of items) { const g = out.get(it.bill.id); if (g) g.more++; else out.set(it.bill.id, { ...it, more: 0 }); }
  return [...out.values()];
}

// Resumen para Inicio: cuántos pagos están vencidos y cuál es el próximo por vencer (dentro de los próximos 30 días).
export function billsSummary() {
  const t = today(), items = pending();
  return { total: S.bills.filter(b => b.active !== false).length, overdue: byBill(items.filter(i => i.due < t)).length, next: items.find(i => i.due >= t) ?? null };
}

// Cantidad de pagos vencidos o que vencen en los próximos 3 días (para el aviso de la pestaña).
export function billsAlert() {
  const soon = addDays(today(), 3);
  return byBill(pending().filter(i => i.due <= soon)).length;
}

function dueText(due) {
  const n = daysBetween(today(), due);
  if (n === 0) return 'vence hoy';
  return n > 0 ? `vence ${fmtDate(due)} (en ${n} ${n === 1 ? 'día' : 'días'})` : `venció ${fmtDate(due)} (hace ${-n} ${n === -1 ? 'día' : 'días'})`;
}

export function billsView() {
  if (!S.bills.length) {
    return `<div class="card empty"><p>Registra los pagos que debes hacer (luz, internet, seguro, tarjeta…) y marca cuándo los realizaste.</p>
      <button class="btn primary" data-act="new-bill">Agregar pago</button></div>`;
  }
  const t = today();
  const items = pending();
  const row = ({ bill, due, more }) => `
    <li class="bill">
      <button class="move" data-act="edit-bill" data-id="${bill.id}">
        <span>${esc(bill.title)}<small>${dueText(due)}${more ? ` · y ${pl(more, 'vencimiento')} más` : ''}${bill.card ? ' · tarjeta' : ''}</small></span>
        ${bill.amount ? `<span class="amt">${money(bill.amount)}</span>` : ''}
      </button>
      <button class="btn sm primary" data-act="pay-bill" data-id="${bill.id}" data-due="${due}">Pagar</button>
    </li>`;
  const overdue = byBill(items.filter(i => i.due < t)), next = items.filter(i => i.due >= t);

  const history = S.bills.flatMap(b => Object.entries(b.paid ?? {}).map(([due, e]) => ({ bill: b, due, e })))
    .sort((a, b) => b.e.on.localeCompare(a.e.on) || b.due.localeCompare(a.due)).slice(0, HISTORY);

  // Los anuales casi nunca caen en los próximos 30 días: se listan todos con su próxima fecha para poder verlos y editarlos.
  const yearly = S.bills.filter(b => b.freq === 'yearly' && b.active !== false).map(bill => {
    let due = null;
    try { due = occurrences(bill, bill.start ?? '0000-01-01', addDays(t, 800)).find(d => !bill.paid?.[d]) ?? null; } catch { /* ficha dañada: sin fecha */ }
    return { bill, due };
  }).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));

  return `
    ${overdue.length ? `<section class="card alert"><div class="card-h"><h3>${icon('alert')} Vencidos</h3></div><ul class="moves">${overdue.map(row).join('')}</ul></section>` : ''}
    <section class="card"><div class="card-h"><h3>Próximos</h3></div>
      ${next.length ? `<ul class="moves">${next.map(row).join('')}</ul>` : '<small class="muted">Nada pendiente en los próximos 30 días.</small>'}</section>
    ${yearly.length ? `<section class="card"><div class="card-h"><h3>Anuales</h3></div><ul class="moves">${yearly.map(({ bill, due }) => `
      <li><button class="move" data-act="edit-bill" data-id="${bill.id}">
        <span>${esc(bill.title)}<small>Cada año${due ? ` · próximo ${fmtDateY(due)}` : ''}${bill.card ? ' · tarjeta' : ''}</small></span>
        ${bill.amount ? `<span class="amt">${money(bill.amount)}</span>` : ''}
      </button></li>`).join('')}</ul></section>` : ''}
    ${history.length ? `<section class="card"><div class="card-h"><h3>Realizados</h3></div><ul class="moves">${history.map(({ bill, due, e }) => `
      <li><button class="move" data-act="paid-bill" data-id="${bill.id}" data-due="${due}">
        <span>${icon(e.skipped ? 'skip' : 'done')} ${esc(bill.title)}<small>${e.skipped ? 'Omitido' : `Pagado el ${fmtDateY(e.on)}`} · vencía ${fmtDate(due)}${e.files?.length ? ' · ' + icon('clip') : ''}</small></span>
        ${e.skipped ? '' : `<span class="amt">${money(e.amount)}</span>`}
      </button></li>`).join('')}</ul></section>` : ''}
    <button class="btn block" data-act="new-bill">${icon('plus')} Agregar pago</button>`;
}

// Fecha que se muestra al editar: la de un pago de una sola vez, o la próxima del año si es anual.
function dateValue(bill) {
  if (bill?.freq === 'once') return bill.dueDate ?? today();
  if (bill?.freq === 'yearly') {
    const y = parseYmd(today()).getFullYear(), at = yr => ymd(new Date(yr, bill.month - 1, Math.min(bill.day, lastDayOf(yr, bill.month - 1))));
    return at(y) >= today() ? at(y) : at(y + 1);
  }
  return today();
}

export function billForm(bill) {
  const cards = S.accounts.filter(isCredit);
  const freq = bill?.freq ?? 'monthly';
  const dated = freq === 'once' || freq === 'yearly'; // estos se piden con una fecha completa
  modal(bill ? 'Editar pago' : 'Nuevo pago', `
    <label>Qué debo pagar <input name="title" required maxlength="60" value="${esc(bill?.title ?? '')}" placeholder="Ej. Internet, Seguro, Visa…"></label>
    <label>Monto aproximado (opcional) <input name="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${bill?.amount || ''}"></label>
    <label>Frecuencia
      <select name="freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${k === freq ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </label>
    <label id="f-once" ${dated ? '' : 'hidden'}><span id="date-hint">Fecha de vencimiento</span> <input name="dueDate" type="date" value="${dateValue(bill)}"></label>
    <label id="f-day" ${dated ? 'hidden' : ''}><span id="day-hint">Día del mes en que vence</span> <input name="day" type="number" inputmode="numeric" min="1" max="${freq === 'biweekly' ? 15 : 31}" value="${bill?.day ?? parseYmd(today()).getDate()}"></label>
    ${cards.length ? `<label>¿Es el pago de una tarjeta?
      <select name="card"><option value="">No</option>${cards.map(c => `<option value="${c.id}" ${c.id === bill?.card ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    </label>` : ''}`, {
    afterOpen(f) {
      const sync = () => {
        const fq = f.elements.freq.value, dated = fq === 'once' || fq === 'yearly', bi = fq === 'biweekly';
        f.querySelector('#f-once').hidden = !dated;
        f.querySelector('#date-hint').textContent = fq === 'yearly' ? 'Próxima fecha de vencimiento (se repite cada año)' : 'Fecha de vencimiento';
        f.querySelector('#f-day').hidden = dated;
        f.elements.day.max = bi ? 15 : 31;
        f.querySelector('#day-hint').textContent = bi ? 'Día de la 1ª quincena (el otro pago cae 15 días después)' : 'Día del mes en que vence';
      };
      f.elements.freq.onchange = sync;
      sync();
    },
    async onSubmit(fd) {
      const f = fd.get('freq');
      const dated = f === 'once' || f === 'yearly', date = fd.get('dueDate');
      if (dated && !date) { alert('Indica la fecha de vencimiento.'); return false; }
      const data = {
        title: fd.get('title').trim(), amount: r2(+fd.get('amount')) || 0, freq: f,
        dueDate: f === 'once' ? date : null,
        day: f === 'once' ? null : f === 'yearly' ? parseYmd(date).getDate() : Math.min(f === 'biweekly' ? 15 : 31, Math.max(1, +fd.get('day') || 1)),
        month: f === 'yearly' ? parseYmd(date).getMonth() + 1 : null,
        card: fd.get('card') || null,
      };
      // Uno anual empieza en la fecha elegida (si ya pasó, aparece vencido); al editar solo se adelanta el inicio si hace falta.
      if (bill) { Object.assign(bill, data); if (f === 'yearly' && date < (bill.start ?? date)) bill.start = date; }
      else S.bills.push({ id: uid(), start: f === 'yearly' ? date : today(), paid: {}, active: true, ...data });
      await saveBill(bill ?? S.bills.at(-1));
    },
    onDelete: bill && (async () => {
      S.bills = S.bills.filter(b => b.id !== bill.id);
      await db.commit({ remove: { bills: [bill.id] } });
      await gcFiles();
    }),
    confirmText: '¿Eliminar este pago y su historial? Los gastos ya registrados se conservan.',
  });
}

export function payForm(bill, due) {
  const files = [];
  const canRegister = hasNormalCats();
  const bal = k => balanceWithout(null, k);
  const card = bill.card ? findAcc(bill.card) : null;

  modal(`Pagar: ${bill.title}`, `
    <p class="muted">${dueText(due)}</p>
    <label>Fecha de pago <input name="on" type="date" required value="${today()}"></label>
    <label>Monto pagado <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${bill.amount || ''}"></label>
    ${canRegister ? `
    <label class="check"><input type="checkbox" name="register" checked><span>Descontar de mis cuentas${card ? ' (se abona a la tarjeta)' : ' (registrar como gasto)'}</span></label>
    <div id="reg">
      ${card ? '<p id="alloc" class="muted"></p>'
        : `<label>Se paga con ${catSelect('from', normalKeys()[0], bal, '', { credit: false })}</label>
           <label>Tipo de gasto ${kindSelect('kind', S.settings.lastKind)}</label>`}
    </div>` : ''}
    ${attachHtml}`, {
    submit: 'Marcar como pagado',
    deleteLabel: 'Omitir',
    confirmText: '¿Omitir este vencimiento? Quedará en el historial como omitido, sin registrar dinero.',
    afterOpen(f) {
      mountAttach(f.querySelector('#attach'), files);
      if (!canRegister) return;
      if (f.elements.kind) wireKindSelect(f.elements.kind);
      const reg = f.querySelector('#reg');
      f.elements.register.onchange = () => { reg.hidden = !f.elements.register.checked; };
      if (card) {
        // Vista previa de cuánto saldrá de cada categoría (según lo gastado con esa tarjeta).
        const alloc = f.querySelector('#alloc');
        const upd = () => {
          const parts = allocatePayment(card, r2(+f.elements.amount.value || 0));
          alloc.textContent = parts.length ? 'Se descontará de: ' + parts.map(p => `${catLabel(p)} ${money(p.amount)}`).join(', ') : '';
        };
        f.elements.amount.addEventListener('input', upd);
        upd();
      }
    },
    async onSubmit(fd) {
      const amount = r2(+fd.get('amount'));
      const on = fd.get('on');
      let moveId = null;
      if (canRegister && fd.get('register')) {
        const parts = card ? allocatePayment(card, amount) : [{ ...splitKey(fd.get('from')), amount }];
        if (parts.some(p => balanceWithout(null, keyOf(p)) < p.amount) && !confirm('Una categoría quedará en negativo. ¿Continuar?')) return false;
        const base = { id: uid(), t: Date.now(), date: on, total: amount, parts, files: [...files] };
        let move;
        if (card) {
          move = { ...base, type: 'transfer', note: bill.title, to: { acc: card.id, cat: card.cats[0].id } };
        } else {
          const kind = fd.get('kind');
          S.settings.lastKind = kind;
          move = { ...base, type: 'expense', title: bill.title, note: '', kind, bill: bill.id };
        }
        await saveMove(null, move);
        moveId = move.id;
      }
      bill.paid ??= {};
      bill.paid[due] = { on, amount, moveId, files: [...files] };
      await saveBill(bill);
      await gcFiles();
    },
    onDelete: async () => {
      bill.paid ??= {};
      bill.paid[due] = { on: today(), amount: 0, skipped: true, files: [] };
      await saveBill(bill);
    },
  });
}

export function paidDetail(bill, due) {
  const e = bill.paid[due];
  const linked = e.moveId && S.moves.find(m => m.id === e.moveId);
  modal(bill.title, `
    <div class="kv"><span class="muted">Vencía</span><span>${fmtDateY(due)}</span></div>
    <div class="kv"><span class="muted">${e.skipped ? 'Omitido el' : 'Pagado el'}</span><span>${fmtDateY(e.on)}</span></div>
    ${e.skipped ? '' : `<div class="kv"><span class="muted">Monto</span><b>${money(e.amount)}</b></div>`}
    <div class="kv"><span class="muted">Dinero</span><span>${linked ? 'Descontado de tus cuentas' : 'Sin movimiento registrado'}</span></div>
    ${e.files?.length ? `<div>${fileLinks(e.files)}</div>` : ''}`, {
    deleteLabel: 'Deshacer',
    confirmText: linked ? 'El pago volverá a pendiente y se revertirá el movimiento registrado en tus cuentas. ¿Continuar?' : 'El pago volverá a pendiente. ¿Continuar?',
    onDelete: async () => {
      if (linked) await deleteMove(linked);
      delete bill.paid[due];
      await saveBill(bill);
      await gcFiles();
    },
  });
}

export const actions = {
  'new-bill': () => billForm(),
  'edit-bill': el => billForm(S.bills.find(b => b.id === el.dataset.id)),
  'pay-bill': el => payForm(S.bills.find(b => b.id === el.dataset.id), el.dataset.due),
  'paid-bill': el => paidDetail(S.bills.find(b => b.id === el.dataset.id), el.dataset.due),
};
