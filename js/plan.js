import * as db from './db.js';
import { esc, money, sum, r2, uid, today, fmtDate, periodFor, toast } from './util.js';
import { S, saveSettings, savePlanLine, saveMove, allKeys, normalKeys, hasCats, hasNormalCats, catLabel, balanceWithout, findCat, splitKey } from './state.js';
import { modal, catSelect } from './ui.js';

const WHEN = { both: 'Cada quincena', q1: 'Solo 1ª quincena (1–15)', q2: 'Solo 2ª quincena (16–fin)' };
const applies = (line, half) => line.when === 'both' || line.when === (half === 1 ? 'q1' : 'q2');
const lineValid = l => { const { acc, cat } = splitKey(l.key); return !!findCat(acc, cat); };

// Ingresos del plan ya registrados dentro de una quincena.
const paydays = q => S.moves.filter(m => m.plan && m.date >= q.start && m.date <= q.end);

export function planView() {
  const q = periodFor('q', today());
  const planned = half => sum(S.plan.filter(l => applies(l, half)), l => l.amount);
  const done = paydays(q);
  const funded = new Map();
  done.forEach(m => m.parts.forEach(p => p.line && funded.set(p.line, (funded.get(p.line) ?? 0) + p.amount)));
  const current = S.plan.filter(l => applies(l, q.half));

  const status = current.length ? `
    <section class="card">
      <div class="card-h"><div><h3>Quincena actual</h3><small>${q.label}</small></div>
        <small class="${done.length ? 'pos' : 'warn'}">${done.length ? `Pago recibido: ${money(sum(done, m => m.total))}` : 'Aún sin pago'}</small></div>
      <ul class="moves">${current.map(l => `
        <li class="move static"><span>${funded.has(l.id) ? '✅' : '⬜'} ${esc(l.name)}<small>${esc(lineValid(l) ? catLabel(splitKey(l.key)) : '(categoría eliminada)')}</small></span>
          <span class="amt">${money(funded.get(l.id) ?? l.amount)}</span></li>`).join('')}</ul>
    </section>` : '';

  const lines = S.plan.map(l => `
    <li><button class="move" data-act="edit-line" data-id="${l.id}">
      <span>${esc(l.name)}<small>${esc(WHEN[l.when])} · ${esc(lineValid(l) ? catLabel(splitKey(l.key)) : '(categoría eliminada)')}</small></span>
      <span class="amt">${money(l.amount)}</span></button></li>`).join('');

  return `
    <section class="card empty-ish">
      <p class="muted">Define a dónde va cada pago que recibes. Al registrar un pago, la app lo reparte por ti según este plan.</p>
      <button class="btn primary block" data-act="new-payday">💰 Registrar pago recibido</button>
    </section>
    ${status}
    <section class="card">
      <div class="card-h"><h3>Plan de reparto</h3><button class="btn sm" data-act="new-line">＋ Línea</button></div>
      ${lines ? `<ul class="moves">${lines}</ul>
        <div class="kv plan-total"><span class="muted">Plan 1ª quincena</span><b>${money(planned(1))}</b></div>
        <div class="kv plan-total"><span class="muted">Plan 2ª quincena</span><b>${money(planned(2))}</b></div>`
        : '<small class="muted">Aún no hay líneas. Ej.: Transporte Q300 cada quincena, Seguro Q450 solo la 1ª quincena, Pago de tarjeta Q800 cada quincena.</small>'}
    </section>`;
}

export function lineForm(line) {
  if (!hasCats()) return toast('Primero crea una cuenta con una categoría');
  const bal = k => balanceWithout(null, k);
  modal(line ? 'Editar línea' : 'Nueva línea del plan', `
    <label>Concepto <input name="name" required maxlength="40" value="${esc(line?.name ?? '')}" placeholder="Ej. Transporte, Seguro, Tarjeta…"></label>
    <label>Monto <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${line?.amount ?? ''}"></label>
    <label>Va hacia ${catSelect('key', line?.key ?? allKeys()[0], bal)}</label>
    <label>Cuándo aplica
      <select name="when">${Object.entries(WHEN).map(([k, v]) => `<option value="${k}" ${k === (line?.when ?? 'both') ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </label>
    <small class="muted">Si el destino es una tarjeta de crédito, el monto se usa para pagarla.</small>`, {
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

// Registrar un pago: se reparte entre las líneas del plan que aplican a esa quincena; el resto va al «sobrante».
export function paydayForm() {
  if (!hasNormalCats()) return toast('Primero crea una cuenta con una categoría');
  const bal = k => balanceWithout(null, k);
  const keys = normalKeys();
  let received = 0;
  let date = today();
  let rows = []; // { line, on, amount }
  const leftoverKey = keys.includes(S.settings.leftover) ? S.settings.leftover : keys[0];

  const syncRows = () => {
    const half = periodFor('q', date).half;
    const prev = new Map(rows.map(r => [r.line.id, r]));
    rows = S.plan.filter(l => applies(l, half) && lineValid(l))
      .map(l => prev.get(l.id) ?? { line: l, on: true, amount: l.amount });
  };
  syncRows();

  modal('Registrar pago recibido', `
    <label>Título <input name="title" required maxlength="60" value="Pago quincenal"></label>
    <label>Monto recibido <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required></label>
    <label>Fecha <input name="date" type="date" required value="${date}"></label>
    <div>
      <small class="muted">Reparto según tu plan</small>
      <div id="lines" class="parts"></div>
      <p class="muted" id="noplan" ${rows.length ? 'hidden' : ''}>No hay líneas del plan para esta quincena.</p>
    </div>
    <label>Lo que sobre va hacia ${catSelect('leftover', leftoverKey, bal, '', { credit: false })}</label>
    <p id="remain" class="remain" aria-live="polite"></p>`, {
    submit: 'Registrar',
    afterOpen(f) {
      const box = f.querySelector('#lines'), remain = f.querySelector('#remain'), noplan = f.querySelector('#noplan');
      const left = () => r2(received - sum(rows.filter(r => r.on), r => r.amount));
      const status = () => {
        const l = left();
        remain.className = 'remain ' + (l < 0 ? 'neg' : 'pos');
        remain.textContent = l < 0 ? `Las líneas superan lo recibido por ${money(-l)}` : `Sobrante: ${money(l)}`;
      };
      const paint = () => {
        noplan.hidden = rows.length > 0;
        box.innerHTML = rows.map((r, i) => `
          <div class="part line-row">
            <label class="check"><input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}><span>${esc(r.line.name)}<small>${esc(catLabel(splitKey(r.line.key)))}</small></span></label>
            <input type="number" inputmode="decimal" step="0.01" min="0" data-i="${i}" value="${r.amount}" aria-label="Monto de ${esc(r.line.name)}">
          </div>`).join('');
        status();
      };
      f.elements.amount.addEventListener('input', () => { received = r2(+f.elements.amount.value || 0); status(); });
      f.elements.date.addEventListener('change', () => { date = f.elements.date.value || date; syncRows(); paint(); });
      box.addEventListener('input', e => {
        const r = rows[+e.target.dataset.i];
        if (e.target.type === 'checkbox') r.on = e.target.checked; else r.amount = r2(+e.target.value || 0);
        status();
      });
      paint();
      f.elements.amount.focus();
    },
    async onSubmit(fd) {
      const total = r2(+fd.get('amount'));
      const l = r2(total - sum(rows.filter(r => r.on), r => r.amount));
      if (l < 0) { alert('Las líneas del plan superan lo recibido.'); return false; }
      const parts = rows.filter(r => r.on && r.amount > 0).map(r => ({ ...splitKey(r.line.key), amount: r.amount, line: r.line.id }));
      if (l > 0.004) parts.push({ ...splitKey(fd.get('leftover')), amount: l, line: null });
      S.settings.leftover = fd.get('leftover');
      await saveSettings();
      await saveMove(null, {
        id: uid(), t: Date.now(), type: 'income', plan: true, date: fd.get('date'),
        title: fd.get('title').trim(), note: '', total, parts, files: [],
      });
    },
  });
}

export const actions = {
  'new-line': () => lineForm(),
  'edit-line': el => lineForm(S.plan.find(l => l.id === el.dataset.id)),
  'new-payday': () => paydayForm(),
};
