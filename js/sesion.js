import { S } from './state.js';
import { TABS } from './ui.js';

// Recordar la sesión. Android puede cerrar el proceso de una app instalada mientras está en segundo plano; al volver a abrirla arranca de cero
// (y `S.tab` es 'home'). Para no perder el lugar, al pasar a segundo plano se guarda dónde estabas (pestaña, sub-pantalla, lista o grupo abierto,
// posición del scroll…) y al arrancar se restaura si pasaron menos de 30 minutos; pasado ese tiempo la app abre en Inicio, que es lo útil al empezar
// el día. Solo cambia el estado de la pantalla: los datos siempre están en IndexedDB.
// Solo actúa en la app instalada (`display-mode: standalone`); en una pestaña normal el navegador ya tiene su propia restauración. La clave de
// localStorage `tracker-restore` = 'always' la fuerza (para las pruebas). Todo va en try/catch: sin localStorage o con un valor dañado se abre en Inicio.
const KEY = 'tracker-session';
const WINDOW = 30 * 60 * 1000;
const SUBS = { sub: ['accounts', 'bills', 'reports'], listSub: ['lists', 'agenda', 'templates', 'archive'], gymSub: ['train', 'routines', 'history', 'progress', 'catalog'], habitSlot: ['morning', 'day', 'night', ''] };

const active = () => window.matchMedia?.('(display-mode: standalone)').matches || localStorage.getItem('tracker-restore') === 'always';

export function saveSession() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      t: Date.now(), tab: S.tab, sub: S.sub, listId: S.listId, listSub: S.listSub, noteGroup: S.noteGroup, gymSub: S.gymSub, habitSlot: S.habitSlot,
      homeDoneOpen: !!S.homeDoneOpen, homePendingClosed: !!S.homePendingClosed, scroll: Math.round(window.scrollY),
    }));
  } catch { /* sin almacenamiento local: se abre en Inicio */ }
}

// Restaura el estado guardado (si corresponde) y devuelve el scroll que hay que aplicar tras el primer pintado. Valida todo contra los datos actuales:
// una lista o un grupo que ya no existen simplemente no se abren.
export function restoreSession() {
  try {
    if (!active()) return 0;
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const age = Date.now() - s?.t;
    if (!s || !(age >= 0 && age < WINDOW) || !TABS.some(t => t[0] === s.tab)) return 0;
    S.tab = s.tab;
    for (const [k, ok] of Object.entries(SUBS)) if (ok.includes(s[k])) S[k] = s[k];
    if (S.lists.some(l => l.id === s.listId)) S.listId = s.listId;
    if (S.noteGroups.some(g => g.id === s.noteGroup)) S.noteGroup = s.noteGroup;
    S.homeDoneOpen = s.homeDoneOpen === true;
    S.homePendingClosed = s.homePendingClosed === true;
    return Number.isFinite(s.scroll) && s.scroll > 0 ? Math.min(s.scroll, 100000) : 0;
  } catch { return 0; }
}

// Guarda al pasar a segundo plano (el aviso más fiable en Android, antes de que el sistema pueda cerrar la app) y al descargar la página.
export function watchSession() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSession(); });
  window.addEventListener('pagehide', saveSession);
}
