import { $, esc, today, fmtDate, daysBetween, pl, applyOrder, toast } from './util.js';
import { S, saveHabit, saveList } from './state.js';
import { isDone, isSkip, markDay, skipDay, cls, mark, label, groups, badge } from './habits.js';
import { icon } from './icons.js';
import { billsSummary } from './bills.js';
import { todayTasks, taskRow } from './lists.js';
import { quickNoteForm, inboxSection, restoreFocus as restoreQuick } from './inbox.js';

// Frases con autoría documentada (obras, discursos o tradición). Se evitaron las de atribución dudosa.
export const QUOTES = [
  ['El que tiene un porqué para vivir puede soportar casi cualquier cómo.', 'Friedrich Nietzsche'],
  ['La vida no examinada no merece ser vivida.', 'Sócrates'],
  ['Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.', 'Will Durant'],
  ['El viaje de mil millas comienza con un solo paso.', 'Lao Tsé'],
  ['No es que tengamos poco tiempo, sino que perdemos mucho.', 'Séneca'],
  ['El alma se tiñe del color de sus pensamientos.', 'Marco Aurelio'],
  ['No son las cosas las que inquietan a las personas, sino las opiniones que tienen de ellas.', 'Epicteto'],
  ['La imaginación es más importante que el conocimiento.', 'Albert Einstein'],
  ['Caminante, no hay camino, se hace camino al andar.', 'Antonio Machado'],
  ['Lo esencial es invisible a los ojos.', 'Antoine de Saint-Exupéry'],
  ['Quien lee mucho y anda mucho, ve mucho y sabe mucho.', 'Miguel de Cervantes'],
  ['La libertad, Sancho, es uno de los más preciosos dones que a los hombres dieron los cielos.', 'Miguel de Cervantes'],
  ['Todo lo que somos es el resultado de lo que hemos pensado.', 'Buda (Dhammapada)'],
  ['La única manera de hacer un gran trabajo es amar lo que haces.', 'Steve Jobs'],
  ['Nada en la vida debe ser temido, solo comprendido.', 'Marie Curie'],
  ['Cuando ya no podemos cambiar una situación, se nos desafía a cambiarnos a nosotros mismos.', 'Viktor Frankl'],
  ['Lo que no me mata me hace más fuerte.', 'Friedrich Nietzsche'],
  ['Cuida los pequeños gastos: un pequeño agujero hunde un gran barco.', 'Benjamin Franklin'],
  ['El mejor momento para plantar un árbol fue hace veinte años. El segundo mejor momento es ahora.', 'Proverbio chino'],
  ['La gota perfora la piedra no por su fuerza, sino por su constancia.', 'Ovidio'],
  ['Hay que pedir una mente sana en un cuerpo sano.', 'Juvenal'],
  ['Vencer a otros es fuerza; vencerse a uno mismo es poder.', 'Lao Tsé'],
  ['No hay viento favorable para quien no sabe adónde va.', 'Séneca'],
  ['Aprender sin pensar es inútil; pensar sin aprender, peligroso.', 'Confucio'],
  ['Quien teme sufrir ya sufre lo que teme.', 'Michel de Montaigne'],
  ['La vida es un diez por ciento lo que te ocurre y un noventa por ciento cómo reaccionas.', 'Charles R. Swindoll'],
  ['Si quieres ir rápido, camina solo; si quieres llegar lejos, ve acompañado.', 'Proverbio africano'],
  ['Poco a poco se anda lejos.', 'Refrán'],
  ['La vida no es la que uno vivió, sino la que uno recuerda y cómo la recuerda para contarla.', 'Gabriel García Márquez'],
  ['Pies, ¿para qué los quiero si tengo alas para volar?', 'Frida Kahlo'],
  ['Que otros se jacten de las páginas que han escrito; a mí me enorgullecen las que he leído.', 'Jorge Luis Borges'],
  ['Ser culto es el único modo de ser libre.', 'José Martí'],
  ['No es pobre el que tiene poco, sino el que desea más.', 'Séneca'],
  ['Si tienes un jardín y una biblioteca, nada te faltará.', 'Cicerón'],
];

// Se mezclan todas y se reparten una a una: no se repite ninguna hasta haberlas visto todas
// (y la primera de una mezcla nueva nunca es la última de la anterior).
let bag = [], current = null;

export function nextQuote() {
  if (!bag.length) {
    bag = QUOTES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag.length > 1 && bag.at(-1) === current) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  current = bag.pop();
}

const greeting = h => (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
const MAX_TASKS = 3;

// Franja de resumen: lo que pasa hoy de un vistazo (hábitos, tareas, pagos); cada chip lleva a su sección.
function summaryStrip() {
  const t = today();
  const due = S.habits.filter(h => !isSkip(h, t)), done = due.filter(h => isDone(h, t)).length; // los que hoy «no tocan» no cuentan
  const b = billsSummary(), n = b.next ? daysBetween(t, b.next.due) : null;
  let pay;
  if (b.overdue) pay = [`<b class="neg">${b.overdue}</b>`, b.overdue === 1 ? 'Pago vencido' : 'Pagos vencidos'];
  else if (n !== null && n <= 3) pay = [`<b class="chip-txt">${esc(b.next.bill.title)}</b>`, n === 0 ? 'vence hoy' : n === 1 ? 'vence mañana' : `vence el ${fmtDate(b.next.due)}`];
  else pay = [`<b>${icon('check')}</b>`, 'Pagos al día'];
  return `
    <div class="home-sum">
      <button class="home-chip hc-habits" data-act="tab" data-tab="habits"><b>${due.length ? `${done}/${due.length}` : '—'}</b><small>Hábitos</small></button>
      <button class="home-chip hc-lists" data-act="home-agenda"><b>${todayTasks().length}</b><small>Tareas</small></button>
      <button class="home-chip hc-money" data-act="home-bills">${pay[0]}<small>${pay[1]}</small></button>
    </div>`;
}

// «Hábitos» de hoy: primero lo que falta; lo hecho (y los «no toca») se pliega en «✓ N hechos». Lo que acabas de marcar se queda en su
// sitio (`S.homeJust`) hasta que vuelves a tocar Inicio, para que la fila no salte bajo el dedo. Un toque marca/desmarca y la pulsación
// larga pone «no toca» (`data-hold`). Cada acción reemplaza solo este bloque (`quiet`), sin repintar la pantalla.
function habitsToday() {
  const t = today();
  if (!S.habits.length) {
    return `<section class="card today-habits" id="today-habits"><div class="th-head"><h3 class="home-h">Hábitos</h3></div>
      <p class="muted">Crea tu primer hábito</p><div><button class="btn primary sm" data-act="new-habit">Crear hábito</button></div></section>`;
  }
  const all = groups().all.flatMap(g => g.items), just = S.homeJust ??= new Set();
  const due = all.filter(h => !isSkip(h, t)), done = due.filter(h => isDone(h, t)).length, left = due.length - done;
  const open = h => (!isDone(h, t) && !isSkip(h, t)) || just.has(h.id);
  const pending = all.filter(open), rest = all.filter(h => !open(h)), skips = all.filter(h => isSkip(h, t)).length;
  const row = h => `
    <div class="th-row" style="--c:var(--${h.color})">${badge(h)}<span class="th-name">${esc(h.name)}${isSkip(h, t) ? '<small class="muted">hoy no toca</small>' : ''}</span>
      <button class="dot ${cls(h, t)}" data-act="home-habit" data-hold data-id="${h.id}" aria-pressed="${isSkip(h, t) ? 'mixed' : isDone(h, t)}" aria-label="${esc(h.name)} hoy: ${label(h, t)}">${mark(h, t)}</button>
    </div>`;
  const state = left ? `${left === 1 ? 'Falta' : 'Faltan'} ${left}` : due.length ? 'Todo hecho' : 'Hoy ninguno toca';
  return `
    <section class="card today-habits" id="today-habits">
      <div class="th-head"><h3 class="home-h">Hábitos</h3>${pending.length
        ? `<button class="th-count th-toggle" data-act="home-pending-toggle" aria-expanded="${!S.homePendingClosed}">${state}${icon(S.homePendingClosed ? 'down' : 'up')}</button>`
        : `<span class="th-count">${state}</span>`}</div>
      <div class="bar"><i style="width:${due.length ? (done / due.length) * 100 : 0}%"></i></div>
      ${S.homePendingClosed ? '' : `<div class="th-rows">${pending.map(row).join('')}</div>`}
      ${rest.length ? `<button class="th-more" data-act="home-done-toggle" aria-expanded="${!!S.homeDoneOpen}">${icon('check')}<span>${[done && pl(done, 'hecho'), skips && `${skips} no toca`].filter(Boolean).join(' · ')}</span>${icon(S.homeDoneOpen ? 'up' : 'down')}</button>` : ''}
      ${rest.length && S.homeDoneOpen ? `<div class="th-rows">${rest.map(row).join('')}</div>` : ''}
    </section>`;
}

// Tarjeta de acciones de dinero: registrar un gasto, un ingreso o mover dinero sin entrar a Finanzas (los formularios los abre money.js).
function moneyActions() {
  return `
    <div class="tile-acts">
      <button class="btn" data-act="new-exp">${icon('minus')} Gasto</button>
      <button class="btn" data-act="new-inc">${icon('plus')} Ingreso</button>
      <button class="btn" data-act="new-xfer">${icon('swap')} Mover</button>
    </div>`;
}

// «Tareas de hoy»: elementos de las listas con fecha límite de hoy o vencida; la casilla las marca como hechas.
function tasksSection() {
  const all = todayTasks(), shown = all.slice(0, MAX_TASKS), extra = all.length - shown.length;
  const rows = shown.map(({ list, item }) => taskRow(list, item, 'home-task')).join('');
  return `
    <section class="card today" id="today-tasks">
      <h3 class="home-h">Tareas de hoy${all.length ? ` <span class="count">${all.length}</span>` : ''}</h3>
      ${all.length ? `<div class="trows">${rows}</div>
        ${extra > 0 ? `<button class="btn ghost block" data-act="tab" data-tab="lists">Ver ${pl(extra, 'más', 'más')} en Listas</button>` : ''}`
        : `<p class="calm">${icon('check')} Nada pendiente para hoy.</p>`}
    </section>`;
}

// Inicio es la primera pantalla: si los datos de alguna parte vinieran raros, esa parte se omite en vez de impedir que la app abra.
const safe = fn => { try { return fn(); } catch (err) { console.error(err); return ''; } };

// Lo que se puede reordenar en Inicio (Configuración › Orden). El saludo, la franja de resumen y «Hábitos» van siempre arriba y no se reordenan.
// El orden guardado está en `settings.homeOrder`; lo que falte se agrega al final y las claves que ya no existen (`tiles`, y `tileOrder`/`habits`/`gym`
// de respaldos viejos) se ignoran (ver `applyOrder`).
export const HOME_BLOCKS = [['tasks', 'Tareas de hoy'], ['actions', 'Gasto, Ingreso y Mover'], ['quick', 'Nota rápida'], ['inbox', 'Bandeja'], ['quote', 'Frase']];

function quoteBlock() {
  const [text, author] = QUOTES[current];
  return `<button class="home-quote" data-act="home-quote" aria-label="Mostrar otra frase">
    <blockquote><p>${esc(text)}</p><footer>${esc(author)}</footer></blockquote>
  </button>`;
}

const BLOCK_VIEWS = {
  quote: quoteBlock,
  quick: () => safe(quickNoteForm),
  actions: moneyActions,
  inbox: () => safe(inboxSection),
  tasks: () => safe(tasksSection),
};

export function homeView() {
  if (current === null) nextQuote();
  const now = new Date();
  const weekday = now.toLocaleDateString('es-GT', { weekday: 'long' });
  return `
    <section class="home">
      <header class="home-top"><span class="overline">${esc(weekday[0].toUpperCase() + weekday.slice(1))} · ${esc(fmtDate(today()))}</span><h2>${greeting(now.getHours())}</h2></header>
      ${safe(summaryStrip)}
      ${safe(habitsToday)}
      ${applyOrder(HOME_BLOCKS.map(b => b[0]), S.settings.homeOrder).map(k => safe(BLOCK_VIEWS[k])).join('')}
    </section>`;
}

// Tocar la frase muestra otra (no hay botón visible para mantener la pantalla limpia).
export { restoreQuick };

export const actions = {
  'home-quote': () => nextQuote(),
  'home-bills': () => { S.tab = 'money'; S.sub = 'bills'; window.scrollTo(0, 0); },
  'home-agenda': () => { S.tab = 'lists'; S.listSub = 'agenda'; S.listId = null; window.scrollTo(0, 0); },
};

// Acciones que se aplican en el sitio, sin repintar la pantalla (el despachador de `app.js` las consulta antes que `actions`):
// repintar tiraría el scroll y la animación del toque. Se actualiza el DOM primero y se guarda después.
const repaintHabits = id => { $('#today-habits').outerHTML = habitsToday(); if (id) $(`#today-habits [data-id="${id}"]`)?.classList.add('pop'); };
// Lo recién marcado se queda en su sitio hasta que se vuelve a tocar Inicio (ver `habitsToday`).
const remember = h => { const j = S.homeJust ??= new Set(); if (h.dates[today()]) j.add(h.id); else j.delete(h.id); };

// Pulsación larga en un hábito: «no toca» (otra pulsación larga lo quita). `app.js` la detecta con `data-hold`.
export async function hold(el) {
  const h = S.habits.find(x => x.id === el.dataset.id);
  if (!h) return;
  skipDay(h, today());
  remember(h);
  repaintHabits(h.id);
  toast(isSkip(h, today()) ? `«${h.name}»: hoy no toca` : `«${h.name}»: sin marcar`);
  await saveHabit(h);
}

export const quiet = {
  async 'home-habit'(el) {
    const h = S.habits.find(x => x.id === el.dataset.id);
    if (!h) return;
    markDay(h, today());
    remember(h);
    repaintHabits(h.id);
    await saveHabit(h);
  },
  'home-done-toggle'() { S.homeDoneOpen = !S.homeDoneOpen; repaintHabits(); },
  'home-pending-toggle'() { S.homePendingClosed = !S.homePendingClosed; repaintHabits(); }, // pliega o despliega lo que falta (solo memoria, como «hechos»)
  async 'home-task'(el) {
    const l = S.lists.find(x => x.id === el.dataset.list), i = l?.items.find(x => x.id === el.dataset.id);
    if (!i) return;
    i.done = !i.done;
    if (i.done) i.doneAt = today(); else delete i.doneAt;
    const row = el.closest('.trow');
    row.classList.toggle('done', i.done);
    el.setAttribute('aria-pressed', i.done);
    el.firstElementChild.innerHTML = i.done ? icon('check') : '';
    if (i.done) el.classList.add('pop'); else el.classList.remove('pop');
    const n = $('#today-tasks .count');
    if (n) n.textContent = todayTasks().length;
    await saveList(l);
  },
};
