import { $, toast } from './util.js';
import { icon } from './icons.js';
import { S, hooks, loadState, gcFiles, hasNormalCats } from './state.js';
import { isOpen, openFile, applyFont } from './ui.js';
import * as money from './money.js';
import * as plan from './plan.js';
import * as bills from './bills.js';
import * as reports from './reports.js';
import * as purchases from './purchases.js';
import * as habits from './habits.js';
import * as lists from './lists.js';
import * as home from './home.js';
import * as inbox from './inbox.js';
import * as pomodoro from './pomodoro.js';
import * as notes from './notes.js';
import * as data from './data.js';
import { esc } from './util.js';

const SUBS = [['accounts', 'Cuentas'], ['plan', 'Guía'], ['bills', 'Pagos'], ['reports', 'Reportes']];
const SUB_TITLES = { accounts: 'Finanzas', plan: 'Guía de transferencias', bills: 'Pagos', reports: 'Reportes' };
const SUB_ACTION = { accounts: ['new-acc', 'Nueva cuenta'], plan: ['new-line', 'Nueva línea'], bills: ['new-bill', 'Nuevo pago'] };

const TABS = [['home', 'Inicio', 'home'], ['money', 'Finanzas', 'wallet'], ['habits', 'Hábitos', 'habits'], ['lists', 'Listas', 'checklist'], ['purchases', 'Compras', 'bag'],
  ['pomodoro', 'Pomodoro', 'timer'], ['gym', 'Gimnasio', 'dumbbell'], ['notes', 'Notas', 'note'], ['data', 'Configuración', 'data']];
// Secciones aún sin contenido: título (para la barra superior) y mensaje.
const EMPTY = { gym: 'Gimnasio' };

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

  if (S.tab === 'home') {
    top.innerHTML = topbar('Inicio');
    view.innerHTML = home.homeView();
    home.restoreQuick();
  } else if (S.tab === 'money') {
    const alerts = bills.billsAlert();
    top.innerHTML = topbar(SUB_TITLES[S.sub], SUB_ACTION[S.sub]);
    const seg = `<div class="seg" role="tablist">${SUBS.map(([k, name]) =>
      `<button class="${k === S.sub ? 'on' : ''}" data-act="sub" data-sub="${k}">${name}${k === 'bills' && alerts ? `<span class="badge">${alerts}</span>` : ''}</button>`).join('')}</div>`;
    const body = { accounts: money.accountsView, plan: plan.planView, bills: bills.billsView, reports: reports.reportsView }[S.sub]();
    view.innerHTML = seg + body;
  } else if (S.tab === 'habits') {
    top.innerHTML = topbar('Hábitos', ['new-habit', 'Nuevo hábito']);
    view.innerHTML = habits.habitsView();
    habits.restoreCarousel();
  } else if (S.tab === 'lists') {
    const cur = S.listId && lists.current();
    if (cur) {
      top.innerHTML = `<button class="icon" data-act="list-back" aria-label="Volver a las listas">${icon('left')}</button><h1>${esc(cur.name)}</h1>
        <button class="icon" data-act="list-opts" aria-label="Opciones de la lista">${icon('edit')}</button>`;
      view.innerHTML = lists.listDetail(cur);
    } else {
      top.innerHTML = topbar('Listas', S.listSub === 'templates' ? ['new-tpl', 'Nueva plantilla'] : ['new-list', 'Nueva lista']);
      view.innerHTML = lists.listsView();
    }
    lists.restoreFocus();
  } else if (S.tab === 'pomodoro') {
    top.innerHTML = topbar('Pomodoro');
    view.innerHTML = pomodoro.pomodoroView();
  } else if (S.tab === 'notes') {
    const g = S.noteGroup && notes.currentGroup();
    if (g) {
      top.innerHTML = `<button class="icon" data-act="note-back" aria-label="Volver a los grupos">${icon('left')}</button><h1>${esc(g.name)}</h1>
        <button class="icon" data-act="new-note" aria-label="Nueva nota">${icon('plus')}</button>`;
      view.innerHTML = notes.groupView(g);
    } else {
      top.innerHTML = topbar('Notas', ['new-ngroup', 'Nuevo grupo']);
      view.innerHTML = notes.notesHome();
    }
  } else if (EMPTY[S.tab]) {
    top.innerHTML = topbar(EMPTY[S.tab]);
    view.innerHTML = '<div class="card empty"><p>Esta sección está vacía por ahora.</p></div>';
  } else if (S.tab === 'purchases') {
    top.innerHTML = topbar('Compras', ['new-purchase', 'Nueva compra']);
    view.innerHTML = purchases.purchasesView();
  } else {
    top.innerHTML = topbar('Configuración');
    view.innerHTML = data.dataView();
  }
  menuOpen(document.body.classList.contains('menu-open'));
}
hooks.render = render;

const actions = {
  tab: el => { S.tab = el.dataset.tab; if (S.tab === 'home') home.nextQuote(); S.habitsSort = false; S.listEdit = false; menuOpen(false); window.scrollTo(0, 0); },
  'menu-open': () => menuOpen(true),
  'menu-close': () => menuOpen(false),
  sub: el => { S.sub = el.dataset.sub; },
  'open-file': el => openFile(el.dataset.id),
  ...money.actions, ...plan.actions, ...bills.actions, ...reports.actions, ...purchases.actions, ...habits.actions, ...lists.actions, ...home.actions, ...inbox.actions, ...pomodoro.actions, ...notes.actions, ...data.actions,
};

document.addEventListener('click', async e => {
  const pill = e.target.closest('[data-slotpill]');
  if (pill) return habits.goSlot(pill);
  const el = e.target.closest('[data-act]');
  const fn = el && actions[el.dataset.act];
  if (!fn) return;
  await fn(el);
  if (!isOpen()) render();
});

const changes = { ...data.changes, ...lists.changes };
document.addEventListener('change', async e => {
  const fn = changes[e.target.dataset.change];
  if (fn) { await fn(e.target); render(); }
});

// Las búsquedas (compras, notas) solo repintan su lista para no perder el foco del campo.
document.addEventListener('input', e => {
  if (e.target.id === 'nsearch') return notes.onSearch(e.target.value);
  if (e.target.id !== 'psearch') return;
  S.search = e.target.value;
  S.purchaseLimit = 40;
  $('#plist').innerHTML = purchases.purchaseList();
});

// El carrusel de hábitos recuerda en qué momento del día va (el evento scroll no burbujea: se captura).
document.addEventListener('scroll', e => { if (e.target.id === 'hcar') habits.onCarouselScroll(e.target); }, true);

// Formularios en línea (agregar a una lista): se gestionan con data-act, sin enviar la página.
document.addEventListener('submit', e => { if (e.target.matches('[data-noform]')) e.preventDefault(); });

// Cada vez que se vuelve a mostrar Inicio (por ejemplo al regresar a la app desde otra) se elige otra frase.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.tab === 'home' && !isOpen()) { home.nextQuote(); render(); }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') menuOpen(false); });

$('#file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (f) { await data.onFilePicked(f); applyFont(S.settings.font); pomodoro.resume(); render(); }
});

// La actualización de la base de datos espera mientras otra ventana con la versión anterior siga abierta.
window.addEventListener('db-blocked', () => {
  if (!$('.boot')) return;
  $('#view').innerHTML = `<div class="card empty"><p>Tracker está abierto en otra ventana con una versión anterior.</p>
    <small>Ciérrala (en el navegador, cierra la otra pestaña de Tracker; si la instalaste, quítala de las apps recientes). Esta se abrirá sola en cuanto lo hagas.</small></div>`;
});

const fatal = (msg, err) => {
  $('#view').innerHTML = `<div class="card empty"><p>${msg}</p><small>${esc(err?.message ?? '')}</small>
    <button class="btn primary" onclick="location.reload()">Reintentar</button></div>`;
};

// Lo que se comparte desde otra app («Compartir» → Tracker) llega por la URL (Web Share Target) y cae en la bandeja de Inicio.
async function receiveShared() {
  const q = new URLSearchParams(location.search);
  const parts = [];
  for (const k of ['title', 'text', 'url']) {
    const v = (q.get(k) ?? '').trim();
    if (v && !parts.some(p => p.includes(v))) parts.push(v); // Android suele repetir el enlace dentro del texto
  }
  if (!parts.length) return;
  history.replaceState(null, '', location.pathname); // para que recargar no la guarde otra vez
  if (await inbox.addQuick(parts.join('\n'))) {
    S.tab = 'home';
    render();
    toast('Guardado en la bandeja de Inicio');
  }
}

(async function init() {
  try {
    await loadState();
    applyFont(S.settings.font);
    await gcFiles();
  } catch (err) {
    return fatal('No se pudo abrir el almacenamiento local.', err);
  }
  try {
    render();
    pomodoro.resume(); // si el temporizador estaba corriendo al cerrar la app, sigue o avanza
  } catch (err) {
    console.error(err);
    return fatal('Tracker no pudo mostrar la pantalla.', err);
  }

  await receiveShared();

  // Pide almacenamiento persistente para que Android no lo borre por falta de espacio.
  navigator.storage?.persist?.();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
