import { $ } from './util.js';
import { S, hooks, loadState, gcFiles, hasNormalCats } from './state.js';
import { isOpen, openFile } from './ui.js';
import * as money from './money.js';
import * as plan from './plan.js';
import * as bills from './bills.js';
import * as reports from './reports.js';
import * as purchases from './purchases.js';
import * as habits from './habits.js';
import * as data from './data.js';
import { esc } from './util.js';

const SUBS = [['accounts', 'Cuentas'], ['plan', 'Plan'], ['bills', 'Pagos'], ['reports', 'Reportes']];
const SUB_TITLES = { accounts: 'Finanzas', plan: 'Plan de ingresos', bills: 'Pagos', reports: 'Reportes' };
const SUB_ACTION = { accounts: ['new-acc', 'Nueva cuenta'], plan: ['new-line', 'Nueva línea'], bills: ['new-bill', 'Nuevo pago'] };

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  const top = $('#topbar'), view = $('#view');
  $('#fab').hidden = !(S.tab === 'money' && S.sub === 'accounts' && hasNormalCats());

  if (S.tab === 'money') {
    const alerts = bills.billsAlert();
    const [act, label] = SUB_ACTION[S.sub] ?? [];
    top.innerHTML = `<h1>${SUB_TITLES[S.sub]}</h1>${act ? `<button class="icon" data-act="${act}" aria-label="${label}">＋</button>` : ''}`;
    const seg = `<div class="seg" role="tablist">${SUBS.map(([k, name]) =>
      `<button class="${k === S.sub ? 'on' : ''}" data-act="sub" data-sub="${k}">${name}${k === 'bills' && alerts ? `<span class="badge">${alerts}</span>` : ''}</button>`).join('')}</div>`;
    const body = { accounts: money.accountsView, plan: plan.planView, bills: bills.billsView, reports: reports.reportsView }[S.sub]();
    view.innerHTML = seg + body;
  } else if (S.tab === 'habits') {
    top.innerHTML = `<h1>Hábitos</h1><button class="icon" data-act="new-habit" aria-label="Nuevo hábito">＋</button>`;
    view.innerHTML = habits.habitsView();
  } else if (S.tab === 'purchases') {
    top.innerHTML = `<h1>Compras</h1><button class="icon" data-act="new-purchase" aria-label="Nueva compra">＋</button>`;
    view.innerHTML = purchases.purchasesView();
  } else {
    top.innerHTML = `<h1>Datos</h1>`;
    view.innerHTML = data.dataView();
  }
}
hooks.render = render;

const actions = {
  tab: el => { S.tab = el.dataset.tab; },
  sub: el => { S.sub = el.dataset.sub; },
  'open-file': el => openFile(el.dataset.id),
  ...money.actions, ...plan.actions, ...bills.actions, ...reports.actions, ...purchases.actions, ...habits.actions, ...data.actions,
};

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  const fn = el && actions[el.dataset.act];
  if (!fn) return;
  await fn(el);
  if (!isOpen()) render();
});

document.addEventListener('change', async e => {
  const fn = data.changes[e.target.dataset.change];
  if (fn) { await fn(e.target); render(); }
});

// La búsqueda de compras solo repinta la lista para no perder el foco del campo.
document.addEventListener('input', e => {
  if (e.target.id !== 'psearch') return;
  S.search = e.target.value;
  $('#plist').innerHTML = purchases.purchaseList();
});

$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (f) { await data.onFilePicked(f); render(); }
});

(async function init() {
  try {
    await loadState();
    await gcFiles();
  } catch (err) {
    $('#view').innerHTML = `<div class="card empty"><p>No se pudo abrir el almacenamiento local.</p><small>${esc(err.message)}</small></div>`;
    return;
  }
  render();

  // Pide almacenamiento persistente para que Android no lo borre por falta de espacio.
  navigator.storage?.persist?.();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
