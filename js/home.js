import { $, esc, today, fmtDate, daysBetween, pl, applyOrder } from './util.js';
import { S, saveHabit, saveList } from './state.js';
import { isDone, isSkip, setDay, cls, mark, label, groups, badge } from './habits.js';
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
const MAX_TASKS = 6;

// «Hoy»: todos los hábitos a la vez, por momento del día. Cada casilla se marca en el sitio (`quiet['home-habit']`): se reemplaza solo este bloque.
function habitsToday() {
  const t = today();
  if (!S.habits.length) {
    return `<section class="card today-habits" id="today-habits"><div class="th-head"><h3>Hoy</h3></div>
      <p class="muted">Crea tu primer hábito</p><div><button class="btn primary sm" data-act="new-habit">Crear hábito</button></div></section>`;
  }
  const due = S.habits.filter(h => !isSkip(h, t)), done = due.filter(h => isDone(h, t)).length; // los que hoy «no tocan» no cuentan
  const rows = groups().all.flatMap(g => g.items).map(h => `
    <div class="th-row" style="--c:var(--${h.color})">${badge(h)}<span class="th-name">${esc(h.name)}</span>
      <button class="dot ${cls(h, t)}" data-act="home-habit" data-id="${h.id}" aria-pressed="${isSkip(h, t) ? 'mixed' : isDone(h, t)}" aria-label="${esc(h.name)} hoy: ${label(h, t)}">${mark(h, t)}</button>
    </div>`).join('');
  return `
    <section class="card today-habits" id="today-habits">
      <div class="th-head"><h3>Hoy</h3><span class="th-count">${due.length ? `${done} de ${due.length}` : 'Hoy ninguno toca'}</span></div>
      <div class="bar"><i style="width:${due.length ? (done / due.length) * 100 : 0}%"></i></div>
      <div class="th-rows">${rows}</div>
    </section>`;
}

// Línea de pagos: solo aparece si hay vencidos o algo vence en los próximos 3 días (igual que el aviso de la pestaña Pagos).
function billsLine() {
  const b = billsSummary();
  const n = b.next ? daysBetween(today(), b.next.due) : null;
  let text, bad = false;
  if (b.overdue) { text = `${b.overdue} ${pl(b.overdue, 'pago vencido', 'pagos vencidos')}`; bad = true; }
  else if (n !== null && n <= 3) text = `${esc(b.next.bill.title)} ${n === 0 ? 'vence hoy' : n === 1 ? 'vence mañana' : `vence el ${fmtDate(b.next.due)}`}`;
  else return '';
  return `<button class="home-line ${bad ? 'neg' : ''}" data-act="home-bills">${icon('alert')}<span>${text}</span>${icon('right')}</button>`;
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
    <section class="today" id="today-tasks">
      <h3 class="overline">Tareas de hoy${all.length ? ` <span class="count">${all.length}</span>` : ''}</h3>
      ${all.length ? `<div class="trows">${rows}</div>
        ${extra > 0 ? `<button class="btn ghost block" data-act="tab" data-tab="lists">Ver ${pl(extra, 'más', 'más')} en Listas</button>` : ''}`
        : `<p class="calm">${icon('check')} Nada pendiente para hoy.</p>`}
    </section>`;
}

// Inicio es la primera pantalla: si los datos de alguna parte vinieran raros, esa parte se omite en vez de impedir que la app abra.
const safe = fn => { try { return fn(); } catch (err) { console.error(err); return ''; } };

// Lo que se puede reordenar en Inicio (Configuración › Orden): secciones y, dentro de «Tarjetas», cada tarjeta. El saludo va siempre arriba.
// El orden guardado está en `settings.homeOrder` / `settings.tileOrder`; lo que falte se agrega al final (ver `applyOrder`).
// «Hoy» (los hábitos) va siempre justo bajo el saludo y no se reordena. Los órdenes guardados con claves que ya no existen
// (`gym`, `habits`) se ignoran en `applyOrder`.
export const HOME_BLOCKS = [['tasks', 'Tareas de hoy'], ['tiles', 'Pagos y accesos'], ['quick', 'Nota rápida'], ['inbox', 'Bandeja'], ['quote', 'Frase']];
export const HOME_TILES = [['bills', 'Pagos'], ['actions', 'Gasto, Ingreso y Mover']];

function quoteBlock() {
  const [text, author] = QUOTES[current];
  return `<button class="home-quote" data-act="home-quote" aria-label="Mostrar otra frase">
    <blockquote><p>${esc(text)}</p><footer>${esc(author)}</footer></blockquote>
  </button>`;
}

const TILE_VIEWS = { bills: () => safe(billsLine), actions: moneyActions };
const BLOCK_VIEWS = {
  quote: quoteBlock,
  quick: () => safe(quickNoteForm),
  tiles: () => `<div class="home-quick">${applyOrder(HOME_TILES.map(t => t[0]), S.settings.tileOrder).map(k => TILE_VIEWS[k]()).join('')}</div>`,
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
      ${safe(habitsToday)}
      ${applyOrder(HOME_BLOCKS.map(b => b[0]), S.settings.homeOrder).map(k => safe(BLOCK_VIEWS[k])).join('')}
    </section>`;
}

// Tocar la frase muestra otra (no hay botón visible para mantener la pantalla limpia).
export { restoreQuick };

export const actions = {
  'home-quote': () => nextQuote(),
  'home-bills': () => { S.tab = 'money'; S.sub = 'bills'; window.scrollTo(0, 0); },
};

// Acciones que se aplican en el sitio, sin repintar la pantalla (el despachador de `app.js` las consulta antes que `actions`):
// repintar tiraría el scroll y la animación del toque. Se actualiza el DOM primero y se guarda después.
export const quiet = {
  async 'home-habit'(el) {
    const h = S.habits.find(x => x.id === el.dataset.id);
    if (!h) return;
    setDay(h, today());
    $('#today-habits').outerHTML = habitsToday();
    $(`#today-habits [data-id="${h.id}"]`)?.classList.add('pop');
    await saveHabit(h);
  },
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
