import * as db from './db.js';
import { r2, sum, uid, today, byName } from './util.js';

export const S = {
  tab: 'money',
  sub: 'accounts', // accounts | plan | bills | reports
  habits: [], accounts: [], moves: [], plan: [], bills: [], purchases: [],
  files: new Map(), // id -> { mime, name, size } (el contenido se lee bajo demanda)
  settings: { lastExport: null, includeFiles: false, types: null, lastKind: null, lastFrom: null, lastIncomeTo: null, collapsed: {} },
  report: { kind: 'q', ref: today() },
  guide: { ref: today() }, // quincena que se ve en la guía de transferencias
  moveLimit: 30,       // movimientos que muestra la lista principal (crece de 30 en 30)
  purchaseLimit: 40,
  rev: 0,              // versión de los datos: invalida lo calculado en caché
  search: '',
};

// Las vistas se registran aquí para que los formularios puedan pedir un repintado sin importar app.js.
export const hooks = { render: () => {} };

// ---------- caché de lo derivado ----------
// Lo que se calcula recorriendo todo el historial (movimientos ordenados, lo apartado para tarjetas) se guarda
// hasta que cambien los datos. Toda modificación de movimientos o cuentas debe llamar a bump().
const cache = { rev: -1, sorted: null, pending: new Map(), reserved: null };
export const bump = () => { S.rev++; };
function fresh() {
  if (cache.rev !== S.rev) Object.assign(cache, { rev: S.rev, sorted: null, pending: new Map(), reserved: null });
  return cache;
}
// Movimientos de más nuevo a más viejo.
export function sortedMoves() {
  const c = fresh();
  return (c.sorted ??= [...S.moves].sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t));
}

export const DEFAULT_KINDS = ['Comida', 'Transporte', 'Servicios', 'Suscripciones', 'Salud', 'Ocio', 'Hogar', 'Otros'];

export async function loadState() {
  const [habits, accounts, moves, plan, bills, purchases, files, meta] =
    await Promise.all(['habits', 'accounts', 'moves', 'plan', 'bills', 'purchases', 'files', 'meta'].map(db.getAll));
  bump();
  S.habits = habits;
  S.accounts = accounts.map(a => ({ type: 'normal', ...a }));
  sortAccounts();
  S.moves = moves;
  S.plan = plan;
  S.bills = bills;
  S.purchases = purchases;
  S.files = new Map(files.map(f => [f.id, { mime: f.mime, name: f.name, size: f.size }]));
  const settings = meta.find(m => m.k === 'settings');
  if (settings) S.settings = { ...S.settings, ...settings.v };
  if (!S.settings.types) {
    S.settings.types = DEFAULT_KINDS.map(name => ({ id: uid(), name }));
    await saveSettings();
  }
}

export const saveHabit = h => db.commit({ put: { habits: [h] } });
// Cuentas y categorías siempre en orden alfabético (se reordenan al crear o renombrar).
export function sortAccounts() {
  S.accounts.sort(byName);
  S.accounts.forEach(a => a.cats.sort(byName));
}
// Tipos de gasto en orden alfabético (sin tocar el orden guardado).
export const sortedKinds = () => [...S.settings.types].sort(byName);

export const saveAccount = a => { bump(); sortAccounts(); return db.commit({ put: { accounts: [a] } }); };
export const saveSettings = () => db.commit({ put: { meta: [{ k: 'settings', v: S.settings }] } });

// ---------- tipos de gasto ----------
export const kindName = id => S.settings.types.find(t => t.id === id)?.name ?? 'Sin tipo';

// ---------- dinero ----------
export const findAcc = id => S.accounts.find(a => a.id === id);
export const findCat = (accId, catId) => findAcc(accId)?.cats.find(c => c.id === catId);
export const isCredit = acc => acc?.type === 'credit';
export const keyOf = p => `${p.acc}|${p.cat}`;
export const splitKey = k => { const [acc, cat] = k.split('|'); return { acc, cat }; };
export const allKeys = () => S.accounts.flatMap(a => a.cats.map(c => `${a.id}|${c.id}`));
export const hasCats = () => S.accounts.some(a => a.cats.length);
// Categorías de dinero real (las tarjetas no tienen: son un método de pago).
export const normalKeys = () => S.accounts.filter(a => !isCredit(a)).flatMap(a => a.cats.map(c => `${a.id}|${c.id}`));
export const hasNormalCats = () => normalKeys().length > 0;
export const catLabel = p => {
  const a = findAcc(p.acc), c = findCat(p.acc, p.cat);
  if (!c) return '(eliminada)';
  return isCredit(a) ? `${a.name} (tarjeta)` : `${a.name} / ${c.name}`;
};

// Dinero en cuentas normales, deuda en tarjetas y neto (lo que realmente tienes).
export function totals() {
  const cash = sum(S.accounts.filter(a => !isCredit(a)), a => sum(a.cats, c => c.balance));
  const debt = sum(S.accounts.filter(isCredit), a => sum(a.cats, c => c.balance)); // ≤ 0 normalmente
  return { cash, debt, net: r2(cash + debt) };
}

// Efecto de un movimiento sobre los saldos: lista de [acc, cat, delta].
// Un gasto con tarjeta solo suma deuda a la tarjeta: el dinero apartado sigue en su categoría hasta que se paga.
export function effects(m) {
  if (m.type === 'expense' && m.card) {
    const cat = findAcc(m.card)?.cats[0];
    return cat ? [[m.card, cat.id, -m.total]] : [];
  }
  const out = m.parts.map(p => [p.acc, p.cat, m.type === 'income' ? p.amount : -p.amount]);
  if (m.type === 'transfer') out.push([m.to.acc, m.to.cat, m.total]);
  return out;
}
export function applyMove(m, sign) {
  for (const [a, c, d] of effects(m)) {
    const cat = findCat(a, c);
    if (cat) cat.balance = r2(cat.balance + sign * d);
  }
}
// Saldo de una categoría como estaba antes de aplicar `move` (para editarlo sin contarlo dos veces).
export function balanceWithout(move, key) {
  const { acc, cat } = splitKey(key);
  const base = findCat(acc, cat)?.balance ?? 0;
  if (!move) return base;
  return r2(base - sum(effects(move).filter(e => e[0] === acc && e[1] === cat), e => e[2]));
}
// ---------- tarjetas: lo apartado en cada categoría ----------
// Por cada categoría, cuánto de lo que debe una tarjeta saldrá de ella. Se deriva del historial:
// las compras suman a su categoría y los pagos restan primero de la categoría desde la que se paga
// y luego (si sobra) de las más grandes. Así editar o borrar un movimiento siempre cuadra.
export function cardPending(cardId, exclude = null) {
  const c = fresh();
  if (!exclude && c.pending.has(cardId)) return c.pending.get(cardId);
  const out = computePending(cardId, exclude);
  if (!exclude) c.pending.set(cardId, out);
  return out;
}

function computePending(cardId, exclude) {
  const pend = new Map();
  const take = (k, rem) => {
    const v = pend.get(k) ?? 0, t = Math.min(v, rem);
    if (t > 0) pend.set(k, r2(v - t));
    return r2(rem - Math.max(0, t));
  };
  const pay = (key, amount) => {
    let rem = key ? take(key, amount) : amount;
    while (rem > 0.004) {
      const big = [...pend].filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1])[0];
      if (!big) break;
      rem = take(big[0], rem);
    }
  };
  const ms = S.moves.filter(m => m.id !== exclude?.id).sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
  for (const m of ms) {
    if (m.type === 'expense' && m.card === cardId) m.parts.forEach(p => pend.set(keyOf(p), r2((pend.get(keyOf(p)) ?? 0) + p.amount)));
    else if (m.type === 'transfer' && m.to.acc === cardId) m.parts.forEach(p => pay(keyOf(p), p.amount));
    else if (m.type === 'income') m.parts.filter(p => p.acc === cardId).forEach(p => pay(null, p.amount));
  }
  return new Map([...pend].filter(([, v]) => v > 0.004));
}

// categoría -> dinero apartado para pagar tarjetas (todas las tarjetas juntas).
export function reservedMap(exclude = null) {
  const c = fresh();
  if (!exclude && c.reserved) return c.reserved;
  const out = new Map();
  for (const a of S.accounts.filter(isCredit)) {
    for (const [k, v] of cardPending(a.id, exclude)) out.set(k, r2((out.get(k) ?? 0) + v));
  }
  if (!exclude) c.reserved = out;
  return out;
}

// Cuánto se puede gastar de una categoría: su saldo menos lo apartado para tarjetas.
export function availWithout(move, key, res = reservedMap(move)) {
  return r2(balanceWithout(move, key) - (res.get(key) ?? 0));
}

// Reparte un pago a una tarjeta entre las categorías con gastos pendientes; lo que sobre sale de la categoría con más dinero.
export function allocatePayment(card, amount, exclude = null) {
  let rem = amount;
  const parts = [];
  for (const [key, v] of [...cardPending(card.id, exclude)].sort((a, b) => b[1] - a[1])) {
    if (rem <= 0.004) break;
    const t = r2(Math.min(v, rem));
    parts.push({ ...splitKey(key), amount: t });
    rem = r2(rem - t);
  }
  if (rem > 0.004) {
    const k = normalKeys().sort((a, b) => balanceWithout(null, b) - balanceWithout(null, a))[0];
    if (k) parts.push({ ...splitKey(k), amount: rem });
  }
  return parts;
}

export async function saveMove(old, neu) {
  bump();
  if (old) applyMove(old, -1);
  applyMove(neu, 1);
  const i = old ? S.moves.findIndex(m => m.id === old.id) : -1;
  if (i >= 0) S.moves[i] = neu; else S.moves.push(neu);
  await db.commit({ put: { accounts: S.accounts, moves: [neu] } });
  await gcFiles();
}
export async function deleteMove(m) {
  bump();
  applyMove(m, -1);
  S.moves = S.moves.filter(x => x.id !== m.id);
  await db.commit({ put: { accounts: S.accounts }, remove: { moves: [m.id] } });
  await gcFiles();
}

// ---------- pagos, compras, plan ----------
export const saveBill = b => db.commit({ put: { bills: [b] } });
export const savePurchase = async p => { await db.commit({ put: { purchases: [p] } }); await gcFiles(); };
export const savePlanLine = l => db.commit({ put: { plan: [l] } });

// ---------- archivos adjuntos ----------
export async function addFile({ blob, mime, name }) {
  const id = uid();
  await db.commit({ put: { files: [{ id, blob, mime, name, size: blob.size }] } });
  S.files.set(id, { mime, name, size: blob.size });
  return id;
}

// Borra los archivos que ya no referencia ningún gasto, pago o compra.
export async function gcFiles() {
  const used = new Set();
  S.moves.forEach(m => m.files?.forEach(f => used.add(f)));
  S.purchases.forEach(p => p.files?.forEach(f => used.add(f)));
  S.bills.forEach(b => Object.values(b.paid ?? {}).forEach(e => e.files?.forEach(f => used.add(f))));
  const orphans = [...S.files.keys()].filter(id => !used.has(id));
  if (!orphans.length) return;
  orphans.forEach(id => S.files.delete(id));
  await db.commit({ remove: { files: orphans } });
}
