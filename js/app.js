import { $, toast } from './util.js';
import { icon } from './icons.js';
import { S, hooks, loadState, gcFiles, hasNormalCats } from './state.js';
import { isOpen, openFile, applyFont, applyTheme } from './ui.js';
import * as money from './money.js';
import * as bills from './bills.js';
import * as reports from './reports.js';
import * as purchases from './purchases.js';
import * as habits from './habits.js';
import * as lists from './lists.js';
import * as home from './home.js';
import * as inbox from './inbox.js';
import * as pomodoro from './pomodoro.js';
import * as gym from './gym.js';
import * as notes from './notes.js';
import * as data from './data.js';
import * as sync from './sync.js';
import { esc } from './util.js';

const SUBS = [['accounts', 'Cuentas'], ['bills', 'Pagos'], ['reports', 'Reportes']];
const SUB_TITLES = { accounts: 'Finanzas', bills: 'Pagos', reports: 'Reportes' };
const SUB_ACTION = { accounts: ['new-acc', 'Nueva cuenta'], bills: ['new-bill', 'Nuevo pago'] };

const TABS = [['home', 'Inicio', 'home'], ['money', 'Finanzas', 'wallet'], ['habits', 'Hábitos', 'habits'], ['lists', 'Listas', 'checklist'], ['purchases', 'Compras', 'bag'],
  ['pomodoro', 'Pomodoro', 'timer'], ['gym', 'Gimnasio', 'dumbbell'], ['notes', 'Notas', 'note'], ['data', 'Configuración', 'data']];

const menuOpen = open => {
  document.body.classList.toggle('menu-open', open);
  document.querySelectorAll('[data-act=menu-open]').forEach(b => b.setAttribute('aria-expanded', open));
  $('#drawer').setAttribute('aria-hidden', !open);
};

// Barra superior: botón de menú (tres líneas) a la par del título y, opcionalmente, una acción a la derecha.
const topbar = (title, action) => `
  <button class="icon" data-act="menu-open" aria-label="Abrir menú" aria-expanded="false">${icon('menu')}</button>
  <h1>${title}</h1>${action ? `<button class="icon" data-act="${action[0]}" aria-label="${action[1]}">${icon('plus')}</button>` : ''}`;

// Si una pantalla falla al pintarse (un dato que no se pudo reparar), solo esa sección muestra el aviso: el menú y las demás siguen.
function broken(err) {
  console.error(err);
  return `<div class="card empty"><p>No se pudo mostrar esta sección.</p>
    <small>Algún dato guardado tiene un formato inesperado. Las demás secciones siguen funcionando; si el problema sigue, restaura un respaldo desde Configuración.</small>
    <small class="muted">Detalle: ${esc(err?.message ?? String(err))}</small>
    <button class="btn" data-act="tab" data-tab="home">Ir a Inicio</button></div>`;
}

let enter = false; // la próxima pintura viene de un cambio de pestaña: entra con fundido

function render() {
  $('#drawer').innerHTML = `
    <div class="drawer-h"><b>Tracker</b><button class="icon" data-act="menu-close" aria-label="Cerrar menú">${icon('close')}</button></div>
    <nav id="tabs">${TABS.map(([k, name, ic]) => `<button class="${k === S.tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${icon(ic)}<span>${name}</span></button>`).join('')}</nav>`;
  const top = $('#topbar'), view = $('#view');
  const fab = $('#fab');
  fab.hidden = !(S.tab === 'money' && S.sub === 'accounts' && hasNormalCats());
  fab.innerHTML = icon('plus');

  try {
    if (S.tab === 'home') {
      top.innerHTML = topbar('Inicio');
      view.innerHTML = home.homeView();
      home.restoreQuick();
    } else if (S.tab === 'money') {
      const alerts = bills.billsAlert();
      top.innerHTML = topbar(SUB_TITLES[S.sub], SUB_ACTION[S.sub]);
      const seg = `<div class="seg" role="tablist">${SUBS.map(([k, name]) =>
        `<button class="${k === S.sub ? 'on' : ''}" data-act="sub" data-sub="${k}">${name}${k === 'bills' && alerts ? `<span class="badge">${alerts}</span>` : ''}</button>`).join('')}</div>`;
      const body = { accounts: money.accountsView, bills: bills.billsView, reports: reports.reportsView }[S.sub]();
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
    } else if (S.tab === 'gym') {
      top.innerHTML = S.gymSub === 'catalog'
        ? `<button class="icon" data-act="gym-sub" data-sub="routines" aria-label="Volver a las rutinas">${icon('left')}</button><h1>Catálogo de ejercicios</h1>
          <button class="icon" data-act="new-ex" aria-label="Nuevo ejercicio">${icon('plus')}</button>`
        : topbar('Gimnasio', S.gymSub === 'routines' ? ['new-routine', 'Nueva rutina'] : null);
      view.innerHTML = gym.gymView();
    } else if (S.tab === 'purchases') {
      top.innerHTML = topbar('Compras', ['new-purchase', 'Nueva compra']);
      view.innerHTML = purchases.purchasesView();
    } else {
      top.innerHTML = topbar('Configuración');
      view.innerHTML = data.dataView(sync.syncView());
    }
  } catch (err) {
    top.innerHTML = topbar(TABS.find(t => t[0] === S.tab)?.[1] ?? 'Tracker'); // con el menú siempre a mano
    view.innerHTML = broken(err);
    S.listId = null; // al volver a la sección se abre su vista general, no el detalle que falló
    S.noteGroup = null;
  }
  menuOpen(document.body.classList.contains('menu-open'));
  if (enter) { enter = false; view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
}
hooks.render = render;

const actions = {
  tab: el => { enter = true; S.tab = el.dataset.tab; if (S.tab === 'home') home.nextQuote(); S.habitsSort = false; S.listEdit = false; S.inboxSel = null; menuOpen(false); window.scrollTo(0, 0); },
  'menu-open': () => menuOpen(true),
  'menu-close': () => menuOpen(false),
  sub: el => { S.sub = el.dataset.sub; },
  'open-file': el => openFile(el.dataset.id),
  ...money.actions, ...bills.actions, ...reports.actions, ...purchases.actions, ...habits.actions, ...lists.actions, ...home.actions, ...inbox.actions, ...pomodoro.actions, ...gym.actions, ...notes.actions, ...data.actions, ...sync.actions,
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

const changes = { ...data.changes, ...lists.changes, ...gym.changes };
document.addEventListener('change', async e => {
  const fn = changes[e.target.dataset.change];
  // Un cambio que devuelve false se guarda sin repintar (los campos de peso y repeticiones del Gimnasio).
  if (fn && (await fn(e.target)) !== false) render();
});

// Las búsquedas (compras, notas) solo repintan su lista para no perder el foco del campo.
document.addEventListener('input', e => {
  if (e.target.id === 'nsearch') return notes.onSearch(e.target.value);
  if (e.target.id === 'gsearch') return gym.onSearch(e.target.value);
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
  if (f) { await data.onFilePicked(f); applyFont(S.settings.font); applyTheme(S.settings.theme); pomodoro.resume(); gym.resume(); render(); }
});

// La actualización de la base de datos espera mientras otra ventana con la versión anterior siga abierta.
window.addEventListener('db-blocked', () => {
  if (!$('.boot')) return;
  $('#view').innerHTML = `<div class="card empty"><p>Tracker está abierto en otra ventana con una versión anterior.</p>
    <small>Ciérrala (en el navegador, cierra la otra pestaña de Tracker; si la instalaste, quítala de las apps recientes). Esta se abrirá sola en cuanto lo hagas.</small></div>`;
});

// El service worker abre con la copia guardada y baja la versión nueva en segundo plano: cuando está lista avisa aquí. No se recarga solo
// para no tirar un formulario a medias.
function showUpdate() {
  if ($('#upd')) return;
  const d = document.createElement('div');
  d.id = 'upd';
  d.setAttribute('role', 'status');
  d.innerHTML = `<span>Hay una versión nueva</span><button class="btn sm primary" id="upd-go">Actualizar</button>
    <button class="icon sm" id="upd-x" aria-label="Ahora no">${icon('close')}</button>`;
  document.body.append(d);
  $('#upd-go').onclick = () => location.reload();
  $('#upd-x').onclick = () => d.remove();
}

// Se escucha desde el arranque del módulo (no desde init): la versión nueva puede estar lista antes de que termine de cargar la base.
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'update-ready') showUpdate(); });

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
    applyTheme(S.settings.theme);
    await gcFiles();
  } catch (err) {
    return fatal('No se pudo abrir el almacenamiento local.', err);
  }
  try {
    render();
    pomodoro.resume(); // si el temporizador estaba corriendo al cerrar la app, sigue o avanza
    gym.resume();      // y lo mismo con el descanso entre series
  } catch (err) {
    console.error(err);
    return fatal('Tracker no pudo mostrar la pantalla.', err);
  }

  await receiveShared();

  // Pide almacenamiento persistente para que Android no lo borre por falta de espacio.
  navigator.storage?.persist?.();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.ready.then(r => r.active?.postMessage({ type: 'ver' })).catch(() => {}); // «¿lo que veo ya quedó viejo?»
  }
})();
