import * as db from './db.js';
import { $, esc, uid, today, addDays, parseYmd, daysBetween, fmtDate, fmtDateY, norm, r2, toast } from './util.js';
import { S, hooks, saveSettings, saveRoutine, saveWorkout } from './state.js';
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

const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const fmtN = n => String(+Number(n).toFixed(2));
const key = name => norm(name).replace(/\s+/g, ' ').trim(); // un mismo ejercicio sin importar tildes ni mayúsculas
const num = (v, lo, hi, d) => {
  const n = typeof v === 'string' && !v.trim() ? NaN : Number(v);
  return v != null && typeof v !== 'boolean' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

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
const pad = n => String(n).padStart(2, '0');
const fmt = t => { const s = Math.ceil(t / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

let timer = null;
const startTick = () => { timer ??= setInterval(tick, 250); };
const stopTick = () => { clearInterval(timer); timer = null; };

function paint() {
  if (!rest()) return;
  const txt = fmt(restLeft());
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
async function startRest(secs) {
  prepAudio();
  G().rest = { endsAt: Date.now() + secs * 1000, total: secs };
  startTick();
  keepAwake('gym', true);
  await saveSettings();
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
const finished = () => S.workouts.filter(w => w.end).sort((a, b) => b.t - a.t);
const doneSets = e => e.sets.filter(s => s.done);
const volume = sets => sets.reduce((t, s) => t + s.weight * s.reps, 0);
const topSet = sets => sets.reduce((b, s) => (!b || s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps) ? s : b), null);
const setText = (s, unit) => (s.weight > 0 ? `${fmtN(s.weight)} ${unit} × ${s.reps}` : `${s.reps} reps`);
const mins = w => {
  const last = Math.max(0, ...w.exercises.flatMap(e => e.sets.map(s => s.at ?? 0)));
  return last > w.t ? Math.max(1, Math.round((last - w.t) / 60000)) : null;
};
function summary(w) {
  const sets = w.exercises.flatMap(doneSets);
  return { sets: sets.length, vol: volume(sets), mins: mins(w) };
}
const fmtVol = v => Math.round(v).toLocaleString('en-US');

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
      p.sessions.push({ date: w.date, t: w.t, sets, top: topSet(sets), vol: volume(sets) });
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
        name: e.name, sets: Math.round(num(e.sets, 1, 20, 3)), reps: Math.round(num(e.reps, 0, 999, 10)), weight: r2(num(e.weight, 0, 9999, 0)),
        ...(e.rest != null && Number.isFinite(Number(e.rest)) ? { rest: Math.round(num(e.rest, 0, 600, 0)) } : {}),
      })),
    };
  });
}
export function sanitizeWorkouts(list) {
  const out = list.map(w => {
    if (!w?.id || typeof w.name !== 'string' || !Array.isArray(w.exercises)) throw new Error('Hay un entrenamiento inválido en el archivo.');
    return {
      id: String(w.id), name: w.name, routineId: w.routineId ? String(w.routineId) : null, color: COLORS.includes(w.color) ? w.color : 'mauve',
      date: /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : today(), t: Number(w.t) || 0,
      ...(Number.isFinite(w.end) ? { end: w.end } : {}),
      exercises: w.exercises.filter(e => typeof e?.name === 'string' && Array.isArray(e.sets)).map(e => ({
        id: String(e.id ?? uid()), name: e.name,
        ...(e.rest != null && Number.isFinite(Number(e.rest)) ? { rest: Math.round(num(e.rest, 0, 600, 0)) } : {}),
        sets: e.sets.filter(s => s && typeof s === 'object').map(s => ({
          reps: Math.round(num(s.reps, 0, 999, 0)), weight: r2(num(s.weight, 0, 9999, 0)), done: !!s.done,
          ...(s.done && Number.isFinite(s.at) ? { at: s.at } : {}),
        })),
      })),
    };
  });
  // Solo puede haber un entrenamiento en curso: si el respaldo trae más, los más viejos se dan por terminados.
  const open = out.filter(w => !w.end).sort((a, b) => b.t - a.t);
  open.slice(1).forEach(w => { w.end = w.t; });
  return out;
}

// Resumen para Inicio: el entrenamiento en curso (si hay) y los últimos `n` días en que hubo ejercicio, el más reciente primero.
// Si un día tuvo varios entrenamientos se juntan en una sola fila.
export function homeInfo(n = 7) {
  const byDate = new Map();
  for (const w of finished()) {
    const d = byDate.get(w.date) ?? { date: w.date, names: [], exercises: 0, sets: 0, vol: 0 };
    const s = summary(w);
    if (!d.names.includes(w.name)) d.names.push(w.name);
    d.exercises += w.exercises.length;
    d.sets += s.sets;
    d.vol += s.vol;
    byDate.set(w.date, d);
  }
  const w = active(), sets = w?.exercises.flatMap(e => e.sets) ?? [];
  return {
    unit: cfg().unit,
    live: w ? { name: w.name, done: sets.filter(s => s.done).length, total: sets.length } : null,
    days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n),
  };
}

// ---------- vista ----------
export function gymView() {
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
      <div class="rest-top"><span class="overline">Descanso</span><b class="rest-clock" data-rest-clock>${fmt(restLeft())}</b></div>
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

function exerciseCard(w, e, last, c) {
  const rows = e.sets.map((s, i) => `
    <div class="gx-set ${s.done ? 'done' : ''}">
      <span class="gx-n">${i + 1}</span>
      <input type="number" inputmode="decimal" step="any" min="0" max="9999" placeholder="0" value="${s.weight ? fmtN(s.weight) : ''}"
        data-change="gym-w" data-ex="${e.id}" data-i="${i}" aria-label="Peso de la serie ${i + 1} de ${esc(e.name)}">
      <span class="gx-x">×</span>
      <input type="number" inputmode="numeric" min="0" max="999" placeholder="0" value="${s.reps}"
        data-change="gym-r" data-ex="${e.id}" data-i="${i}" aria-label="Repeticiones de la serie ${i + 1} de ${esc(e.name)}">
      <button class="set-chk ${s.done ? 'on' : ''}" data-act="gym-set" data-ex="${e.id}" data-i="${i}" aria-pressed="${!!s.done}"
        aria-label="Marcar la serie ${i + 1} de ${esc(e.name)}">${icon('check')}</button>
    </div>`).join('');
  return `
    <section class="card gx" style="--c:var(--${w.color})">
      <div class="gx-h">
        <b class="gx-name">${esc(e.name)}</b>
        <small class="muted">${doneSets(e).length}/${e.sets.length}</small>
        <button class="icon sm" data-act="gym-ex-opts" data-ex="${e.id}" aria-label="Opciones de ${esc(e.name)}">${icon('edit')}</button>
      </div>
      ${last ? `<small class="muted gx-prev">Última vez: ${esc(last.slice(0, 6).map(s => setText(s, c.unit)).join(' · '))}</small>` : ''}
      <div class="gx-cols"><span></span><small>Peso (${c.unit})</small><span></span><small>Reps</small><span></span></div>
      ${rows}
      <button class="btn sm gx-add" data-act="gym-add-set" data-ex="${e.id}">${icon('plus')} Serie</button>
    </section>`;
}

function routinesView() {
  if (!S.routines.length) {
    return `<div class="card empty"><p>Aún no tienes rutinas.</p>
      <small>Escribe los ejercicios de un día de entrenamiento (por ejemplo «Pecho y tríceps») y empiézalo cuando vayas al gimnasio.</small>
      <button class="btn primary" data-act="new-routine">Crear la primera</button></div>`;
  }
  return S.routines.map(routineCard).join('');
}

function workoutCard(w) {
  const s = summary(w), c = cfg();
  return `
    <button class="card list-card" style="--c:var(--${w.color})" data-act="workout-open" data-id="${w.id}">
      <span class="lc-top"><b>${esc(w.name)}</b><small>${esc(fmtDate(w.date))}</small></span>
      <small class="muted">${pl(w.exercises.length, 'ejercicio')} · ${pl(s.sets, 'serie')} · ${fmtVol(s.vol)} ${c.unit}${s.mins ? ` · ${s.mins} min` : ''}</small>
    </button>`;
}

function historyView() {
  const all = finished();
  if (!all.length) return '<div class="card empty"><p>Aquí aparecerán tus entrenamientos.</p><small>Cuando termines uno, se guarda con sus series, pesos y repeticiones.</small></div>';
  const shown = all.slice(0, S.gymLimit), left = all.length - shown.length;
  return `${shown.map(workoutCard).join('')}
    ${left > 0 ? `<button class="btn ghost block" data-act="gym-more">Ver más (${Math.min(30, left)} de ${left} restantes)</button>` : ''}`;
}

const metricOf = (p, s) => (p.sessions.some(x => x.top.weight > 0) ? s.top.weight : s.top.reps);

function progressView() {
  const list = [...progressMap()].map(([k, p]) => ({ k, ...p })).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }));
  if (!list.length) return '<div class="card empty"><p>Aquí verás cómo avanzas en cada ejercicio.</p><small>Aparece después de terminar tu primer entrenamiento.</small></div>';
  const c = cfg();
  return list.map(p => {
    const best = p.sessions.reduce((b, s) => (metricOf(p, s) > metricOf(p, b) ? s : b));
    return `
      <button class="card list-card" data-act="gym-prog" data-k="${esc(p.k)}">
        <span class="lc-top"><b>${esc(p.name)}</b><small>${pl(p.sessions.length, 'sesión', 'sesiones')}</small></span>
        <small class="muted">Mejor: ${esc(setText(best.top, c.unit))} · última vez ${esc(fmtDate(p.sessions.at(-1).date))}</small>
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
    <p>Mejor serie: <b>${esc(setText(best.top, c.unit))}</b> <span class="muted">(${esc(fmtDateY(best.date))})</span></p>
    <div>
      <small class="muted">${p.sessions.some(s => s.top.weight > 0) ? `Peso máximo por sesión (${c.unit})` : 'Repeticiones máximas por sesión'} · últimas ${recent.length}</small>
      <div class="spark few" role="img" aria-label="Gráfica de progreso">${vals.map(v => `<div class="col"><i style="height:${Math.max(4, (v / max) * 100)}%"></i></div>`).join('')}</div>
      <div class="spark-x"><span>${esc(fmtDate(recent[0].date))}</span><span>${esc(fmtDate(recent.at(-1).date))}</span></div>
    </div>
    <ul class="moves">${[...p.sessions].reverse().slice(0, 10).map(s => `
      <li><div class="move static"><span>${esc(fmtDate(s.date))}<small>${pl(s.sets.length, 'serie')} · ${fmtVol(s.vol)} ${c.unit}</small></span>
        <span class="amt">${esc(setText(s.top, c.unit))}</span></div></li>`).join('')}</ul>`);
}

let viewing = null; // entrenamiento cuyo detalle está abierto (para «Guardar como rutina»)
function workoutDetail(w) {
  viewing = w;
  const s = summary(w), c = cfg();
  modal(w.name, `
    <small class="muted">${esc(fmtDateY(w.date))} · ${pl(s.sets, 'serie')} · ${fmtVol(s.vol)} ${c.unit}${s.mins ? ` · ${s.mins} min` : ''}</small>
    ${w.exercises.map(e => `
      <div class="gx-done"><b>${esc(e.name)}</b>
        <ol>${doneSets(e).map(x => `<li>${esc(setText(x, c.unit))}</li>`).join('')}</ol></div>`).join('')}
    <button type="button" class="btn block" data-act="workout-to-routine">${icon('copy')} Guardar como rutina</button>`, {
    onDelete: async () => {
      S.workouts = S.workouts.filter(x => x.id !== w.id);
      await db.commit({ remove: { workouts: [w.id] } });
    },
    confirmText: '¿Eliminar este entrenamiento del historial?',
  });
}

// ---------- formularios ----------
const RE = /^(.*?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?:\s+@\s*(\d+(?:[.,]\d+)?))?(?:\s+\/\s*(\d{1,4}))?$/i;
// Una línea por ejercicio: «Press de banca 4x10 @60 /90» = 4 series de 10 con 60 de peso y 90 s de descanso (peso y descanso opcionales).
const parseExercises = text => text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const m = l.match(RE);
  if (!m || !m[1].trim()) return { name: l.slice(0, 50), sets: 3, reps: 10, weight: 0 };
  return {
    name: m[1].trim().slice(0, 50), sets: Math.round(num(m[2], 1, 20, 3)), reps: Math.round(num(m[3], 0, 999, 10)),
    weight: m[4] ? r2(num(m[4].replace(',', '.'), 0, 9999, 0)) : 0, ...(m[5] != null ? { rest: Math.round(num(m[5], 0, 600, 0)) } : {}),
  };
});
const exercisesText = list => list.map(e => `${e.name} ${e.sets}x${e.reps}${e.weight > 0 ? ` @${fmtN(e.weight)}` : ''}${e.rest != null ? ` /${e.rest}` : ''}`).join('\n');

// `seed` (solo al crear) rellena el formulario, por ejemplo con un entrenamiento ya hecho.
function routineForm(r, seed) {
  const src = r ?? seed, color = src?.color ?? 'mauve';
  modal(r ? 'Editar rutina' : 'Nueva rutina', `
    <label>Nombre <input name="name" required maxlength="40" value="${esc(src?.name ?? '')}" placeholder="Ej. Pecho y tríceps, Pierna…"></label>
    <label>Ejercicios (uno por línea)
      <textarea name="exercises" rows="8" required placeholder="Press de banca 4x10 @60&#10;Fondos 3x12&#10;Sentadilla 4x8 @80 /120">${esc(exercisesText(src?.exercises ?? []))}</textarea>
      <small>Nombre, series × repeticiones y, si quieres, @peso y /descanso en segundos. Sin series ni repeticiones se usa 3×10.</small>
    </label>
    <div><small class="muted">Color</small>
      <div class="swatches" role="radiogroup" aria-label="Color">
        ${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--c:var(--${c})"></span></label>`).join('')}
      </div>
    </div>`, {
    async onSubmit(fd) {
      const exercises = parseExercises(fd.get('exercises'));
      if (!exercises.length) return false;
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

// Nombres de ejercicios conocidos (rutinas e historial) para sugerirlos al escribir.
function knownNames() {
  const seen = new Map();
  S.routines.forEach(r => r.exercises.forEach(e => seen.set(key(e.name), e.name)));
  progressMap().forEach((p, k) => seen.set(k, p.name));
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function newExercise(e, prog) {
  const last = prog.get(key(e.name))?.sessions.at(-1)?.sets ?? [];
  return {
    id: uid(), name: e.name, ...(e.rest != null ? { rest: e.rest } : {}),
    sets: Array.from({ length: e.sets }, (_, i) => ({ reps: e.reps, weight: e.weight > 0 ? e.weight : (last[i] ?? last.at(-1))?.weight ?? 0, done: false })),
  };
}

function addExerciseForm(w) {
  modal('Agregar ejercicio', `
    <label>Nombre <input name="name" required maxlength="50" list="gym-names" autocomplete="off"></label>
    <datalist id="gym-names">${knownNames().map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    <div class="two">
      <label>Series <input name="sets" type="number" inputmode="numeric" min="1" max="20" required value="3"></label>
      <label>Repeticiones <input name="reps" type="number" inputmode="numeric" min="0" max="999" required value="10"></label>
    </div>
    <small class="muted">El peso se completa con el de la última vez que hiciste este ejercicio.</small>`, {
    submit: 'Agregar',
    async onSubmit(fd) {
      const name = fd.get('name').trim();
      if (!name) return false;
      w.exercises.push(newExercise({ name, sets: Math.round(num(fd.get('sets'), 1, 20, 3)), reps: Math.round(num(fd.get('reps'), 0, 999, 10)), weight: 0 }, progressMap()));
      await saveWorkout(w);
    },
  });
}

function exerciseOptions(w, e) {
  modal('Ejercicio', `
    <label>Nombre <input name="name" required maxlength="50" value="${esc(e.name)}"></label>
    <label>Series <input name="sets" type="number" inputmode="numeric" min="1" max="20" required value="${e.sets.length}"></label>
    <label>Descanso entre series (segundos)
      <input name="rest" type="number" inputmode="numeric" min="0" max="600" placeholder="${cfg().rest} (el predeterminado)" value="${e.rest ?? ''}">
    </label>`, {
    async onSubmit(fd) {
      const name = fd.get('name').trim();
      if (!name) return false;
      e.name = name;
      const rest = fd.get('rest').trim();
      if (rest === '') delete e.rest; else e.rest = Math.round(num(rest, 0, 600, 0));
      const n = Math.round(num(fd.get('sets'), 1, 20, e.sets.length));
      while (e.sets.length > n) e.sets.pop();
      while (e.sets.length < n) { const l = e.sets.at(-1); e.sets.push({ reps: l?.reps ?? 10, weight: l?.weight ?? 0, done: false }); }
      await saveWorkout(w);
    },
    onDelete: async () => { w.exercises = w.exercises.filter(x => x.id !== e.id); await saveWorkout(w); },
    deleteLabel: 'Quitar',
    confirmText: '¿Quitar este ejercicio del entrenamiento?',
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
  'new-routine': () => { S.gymSub = 'routines'; routineForm(); },
  'edit-routine': el => routineForm(S.routines.find(r => r.id === el.dataset.id)),
  'start-routine': el => startWorkout(S.routines.find(r => r.id === el.dataset.id)),
  'start-empty': () => startWorkout(null),
  'workout-open': el => workoutDetail(S.workouts.find(w => w.id === el.dataset.id)),
  'workout-to-routine': () => {
    const w = viewing;
    if (!w) return;
    routineForm(null, {
      name: w.name, color: w.color,
      exercises: w.exercises.filter(e => e.sets.length).map(e => ({ name: e.name, sets: e.sets.length, reps: e.sets.at(-1).reps, weight: Math.max(...e.sets.map(s => s.weight)) })),
    });
  },
  'gym-prog': el => progressDetail(el.dataset.k),
  'gym-add-ex': () => addExerciseForm(active()),
  'gym-ex-opts': el => { const w = active(); exerciseOptions(w, w.exercises.find(e => e.id === el.dataset.ex)); },
  async 'gym-add-set'(el) {
    const w = active(), e = w?.exercises.find(x => x.id === el.dataset.ex);
    if (!e || e.sets.length >= 20) return;
    const l = e.sets.at(-1);
    e.sets.push({ reps: l?.reps ?? 10, weight: l?.weight ?? 0, done: false });
    await saveWorkout(w);
  },
  // Marcar una serie lee lo que hay escrito en la fila (por si el campo aún no avisó su cambio) y, al marcarla, inicia el descanso.
  async 'gym-set'(el) {
    const { w, e, s } = target(el);
    if (!s) return;
    const [wi, ri] = el.closest('.gx-set').querySelectorAll('input');
    s.weight = r2(num(wi.value, 0, 9999, s.weight));
    s.reps = Math.round(num(ri.value, 0, 999, s.reps));
    s.done = !s.done;
    if (!s.done) delete s.at;
    else {
      s.at = Date.now();
      const best = Math.max(0, ...(progressMap().get(key(e.name))?.sessions.map(x => x.top.weight) ?? []));
      if (s.weight > 0 && best > 0 && s.weight > best) toast(`Nuevo récord en ${e.name}: ${fmtN(s.weight)} ${cfg().unit}`);
    }
    await saveWorkout(w);
    const secs = e.rest ?? cfg().rest;
    if (s.done && secs > 0) await startRest(secs);
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
    const s = summary(w);
    toast(`Entrenamiento guardado: ${pl(s.sets, 'serie')}, ${fmtVol(s.vol)} ${cfg().unit}`);
  },
  async 'gym-discard'() {
    const w = active();
    if (!w || !confirm('¿Descartar este entrenamiento? No se guardará nada.')) return;
    await discard(w);
  },
};

// Cambios en los campos de peso y repeticiones: se guardan sin repintar, para no perder el foco ni el toque del botón de marcar.
async function setField(el, field) {
  const { w, s } = target(el);
  if (!s) return false;
  s[field] = field === 'weight' ? r2(num(el.value, 0, 9999, s.weight)) : Math.round(num(el.value, 0, 999, s.reps));
  await saveWorkout(w);
  return false;
}
export const changes = {
  'gym-w': el => setField(el, 'weight'),
  'gym-r': el => setField(el, 'reps'),
};
