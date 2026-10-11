import { $ } from './util.js';
import { icon } from './icons.js';
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

const SUBS = [['accounts', 'Cuentas'], ['plan', 'Guía'], ['bills', 'Pagos'], ['reports', 'Reportes']];
const SUB_TITLES = { accounts: 'Finanzas', plan: 'Guía de transferencias', bills: 'Pagos', reports: 'Reportes' };
const SUB_ACTION = { accounts: ['new-acc', 'Nueva cuenta'], plan: ['new-line', 'Nueva línea'], bills: ['new-bill', 'Nuevo pago'] };

const TABS = [['money', 'Finanzas', 'wallet'], ['habits', 'Hábitos', 'habits'], ['purchases', 'Compras', 'bag'], ['data', 'Datos', 'data']];

const menuOpen = open => {
  document.body.classList.toggle('menu-open', open);
  document.querySelectorAll('[data-act=menu-open]').forEach(b => b.setAttribute('aria-expanded', open));
  $('#drawer').setAttribute('aria-hidden', !open);
};

// Barra superior: botón de menú (tres líneas) a la par del título y, opcionalmente, una acción a la derecha.
const topbar = (title, action) => `
  <button class="icon" data-act="menu-open" aria-label="Abrir menú" aria-expanded="false">${icon('menu')}</button>
  <h1>${title}</h1>${action ? `<button class="icon" data-act="${action[0]}" aria-label="${action[1]}">${icon('plus')}</button>` : ''}`;

function render() {
  $('#drawer').innerHTML = `
    <div class="drawer-h"><b>Tracker</b><button class="icon" data-act="menu-close" aria-label="Cerrar menú">${icon('close')}</button></div>
    <nav id="tabs">${TABS.map(([k, name, ic]) => `<button class="${k === S.tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${icon(ic)}<span>${name}</span></button>`).join('')}</nav>`;
  const top = $('#topbar'), view = $('#view');
  const fab = $('#fab');
  fab.hidden = !(S.tab === 'money' && S.sub === 'accounts' && hasNormalCats());
  fab.innerHTML = icon('plus');

  if (S.tab === 'money') {
    const alerts = bills.billsAlert();
    top.innerHTML = topbar(SUB_TITLES[S.sub], SUB_ACTION[S.sub]);
    const seg = `<div class="seg" role="tablist">${SUBS.map(([k, name]) =>
      `<button class="${k === S.sub ? 'on' : ''}" data-act="sub" data-sub="${k}">${name}${k === 'bills' && alerts ? `<span class="badge">${alerts}</span>` : ''}</button>`).join('')}</div>`;
    const body = { accounts: money.accountsView, plan: plan.planView, bills: bills.billsView, reports: reports.reportsView }[S.sub]();
    view.innerHTML = seg + body;
  } else if (S.tab === 'habits') {
    top.innerHTML = topbar('Hábitos', ['new-habit', 'Nuevo hábito']);
    view.innerHTML = habits.habitsView();
  } else if (S.tab === 'purchases') {
    top.innerHTML = topbar('Compras', ['new-purchase', 'Nueva compra']);
    view.innerHTML = purchases.purchasesView();
  } else {
    top.innerHTML = topbar('Datos');
    view.innerHTML = data.dataView();
  }
  menuOpen(document.body.classList.contains('menu-open'));
}
hooks.render = render;

const actions = {
  tab: el => { S.tab = el.dataset.tab; menuOpen(false); window.scrollTo(0, 0); },
  'menu-open': () => menuOpen(true),
  'menu-close': () => menuOpen(false),
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
  S.purchaseLimit = 40;
  $('#plist').innerHTML = purchases.purchaseList();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') menuOpen(false); });

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
