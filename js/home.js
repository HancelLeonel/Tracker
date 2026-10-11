import { esc, today, fmtDate, parseYmd, daysBetween, money, sum, toast } from './util.js';
import { S, totals, saveSettings, isCredit } from './state.js';
import { modal } from './ui.js';
import { icon } from './icons.js';
import { billsSummary } from './bills.js';
import { todayTasks, taskRow } from './lists.js';
import { homeInfo as gymInfo } from './gym.js';
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
const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const MAX_TASKS = 6;

// Tarjeta «Hábitos»: cuántos van hoy.
function habitsTile() {
  const t = today(), total = S.habits.length, done = S.habits.filter(h => h.dates[t]).length;
  return `
    <button class="tile" data-act="tab" data-tab="habits">
      <span class="overline">Hábitos</span>
      ${total ? `<b class="tile-n">${done}<small>/${total}</small></b><span class="bar"><i style="width:${(done / total) * 100}%"></i></span>`
        : '<b class="tile-n muted">—</b><small>Crea tu primer hábito</small>'}
    </button>`;
}

// Tarjeta «Pagos»: vencidos en rojo, o el próximo por vencer, o al día.
function billsTile() {
  const b = billsSummary();
  const n = b.next ? daysBetween(today(), b.next.due) : null;
  let body;
  if (b.overdue) body = `<b class="tile-n neg">${b.overdue}</b><small class="neg">${pl(b.overdue, 'pago vencido', 'pagos vencidos')}</small>`;
  else if (n !== null && n <= 3) { // solo se muestra lo que vence en los próximos 3 días (igual que el aviso de la pestaña Pagos)
    body = `<b class="tile-n tile-txt">${esc(b.next.bill.title)}</b><small>${n === 0 ? 'Vence hoy' : n === 1 ? 'Vence mañana' : `Vence el ${fmtDate(b.next.due)}`}</small>`;
  } else body = '<b class="tile-n muted">—</b><small>No hay pagos cercanos</small>';
  return `<button class="tile" data-act="home-bills"><span class="overline">Pagos</span>${body}</button>`;
}

// Tarjeta «Dinero»: el saldo neto de Finanzas (total) o solo el de las cuentas elegidas, oculto de entrada en cada apertura
// (el ojo lo muestra). La elección vive en `S.settings.homeMoney = { mode: 'total'|'accounts', ids }`; se corrige al leerla
// (cuentas que ya no existen, valores raros) para que un respaldo manipulado no rompa Inicio.
const accBalance = a => sum(a.cats, c => c.balance);
function moneyCfg() {
  const c = S.settings.homeMoney;
  const ids = Array.isArray(c?.ids) ? c.ids.filter(id => S.accounts.some(a => a.id === id)) : [];
  return { mode: c?.mode === 'accounts' && ids.length ? 'accounts' : 'total', ids };
}

function moneyTile() {
  if (!S.accounts.length) return '';
  const hidden = S.hideMoney, cfg = moneyCfg();
  const show = v => (hidden ? 'Q ••••' : esc(money(v)));
  const sel = cfg.mode === 'accounts' ? S.accounts.filter(a => cfg.ids.includes(a.id)) : [];
  const amount = sel.length ? sum(sel, accBalance) : totals().net;
  const label = !sel.length ? 'Total de tus cuentas' : sel.length === 1 ? sel[0].name : `${sel.length} cuentas`;
  return `
    <div class="tile tile-money">
      <button class="tile-main" data-act="home-money"><span class="overline">Dinero</span>
        <b class="tile-n tile-txt">${show(amount)}</b><small>${esc(label)}</small>
        ${sel.length > 1 ? `<span class="money-lines">${sel.map(a => `<span class="kv"><span class="muted">${esc(a.name)}</span><span>${show(accBalance(a))}</span></span>`).join('')}</span>` : ''}</button>
      <button class="cog" data-act="home-money-cfg" aria-label="Elegir qué cuentas mostrar">${icon('sliders')}</button>
      <button class="eye" data-act="home-eye" aria-pressed="${!hidden}" aria-label="${hidden ? 'Mostrar' : 'Ocultar'} el dinero">${icon(hidden ? 'eyeoff' : 'eye')}</button>
    </div>`;
}

function moneyForm() {
  const c = moneyCfg();
  modal('Tarjeta de dinero', `
    <label class="check"><input type="radio" name="mode" value="total" ${c.mode === 'total' ? 'checked' : ''}><span>Total de todas tus cuentas<small>Tu dinero en cuentas menos lo que debes en tarjetas.</small></span></label>
    <label class="check"><input type="radio" name="mode" value="accounts" ${c.mode === 'accounts' ? 'checked' : ''}><span>Solo las cuentas que elija<small>Una o varias; se suman.</small></span></label>
    <div class="acc-pick">${S.accounts.map(a => `
      <label class="check"><input type="checkbox" name="acc" value="${esc(a.id)}" ${c.ids.includes(a.id) ? 'checked' : ''}><span>${esc(a.name)}${isCredit(a) ? ' <small>(tarjeta)</small>' : ''}</span></label>`).join('')}</div>`, {
    afterOpen(f) {
      // Marcar una cuenta ya implica «solo las que elija».
      f.querySelectorAll('[name=acc]').forEach(i => i.addEventListener('change', () => { if (f.querySelector('[name=acc]:checked')) f.elements.mode.value = 'accounts'; }));
    },
    async onSubmit(fd) {
      const ids = fd.getAll('acc');
      if (fd.get('mode') === 'accounts' && !ids.length) { toast('Elige al menos una cuenta'); return false; }
      S.settings.homeMoney = { mode: fd.get('mode') === 'accounts' ? 'accounts' : 'total', ids };
      await saveSettings();
    },
  });
}

// Tarjeta «Ejercicio»: los últimos 7 días en que entrenaste (y el entrenamiento en curso, arriba). Tocar una fila abre el Gimnasio.
const dayLabel = d => {
  const n = daysBetween(d, today());
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  const w = parseYmd(d).toLocaleDateString('es-GT', { weekday: 'short' }).replace(/\.$/, '');
  return w.charAt(0).toUpperCase() + w.slice(1);
};
function gymTile() {
  const g = gymInfo();
  const live = g.live ? `
    <button class="xrow live" data-act="home-gym" data-sub="train">
      <span class="xr-d"><b>Ahora</b><small>En curso</small></span>
      <span class="xr-m"><span class="xr-t">${esc(g.live.name)}</span><small>${g.live.done}/${g.live.total} series</small></span>
    </button>` : '';
  const rows = g.days.map(d => `
    <button class="xrow" data-act="home-gym" data-sub="history">
      <span class="xr-d"><b>${esc(dayLabel(d.date))}</b><small>${esc(fmtDate(d.date))}</small></span>
      <span class="xr-m"><span class="xr-t">${esc(d.names.join(' + '))}</span><small>${pl(d.exercises, 'ejercicio')} · ${pl(d.sets, 'serie')} · ${Math.round(d.vol).toLocaleString('en-US')} ${g.unit}</small></span>
    </button>`).join('');
  return `
    <section class="home-sec">
      <h3 class="overline">Ejercicio</h3>
      ${live || rows ? `<div class="trows card-rows">${live}${rows}</div>`
        : `<button class="btn ghost block" data-act="home-gym" data-sub="train">${icon('dumbbell')} Registrar tu primer entrenamiento</button>`}
    </section>`;
}

// «Tareas de hoy»: elementos de las listas con fecha límite de hoy o vencida; la casilla las marca como hechas.
function tasksSection() {
  const all = todayTasks(), shown = all.slice(0, MAX_TASKS), extra = all.length - shown.length;
  const rows = shown.map(({ list, item }) => taskRow(list, item)).join('');
  return `
    <section class="today">
      <h3 class="overline">Tareas de hoy${all.length ? ` <span class="count">${all.length}</span>` : ''}</h3>
      ${all.length ? `<div class="trows">${rows}</div>
        ${extra > 0 ? `<button class="btn ghost block" data-act="tab" data-tab="lists">Ver ${pl(extra, 'más', 'más')} en Listas</button>` : ''}`
        : `<p class="calm">${icon('check')} Nada pendiente para hoy.</p>`}
    </section>`;
}

// Inicio es la primera pantalla: si los datos de alguna parte vinieran raros, esa parte se omite en vez de impedir que la app abra.
const safe = fn => { try { return fn(); } catch (err) { console.error(err); return ''; } };

export function homeView() {
  if (current === null) nextQuote();
  const [text, author] = QUOTES[current];
  const now = new Date();
  const weekday = now.toLocaleDateString('es-GT', { weekday: 'long' });
  return `
    <section class="home">
      <header class="home-top"><span class="overline">${esc(weekday)} · ${esc(fmtDate(today()))}</span><h2>${greeting(now.getHours())}</h2></header>
      <button class="home-quote" data-act="home-quote" aria-label="Mostrar otra frase">
        <blockquote><p>${esc(text)}</p><footer>${esc(author)}</footer></blockquote>
      </button>
      <button class="btn primary block quick-exp" data-act="new-exp">${icon('plus')} Nuevo gasto</button>
      ${safe(quickNoteForm)}
      <div class="tiles">${safe(habitsTile)}${safe(billsTile)}</div>
      ${safe(moneyTile)}
      ${safe(gymTile)}
      ${safe(inboxSection)}
      ${safe(tasksSection)}
    </section>`;
}

// Tocar la frase muestra otra (no hay botón visible para mantener la pantalla limpia).
export { restoreQuick };

export const actions = {
  'home-quote': () => nextQuote(),
  'home-eye': () => { S.hideMoney = !S.hideMoney; },
  'home-money': () => { S.tab = 'money'; S.sub = 'accounts'; window.scrollTo(0, 0); },
  'home-money-cfg': () => moneyForm(),
  'home-gym': el => { S.tab = 'gym'; S.gymSub = el.dataset.sub; S.gymLimit = 30; window.scrollTo(0, 0); },
  'home-bills': () => { S.tab = 'money'; S.sub = 'bills'; window.scrollTo(0, 0); },
};
