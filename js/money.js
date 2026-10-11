import * as db from './db.js';
import { esc, money, sum, r2, uid, today, fmtDate, toast } from './util.js';
import {
  S, saveSettings, saveAccount, saveMove, deleteMove, findAcc, findCat, isCredit, keyOf, splitKey,
  normalKeys, hasNormalCats, catLabel, totals, balanceWithout, availWithout, kindName, reservedMap, cardPending,
} from './state.js';
import { modal, catSelect, kindSelect, wireKindSelect, mountAttach, attachHtml, fileLinks } from './ui.js';

const MOVE_LIMIT = 30;

export function moveTitle(m) {
  return m.title || m.note || { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' }[m.type];
}
export function moveWhere(m) {
  if (m.type === 'transfer') return `${m.parts.map(catLabel).join(' + ')} → ${catLabel(m.to)}`;
  const where = m.parts.map(catLabel).join(' + ');
  return m.card ? `${where} · 💳 ${findAcc(m.card)?.name ?? '(eliminada)'}` : where;
}

// ---------- vista de cuentas ----------
export function accountsView() {
  if (!S.accounts.length) {
    return `
      <div class="card empty">
        <p>Crea tu primera cuenta (banco, efectivo, tarjeta…) y luego sus categorías con el dinero que tienes en cada una.</p>
        <button class="btn primary" data-act="new-acc">Crear cuenta</button>
      </div>`;
  }

  const res = reservedMap();
  const cards = S.accounts.map(a => (isCredit(a) ? creditCard(a) : normalCard(a, res))).join('');

  const sorted = [...S.moves].sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t);
  const shown = S.showAllMoves ? sorted : sorted.slice(0, MOVE_LIMIT);
  const moves = shown.map(m => {
    const amt = m.type === 'expense' ? `<span class="amt out">−${money(m.total)}</span>`
      : m.type === 'income' ? `<span class="amt in">+${money(m.total)}</span>`
      : `<span class="amt">${money(m.total)}</span>`;
    const bits = [fmtDate(m.date), m.type === 'expense' ? kindName(m.kind) : null, m.files?.length ? '📎' : null, moveWhere(m)].filter(Boolean);
    return `
      <li><button class="move" data-act="edit-move" data-id="${m.id}">
        <span>${esc(moveTitle(m))}<small>${esc(bits.join(' · '))}</small></span>${amt}
      </button></li>`;
  }).join('');

  const t = totals();
  return `
    <section class="card">
      <div class="total"><small>Dinero total${t.debt ? ' (descontando tarjetas)' : ''}</small><b class="${t.net < 0 ? 'neg' : ''}">${money(t.net)}</b>
        ${t.debt ? `<small>En cuentas ${money(t.cash)} · Deuda en tarjetas ${money(-t.debt)}</small>` : ''}</div>
      <div class="quick">
        <button class="btn" data-act="new-exp">− Gasto</button>
        <button class="btn" data-act="new-inc">＋ Ingreso</button>
        <button class="btn" data-act="new-xfer">⇄ Mover</button>
      </div>
    </section>
    ${cards}
    ${moves ? `<section class="card"><div class="card-h"><h3>Movimientos</h3></div><ul class="moves">${moves}</ul>
      ${sorted.length > MOVE_LIMIT ? `<button class="btn ghost block" data-act="more-moves">${S.showAllMoves ? 'Ver menos' : `Ver todos (${sorted.length})`}</button>` : ''}</section>` : ''}`;
}

function normalCard(a, res) {
  const cats = a.cats.map(c => {
    const r = res.get(`${a.id}|${c.id}`) ?? 0;
    return `
    <li class="cat">
      <button class="cat-main" data-act="new-exp" data-acc="${a.id}" data-cat="${c.id}">
        <span class="cat-row"><span>${esc(c.name)}</span><b class="${c.balance < 0 ? 'neg' : ''}">${money(c.balance)}</b></span>
        ${r ? `<small class="reserved">💳 ${money(r)} por pagar a tarjeta · libre ${money(r2(c.balance - r))}</small>` : ''}
      </button>
      <button class="mini" data-act="edit-cat" data-acc="${a.id}" data-cat="${c.id}" aria-label="Editar ${esc(c.name)}">✎</button>
    </li>`;
  }).join('');
  const total = sum(a.cats, c => c.balance);
  return `
    <section class="card">
      <div class="card-h">
        <div><h3>${esc(a.name)}</h3><small>Total <b class="${total < 0 ? 'neg' : 'pos'}">${money(total)}</b></small></div>
        <button class="icon" data-act="edit-acc" data-acc="${a.id}" aria-label="Editar cuenta ${esc(a.name)}">✎</button>
      </div>
      ${cats ? `<ul class="cats">${cats}</ul>` : '<small>Sin categorías todavía.</small>'}
      <div class="card-f"><button class="btn sm" data-act="new-cat" data-acc="${a.id}">＋ Categoría</button></div>
    </section>`;
}

function creditCard(a) {
  const bal = a.cats[0]?.balance ?? 0;
  const free = a.limit > 0 ? r2(a.limit + bal) : null;
  const pend = [...cardPending(a.id)].sort((x, y) => y[1] - x[1]);
  const other = r2(-bal - sum(pend, p => p[1]));
  const pendHtml = pend.length || other > 0.004 ? `
      <ul class="cats">
        ${pend.map(([k, v]) => `<li class="cat-row pend"><span>${esc(catLabel(splitKey(k)))}</span><b>${money(v)}</b></li>`).join('')}
        ${other > 0.004 ? `<li class="cat-row pend"><span>Sin categoría (saldo inicial)</span><b>${money(other)}</b></li>` : ''}
      </ul>` : '';
  return `
    <section class="card">
      <div class="card-h">
        <div><h3>💳 ${esc(a.name)}</h3>
          <small>${bal < 0 ? 'Debes' : 'A favor'} <b class="${bal < 0 ? 'neg' : 'pos'}">${money(Math.abs(bal))}</b>${free !== null ? ` · Crédito disponible ${money(free)}` : ''}</small></div>
        <button class="icon" data-act="edit-acc" data-acc="${a.id}" aria-label="Editar tarjeta ${esc(a.name)}">✎</button>
      </div>
      ${pendHtml}
      <div class="card-f"><button class="btn sm" data-act="pay-card" data-acc="${a.id}">Pagar tarjeta</button>
        <button class="btn sm" data-act="new-exp" data-card="${a.id}">− Compra</button></div>
    </section>`;
}

// ---------- gasto ----------
export function expenseForm(move, presetKey, presetCard) {
  if (!hasNormalCats()) return toast('Primero crea una cuenta con una categoría');
  const keys = normalKeys();
  const res = reservedMap(move); // lo apartado para tarjetas, sin contar este mismo gasto
  const bal = k => balanceWithout(move, k);
  const avail = k => availWithout(move, k, res);
  const valid = k => (keys.includes(k) ? k : keys[0]);
  const cards = S.accounts.filter(isCredit);

  let total = move?.total ?? 0;
  let auto = !move || move.parts.length === 1; // en modo auto, el reparto entre categorías se calcula solo
  const rows = move
    ? move.parts.map(p => ({ key: valid(keyOf(p)), amount: p.amount }))
    : [{ key: valid(presetKey), amount: 0 }];
  const files = [...(move?.files ?? [])];

  // Reparte el total: cada categoría aporta hasta lo que tiene libre; el resto pasa a la siguiente.
  function autoFill() {
    for (;;) {
      let rem = total;
      rows.forEach((r, i) => {
        r.amount = i === rows.length - 1 ? rem : Math.min(rem, Math.max(0, avail(r.key)));
        rem = r2(rem - r.amount);
      });
      const last = rows.at(-1);
      const next = nextKey();
      // Al editar solo se ajustan los montos: no se cambia de categoría lo que ya estaba asignado.
      if (!move && last.amount > avail(last.key) + 0.004 && next) rows.push({ key: next, amount: 0 });
      else break;
    }
    while (!move && rows.length > 1 && rows.at(-1).amount <= 0.004) rows.pop();
  }
  // Siguiente categoría sugerida: misma cuenta primero, luego la de mayor dinero libre.
  function nextKey() {
    const used = new Set(rows.map(r => r.key));
    const acc = splitKey(rows.at(-1).key).acc;
    return keys.filter(k => !used.has(k))
      .sort((a, b) => (splitKey(b).acc === acc) - (splitKey(a).acc === acc) || avail(b) - avail(a))[0];
  }

  modal(move ? 'Editar gasto' : 'Nuevo gasto', `
    <label>Título <input name="title" required maxlength="60" value="${esc(move?.title ?? '')}" placeholder="Ej. Netflix, Almuerzo, Gasolina…"></label>
    <label>Monto total <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${move?.total ?? ''}"></label>
    <label>Tipo de gasto ${kindSelect('kind', move?.kind ?? S.settings.lastKind)}</label>
    ${cards.length ? `<label>Pagado con
      <select name="card"><option value="">Efectivo / débito (se descuenta ya)</option>
        ${cards.map(c => `<option value="${c.id}" ${c.id === (move ? move.card : presetCard) ? 'selected' : ''}>💳 ${esc(c.name)} (se paga después)</option>`).join('')}</select></label>` : ''}
    <div>
      <small class="muted" id="parts-label">Dinero apartado para esto</small>
      <div id="parts" class="parts"></div>
      <p id="remain" class="remain" aria-live="polite"></p>
      <button type="button" class="btn sm" id="addpart">＋ Dividir en otra categoría</button>
    </div>
    <label>Nota (opcional) <input name="note" maxlength="120" value="${esc(move?.note ?? '')}"></label>
    <label>Fecha <input name="date" type="date" required value="${move?.date ?? today()}"></label>
    ${attachHtml}`, {
    afterOpen(f) {
      const box = f.querySelector('#parts'), remain = f.querySelector('#remain');
      wireKindSelect(f.elements.kind);
      mountAttach(f.querySelector('#attach'), files);
      const paint = () => {
        box.innerHTML = rows.map((r, i) => `
          <div class="part">
            ${catSelect('key', r.key, avail, `data-i="${i}"`, { credit: false })}
            <input data-i="${i}" type="number" inputmode="decimal" step="0.01" min="0.01" value="${r.amount || ''}" aria-label="Monto de esta categoría">
            ${rows.length > 1 ? `<button type="button" class="mini" data-rm="${i}" aria-label="Quitar">✕</button>` : ''}
          </div>`).join('');
        status();
      };
      const status = () => {
        const diff = r2(total - sum(rows, r => r.amount));
        const neg = rows.some(r => r.amount > avail(r.key) + 0.004);
        remain.className = 'remain ' + (diff ? 'neg' : neg ? 'warn' : '');
        remain.textContent = diff ? `Falta asignar ${money(diff)}` : neg ? 'Alguna categoría quedará en negativo' : '';
      };
      f.elements.amount.addEventListener('input', () => {
        total = r2(+f.elements.amount.value || 0);
        if (auto) { autoFill(); paint(); } else status();
      });
      box.addEventListener('change', e => {
        const i = +e.target.dataset.i;
        if (e.target.tagName === 'SELECT') {
          rows[i].key = e.target.value;
          if (auto) autoFill();
          paint();
        } else {
          rows[i].amount = +e.target.value || 0;
          auto = false;
          status();
        }
      });
      box.addEventListener('input', e => {
        if (e.target.tagName !== 'INPUT') return;
        rows[+e.target.dataset.i].amount = +e.target.value || 0;
        auto = false;
        status();
      });
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-rm]');
        if (!b) return;
        rows.splice(+b.dataset.rm, 1);
        auto = false;
        paint();
      });
      f.querySelector('#addpart').onclick = () => {
        const next = nextKey();
        if (!next) return toast('No hay más categorías');
        rows.push({ key: next, amount: Math.max(0, r2(total - sum(rows, r => r.amount))) });
        auto = false;
        paint();
      };
      const syncLabel = () => {
        f.querySelector('#parts-label').textContent = f.elements.card?.value
          ? 'Categoría de la que saldrá el dinero al pagar la tarjeta' : 'Se descuenta de (dinero apartado)';
      };
      f.elements.card?.addEventListener('change', syncLabel);
      syncLabel();
      paint();
      if (!move) f.elements.title.focus();
    },
    async onSubmit(fd) {
      const parts = rows.filter(r => r.amount > 0).map(r => ({ ...splitKey(r.key), amount: r2(r.amount) }));
      const tot = r2(+fd.get('amount'));
      const title = fd.get('title').trim();
      const card = fd.get('card') || null;
      if (!title) { alert('El gasto necesita un título.'); return false; }
      if (!parts.length || Math.abs(sum(parts, p => p.amount) - tot) > 0.005) {
        alert('Los montos de las categorías deben sumar el total del gasto.');
        return false;
      }
      const c = card && findAcc(card);
      if (c?.limit > 0) {
        const room = r2(c.limit + (c.cats[0].balance + (move?.card === card ? move.total : 0)));
        if (tot > room && !confirm(`Esta compra supera el crédito disponible de ${c.name} (${money(Math.max(0, room))}). ¿Continuar?`)) return false;
      }
      const kind = fd.get('kind');
      S.settings.lastKind = kind;
      await saveSettings();
      await saveMove(move, {
        id: move?.id ?? uid(), t: move?.t ?? Date.now(), type: 'expense', date: fd.get('date'),
        title, note: fd.get('note').trim(), kind, total: tot, parts, files: [...files],
        ...(card ? { card } : {}),
        ...(move?.bill ? { bill: move.bill } : {}),
      });
    },
    onDelete: move && (() => deleteMove(move)),
  });
}

// ---------- ingreso y transferencia ----------
export function flowForm(type, move, preset = {}) {
  if (!hasNormalCats()) return toast('Primero crea una cuenta con una categoría');
  const res = reservedMap(move);
  const bal = k => balanceWithout(move, k);
  const free = k => availWithout(move, k, res);
  const first = normalKeys()[0];
  const isX = type === 'transfer';
  const title = { income: 'Ingreso', transfer: 'Mover dinero' }[type];
  const files = [...(move?.files ?? [])];
  const opt = { credit: false };

  modal(move ? `Editar: ${title.toLowerCase()}` : title, `
    ${isX ? `<label>Desde ${catSelect('from', move ? keyOf(move.parts[0]) : preset.from ?? first, free, '', opt)}</label>` : ''}
    <label>${isX ? 'Hacia' : 'Para'} ${catSelect('to', move ? keyOf(isX ? move.to : move.parts[0]) : preset.to ?? first, bal, '', opt)}</label>
    <label>Monto <input name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${move?.total ?? ''}"></label>
    <label>Descripción (opcional) <input name="note" maxlength="80" value="${esc(move?.note ?? '')}"></label>
    <label>Fecha <input name="date" type="date" required value="${move?.date ?? today()}"></label>
    ${isX ? '' : attachHtml}`, {
    afterOpen(f) {
      if (!isX) mountAttach(f.querySelector('#attach'), files);
      if (!move) f.elements.amount.focus();
    },
    async onSubmit(fd) {
      const amount = r2(+fd.get('amount'));
      const to = splitKey(fd.get('to'));
      const m = { id: move?.id ?? uid(), t: move?.t ?? Date.now(), type, date: fd.get('date'), note: fd.get('note').trim(), total: amount };
      if (isX) {
        if (fd.get('from') === fd.get('to')) { alert('Elige categorías distintas.'); return false; }
        m.parts = [{ ...splitKey(fd.get('from')), amount }];
        m.to = to;
      } else {
        m.parts = [{ ...to, amount }];
        m.files = [...files];
      }
      await saveMove(move, m);
    },
    onDelete: move && (() => deleteMove(move)),
  });
}

// ---------- pago de tarjeta ----------
// Propone pagar cada categoría con lo que se gastó de ella con la tarjeta (p. ej. Q200 desde Efectivo/Comida).
export function payCardForm(card, move) {
  if (!hasNormalCats()) return toast('Primero crea una cuenta con una categoría');
  const bal = k => balanceWithout(move, k);
  const debt = r2(-(card.cats[0].balance + (move ? move.total : 0))); // deuda antes de este pago
  const pend = cardPending(card.id, move);
  const opt = { credit: false };
  const rows = move
    ? move.parts.map(p => ({ key: keyOf(p), amount: p.amount }))
    : (pend.size ? [...pend].sort((a, b) => b[1] - a[1]).map(([key, amount]) => ({ key, amount })) : [{ key: normalKeys()[0], amount: Math.max(0, debt) }]);
  const untracked = r2(debt - sum([...pend], p => p[1]));

  modal(move ? `Editar pago de ${card.name}` : `Pagar ${card.name}`, `
    <p class="muted">Debes <b>${money(Math.max(0, debt))}</b>${pend.size ? ' · propuesto según los gastos hechos con la tarjeta' : ''}${untracked > 0.004 && pend.size ? `<br>${money(untracked)} son saldo inicial sin categoría.` : ''}</p>
    <div id="parts" class="parts"></div>
    <p id="remain" class="remain" aria-live="polite"></p>
    <button type="button" class="btn sm" id="addpart">＋ Otra categoría</button>
    <label>Descripción (opcional) <input name="note" maxlength="80" value="${esc(move?.note ?? '')}"></label>
    <label>Fecha <input name="date" type="date" required value="${move?.date ?? today()}"></label>`, {
    submit: 'Registrar pago',
    afterOpen(f) {
      const box = f.querySelector('#parts'), remain = f.querySelector('#remain');
      const paint = () => {
        box.innerHTML = rows.map((r, i) => `
          <div class="part">
            ${catSelect('key', r.key, bal, `data-i="${i}"`, opt)}
            <input data-i="${i}" type="number" inputmode="decimal" step="0.01" min="0.01" value="${r.amount || ''}" aria-label="Monto desde esta categoría">
            ${rows.length > 1 ? `<button type="button" class="mini" data-rm="${i}" aria-label="Quitar">✕</button>` : ''}
          </div>`).join('');
        status();
      };
      const status = () => {
        const t = sum(rows, r => r.amount);
        const over = rows.some(r => r.amount > bal(r.key) + 0.004);
        remain.className = 'remain ' + (over ? 'warn' : 'pos');
        remain.textContent = `Total a pagar: ${money(t)}${t > debt + 0.004 ? ' (más de lo que debes)' : ''}${over ? ' · una categoría quedará en negativo' : ''}`;
      };
      box.addEventListener('change', e => {
        const r = rows[+e.target.dataset.i];
        if (e.target.tagName === 'SELECT') { r.key = e.target.value; paint(); } else { r.amount = +e.target.value || 0; status(); }
      });
      box.addEventListener('input', e => { if (e.target.tagName === 'INPUT') { rows[+e.target.dataset.i].amount = +e.target.value || 0; status(); } });
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-rm]');
        if (b) { rows.splice(+b.dataset.rm, 1); paint(); }
      });
      f.querySelector('#addpart').onclick = () => {
        const used = new Set(rows.map(r => r.key));
        rows.push({ key: normalKeys().find(k => !used.has(k)) ?? normalKeys()[0], amount: 0 });
        paint();
      };
      paint();
    },
    async onSubmit(fd) {
      const parts = rows.filter(r => r.amount > 0).map(r => ({ ...splitKey(r.key), amount: r2(r.amount) }));
      if (!parts.length) { alert('Indica cuánto vas a pagar.'); return false; }
      await saveMove(move, {
        id: move?.id ?? uid(), t: move?.t ?? Date.now(), type: 'transfer', date: fd.get('date'),
        note: fd.get('note').trim() || `Pago ${card.name}`, total: sum(parts, p => p.amount), parts,
        to: { acc: card.id, cat: card.cats[0].id },
      });
    },
    onDelete: move && (() => deleteMove(move)),
  });
}

// Un ingreso repartido por el plan no se edita: se muestra y, si hace falta, se elimina y se registra de nuevo.
export function paydayDetail(m) {
  modal(moveTitle(m), `
    <p class="muted">${fmtDate(m.date)} · Recibido <b>${money(m.total)}</b></p>
    <ul class="moves">${m.parts.map(p => {
      const line = S.plan.find(l => l.id === p.line);
      return `<li class="move static"><span>${esc(line?.name ?? 'Sobrante')}<small>${esc(catLabel(p))}</small></span><span class="amt in">+${money(p.amount)}</span></li>`;
    }).join('')}</ul>
    ${m.files?.length ? `<div>${fileLinks(m.files)}</div>` : ''}
    <small class="muted">Para corregirlo, elimínalo y regístralo de nuevo: los saldos se revierten solos.</small>`, {
    onDelete: () => deleteMove(m),
  });
}

// ---------- cuentas y categorías ----------
export function accountForm(acc) {
  const credit = isCredit(acc);
  modal(acc ? 'Editar cuenta' : 'Nueva cuenta', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(acc?.name ?? '')}" placeholder="Ej. Banco, Efectivo, Visa…"></label>
    <label>Tipo
      <select name="type" ${acc ? 'disabled' : ''}>
        <option value="normal" ${credit ? '' : 'selected'}>Cuenta normal (dinero que tengo)</option>
        <option value="credit" ${credit ? 'selected' : ''}>Tarjeta de crédito (dinero que debo)</option>
      </select>
    </label>
    <div id="credit-fields" ${credit ? '' : 'hidden'}>
      <label>Deuda actual <input name="debt" type="number" inputmode="decimal" step="0.01" min="0" value="${credit ? -(acc.cats[0]?.balance ?? 0) : 0}"></label>
      <label>Límite de crédito (opcional) <input name="limit" type="number" inputmode="decimal" step="0.01" min="0" value="${acc?.limit || ''}"></label>
      <small class="muted">Los gastos con tarjeta suman deuda; al pagarla con «Pagar tarjeta» no se vuelven a contar como gasto.</small>
    </div>`, {
    afterOpen(f) {
      f.elements.type.onchange = () => { f.querySelector("#credit-fields").hidden = f.elements.type.value !== 'credit'; };
    },
    async onSubmit(fd) {
      const name = fd.get('name').trim();
      const isC = acc ? credit : fd.get('type') === 'credit';
      let a = acc;
      if (!a) { a = { id: uid(), name, type: isC ? 'credit' : 'normal', cats: [], order: Date.now() }; S.accounts.push(a); }
      a.name = name;
      if (isC) {
        a.limit = r2(+fd.get('limit')) || 0;
        const debt = -r2(+fd.get('debt') || 0);
        if (a.cats[0]) a.cats[0].balance = debt; else a.cats.push({ id: uid(), name: 'Deuda', balance: debt });
      }
      await saveAccount(a);
    },
    onDelete: acc && (async () => {
      S.accounts = S.accounts.filter(a => a.id !== acc.id);
      await db.commit({ remove: { accounts: [acc.id] } });
    }),
  });
}

export function categoryForm(acc, cat) {
  modal(cat ? 'Editar categoría' : `Nueva categoría en ${acc.name}`, `
    <label>Para qué es el dinero <input name="name" required maxlength="40" value="${esc(cat?.name ?? '')}" placeholder="Ej. Comida, Transporte…"></label>
    <label>Dinero real que hay ahora <input name="balance" type="number" inputmode="decimal" step="0.01" required value="${cat?.balance ?? ''}"></label>
    ${cat ? '<small class="muted">Esto corrige el saldo directamente. Para sumar dinero usa «Ingreso» y para repartirlo «Mover».</small>' : ''}`, {
    async onSubmit(fd) {
      const data = { name: fd.get('name').trim(), balance: r2(+fd.get('balance')) };
      if (cat) Object.assign(cat, data); else acc.cats.push({ id: uid(), ...data });
      await saveAccount(acc);
    },
    onDelete: cat && (async () => {
      acc.cats = acc.cats.filter(c => c.id !== cat.id);
      await saveAccount(acc);
    }),
  });
}

// ---------- acciones ----------
export const actions = {
  'new-acc': () => accountForm(),
  'edit-acc': el => accountForm(findAcc(el.dataset.acc)),
  'new-cat': el => categoryForm(findAcc(el.dataset.acc)),
  'edit-cat': el => categoryForm(findAcc(el.dataset.acc), findCat(el.dataset.acc, el.dataset.cat)),

  'new-exp': el => expenseForm(null, el.dataset.acc && `${el.dataset.acc}|${el.dataset.cat}`, el.dataset.card),
  'new-inc': () => flowForm('income'),
  'new-xfer': () => flowForm('transfer'),
  'pay-card': el => payCardForm(findAcc(el.dataset.acc)),
  'edit-move'(el) {
    const m = S.moves.find(x => x.id === el.dataset.id);
    if (m.type === 'expense') expenseForm(m);
    else if (m.plan) paydayDetail(m);
    else if (m.type === 'transfer' && isCredit(findAcc(m.to.acc))) payCardForm(findAcc(m.to.acc), m);
    else flowForm(m.type, m);
  },
  'more-moves': () => { S.showAllMoves = !S.showAllMoves; },
};
