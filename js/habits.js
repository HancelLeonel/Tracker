import * as db from './db.js';
import { esc, uid, today, addDays, parseYmd, fmtDate } from './util.js';
import { S, saveHabit } from './state.js';
import { modal } from './ui.js';
import { icon } from './icons.js';

export const COLORS = ['mauve', 'blue', 'green', 'peach', 'pink', 'teal', 'yellow', 'red', 'lavender'];
const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function streak(h) {
  let d = today();
  if (!h.dates[d]) d = addDays(d, -1);
  let n = 0;
  while (h.dates[d]) { n++; d = addDays(d, -1); }
  return n;
}

export function habitsView() {
  if (!S.habits.length) {
    return `<div class="card empty"><p>Aún no tienes hábitos.</p><button class="btn primary" data-act="new-habit">Crear el primero</button></div>`;
  }
  const t = today();
  const done = S.habits.filter(h => h.dates[t]).length;
  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  const cards = S.habits.map(h => {
    const s = streak(h);
    const week = days.map(d => `
      <div class="day ${d === t ? 'today' : ''}">
        <small>${WEEKDAYS[parseYmd(d).getDay()]}</small>
        <button class="dot ${h.dates[d] ? 'on' : ''}" data-act="toggle" data-id="${h.id}" data-date="${d}" aria-pressed="${!!h.dates[d]}" aria-label="${esc(h.name)} ${fmtDate(d)}">${h.dates[d] ? icon('check') : ''}</button>
      </div>`).join('');
    return `
      <section class="card habit" style="--c:var(--${h.color})">
        <div class="habit-h">
          <button class="name" data-act="edit-habit" data-id="${h.id}">${esc(h.name)}</button>
          ${s ? `<span class="streak">${icon('flame')} ${s} ${s === 1 ? 'día' : 'días'}</span>` : ''}
        </div>
        <div class="week">${week}</div>
      </section>`;
  }).join('');

  return `
    <section class="card progress-ring">
      <b>Hoy ${done}/${S.habits.length}</b>
      <div class="bar"><i style="width:${(done / S.habits.length) * 100}%"></i></div>
    </section>
    ${cards}`;
}

export function habitForm(habit) {
  const color = habit?.color ?? 'mauve';
  modal(habit ? 'Editar hábito' : 'Nuevo hábito', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(habit?.name ?? '')}" placeholder="Ej. Tomar agua, Leer…"></label>
    <div class="swatches" role="radiogroup" aria-label="Color">
      ${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--c:var(--${c})"></span></label>`).join('')}
    </div>`, {
    async onSubmit(fd) {
      const data = { name: fd.get('name').trim(), color: fd.get('color') };
      if (habit) { Object.assign(habit, data); await saveHabit(habit); }
      else { const h = { id: uid(), dates: {}, ...data }; S.habits.push(h); await saveHabit(h); }
    },
    onDelete: habit && (async () => {
      S.habits = S.habits.filter(h => h.id !== habit.id);
      await db.commit({ remove: { habits: [habit.id] } });
    }),
  });
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
};
