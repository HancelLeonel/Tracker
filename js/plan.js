import * as db from './db.js';
import { esc, money, sum, r2, uid, today, periodFor, shiftRef, toast } from './util.js';
import { S, savePlanLine, allKeys, hasCats, catLabel, balanceWithout, findAcc, findCat, isCredit, splitKey } from './state.js';
import { modal, catSelect } from './ui.js';
import { flowForm, payCardForm } from './money.js';
import { icon as svg } from './icons.js';

// La guía es una lista de transferencias que debes hacer cada quincena. Los pagos entran a una cuenta
// y tú los repartes como puedas; la app mide el avance con las transferencias que registres.
const WHEN = { both: 'Cada quincena', q1: 'Solo 1ª quincena (1–15)', q2: 'Solo 2ª quincena (16–fin)' };
const applies = (line, half) => line.when === 'both' || line.when === (half === 1 ? 'q1' : 'q2');
const lineValid = l => { const { acc, cat } = splitKey(l.key); return !!findCat(acc, cat); };
const accOf = l => splitKey(l.key).acc;

// Dinero transferido en el periodo, por categoría destino y por cuenta destino (desde otras cuentas).
function progress(p) {
  const into = new Map(), cross = new Map();
  for (const m of S.moves) {
    if (m.type !== 'transfer' || m.date < p.start || m.date > p.end) continue;
    const key = `${m.to.acc}|${m.to.cat}`;
    into.set(key, r2((into.get(key) ?? 0) + m.total));
    const fromOthers = sum(m.parts.filter(pt => pt.acc !== m.to.acc), pt => pt.amount);
    if (fromOthers) cross.set(m.to.acc, r2((cross.get(m.to.acc) ?? 0) + fromOthers));
  }
  return { into, cross };
}

const bar = (done, total) => `<div class="bar"><i style="width:${total ? Math.min(100, done / total * 100) : 0}%"></i></div>`;
const icon = (done, total) => `<span class="status-i">${svg(done >= total - 0.004 ? 'done' : done > 0 ? 'half' : 'circle')}</span>`;

export function planView() {
  const p = periodFor('q', S.guide.ref);
  const lines = S.plan.filter(l => applies(l, p.half) && lineValid(l));
  const { into, cross } = progress(p);
  const received = sum(S.moves.filter(m => m.type === 'income' && m.date >= p.start && m.date <= p.end), m => m.total);

  // Agrupa por cuenta destino y calcula el avance de cada una.
  const groups = new Map();
  for (const l of lines) groups.set(accOf(l), [...(groups.get(accOf(l)) ?? []), l]);
  const accs = [...groups].map(([id, ls]) => {
    const total = sum(ls, l => l.amount);
    const byLines = sum(ls, l => Math.min(l.amount, into.get(l.key) ?? 0));
    const done = Math.min(total, Math.max(cross.get(id) ?? 0, byLines));
    return { acc: findAcc(id), lines: ls, total, done };
  }).sort((a, b) => S.accounts.indexOf(a.acc) - S.accounts.indexOf(b.acc));
  const total = sum(accs, a => a.total), done = sum(accs, a => a.done);

  const header = `
    <div class="qnav">
      <button class="icon" data-act="guide-prev" aria-label="Quincena anterior">${svg('left')}</button>
      <button class="label" data-act="guide-now"><b>${p.label}</b></button>
      <button class="icon" data-act="guide-next" aria-label="Quincena siguiente">${svg('right')}</button>
    </div>
    <section class="card">
      <div class="grid2">
        <div><small>Pago recibido</small><b class="big ${received ? 'pos' : 'warn'}">${money(received)}</b></div>
        <div><small>Por transferir</small><b class="big">${money(r2(Math.max(0, total - done)))}</b>${total ? `<small>de ${money(total)}</small>` : ''}</div>
      </div>
      ${total ? bar(done, total) : ''}
      <button class="btn primary block" data-act="new-pay">${svg('coin')} Registrar pago recibido</button>
    </section>`;

  const cards = accs.map(({ acc, lines: ls, total, done }) => `
    <section class="card">
      <div class="card-h">
        <div><h3>${isCredit(acc) ? svg('card') + ' ' : ''}${esc(acc.name)}</h3>
          <small>${done >= total - 0.004 ? '<b class="pos">Completo</b>' : `Transferir <b>${money(total)}</b> · llevas ${money(done)} · faltan <b class="warn">${money(r2(total - done))}</b>`}</small></div>
        <button class="btn sm primary" data-act="guide-acc" data-acc="${acc.id}" data-left="${r2(total - done)}">${svg('swap')} Transferir</button>
      </div>
      ${bar(done, total)}
      <ul class="cats">${ls.map(l => {
        const d = into.get(l.key) ?? 0;
        return `
        <li class="cat">
          <button class="cat-main" data-act="guide-do" data-id="${l.id}" data-done="${d}">
            <span class="cat-row"><span>${icon(d, l.amount)} ${esc(l.name)}</span><span>${money(d)} / ${money(l.amount)}</span></span>
            <small class="muted">${esc(catLabel(splitKey(l.key)))}</small>
          </button>
          <button class="mini" data-act="edit-line" data-id="${l.id}" aria-label="Editar ${esc(l.name)}">${svg('edit')}</button>
        </li>`;
      }).join('')}</ul>
    </section>`).join('');

  const planned = half => sum(S.plan.filter(l => applies(l, half)), l => l.amount);
  const all = S.plan.map(l => `
    <li><button class="move" data-act="edit-line" data-id="${l.id}">
      <span>${esc(l.name)}<small>${esc(WHEN[l.when])} · ${esc(lineValid(l) ? catLabel(splitKey(l.key)) : '(categoría eliminada)')}</small></span>
      <span class="amt">${money(l.amount)}</span></button></li>`).join('');

  return `
    ${header}
    ${cards || `<div class="card empty"><p>${S.plan.length ? 'No hay transferencias pendientes para esta quincena.' : 'Crea tu guía: lo que debes transferir cada quincena (por ejemplo, Q200 a Efectivo / Internet).'}</p></div>`}
    <section class="card">
      <div class="card-h"><h3>Líneas de la guía</h3><button class="btn sm" data-act="new-line">${svg('plus')} Línea</button></div>
      ${all ? `<ul class="moves">${all}</ul>
        <div class="kv plan-total"><span class="muted">Total 1ª quincena</span><b>${money(planned(1))}</b></div>
        <div class="kv plan-total"><span class="muted">Total 2ª quincena</span><b>${money(planned(2))}</b></div>`
        : '<small class="muted">Ej.: Internet Q200 cada quincena → Efectivo / Internet; Seguro Q450 solo la 1ª quincena → Banco / Seguro.</small>'}
    </section>`;
}

export function lineForm(line) {
  if (!hasCats()) return toast('Primero crea una cuenta con una categoría');
  const bal = k => balanceWithout(null, k);
  modal(line ? 'Editar línea' : 'Nueva línea de la guía', `
    <label>Concepto <input name="name" required maxlength="40" value="${esc(line?.name ?? '')}" placeholder="Ej. Internet, Seguro, Comida…"></label>
    <label>Monto a transferir <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${line?.amount ?? ''}"></label>
    <label>Transferir a ${catSelect('key', line?.key ?? allKeys()[0], bal)}</label>
    <label>Cuándo aplica
      <select name="when">${Object.entries(WHEN).map(([k, v]) => `<option value="${k}" ${k === (line?.when ?? 'both') ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </label>
    <small class="muted">El avance se calcula con las transferencias que registres hacia esa categoría durante la quincena.</small>`, {
    async onSubmit(fd) {
      const data = { name: fd.get('name').trim(), amount: r2(+fd.get('amount')), key: fd.get('key'), when: fd.get('when') };
      if (line) Object.assign(line, data);
      else S.plan.push({ id: uid(), ...data });
      await savePlanLine(line ?? S.plan.at(-1));
    },
    onDelete: line && (async () => {
      S.plan = S.plan.filter(l => l.id !== line.id);
      await db.commit({ remove: { plan: [line.id] } });
    }),
  });
}

// Abre la transferencia (o el pago de tarjeta) ya llenada para cumplir una parte de la guía.
function doTransfer(key, amount, note) {
  const a = findAcc(splitKey(key).acc);
  if (isCredit(a)) return payCardForm(a);
  flowForm('transfer', null, { to: key, amount: amount > 0 ? amount : '', note });
}

export const actions = {
  'new-line': () => lineForm(),
  'edit-line': el => lineForm(S.plan.find(l => l.id === el.dataset.id)),
  'new-pay': () => flowForm('income', null, { note: 'Pago quincenal' }),
  'guide-do'(el) {
    const l = S.plan.find(x => x.id === el.dataset.id);
    doTransfer(l.key, r2(l.amount - (+el.dataset.done || 0)), l.name);
  },
  'guide-acc'(el) {
    const p = periodFor('q', S.guide.ref);
    const l = S.plan.find(x => applies(x, p.half) && lineValid(x) && accOf(x) === el.dataset.acc);
    doTransfer(l.key, +el.dataset.left, `Guía ${findAcc(el.dataset.acc).name}`);
  },
  'guide-prev': () => { S.guide.ref = shiftRef('q', S.guide.ref, -1); },
  'guide-next': () => { S.guide.ref = shiftRef('q', S.guide.ref, 1); },
  'guide-now': () => { S.guide.ref = today(); },
};
