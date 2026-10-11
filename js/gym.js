import * as db from './db.js';
import { $, esc, uid, today, addDays, parseYmd, daysBetween, fmtDate, fmtDateY, norm, r2, toast, pl, clock } from './util.js';
import { S, hooks, saveSettings, saveRoutine, saveWorkout, saveExercise } from './state.js';
import { GROUPS, exKey } from './catalogo.js';
import { modal } from './ui.js';
import { icon } from './icons.js';
import { COLORS } from './habits.js';
import { prepAudio, alarm, keepAwake } from './aviso.js';

// Rutinas = plantillas (store `routines`): al empezar un entrenamiento se COPIAN a `workouts`, y a partir de ahí son
// independientes (editar la rutina no toca lo ya entrenado). Un entrenamiento sin `end` está en curso (solo se muestra uno).
// El descanso entre series vive en los ajustes (`S.settings.gym`, viaja en el respaldo):
//   cfg  -> unidad de peso (kg/lb) y descanso predeterminado en segundos (0 = sin descanso automático)
//   rest -> { endsAt, total } mientras corre: la cuenta se deriva de la hora de fin, igual que el Pomodoro
const DEFAULTS = { unit: 'kg', rest: 90 };
const SUBS = [['train', 'Entrenar'], ['routines', 'Rutinas'], ['history', 'Historial'], ['progress', 'Progreso']];

const fmtN = n => String(+Number(n).toFixed(2));
const key = exKey; // un mismo ejercicio sin importar tildes ni mayúsculas
const num = (v, lo, hi, d) => {
  const n = typeof v === 'string' && !v.trim() ? NaN : Number(v);
  return v != null && typeof v !== 'boolean' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// Cada serie tiene dos casillas. Fuerza: peso × repeticiones. Cardio (ejercicios del grupo «Cardio» del catálogo): tiempo · distancia.
// El ejercicio guarda `cardio: true` al crearse, así el historial se sigue leyendo bien aunque el catálogo cambie.
const FIELDS = { weight: [0, 9999, true], reps: [0, 999, false], min: [0, 1440, true], km: [0, 999, true] }; // mínimo, máximo, decimales
const fieldVal = (f, v, d) => { const [lo, hi, dec] = FIELDS[f]; const x = num(v, lo, hi, d); return dec ? r2(x) : Math.round(x); };
const MODES = {
  strength: { a: 'weight', b: 'reps', sep: '×', heads: unit => [`Peso (${unit})`, 'Reps'], blank: () => ({ reps: 10, weight: 0, done: false }) },
  cardio: { a: 'min', b: 'km', sep: '·', heads: () => ['Tiempo (min)', 'Distancia (km)'], blank: () => ({ min: 0, km: 0, done: false }) },
};
const modeOf = e => MODES[e?.cardio ? 'cardio' : 'strength'];
const isCardio = name => S.exercises.find(x => key(x.name) === key(name))?.group === 'Cardio';
const copySet = ({ done, at, note, ...rest }) => ({ ...rest, done: false }); // una serie nueva igual a otra (sin marcar ni nota)
const inputmode = f => (FIELDS[f][2] ? 'decimal' : 'numeric');

// ---------- ajustes y descanso ----------
const G = () => {
  if (!S.settings.gym || typeof S.settings.gym !== 'object') S.settings.gym = { cfg: { ...DEFAULTS }, rest: null };
  return S.settings.gym;
};
// Los valores se corrigen al leerlos: un respaldo manipulado no puede dejar un descanso infinito.
const cfg = () => {
  const c = G().cfg ?? {};
  return { unit: c.unit === 'lb' ? 'lb' : 'kg', rest: Math.round(num(c.rest, 0, 600, DEFAULTS.rest)) };
};
const rest = () => {
  const r = G().rest;
  return r && Number.isFinite(r.endsAt) && Number.isFinite(r.total) && r.total > 0 && r.total <= 3600 ? r : null;
};
const restLeft = () => Math.min(rest().total * 1000, Math.max(0, rest().endsAt - Date.now()));
const restPct = () => Math.min(100, (1 - restLeft() / (rest().total * 1000)) * 100);

let timer = null;
const startTick = () => { timer ??= setInterval(tick, 250); };
const stopTick = () => { clearInterval(timer); timer = null; };

function paint() {
  if (!rest()) return;
  const txt = clock(restLeft());
  document.querySelectorAll('[data-rest-clock]').forEach(e => { if (e.textContent !== txt) e.textContent = txt; });
  const bar = $('[data-rest-bar]');
  if (bar) bar.style.width = `${restPct()}%`;
}
function tick() {
  if (!rest()) return stopTick();
  if (rest().endsAt - Date.now() <= 0) return endRest(true);
  paint();
}
async function endRest(sound) {
  G().rest = null;
  stopTick();
  keepAwake('gym', false);
  if (sound) { alarm({ beeps: 2, freq: 660 }); toast('Descanso terminado'); }
  await saveSettings();
  if (S.tab === 'gym' && !$('#dlg[open]')) hooks.render();
}
// Arranca la cuenta; quien la llama guarda los ajustes (junto con la serie, en una sola escritura).
function startRest(secs) {
  prepAudio();
  G().rest = { endsAt: Date.now() + secs * 1000, total: secs };
  startTick();
  keepAwake('gym', true);
}
const clearRest = async () => { if (G().rest) await endRest(false); };

// Al abrir la app (o importar un respaldo): si el descanso sigue, continúa; si terminó con la app cerrada, se quita sin sonar.
export function resume() {
  const r = rest();
  if (!r || r.endsAt <= Date.now()) {
    stopTick();
    keepAwake('gym', false);
    if (G().rest) { G().rest = null; saveSettings(); }
    return;
  }
  startTick();
  keepAwake('gym', true);
  tick();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && rest()) { keepAwake('gym', true); tick(); }
});

// ---------- datos ----------
const active = () => S.workouts.filter(w => !w.end).sort((a, b) => b.t - a.t)[0] ?? null;
const finished = () => S.workouts.filter(w => w.end).sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t);
const doneSets = e => e.sets.filter(s => s.done);
const volume = sets => sets.reduce((t, s) => t + (s.weight || 0) * (s.reps || 0), 0); // el cardio no suma volumen
const total = (sets, f) => sets.reduce((t, s) => t + (s[f] || 0), 0);
const topSet = (sets, cardio) => sets.reduce((b, s) => (!b ? s
  : cardio ? (s.km > b.km || (s.km === b.km && s.min > b.min) ? s : b)
  : (s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps) ? s : b)), null);
function setText(s, unit) {
  if (s.min != null || s.km != null) return [s.min ? `${fmtN(s.min)} min` : '', s.km ? `${fmtN(s.km)} km` : ''].filter(Boolean).join(' · ') || '—';
  return s.weight > 0 ? `${fmtN(s.weight)} ${unit} × ${s.reps}` : `${s.reps} reps`;
}
const mins = w => {
  const last = Math.max(0, ...w.exercises.flatMap(e => e.sets.map(s => s.at ?? 0)));
  return last > w.t ? Math.max(1, Math.round((last - w.t) / 60000)) : null;
};
function summary(w) {
  const sets = w.exercises.flatMap(doneSets);
  return { sets: sets.length, vol: volume(sets), km: total(sets, 'km'), mins: mins(w) };
}
const fmtVol = v => Math.round(v).toLocaleString('en-US');
// «4 ejercicios · 12 series · 3,420 kg · 5 km · 52 min» (lo que no aplica no se muestra).
function summaryText(w) {
  const s = summary(w), unit = cfg().unit;
  return [pl(w.exercises.length, 'ejercicio'), pl(s.sets, 'serie'), s.vol > 0 ? `${fmtVol(s.vol)} ${unit}` : '', s.km > 0 ? `${fmtN(s.km)} km` : '', s.mins ? `${s.mins} min` : '']
    .filter(Boolean).join(' · ');
}

// Historia por ejercicio (de más viejo a más nuevo): de ahí salen «la última vez», los récords y el progreso.
function progressMap() {
  const out = new Map();
  for (const w of finished().reverse()) {
    for (const e of w.exercises) {
      const sets = doneSets(e);
      if (!sets.length) continue;
      const k = key(e.name);
      let p = out.get(k);
      if (!p) out.set(k, p = { name: e.name, sessions: [] });
      p.name = e.name;
      p.cardio = !!e.cardio;
      p.sessions.push({ date: w.date, t: w.t, sets, cardio: !!e.cardio, top: topSet(sets, e.cardio), vol: volume(sets), km: total(sets, 'km'), min: total(sets, 'min') });
    }
  }
  return out;
}

// ---------- saneo al importar un respaldo ----------
export function sanitizeRoutines(list) {
  return list.map(r => {
    if (!r?.id || typeof r.name !== 'string' || !Array.isArray(r.exercises)) throw new Error('Hay una rutina inválida en el archivo.');
    return {
      id: String(r.id), name: r.name, color: COLORS.includes(r.color) ? r.color : 'mauve',
      exercises: r.exercises.filter(e => typeof e?.name === 'string' && e.name.trim()).map(e => ({
        name: e.name, sets: Math.round(num(e.sets, 1, 20, 3)),
        ...(e.cardio ? { cardio: true, min: fieldVal('min', e.min, 0), km: fieldVal('km', e.km, 0) }
          : { reps: Math.round(num(e.reps, 0, 999, 10)), weight: r2(num(e.weight, 0, 9999, 0)) }),
        ...(e.rest != null && Number.isFinite(Number(e.rest)) ? { rest: Math.round(num(e.rest, 0, 600, 0)) } : {}),
      })),
    };
  });
}
export function sanitizeExercises(list) {
  const seen = new Set();
  return list.filter(e => typeof e?.name === 'string' && e.name.trim()).map(e => ({
    id: String(e.id ?? uid()), name: e.name.trim().replace(/\s+/g, ' ').slice(0, 50), group: GROUPS.includes(e.group) ? e.group : 'Otro',
  })).filter(e => !seen.has(key(e.name)) && seen.add(key(e.name))); // sin nombres repetidos
}
export function sanitizeWorkouts(list) {
  const out = list.map(w => {
    if (!w?.id || typeof w.name !== 'string' || !Array.isArray(w.exercises)) throw new Error('Hay un entrenamiento inválido en el archivo.');
    return {
      id: String(w.id), name: w.name, routineId: w.routineId ? String(w.routineId) : null, color: COLORS.includes(w.color) ? w.color : 'mauve',
      date: /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : today(), t: Number(w.t) || 0,
      ...(Number.isFinite(w.end) ? { end: w.end } : {}),
      exercises: w.exercises.filter(e => typeof e?.name === 'string' && Array.isArray(e.sets)).map(e => ({
        id: String(e.id ?? uid()), name: e.name, ...(e.cardio ? { cardio: true } : {}),
        ...(e.rest != null && Number.isFinite(Number(e.rest)) ? { rest: Math.round(num(e.rest, 0, 600, 0)) } : {}),
        sets: e.sets.filter(s => s && typeof s === 'object').map(s => ({
          ...(e.cardio ? { min: fieldVal('min', s.min, 0), km: fieldVal('km', s.km, 0) } : { reps: fieldVal('reps', s.reps, 0), weight: fieldVal('weight', s.weight, 0) }),
          done: !!s.done,
          ...(s.done && Number.isFinite(s.at) ? { at: s.at } : {}),
          ...(typeof s.note === 'string' && s.note.trim() ? { note: s.note.trim().slice(0, 120) } : {}),
        })),
      })),
    };
  });
  // Solo puede haber un entrenamiento en curso: si el respaldo trae más, los más viejos se dan por terminados.
  const open = out.filter(w => !w.end).sort((a, b) => b.t - a.t);
  open.slice(1).forEach(w => { w.end = w.t; });
  return out;
}

// Resumen para Inicio: los últimos `n` días (el último es hoy) con si hubo un entrenamiento terminado ese día, la fecha del último
// entrenamiento y el que está en curso (si hay).
export function homeInfo(n = 7) {
  const t = today(), trained = new Set(finished().map(w => w.date));
  const days = Array.from({ length: n }, (_, i) => { const date = addDays(t, i - (n - 1)); return { date, on: trained.has(date) }; });
  const w = active(), sets = w?.exercises.flatMap(e => e.sets) ?? [];
  return {
    days, count: days.filter(d => d.on).length, last: [...trained].sort().at(-1) ?? null,
    live: w ? { name: w.name, done: sets.filter(x => x.done).length, total: sets.length } : null,
  };
}

// ---------- vista ----------
export function gymView() {
  if (S.gymSub === 'catalog') return catalogView();
  const sub = SUBS.some(s => s[0] === S.gymSub) ? S.gymSub : 'train';
  const seg = `<div class="seg" role="tablist">${SUBS.map(([k, name]) =>
    `<button class="${k === sub ? 'on' : ''}" data-act="gym-sub" data-sub="${k}">${name}</button>`).join('')}</div>`;
  const body = { train: trainView, routines: routinesView, history: historyView, progress: progressView }[sub];
  return seg + body();
}

function lastUsed(r) { return S.workouts.filter(w => w.routineId === r.id && w.end).map(w => w.date).sort().at(-1) ?? null; }

function routineCard(r) {
  const n = r.exercises.length, series = r.exercises.reduce((t, e) => t + e.sets, 0), last = lastUsed(r);
  return `
    <section class="card habit" style="--c:var(--${r.color})">
      <div class="habit-h">
        <span class="h-ic">${icon('dumbbell')}</span>
        <button class="name" data-act="edit-routine" data-id="${r.id}">${esc(r.name)}</button>
      </div>
      <p class="muted tpl-meta">${pl(n, 'ejercicio')} · ${pl(series, 'serie')}${last ? ` · última vez ${fmtDate(last)}` : ''}</p>
      <p class="muted gx-prev">${esc(r.exercises.slice(0, 4).map(e => e.name).join(' · '))}${n > 4 ? '…' : ''}</p>
      ${active() ? '<small class="muted">Termina el entrenamiento en curso para empezar otro.</small>'
        : `<button class="btn primary block" data-act="start-routine" data-id="${r.id}">${icon('play')} Empezar</button>`}
    </section>`;
}

const weekStart = d => addDays(d, -((parseYmd(d).getDay() + 6) % 7)); // la semana empieza el lunes
const ago = d => { const n = daysBetween(d, today()); return n <= 0 ? 'Hoy' : n === 1 ? 'Ayer' : `Hace ${n} días`; };

function trainView() {
  const w = active();
  return (w ? activeView(w) : startView()) + `<button class="btn ghost block" data-act="gym-cfg">${icon('sliders')} Configurar</button>`;
}

function startView() {
  const done = finished(), c = cfg();
  const wk = done.filter(w => w.date >= weekStart(today()));
  const stats = done.length ? `
    <section class="card summary">
      <div><b>${wk.length}</b><small>Esta semana</small></div>
      <div><b>${fmtVol(wk.reduce((t, w) => t + summary(w).vol, 0))}</b><small>Volumen (${c.unit})</small></div>
      <div><b>${ago(done[0].date)}</b><small>Último</small></div>
    </section>` : '';
  return `
    ${stats}
    <button class="btn block" data-act="start-empty">${icon('plus')} Entrenamiento libre</button>
    ${S.routines.length ? `<h3 class="overline">Empezar con una rutina</h3>${S.routines.map(routineCard).join('')}`
      : `<div class="card empty"><p>Aún no tienes rutinas.</p>
        <small>Una rutina es la lista de ejercicios que repites, con sus series y repeticiones. Al empezarla se copia, y ahí solo anotas el peso y marcas cada serie.</small>
        <button class="btn primary" data-act="new-routine">Crear la primera</button></div>`}`;
}

function restBar() {
  if (!rest()) return '';
  return `
    <section class="card rest-bar" role="timer" aria-label="Descanso">
      <div class="rest-top"><span class="overline">Descanso</span><b class="rest-clock" data-rest-clock>${clock(restLeft())}</b></div>
      <div class="bar"><i data-rest-bar style="width:${restPct()}%"></i></div>
      <div class="rest-tools">
        <button class="btn sm" data-act="gym-rest-less">−15 s</button>
        <button class="btn sm" data-act="gym-rest-more">+15 s</button>
        <button class="btn sm primary" data-act="gym-rest-skip">${icon('skip')} Saltar</button>
      </div>
    </section>`;
}

function activeView(w) {
  const prog = progressMap(), c = cfg();
  const sets = w.exercises.flatMap(e => e.sets), done = sets.filter(s => s.done).length;
  const time = new Date(w.t).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
  return `
    ${restBar()}
    <section class="card gym-top" style="--c:var(--${w.color})">
      <h3>${esc(w.name)}</h3>
      <small class="muted">Empezó a las ${esc(time)} · ${done}/${sets.length} series</small>
      <div class="bar"><i style="width:${sets.length ? (done / sets.length) * 100 : 0}%"></i></div>
    </section>
    ${w.exercises.map(e => exerciseCard(w, e, prog.get(key(e.name))?.sessions.at(-1)?.sets, c)).join('')}
    ${w.exercises.length ? '' : '<div class="card empty"><p>Aún no hay ejercicios.</p><small>Agrega el primero.</small></div>'}
    <button class="btn block" data-act="gym-add-ex">${icon('plus')} Agregar ejercicio</button>
    <button class="btn primary block" data-act="gym-finish">${icon('check')} Terminar entrenamiento</button>
    <button class="btn danger block" data-act="gym-discard">Descartar entrenamiento</button>`;
}

// Campo de una de las dos casillas de una serie (`f` = weight/reps/min/km).
const setInput = (e, s, i, f, label, extra = '') => `<input type="number" inputmode="${inputmode(f)}" step="any" min="0" max="${FIELDS[f][1]}" placeholder="0"
  value="${s[f] ? fmtN(s[f]) : f === 'reps' ? (s.reps ?? '') : ''}" data-f="${f}" ${extra} aria-label="${esc(label)} de la serie ${i + 1} de ${esc(e.name)}">`;

function exerciseCard(w, e, last, c) {
  const m = modeOf(e), [ha, hb] = m.heads(c.unit);
  const rows = e.sets.map((s, i) => `
    <div class="gx-set ${s.done ? 'done' : ''}">
      <span class="gx-n">${i + 1}</span>
      ${setInput(e, s, i, m.a, ha, `data-change="gym-f" data-ex="${e.id}" data-i="${i}"`)}
      <span class="gx-x">${m.sep}</span>
      ${setInput(e, s, i, m.b, hb, `data-change="gym-f" data-ex="${e.id}" data-i="${i}"`)}
      <button class="set-chk ${s.done ? 'on' : ''}" data-act="gym-set" data-ex="${e.id}" data-i="${i}" aria-pressed="${!!s.done}"
        aria-label="Marcar la serie ${i + 1} de ${esc(e.name)}">${icon('check')}</button>
    </div>${s.note ? `<small class="gx-note">${esc(s.note)}</small>` : ''}`).join('');
  return `
    <section class="card gx" style="--c:var(--${w.color})">
      <div class="gx-h">
        <b class="gx-name">${esc(e.name)}</b>
        <small class="muted">${doneSets(e).length}/${e.sets.length}</small>
        <button class="icon sm" data-act="gym-ex-opts" data-ex="${e.id}" aria-label="Opciones de ${esc(e.name)}">${icon('edit')}</button>
      </div>
      ${last ? `<small class="muted gx-prev">Última vez: ${esc(last.slice(0, 6).map(s => setText(s, c.unit)).join(' · '))}</small>` : ''}
      <div class="gx-cols"><span></span><small>${ha}</small><span></span><small>${hb}</small><span></span></div>
      ${rows}
      <button class="btn sm gx-add" data-act="gym-add-set" data-ex="${e.id}">${icon('plus')} Serie</button>
    </section>`;
}

function routinesView() {
  const cat = `<button class="btn block" data-act="gym-catalog">${icon('list')} Catálogo de ejercicios · ${S.exercises.length}</button>`;
  if (!S.routines.length) {
    return `${cat}<div class="card empty"><p>Aún no tienes rutinas.</p>
      <small>Elige del catálogo los ejercicios de un día de entrenamiento (por ejemplo «Pecho y tríceps») y empiézalo cuando vayas al gimnasio.</small>
      <button class="btn primary" data-act="new-routine">Crear la primera</button></div>`;
  }
  return cat + S.routines.map(routineCard).join('');
}

// ---------- catálogo de ejercicios ----------
const routinesWith = name => S.routines.filter(r => r.exercises.some(e => key(e.name) === key(name)));

// <select> con los ejercicios del catálogo agrupados por músculo. Si el nombre actual ya no está en el catálogo (un respaldo, una
// rutina vieja) se ofrece igual, marcado, para no perderlo al guardar.
function exerciseSelect(name, current = '', attrs = '') {
  const groups = GROUPS.map(g => [g, S.exercises.filter(e => e.group === g)]).filter(x => x[1].length);
  const inCatalog = !current || S.exercises.some(e => key(e.name) === key(current));
  return `<select name="${name}" ${attrs}>
    <option value="">Elige un ejercicio…</option>
    ${inCatalog ? '' : `<option value="${esc(current)}" selected>${esc(current)} (fuera del catálogo)</option>`}
    ${groups.map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(e =>
      `<option value="${esc(e.name)}" ${key(e.name) === key(current) ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>`).join('')}
  </select>`;
}

function catalogList() {
  const q = norm(S.gymQuery).trim();
  const used = new Map();
  S.routines.forEach(r => new Set(r.exercises.map(e => key(e.name))).forEach(k => used.set(k, (used.get(k) ?? 0) + 1)));
  const out = GROUPS.map(g => [g, S.exercises.filter(e => e.group === g && (!q || norm(e.name).includes(q)))]).filter(x => x[1].length);
  if (!out.length) return `<div class="card empty"><p>${q ? 'Ningún ejercicio coincide.' : 'El catálogo está vacío.'}</p><small>${q ? 'Prueba con otra palabra o agrégalo con el +.' : 'Agrega ejercicios con el + de arriba.'}</small></div>`;
  return out.map(([g, list]) => `
    <section class="today"><h3 class="overline">${esc(g)} <span class="count">${list.length}</span></h3>
      <div class="trows card-rows">${list.map(e => {
        const n = used.get(key(e.name)) ?? 0;
        return `<button class="exrow" data-act="edit-ex" data-id="${e.id}"><span class="xr-t">${esc(e.name)}</span>${n ? `<small>${pl(n, 'rutina')}</small>` : ''}</button>`;
      }).join('')}</div></section>`).join('');
}

function catalogView() {
  return `
    <input class="search" id="gsearch" type="search" placeholder="Buscar ejercicio…" value="${esc(S.gymQuery)}" aria-label="Buscar ejercicio" autocomplete="off">
    <div id="gcat" class="catalog">${catalogList()}</div>`;
}
export function onSearch(v) {
  S.gymQuery = v;
  $('#gcat').innerHTML = catalogList();
}

// Cambiar el nombre de un ejercicio lo cambia también en las rutinas y el historial (se guardan por nombre).
async function renameEverywhere(old, neu) {
  const k = key(old), rs = [], ws = [];
  const fix = (list, out) => list.forEach(x => {
    let hit = false;
    x.exercises.forEach(e => { if (key(e.name) === k) { e.name = neu; hit = true; } });
    if (hit) out.push(x);
  });
  fix(S.routines, rs);
  fix(S.workouts, ws);
  if (rs.length || ws.length) await db.commit({ put: { routines: rs, workouts: ws } });
}

// `then(nombre)` se llama al guardar uno nuevo (por ejemplo para volver al formulario que lo pidió).
function catalogForm(ex, then) {
  const used = ex ? routinesWith(ex.name) : [];
  modal(ex ? 'Editar ejercicio' : 'Nuevo ejercicio', `
    <label>Nombre <input name="name" required maxlength="50" value="${esc(ex?.name ?? '')}" placeholder="Ej. Press de banca" autocomplete="off"></label>
    <label>Grupo muscular
      <select name="group">${GROUPS.map(g => `<option value="${esc(g)}" ${g === (ex?.group ?? 'Otro') ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
    </label>
    ${ex ? '<small class="muted">Si cambias el nombre, también cambia en tus rutinas y en el historial.</small>' : ''}
    ${used.length ? `<small class="muted">Está en ${used.length === 1 ? 'la rutina' : 'las rutinas'}: ${used.map(r => esc(r.name)).join(', ')}. Quítalo de ${used.length === 1 ? 'ella' : 'ellas'} para poder eliminarlo.</small>` : ''}`, {
    async onSubmit(fd) {
      const name = fd.get('name').trim().replace(/\s+/g, ' ');
      if (!name) return false;
      if (S.exercises.some(e => e !== ex && key(e.name) === key(name))) { toast('Ya existe un ejercicio con ese nombre'); return false; }
      const group = GROUPS.includes(fd.get('group')) ? fd.get('group') : 'Otro';
      if (ex) {
        const old = ex.name;
        Object.assign(ex, { name, group });
        if (old !== name) await renameEverywhere(old, name);
      } else S.exercises.push(ex = { id: uid(), name, group });
      await saveExercise(ex);
      if (then) setTimeout(() => then(ex.name), 0); // después de que este diálogo se cierre
    },
    onDelete: ex && !used.length ? async () => {
      S.exercises = S.exercises.filter(x => x.id !== ex.id);
      await db.commit({ remove: { exercises: [ex.id] } });
    } : undefined,
    confirmText: '¿Eliminar este ejercicio del catálogo? Tu historial lo conserva.',
  });
}

function workoutCard(w) {
  return `
    <button class="card list-card" style="--c:var(--${w.color})" data-act="workout-open" data-id="${w.id}">
      <span class="lc-top"><b>${esc(w.name)}</b><small>${esc(fmtDate(w.date))}</small></span>
      <small class="muted">${summaryText(w)}</small>
    </button>`;
}

function historyView() {
  const all = finished();
  if (!all.length) return '<div class="card empty"><p>Aquí aparecerán tus entrenamientos.</p><small>Cuando termines uno, se guarda con sus series, pesos y repeticiones.</small></div>';
  const shown = all.slice(0, S.gymLimit), left = all.length - shown.length;
  return `${shown.map(workoutCard).join('')}
    ${left > 0 ? `<button class="btn ghost block" data-act="gym-more">Ver más (${Math.min(30, left)} de ${left} restantes)</button>` : ''}`;
}

// Qué se grafica de cada sesión: fuerza → peso máximo (o repeticiones si nunca hubo peso); cardio → distancia total (o tiempo).
const metricOf = (p, s) => (p.cardio ? (p.sessions.some(x => x.km > 0) ? s.km : s.min)
  : p.sessions.some(x => x.top.weight > 0) ? s.top.weight : s.top.reps);
const metricLabel = (p, unit) => (p.cardio ? (p.sessions.some(x => x.km > 0) ? 'Distancia por sesión (km)' : 'Tiempo por sesión (min)')
  : p.sessions.some(x => x.top.weight > 0) ? `Peso máximo por sesión (${unit})` : 'Repeticiones máximas por sesión');
const bestText = (p, s, unit) => (p.cardio ? setText({ min: s.min, km: s.km }, unit) : setText(s.top, unit));

function progressView() {
  const list = [...progressMap()].map(([k, p]) => ({ k, ...p })).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }));
  if (!list.length) return '<div class="card empty"><p>Aquí verás cómo avanzas en cada ejercicio.</p><small>Aparece después de terminar tu primer entrenamiento.</small></div>';
  const c = cfg();
  return list.map(p => {
    const best = p.sessions.reduce((b, s) => (metricOf(p, s) > metricOf(p, b) ? s : b));
    return `
      <button class="card list-card" data-act="gym-prog" data-k="${esc(p.k)}">
        <span class="lc-top"><b>${esc(p.name)}</b><small>${pl(p.sessions.length, 'sesión', 'sesiones')}</small></span>
        <small class="muted">Mejor: ${esc(bestText(p, best, c.unit))} · última vez ${esc(fmtDate(p.sessions.at(-1).date))}</small>
      </button>`;
  }).join('');
}

function progressDetail(k) {
  const p = progressMap().get(k);
  if (!p) return;
  const c = cfg(), recent = p.sessions.slice(-12);
  const best = p.sessions.reduce((b, s) => (metricOf(p, s) > metricOf(p, b) ? s : b));
  const vals = recent.map(s => metricOf(p, s)), max = Math.max(...vals, 1);
  modal(p.name, `
    <p>${p.cardio ? 'Mejor sesión' : 'Mejor serie'}: <b>${esc(bestText(p, best, c.unit))}</b> <span class="muted">(${esc(fmtDateY(best.date))})</span></p>
    <div>
      <small class="muted">${metricLabel(p, c.unit)} · últimas ${recent.length}</small>
      <div class="spark few" role="img" aria-label="Gráfica de progreso">${vals.map(v => `<div class="col"><i style="height:${Math.max(4, (v / max) * 100)}%"></i></div>`).join('')}</div>
      <div class="spark-x"><span>${esc(fmtDate(recent[0].date))}</span><span>${esc(fmtDate(recent.at(-1).date))}</span></div>
    </div>
    <ul class="moves">${[...p.sessions].reverse().slice(0, 10).map(s => `
      <li><div class="move static"><span>${esc(fmtDate(s.date))}<small>${pl(s.sets.length, 'serie')}${s.vol > 0 ? ` · ${fmtVol(s.vol)} ${c.unit}` : ''}</small></span>
        <span class="amt">${esc(bestText(p, s, c.unit))}</span></div></li>`).join('')}</ul>`);
}

let viewing = null; // entrenamiento cuyo detalle está abierto (para «Guardar como rutina»)
function workoutDetail(w) {
  viewing = w;
  const c = cfg();
  modal(w.name, `
    <small class="muted">${esc(fmtDateY(w.date))} · ${summaryText(w)}</small>
    ${w.exercises.map(e => `
      <div class="gx-done"><b>${esc(e.name)}</b>
        <ol>${doneSets(e).map(x => `<li>${esc(setText(x, c.unit))}${x.note ? ` <span class="muted">— ${esc(x.note)}</span>` : ''}</li>`).join('')}</ol></div>`).join('')}
    <div class="two">
      <button type="button" class="btn" data-act="workout-edit">${icon('edit')} Editar</button>
      <button type="button" class="btn" data-act="workout-to-routine">${icon('copy')} Como rutina</button>
    </div>`, {
    onDelete: async () => {
      S.workouts = S.workouts.filter(x => x.id !== w.id);
      await db.commit({ remove: { workouts: [w.id] } });
    },
    confirmText: '¿Eliminar este entrenamiento del historial?',
  });
}

// ---------- formularios ----------
// Editor de rutina por filas: cada ejercicio se elige del catálogo y lleva series, repeticiones, peso y descanso (opcionales los dos últimos).
// `seed` (solo al crear) rellena el formulario, por ejemplo con un entrenamiento ya hecho.
function routineForm(r, seed) {
  const src = r ?? seed, color = src?.color ?? 'mauve', unit = cfg().unit;
  const blank = () => ({ name: '', sets: 3, reps: 10, weight: 0 });
  const numIn = (e, k, label, attrs = '') => `<label>${label} <input data-k="${k}" type="number" inputmode="${inputmode(k)}" step="any" min="0" max="${FIELDS[k][1]}" ${attrs} placeholder="0" value="${e[k] ? fmtN(e[k]) : k === 'reps' ? (e.reps ?? '') : ''}"></label>`;
  const rows = (src?.exercises?.length ? src.exercises : [blank()]).map(e => ({ ...e }));
  modal(r ? 'Editar rutina' : 'Nueva rutina', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(src?.name ?? '')}" placeholder="Ej. Pecho y tríceps, Pierna…"></label>
    <div><small class="muted">Ejercicios</small>
      ${S.exercises.length ? '' : '<p class="muted note">Tu catálogo está vacío: agrega ejercicios en Rutinas › Catálogo de ejercicios.</p>'}
      <div id="rx" class="fields-ed"></div>
      <button type="button" class="btn sm" id="rx-add">${icon('plus')} Agregar ejercicio</button></div>
    <div><small class="muted">Color</small>
      <div class="swatches" role="radiogroup" aria-label="Color">
        ${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--c:var(--${c})"></span></label>`).join('')}
      </div>
    </div>`, {
    afterOpen(form) {
      const box = form.querySelector('#rx');
      const paint = () => {
        box.innerHTML = rows.map((e, i) => `
          <div class="frow rx" data-i="${i}">
            ${exerciseSelect('ex', e.name, `required data-k="name" aria-label="Ejercicio ${i + 1}"`)}
            <div class="rx-nums">
              <label>Series <input data-k="sets" type="number" inputmode="numeric" min="1" max="20" required value="${e.sets}"></label>
              ${isCardio(e.name) ? numIn(e, 'min', 'Min') + numIn(e, 'km', 'Km') : numIn(e, 'reps', 'Reps', 'required') + numIn(e, 'weight', `Peso (${unit})`)}
              <label>Desc. (s) <input data-k="rest" type="number" inputmode="numeric" min="0" max="600" placeholder="${isCardio(e.name) ? 0 : cfg().rest}" value="${e.rest ?? ''}"></label>
            </div>
            <div class="frow-tools"><span class="spacer"></span>
              <button type="button" class="icon sm" data-mv="-1" aria-label="Subir ejercicio ${i + 1}" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
              <button type="button" class="icon sm" data-mv="1" aria-label="Bajar ejercicio ${i + 1}" ${i === rows.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
              <button type="button" class="icon sm" data-rm aria-label="Quitar ejercicio ${i + 1}">${icon('close')}</button>
            </div>
          </div>`).join('');
      };
      const sync = e => {
        const k = e.target.dataset.k, i = +e.target.closest('.rx')?.dataset.i;
        if (!k || Number.isNaN(i)) return;
        const row = rows[i], v = e.target.value;
        if (k === 'name') {
          const was = isCardio(row.name);
          row.name = v;
          // Al pasar de un ejercicio de fuerza a uno de cardio (o al revés) cambian las casillas de la fila.
          if (isCardio(v) !== was) { Object.assign(row, isCardio(v) ? { sets: 1, min: 0, km: 0 } : { sets: 3, reps: 10, weight: 0 }); paint(); }
        } else if (k === 'rest') { if (v === '') delete row.rest; else row.rest = Math.round(num(v, 0, 600, 0)); }
        else if (k === 'sets') row.sets = Math.round(num(v, 1, 20, row.sets));
        else if (FIELDS[k]) row[k] = fieldVal(k, v, 0);
      };
      box.addEventListener('input', sync);
      box.addEventListener('change', sync);
      box.addEventListener('click', e => {
        const row = e.target.closest('.rx'), b = e.target.closest('button');
        if (!row || !b) return;
        const i = +row.dataset.i;
        if (b.dataset.mv) {
          const j = i + +b.dataset.mv;
          if (rows[j]) { [rows[i], rows[j]] = [rows[j], rows[i]]; paint(); }
        } else if ('rm' in b.dataset) { rows.splice(i, 1); paint(); }
      });
      form.querySelector('#rx-add').onclick = () => { rows.push(blank()); paint(); box.querySelector('.rx:last-child select')?.focus(); };
      paint();
    },
    async onSubmit(fd) {
      if (!rows.length || rows.some(e => !e.name)) { toast('Elige un ejercicio en cada fila'); return false; }
      const exercises = rows.map(e => ({
        name: e.name, sets: e.sets,
        ...(isCardio(e.name) ? { cardio: true, min: e.min || 0, km: e.km || 0 } : { reps: e.reps ?? 10, weight: e.weight || 0 }),
        ...(e.rest != null ? { rest: e.rest } : {}),
      }));
      const data = { name: fd.get('name').trim(), color: fd.get('color'), exercises };
      if (r) Object.assign(r, data); else S.routines.push(r = { id: uid(), ...data });
      await saveRoutine(r);
      if (seed) toast('Rutina guardada');
    },
    onDelete: r && (async () => {
      S.routines = S.routines.filter(x => x.id !== r.id);
      await db.commit({ remove: { routines: [r.id] } });
    }),
    confirmText: '¿Eliminar esta rutina? Los entrenamientos ya hechos no se borran.',
  });
}

function configForm() {
  const c = cfg();
  modal('Configurar Gimnasio', `
    <label>Unidad de peso
      <select name="unit"><option value="kg" ${c.unit === 'kg' ? 'selected' : ''}>Kilogramos (kg)</option><option value="lb" ${c.unit === 'lb' ? 'selected' : ''}>Libras (lb)</option></select>
    </label>
    <label>Descanso entre series (segundos)
      <input name="rest" type="number" inputmode="numeric" min="0" max="600" required value="${c.rest}">
    </label>
    <small class="muted">Al marcar una serie empieza el descanso (con 0 no empieza). Cada ejercicio puede tener el suyo. Cambiar la unidad solo cambia la etiqueta: no convierte lo ya guardado.</small>`, {
    async onSubmit(fd) {
      G().cfg = { unit: fd.get('unit') === 'lb' ? 'lb' : 'kg', rest: Math.round(num(fd.get('rest'), 0, 600, DEFAULTS.rest)) };
      await saveSettings();
    },
  });
}

// Las casillas vacías de la rutina se llenan con lo de la última vez (la misma serie, o la última que hubo).
function newExercise(e, prog) {
  const cardio = e.cardio ?? isCardio(e.name);
  const last = prog.get(key(e.name))?.sessions.at(-1)?.sets ?? [];
  const prev = (i, f) => (last[i] ?? last.at(-1))?.[f] ?? 0;
  return {
    id: uid(), name: e.name, ...(cardio ? { cardio: true } : {}), ...(e.rest != null ? { rest: e.rest } : {}),
    sets: Array.from({ length: e.sets }, (_, i) => (cardio
      ? { min: e.min > 0 ? e.min : prev(i, 'min'), km: e.km > 0 ? e.km : prev(i, 'km'), done: false }
      : { reps: e.reps ?? 10, weight: e.weight > 0 ? e.weight : prev(i, 'weight'), done: false })),
  };
}

function addExerciseForm(w, preset = '') {
  modal('Agregar ejercicio', `
    <label>Ejercicio ${exerciseSelect('name', preset, 'required')}</label>
    <div class="two">
      <label>Series <input name="sets" type="number" inputmode="numeric" min="1" max="20" required value="${isCardio(preset) ? 1 : 3}"></label>
      <label id="ax-reps" ${isCardio(preset) ? 'hidden' : ''}>Repeticiones <input name="reps" type="number" inputmode="numeric" min="0" max="999" value="10"></label>
    </div>
    <small class="muted" id="ax-hint">${isCardio(preset) ? 'Cardio: anotas tiempo y distancia de cada serie.' : 'El peso se completa con el de la última vez que hiciste este ejercicio.'}</small>
    <button type="button" class="btn sm" id="new-ex">${icon('plus')} Crear un ejercicio nuevo en el catálogo</button>`, {
    submit: 'Agregar',
    afterOpen: f => {
      f.querySelector('#new-ex').onclick = () => catalogForm(null, name => addExerciseForm(w, name));
      f.elements.name.addEventListener('change', () => {
        const c = isCardio(f.elements.name.value);
        f.querySelector('#ax-reps').hidden = c;
        f.elements.sets.value = c ? 1 : 3;
        f.querySelector('#ax-hint').textContent = c ? 'Cardio: anotas tiempo y distancia de cada serie.' : 'El peso se completa con el de la última vez que hiciste este ejercicio.';
      });
    },
    async onSubmit(fd) {
      const name = fd.get('name');
      if (!name) return false;
      w.exercises.push(newExercise({ name, sets: Math.round(num(fd.get('sets'), 1, 20, 3)), reps: Math.round(num(fd.get('reps'), 0, 999, 10)), weight: 0 }, progressMap()));
      await saveWorkout(w);
    },
  });
}

// Opciones de un ejercicio del entrenamiento en curso: cambiarlo por otro, cuántas series, descanso, una nota por serie y su lugar.
function exerciseOptions(w, e) {
  const i = w.exercises.indexOf(e);
  modal('Ejercicio', `
    <label>Ejercicio ${exerciseSelect('name', e.name, 'required')}</label>
    <div class="two">
      <label>Series <input name="sets" type="number" inputmode="numeric" min="1" max="20" required value="${e.sets.length}"></label>
      <label>Descanso (s) <input name="rest" type="number" inputmode="numeric" min="0" max="600" placeholder="${e.cardio ? 0 : cfg().rest}" value="${e.rest ?? ''}"></label>
    </div>
    <div><small class="muted">Notas de cada serie (opcional)</small>
      <div class="set-notes">${e.sets.map((x, j) => `<label><span>Serie ${j + 1}</span><input name="note_${j}" maxlength="120" value="${esc(x.note ?? '')}" placeholder="Ej. agarre cerrado"></label>`).join('')}</div></div>
    ${w.exercises.length > 1 ? `<div class="two">
      <button type="button" class="btn" id="ex-up" ${i === 0 ? 'disabled' : ''}>${icon('up')} Subir</button>
      <button type="button" class="btn" id="ex-down" ${i === w.exercises.length - 1 ? 'disabled' : ''}>${icon('down')} Bajar</button></div>` : ''}`, {
    afterOpen(f) {
      // Mover el ejercicio guarda y cierra el diálogo al momento (no hace falta «Guardar»).
      const move = async dir => {
        const j = i + dir;
        if (!w.exercises[j]) return;
        [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]];
        await saveWorkout(w);
        f.closest('dialog').close();
        hooks.render();
      };
      f.querySelector('#ex-up')?.addEventListener('click', () => move(-1));
      f.querySelector('#ex-down')?.addEventListener('click', () => move(1));
    },
    async onSubmit(fd) {
      const name = fd.get('name');
      if (!name) return false;
      e.sets.forEach((x, j) => { const v = (fd.get(`note_${j}`) ?? '').trim(); if (v) x.note = v.slice(0, 120); else delete x.note; });
      if (isCardio(name) !== !!e.cardio) { // de fuerza a cardio (o al revés): las casillas de las series cambian
        if (isCardio(name)) e.cardio = true; else delete e.cardio;
        e.sets = e.sets.map(x => ({ ...modeOf(e).blank(), ...(x.note ? { note: x.note } : {}) }));
      }
      e.name = name;
      const rest = fd.get('rest').trim();
      if (rest === '') delete e.rest; else e.rest = Math.round(num(rest, 0, 600, 0));
      const n = Math.round(num(fd.get('sets'), 1, 20, e.sets.length));
      while (e.sets.length > n) e.sets.pop();
      while (e.sets.length < n) e.sets.push(e.sets.length ? copySet(e.sets.at(-1)) : modeOf(e).blank());
      await saveWorkout(w);
    },
    onDelete: async () => { w.exercises = w.exercises.filter(x => x.id !== e.id); await saveWorkout(w); },
    deleteLabel: 'Quitar',
    confirmText: '¿Quitar este ejercicio del entrenamiento?',
  });
}

// Editar un entrenamiento ya terminado: nombre, fecha, el valor y la nota de cada serie, quitar o agregar series y quitar ejercicios.
function editWorkoutForm(w) {
  const unit = cfg().unit;
  const ex = w.exercises.map(e => ({ ...e, sets: e.sets.map(x => ({ ...x })) }));
  modal('Editar entrenamiento', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(w.name)}"></label>
    <label>Fecha <input name="date" type="date" required value="${w.date}"></label>
    <div id="we" class="fields-ed"></div>`, {
    afterOpen(f) {
      const box = f.querySelector('#we');
      const paint = () => {
        box.innerHTML = ex.map((e, i) => {
          const m = modeOf(e), [ha, hb] = m.heads(unit);
          return `
          <div class="frow" data-e="${i}">
            <div class="gx-h"><b class="gx-name">${esc(e.name)}</b>
              <button type="button" class="icon sm" data-rm-ex aria-label="Quitar ${esc(e.name)} del entrenamiento">${icon('close')}</button></div>
            <div class="we-cols"><span></span><small>${ha}</small><span></span><small>${hb}</small><span></span></div>
            ${e.sets.map((x, j) => `
              <div class="we-set" data-s="${j}">
                <span class="gx-n">${j + 1}</span>
                ${setInput(e, x, j, m.a, ha)}
                <span class="gx-x">${m.sep}</span>
                ${setInput(e, x, j, m.b, hb)}
                <button type="button" class="icon sm" data-rm-set aria-label="Quitar la serie ${j + 1} de ${esc(e.name)}">${icon('close')}</button>
                <input class="we-note" data-f="note" maxlength="120" value="${esc(x.note ?? '')}" placeholder="Nota (opcional)" aria-label="Nota de la serie ${j + 1} de ${esc(e.name)}">
              </div>`).join('')}
            <button type="button" class="btn sm" data-add-set>${icon('plus')} Serie</button>
          </div>`;
        }).join('') || '<p class="muted">Sin ejercicios: deja al menos uno o elimina el entrenamiento desde su detalle.</p>';
      };
      box.addEventListener('input', ev => {
        const ei = ev.target.closest('[data-e]')?.dataset.e, si = ev.target.closest('[data-s]')?.dataset.s, f = ev.target.dataset.f;
        if (ei == null || si == null || !f) return;
        const x = ex[+ei].sets[+si];
        if (f === 'note') { const v = ev.target.value.trim(); if (v) x.note = v.slice(0, 120); else delete x.note; }
        else if (FIELDS[f]) x[f] = fieldVal(f, ev.target.value, 0);
      });
      box.addEventListener('click', ev => {
        const b = ev.target.closest('button'), ei = ev.target.closest('[data-e]')?.dataset.e;
        if (!b || ei == null) return;
        const e = ex[+ei];
        if ('rmEx' in b.dataset) ex.splice(+ei, 1);
        else if ('rmSet' in b.dataset) e.sets.splice(+b.closest('[data-s]').dataset.s, 1);
        else if ('addSet' in b.dataset) e.sets.push({ ...(e.sets.length ? copySet(e.sets.at(-1)) : modeOf(e).blank()), done: true });
        else return;
        paint();
      });
      paint();
    },
    async onSubmit(fd) {
      const kept = ex.map(e => ({ ...e, sets: e.sets.map(x => ({ ...x, done: true })) })).filter(e => e.sets.length);
      if (!kept.length) { toast('Deja al menos una serie; para borrarlo entero usa «Eliminar» en su detalle'); return false; }
      Object.assign(w, { name: fd.get('name').trim() || w.name, date: fd.get('date') || w.date, exercises: kept });
      await saveWorkout(w);
      toast('Entrenamiento actualizado');
    },
  });
}

// ---------- acciones ----------
async function startWorkout(routine) {
  if (active()) return toast('Ya hay un entrenamiento en curso');
  const prog = progressMap();
  const w = {
    id: uid(), name: routine?.name ?? 'Entrenamiento libre', routineId: routine?.id ?? null, color: routine?.color ?? 'mauve',
    date: today(), t: Date.now(), exercises: (routine?.exercises ?? []).map(e => newExercise(e, prog)),
  };
  S.workouts.push(w);
  await saveWorkout(w);
  S.gymSub = 'train';
  window.scrollTo(0, 0);
}

async function discard(w) {
  S.workouts = S.workouts.filter(x => x.id !== w.id);
  await db.commit({ remove: { workouts: [w.id] } });
  await clearRest();
}

// Busca el ejercicio y la serie del entrenamiento en curso a los que apunta un botón o campo.
const target = el => {
  const w = active(), e = w?.exercises.find(x => x.id === el.dataset.ex), s = e?.sets[+el.dataset.i];
  return { w, e, s };
};

async function moveRest(ms) {
  const r = rest();
  if (!r) return;
  r.endsAt += ms;
  if (ms > 0) r.total = Math.min(3600, r.total + ms / 1000);
  if (r.endsAt <= Date.now()) return endRest(false);
  await saveSettings();
  paint();
}

export const actions = {
  'gym-sub': el => { S.gymSub = el.dataset.sub; S.gymLimit = 30; },
  'gym-more': () => { S.gymLimit += 30; },
  'gym-cfg': () => configForm(),
  'gym-catalog': () => { S.gymSub = 'catalog'; S.gymQuery = ''; window.scrollTo(0, 0); },
  'new-ex': () => catalogForm(null),
  'edit-ex': el => catalogForm(S.exercises.find(x => x.id === el.dataset.id)),
  'new-routine': () => { S.gymSub = 'routines'; routineForm(); },
  'edit-routine': el => routineForm(S.routines.find(r => r.id === el.dataset.id)),
  'start-routine': el => startWorkout(S.routines.find(r => r.id === el.dataset.id)),
  'start-empty': () => startWorkout(null),
  'workout-open': el => workoutDetail(S.workouts.find(w => w.id === el.dataset.id)),
  'workout-edit': () => { if (viewing) editWorkoutForm(viewing); },
  'workout-to-routine': () => {
    const w = viewing;
    if (!w) return;
    routineForm(null, {
      name: w.name, color: w.color,
      exercises: w.exercises.filter(e => e.sets.length).map(e => (e.cardio
        ? { name: e.name, cardio: true, sets: e.sets.length, min: e.sets.at(-1).min ?? 0, km: e.sets.at(-1).km ?? 0 }
        : { name: e.name, sets: e.sets.length, reps: e.sets.at(-1).reps, weight: Math.max(...e.sets.map(x => x.weight || 0)) })),
    });
  },
  'gym-prog': el => progressDetail(el.dataset.k),
  'gym-add-ex': () => addExerciseForm(active()),
  'gym-ex-opts': el => { const w = active(); exerciseOptions(w, w.exercises.find(e => e.id === el.dataset.ex)); },
  async 'gym-add-set'(el) {
    const w = active(), e = w?.exercises.find(x => x.id === el.dataset.ex);
    if (!e || e.sets.length >= 20) return;
    e.sets.push(e.sets.length ? copySet(e.sets.at(-1)) : modeOf(e).blank());
    await saveWorkout(w);
  },
  // Marcar una serie lee lo que hay escrito en la fila (por si el campo aún no avisó su cambio) y, al marcarla, inicia el descanso.
  async 'gym-set'(el) {
    const { w, e, s } = target(el);
    if (!s) return;
    el.closest('.gx-set').querySelectorAll('input[data-f]').forEach(i => { s[i.dataset.f] = fieldVal(i.dataset.f, i.value, s[i.dataset.f]); });
    s.done = !s.done;
    if (!s.done) delete s.at;
    else {
      s.at = Date.now();
      const best = e.cardio ? 0 : Math.max(0, ...(progressMap().get(key(e.name))?.sessions.map(x => x.top.weight || 0) ?? []));
      if (s.weight > 0 && best > 0 && s.weight > best) toast(`Nuevo récord en ${e.name}: ${fmtN(s.weight)} ${cfg().unit}`);
    }
    const secs = e.rest ?? (e.cardio ? 0 : cfg().rest); // el cardio no descansa entre series salvo que se pida
    if (s.done && secs > 0) startRest(secs);
    // La serie y el descanso se guardan en una sola transacción: el toque se ve marcado antes (en el teléfono se nota).
    await db.commit({ put: { workouts: [w], ...(s.done && secs > 0 ? { meta: [{ k: 'settings', v: S.settings }] } : {}) } });
  },
  'gym-rest-less': () => moveRest(-15000),
  'gym-rest-more': () => moveRest(15000),
  'gym-rest-skip': () => endRest(false),
  async 'gym-finish'() {
    const w = active();
    if (!w) return;
    const all = w.exercises.flatMap(e => e.sets), open = all.filter(s => !s.done).length;
    if (open === all.length) {
      if (!confirm('No marcaste ninguna serie. ¿Descartar este entrenamiento?')) return;
      return discard(w);
    }
    if (open && !confirm(`Las series sin marcar (${open}) no se guardan. ¿Terminar el entrenamiento?`)) return;
    w.exercises.forEach(e => { e.sets = doneSets(e); });
    w.exercises = w.exercises.filter(e => e.sets.length);
    w.end = Date.now();
    await saveWorkout(w);
    await clearRest();
    S.gymSub = 'history';
    S.gymLimit = 30;
    window.scrollTo(0, 0);
    toast(`Entrenamiento guardado: ${summaryText(w)}`);
  },
  async 'gym-discard'() {
    const w = active();
    if (!w || !confirm('¿Descartar este entrenamiento? No se guardará nada.')) return;
    await discard(w);
  },
};

// Cambios en las casillas de una serie: se guardan sin repintar, para no perder el foco ni el toque del botón de marcar.
export const changes = {
  async 'gym-f'(el) {
    const { w, s } = target(el), f = el.dataset.f;
    if (!s || !FIELDS[f]) return false;
    s[f] = fieldVal(f, el.value, s[f]);
    await saveWorkout(w);
    return false;
  },
};
