import * as db from './db.js';
import { $, esc, uid, today, addDays, parseYmd, fmtDate } from './util.js';
import { S, hooks, saveHabit } from './state.js';
import { modal } from './ui.js';
import { icon, HABIT_ICONS } from './icons.js';

export const COLORS = ['mauve', 'blue', 'green', 'peach', 'pink', 'teal', 'yellow', 'red', 'lavender'];
const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

// Momentos del día en que se agrupan los hábitos. La clave '' es «sin horario».
export const SLOTS = [['morning', 'Mañana', 'sunrise'], ['day', 'Durante el día', 'sun'], ['night', 'Noche', 'moon'], ['', 'Sin horario', 'clock']];
export const SLOT_KEYS = SLOTS.map(s => s[0]);
const slotOf = h => (SLOT_KEYS.includes(h.slot) ? h.slot : '');
const iconOf = h => (HABIT_ICONS.includes(h.icon) ? h.icon : HABIT_ICONS[0]);

// Cada día de un hábito puede estar sin marcar, hecho (1) o «no toca» (2: ese día no aplica, p. ej. el día de descanso del gimnasio).
// Un día «no toca» no rompe la racha ni cuenta en el avance de hoy.
export const SKIP = 2;
export const isSkip = (h, d) => h.dates[d] === SKIP;
export const isDone = (h, d) => !!h.dates[d] && !isSkip(h, d);
// Siguiente estado al tocar: sin marcar → hecho → no toca → sin marcar.
const nextState = v => (!v ? 1 : v === SKIP ? 0 : SKIP);
const cls = (h, d) => (isSkip(h, d) ? 'skip' : isDone(h, d) ? 'on' : '');
const mark = (h, d) => (isSkip(h, d) ? icon('minus') : isDone(h, d) ? icon('check') : '');
const label = (h, d) => (isSkip(h, d) ? 'no toca' : isDone(h, d) ? 'hecho' : 'sin marcar');

const weekDays = () => Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));

function streak(h) {
  let d = today();
  if (!h.dates[d]) d = addDays(d, -1);
  let n = 0;
  while (h.dates[d]) { if (!isSkip(h, d)) n++; d = addDays(d, -1); } // los días «no toca» se saltan sin cortar la racha
  return n;
}

// Hábitos agrupados por momento del día, cada grupo en su orden. Si ninguno tiene horario no se muestran encabezados.
function groups() {
  const all = SLOTS.map(([key, name, ic]) => ({ key, name, ic, items: S.habits.filter(h => slotOf(h) === key) })).filter(g => g.items.length);
  return { all, flat: all.length === 1 && all[0].key === '' };
}

const badge = h => `<span class="h-ic" style="--c:var(--${h.color})">${icon(iconOf(h))}</span>`;

// Los 6 días anteriores a hoy como puntos pequeños (hoy se marca con el botón grande de la fila).
const miniDots = (h, t) => `<span class="mini" aria-hidden="true">${Array.from({ length: 6 }, (_, i) =>
  `<i class="${cls(h, addDays(t, i - 6))}"></i>`).join('')}</span>`;

// Fila compacta: icono, nombre con racha e historial reciente, y botón para marcar hoy.
function habitRow(h, t, sorting, first, last) {
  if (sorting) {
    return `
      <div class="habit hrow sorting" style="--c:var(--${h.color})">${badge(h)}<span class="name"><span class="n">${esc(h.name)}</span></span>
        <div class="card-tools">
          <button class="icon sm" data-act="habit-up" data-id="${h.id}" aria-label="Subir ${esc(h.name)}" ${first ? 'disabled' : ''}>${icon('up')}</button>
          <button class="icon sm" data-act="habit-down" data-id="${h.id}" aria-label="Bajar ${esc(h.name)}" ${last ? 'disabled' : ''}>${icon('down')}</button>
        </div>
      </div>`;
  }
  const s = streak(h), on = isDone(h, t), skip = isSkip(h, t);
  return `
    <div class="habit hrow" style="--c:var(--${h.color})">
      ${badge(h)}
      <button class="name" data-act="edit-habit" data-id="${h.id}">
        <span class="n">${esc(h.name)}</span>
        <span class="sub">${miniDots(h, t)}${s ? `<span class="streak">${icon('flame')} ${s} ${s === 1 ? 'día' : 'días'}</span>` : ''}</span>
      </button>
      <button class="dot ${cls(h, t)}" data-act="toggle" data-id="${h.id}" data-date="${t}" aria-pressed="${skip ? 'mixed' : on}" aria-label="${esc(h.name)} hoy: ${label(h, t)}">${mark(h, t)}</button>
    </div>`;
}

// Momento del día que se muestra primero: el actual si tiene hábitos, y si no el primero que haya.
function currentSlot(keys) {
  if (keys.includes(S.habitSlot)) return S.habitSlot;
  const h = new Date().getHours();
  const now = h < 12 ? 'morning' : h < 19 ? 'day' : 'night';
  return (S.habitSlot = keys.includes(now) ? now : keys[0]);
}

export function habitsView() {
  if (!S.habits.length) {
    return `<div class="card empty"><p>Aún no tienes hábitos.</p><button class="btn primary" data-act="new-habit">Crear el primero</button></div>`;
  }
  const t = today();
  const due = S.habits.filter(h => !isSkip(h, t)); // los que hoy «no tocan» no cuentan
  const done = due.filter(h => isDone(h, t)).length;
  const sorting = S.habitsSort;
  const { all, flat } = groups();
  const cur = currentSlot(all.map(g => g.key));
  const count = g => { const d = g.items.filter(h => !isSkip(h, t)); return `${d.filter(h => isDone(h, t)).length}/${d.length}`; };

  // Cada momento del día es una tarjeta independiente; se pasa de una a otra deslizando (o con los botones de arriba).
  const cards = all.map(g => `
    <section class="card slot-card" data-slot="${g.key}">
      ${flat ? '' : `<h2 class="slot-h">${icon(g.ic)}<span>${g.name}</span><small>${sorting ? '' : count(g)}</small></h2>`}
      ${g.items.map((h, i) => habitRow(h, t, sorting, i === 0, i === g.items.length - 1)).join('')}
    </section>`).join('');
  const pills = all.length > 1 ? `<div class="slot-pills" role="tablist">${all.map(g =>
    `<button class="${g.key === cur ? 'on' : ''}" data-slotpill="${g.key}" role="tab" aria-label="${g.name}">${icon(g.ic)}<span>${count(g)}</span></button>`).join('')}</div>` : '';

  return `
    <section class="card progress-ring">
      <b>Hoy ${done}/${due.length}</b>
      <div class="bar"><i style="width:${due.length ? (done / due.length) * 100 : 0}%"></i></div>
      <button class="btn sm" data-act="habits-sort" aria-pressed="${sorting}">${icon(sorting ? 'check' : 'sort')} ${sorting ? 'Listo' : 'Ordenar'}</button>
    </section>
    ${pills}
    ${sorting ? '<p class="muted note">Usa las flechas para cambiar el orden dentro de cada momento del día. Para pasar un hábito a otro momento, edítalo.</p>' : ''}
    <div class="hcar" id="hcar">${cards}</div>`;
}

// ---------- carrusel de momentos del día ----------
const carousel = () => $('#hcar');
const stepOf = car => (car.children[1] ? car.children[1].offsetLeft - car.children[0].offsetLeft : 0);
const markPill = () => document.querySelectorAll('[data-slotpill]').forEach(b => b.classList.toggle('on', b.dataset.slotpill === S.habitSlot));

// Tras repintar, deja el carrusel en la tarjeta que se estaba viendo (innerHTML lo reinicia al principio).
export function restoreCarousel() {
  const car = carousel();
  if (!car) return;
  const i = [...car.children].findIndex(c => c.dataset.slot === S.habitSlot);
  car.scrollLeft = Math.max(0, i) * stepOf(car);
}

// Al deslizar: recuerda la tarjeta visible y marca su botón.
export function onCarouselScroll(car) {
  const step = stepOf(car);
  const key = car.children[step ? Math.round(car.scrollLeft / step) : 0]?.dataset.slot;
  if (key === undefined || key === S.habitSlot) return;
  S.habitSlot = key;
  markPill();
}

// Botón de un momento del día: desliza hasta su tarjeta.
export function goSlot(el) {
  const car = carousel();
  if (!car) return;
  const i = [...car.children].findIndex(c => c.dataset.slot === el.dataset.slotpill);
  S.habitSlot = el.dataset.slotpill;
  markPill();
  car.scrollTo({ left: i * stepOf(car), behavior: 'smooth' });
}

function setDay(h, d) {
  const n = nextState(h.dates[d]);
  if (n) h.dates[d] = n; else delete h.dates[d];
}

export function habitForm(habit) {
  const color = habit?.color ?? 'mauve';
  const ic = habit ? iconOf(habit) : HABIT_ICONS[0];
  const slot = habit ? slotOf(habit) : '';
  modal(habit ? 'Editar hábito' : 'Nuevo hábito', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(habit?.name ?? '')}" placeholder="Ej. Tomar agua, Leer…"></label>
    <label>Momento del día
      <select name="slot">${SLOTS.map(([k, name]) => `<option value="${k}" ${k === slot ? 'selected' : ''}>${name}</option>`).join('')}</select>
    </label>
    ${habit ? `<div><small class="muted">Últimos 7 días</small>
      <div class="week" id="wk">${weekDays().map(d => `
        <div class="day ${d === today() ? 'today' : ''}"><small>${WEEKDAYS[parseYmd(d).getDay()]}</small>
          <button type="button" class="dot ${cls(habit, d)}" data-d="${d}" aria-pressed="${isSkip(habit, d) ? 'mixed' : isDone(habit, d)}" aria-label="${fmtDate(d)}: ${label(habit, d)}">${mark(habit, d)}</button></div>`).join('')}
      </div>
      <small class="muted">Toca un día para marcarlo como hecho y otra vez para «no toca» (un día que no aplica: no corta la racha ni cuenta en el avance).</small></div>` : ''}
    <div><small class="muted">Icono</small>
      <div class="icon-grid" role="radiogroup" aria-label="Icono">
        ${HABIT_ICONS.map(n => `<label><input type="radio" name="icon" value="${n}" ${n === ic ? 'checked' : ''} aria-label="${n}"><span>${icon(n)}</span></label>`).join('')}
      </div>
    </div>
    <div><small class="muted">Color</small>
      <div class="swatches" role="radiogroup" aria-label="Color">
        ${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--c:var(--${c})"></span></label>`).join('')}
      </div>
    </div>`, {
    afterOpen: f => habit && f.querySelector('#wk').addEventListener('click', async e => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      setDay(habit, b.dataset.d);
      b.className = `dot ${cls(habit, b.dataset.d)}`;
      b.setAttribute('aria-pressed', isSkip(habit, b.dataset.d) ? 'mixed' : isDone(habit, b.dataset.d));
      b.setAttribute('aria-label', `${fmtDate(b.dataset.d)}: ${label(habit, b.dataset.d)}`);
      b.innerHTML = mark(habit, b.dataset.d);
      await saveHabit(habit);
      hooks.render(); // la vista de fondo refleja el cambio aunque el diálogo se cierre con Cancelar
    }),
    async onSubmit(fd) {
      const data = { name: fd.get('name').trim(), color: fd.get('color'), icon: fd.get('icon'), slot: fd.get('slot') };
      if (habit) { Object.assign(habit, data); await saveHabit(habit); }
      else {
        const h = { id: uid(), dates: {}, order: Math.max(0, ...S.habits.map(x => x.order ?? 0)) + 1, ...data };
        S.habits.push(h);
        await saveHabit(h);
      }
    },
    onDelete: habit && (async () => {
      S.habits = S.habits.filter(h => h.id !== habit.id);
      await db.commit({ remove: { habits: [habit.id] } });
    }),
  });
}

// Intercambia el orden con el vecino del mismo momento del día.
async function move(id, dir) {
  const h = S.habits.find(x => x.id === id);
  const sibs = S.habits.filter(x => slotOf(x) === slotOf(h));
  const other = sibs[sibs.indexOf(h) + dir];
  if (!other) return;
  [h.order, other.order] = [other.order, h.order];
  S.habits.sort((a, b) => a.order - b.order);
  await db.commit({ put: { habits: [h, other] } });
}

export const actions = {
  async toggle(el) {
    const h = S.habits.find(h => h.id === el.dataset.id);
    setDay(h, el.dataset.date);
    await saveHabit(h);
  },
  'new-habit': () => habitForm(),
  'edit-habit': el => habitForm(S.habits.find(h => h.id === el.dataset.id)),
  'habits-sort': () => { S.habitsSort = !S.habitsSort; },
  'habit-up': el => move(el.dataset.id, -1),
  'habit-down': el => move(el.dataset.id, 1),
};
