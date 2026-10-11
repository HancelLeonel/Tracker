import * as db from './db.js';
import { esc, uid, today, addDays, parseYmd, fmtDate } from './util.js';
import { S, saveHabit } from './state.js';
import { modal } from './ui.js';
import { icon, HABIT_ICONS } from './icons.js';

export const COLORS = ['mauve', 'blue', 'green', 'peach', 'pink', 'teal', 'yellow', 'red', 'lavender'];
const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

// Momentos del día en que se agrupan los hábitos. La clave '' es «sin horario».
export const SLOTS = [['morning', 'Mañana', 'sunrise'], ['day', 'Durante el día', 'sun'], ['night', 'Noche', 'moon'], ['', 'Sin horario', 'clock']];
export const SLOT_KEYS = SLOTS.map(s => s[0]);
const slotOf = h => (SLOT_KEYS.includes(h.slot) ? h.slot : '');
const iconOf = h => (HABIT_ICONS.includes(h.icon) ? h.icon : HABIT_ICONS[0]);

function streak(h) {
  let d = today();
  if (!h.dates[d]) d = addDays(d, -1);
  let n = 0;
  while (h.dates[d]) { n++; d = addDays(d, -1); }
  return n;
}

// Hábitos agrupados por momento del día, cada grupo en su orden. Si ninguno tiene horario no se muestran encabezados.
function groups() {
  const all = SLOTS.map(([key, name, ic]) => ({ key, name, ic, items: S.habits.filter(h => slotOf(h) === key) })).filter(g => g.items.length);
  return { all, flat: all.length === 1 && all[0].key === '' };
}

const badge = h => `<span class="h-ic" style="--c:var(--${h.color})">${icon(iconOf(h))}</span>`;

function habitCard(h, t, days, sorting, first, last) {
  if (sorting) {
    return `
      <section class="card habit sorting" style="--c:var(--${h.color})">
        <div class="habit-h">${badge(h)}<span class="name">${esc(h.name)}</span>
          <div class="card-tools">
            <button class="icon sm" data-act="habit-up" data-id="${h.id}" aria-label="Subir ${esc(h.name)}" ${first ? 'disabled' : ''}>${icon('up')}</button>
            <button class="icon sm" data-act="habit-down" data-id="${h.id}" aria-label="Bajar ${esc(h.name)}" ${last ? 'disabled' : ''}>${icon('down')}</button>
          </div>
        </div>
      </section>`;
  }
  const s = streak(h);
  const week = days.map(d => `
    <div class="day ${d === t ? 'today' : ''}">
      <small>${WEEKDAYS[parseYmd(d).getDay()]}</small>
      <button class="dot ${h.dates[d] ? 'on' : ''}" data-act="toggle" data-id="${h.id}" data-date="${d}" aria-pressed="${!!h.dates[d]}" aria-label="${esc(h.name)} ${fmtDate(d)}">${h.dates[d] ? icon('check') : ''}</button>
    </div>`).join('');
  return `
    <section class="card habit" style="--c:var(--${h.color})">
      <div class="habit-h">
        ${badge(h)}
        <button class="name" data-act="edit-habit" data-id="${h.id}">${esc(h.name)}</button>
        ${s ? `<span class="streak">${icon('flame')} ${s} ${s === 1 ? 'día' : 'días'}</span>` : ''}
      </div>
      <div class="week">${week}</div>
    </section>`;
}

export function habitsView() {
  if (!S.habits.length) {
    return `<div class="card empty"><p>Aún no tienes hábitos.</p><button class="btn primary" data-act="new-habit">Crear el primero</button></div>`;
  }
  const t = today();
  const done = S.habits.filter(h => h.dates[t]).length;
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const sorting = S.habitsSort;
  const { all, flat } = groups();

  const body = all.map(g => `
    <div class="slot">
      ${flat ? '' : `<h2 class="slot-h">${icon(g.ic)}<span>${g.name}</span><small>${sorting ? '' : `${g.items.filter(h => h.dates[t]).length}/${g.items.length}`}</small></h2>`}
      ${g.items.map((h, i) => habitCard(h, t, days, sorting, i === 0, i === g.items.length - 1)).join('')}
    </div>`).join('');

  return `
    <section class="card progress-ring">
      <b>Hoy ${done}/${S.habits.length}</b>
      <div class="bar"><i style="width:${(done / S.habits.length) * 100}%"></i></div>
      <button class="btn sm" data-act="habits-sort" aria-pressed="${sorting}">${icon(sorting ? 'check' : 'sort')} ${sorting ? 'Listo' : 'Ordenar'}</button>
    </section>
    ${sorting ? '<p class="muted note">Usa las flechas para cambiar el orden dentro de cada momento del día. Para pasar un hábito a otro momento, edítalo.</p>' : ''}
    ${body}`;
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
    const d = el.dataset.date;
    if (h.dates[d]) delete h.dates[d]; else h.dates[d] = 1;
    await saveHabit(h);
  },
  'new-habit': () => habitForm(),
  'edit-habit': el => habitForm(S.habits.find(h => h.id === el.dataset.id)),
  'habits-sort': () => { S.habitsSort = !S.habitsSort; },
  'habit-up': el => move(el.dataset.id, -1),
  'habit-down': el => move(el.dataset.id, 1),
};
