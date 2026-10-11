import { esc, money, sum, r2, today, addDays, daysBetween, fmtDate, fmtDateY, periodFor, shiftRef, MONTHS, toast } from './util.js';
import { S, kindName, catLabel, findAcc } from './state.js';
import { moveTitle } from './money.js';
import { icon } from './icons.js';

const KINDS = [['q', 'Quincena'], ['m', 'Mes'], ['y', 'Año'], ['all', 'Todo']];

function inPeriod(p) { return m => m.date >= p.start && m.date <= p.end; }
const spentIn = p => sum(S.moves.filter(m => m.type === 'expense' && inPeriod(p)(m)), m => m.total);

function group(items, keyFn, valFn) {
  const map = new Map();
  for (const it of items) for (const [k, v] of keyFn(it).map(k => [k, valFn(it, k)])) map.set(k, r2((map.get(k) ?? 0) + v));
  return [...map].sort((a, b) => b[1] - a[1]);
}

// Barras horizontales ordenadas; el largo es relativo al mayor y el texto siempre lleva monto y porcentaje.
function hbars(rows, total) {
  if (!rows.length) return '<small class="muted">Sin datos.</small>';
  const max = rows[0][1] || 1;
  return `<ul class="hbars">${rows.map(([label, v, extra]) => `
    <li>
      <div class="hb-row"><span>${esc(label)}${extra ? `<small> · ${esc(extra)}</small>` : ''}</span><span>${money(v)} <small>${total ? Math.round(v / total * 100) : 0}%</small></span></div>
      <div class="bar"><i style="width:${Math.max(2, v / max * 100)}%"></i></div>
    </li>`).join('')}</ul>`;
}

// Gasto por día (quincena/mes) o por mes (año/todo).
function series(p, expenses) {
  const byDay = p.kind === 'q' || p.kind === 'm';
  const buckets = new Map();
  if (byDay) {
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) buckets.set(d, 0);
  } else if (p.kind === 'y') {
    for (let m = 1; m <= 12; m++) buckets.set(`${p.start.slice(0, 4)}-${String(m).padStart(2, '0')}`, 0);
  } else if (expenses.length) {
    const first = expenses.map(m => m.date).sort()[0].slice(0, 7);
    let [y, m] = first.split('-').map(Number);
    const [ey, em] = today().split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) { buckets.set(`${y}-${String(m).padStart(2, '0')}`, 0); if (++m > 12) { m = 1; y++; } }
  }
  for (const e of expenses) {
    const k = byDay ? e.date : e.date.slice(0, 7);
    if (buckets.has(k)) buckets.set(k, r2(buckets.get(k) + e.total));
  }
  let list = [...buckets].map(([k, v]) => ({
    k, v, label: byDay ? fmtDate(k) : `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`,
    short: byDay ? String(+k.slice(8)) : MONTHS[+k.slice(5) - 1],
  }));
  if (p.kind === 'all') list = list.slice(-24);
  return list;
}

function chart(list) {
  const max = Math.max(...list.map(b => b.v), 0);
  if (!max) return '<small class="muted">Sin gastos en este periodo.</small>';
  const step = Math.ceil(list.length / 8);
  return `
    <div class="spark-top"><small class="muted">Máximo ${money(max)}</small></div>
    <div class="spark" role="img" aria-label="Gasto por ${list.length > 12 ? 'día' : 'periodo'}">
      ${list.map(b => `<button class="col" data-act="spark" data-tip="${esc(b.label)}: ${money(b.v)}" aria-label="${esc(b.label)}: ${money(b.v)}"><i style="height:${b.v ? Math.max(3, b.v / max * 100) : 0}%"></i></button>`).join('')}
    </div>
    <div class="spark-x">${list.map((b, i) => `<span>${i % step === 0 ? b.short : ''}</span>`).join('')}</div>`;
}

export function reportsView() {
  const { kind, ref } = S.report;
  const p = periodFor(kind, ref);
  const ms = S.moves.filter(inPeriod(p));
  const expenses = ms.filter(m => m.type === 'expense');
  const incomes = ms.filter(m => m.type === 'income');
  const spent = sum(expenses, m => m.total), income = sum(incomes, m => m.total);

  // Promedio diario: sobre los días transcurridos del periodo.
  const first = kind === 'all' ? (S.moves.map(m => m.date).sort()[0] ?? today()) : p.start;
  const last = kind === 'all' || p.end > today() ? today() : p.end;
  const days = Math.max(0, daysBetween(first, last) + 1);

  let delta = '';
  if (kind !== 'all') {
    const prev = spentIn(periodFor(kind, shiftRef(kind, ref, -1)));
    delta = prev ? (() => { const d = Math.round((spent - prev) / prev * 100); return `<small class="${d > 0 ? 'neg' : 'pos'}">${d > 0 ? icon('up') : d < 0 ? icon('down') : ''} ${Math.abs(d)}% vs periodo anterior (${money(prev)})</small>`; })()
      : '<small class="muted">Sin gastos en el periodo anterior</small>';
  }

  const byKind = group(expenses, m => [m.kind ?? null], m => m.total).map(([k, v]) => [kindName(k), v]);
  const byBudget = group(expenses, m => [...new Set(m.parts.map(pt => `${pt.acc}|${pt.cat}`))], (m, k) => m.parts.filter(pt => `${pt.acc}|${pt.cat}` === k).reduce((t, pt) => t + pt.amount, 0))
    .map(([k, v]) => { const [acc, cat] = k.split('|'); return [catLabel({ acc, cat }), v]; });

  // Movimiento por cuenta: cuántos movimientos la tocan, cuánto salió y cuánto entró.
  const acct = new Map();
  const touch = (id, m, field, amount) => {
    const a = acct.get(id) ?? { ids: new Set(), spent: 0, income: 0 };
    a.ids.add(m.id);
    if (field) a[field] = r2(a[field] + amount);
    acct.set(id, a);
  };
  for (const m of ms) {
    m.parts.forEach(pt => touch(pt.acc, m, m.type === 'expense' ? 'spent' : m.type === 'income' ? 'income' : null, pt.amount));
    if (m.type === 'transfer') touch(m.to.acc, m, null, 0);
    if (m.card) touch(m.card, m, 'spent', m.total);
  }
  const accounts = [...acct].map(([id, a]) => ({ name: findAcc(id)?.name ?? '(eliminada)', ...a, count: a.ids.size })).sort((a, b) => b.count - a.count || b.spent - a.spent);

  const top = [...expenses].sort((a, b) => b.total - a.total).slice(0, 5);
  const net = r2(income - spent);

  return `
    <div class="seg small" role="tablist">${KINDS.map(([k, label]) => `<button class="${k === kind ? 'on' : ''}" data-act="rep-kind" data-kind="${k}">${label}</button>`).join('')}</div>
    ${kind !== 'all' ? `<div class="qnav">
      <button class="icon" data-act="rep-prev" aria-label="Periodo anterior">${icon('left')}</button>
      <button class="label" data-act="rep-now"><b>${p.label}</b></button>
      <button class="icon" data-act="rep-next" aria-label="Periodo siguiente">${icon('right')}</button></div>` : ''}

    <section class="card">
      <div class="grid2">
        <div><small>Gastado</small><b class="big warn">${money(spent)}</b>${delta}</div>
        <div><small>Ingresos</small><b class="big pos">${money(income)}</b></div>
        <div><small>Balance</small><b class="big ${net < 0 ? 'neg' : ''}">${money(net)}</b></div>
        <div><small>Promedio diario</small><b class="big">${money(days ? r2(spent / days) : 0)}</b><small>${expenses.length} ${expenses.length === 1 ? 'gasto' : 'gastos'}</small></div>
      </div>
      <p class="muted note">Las transferencias y los pagos de tarjeta no cuentan como gasto: el gasto se cuenta al comprar.</p>
    </section>

    <section class="card"><div class="card-h"><h3>${kind === 'q' || kind === 'm' ? 'Gasto por día' : 'Gasto por mes'}</h3></div>${chart(series(p, expenses))}</section>
    <section class="card"><div class="card-h"><h3>En qué se gastó</h3></div>${hbars(byKind, spent)}</section>
    <section class="card"><div class="card-h"><h3>De qué dinero salió</h3></div>${hbars(byBudget.slice(0, 8), spent)}</section>

    <section class="card"><div class="card-h"><h3>Cuentas con más movimiento</h3></div>
      ${accounts.length ? `<ul class="moves">${accounts.map(a => `
        <li class="move static"><span>${esc(a.name)}<small>${a.count} ${a.count === 1 ? 'movimiento' : 'movimientos'}${a.income ? ` · entró ${money(a.income)}` : ''}</small></span><span class="amt out">${a.spent ? '−' + money(a.spent) : ''}</span></li>`).join('')}</ul>` : '<small class="muted">Sin datos.</small>'}
    </section>

    <section class="card"><div class="card-h"><h3>Gastos más grandes</h3></div>
      ${top.length ? `<ul class="moves">${top.map(m => `
        <li><button class="move" data-act="edit-move" data-id="${m.id}"><span>${esc(moveTitle(m))}<small>${fmtDateY(m.date)} · ${esc(kindName(m.kind))}</small></span><span class="amt out">−${money(m.total)}</span></button></li>`).join('')}</ul>` : '<small class="muted">Sin datos.</small>'}
    </section>`;
}

export const actions = {
  'rep-kind': el => { S.report = { kind: el.dataset.kind, ref: today() }; },
  'rep-prev': () => { S.report.ref = shiftRef(S.report.kind, S.report.ref, -1); },
  'rep-next': () => { S.report.ref = shiftRef(S.report.kind, S.report.ref, 1); },
  'rep-now': () => { S.report.ref = today(); },
  spark: el => toast(el.dataset.tip),
};
