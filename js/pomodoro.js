import { $, today, toast } from './util.js';
import { S, hooks, saveSettings } from './state.js';
import { modal } from './ui.js';
import { icon } from './icons.js';
import { prepAudio, alarm, keepAwake } from './aviso.js';

// Estado guardado en los ajustes (viaja en el respaldo):
//   cfg -> minutos de cada fase, pomodoros antes del descanso largo y si la siguiente fase arranca sola
//   run -> fase actual; `endsAt` (ms) mientras corre, `left` (ms) mientras está en pausa
//   day -> pomodoros de trabajo terminados hoy
// La cuenta regresiva se deriva siempre de `endsAt`, así que sigue bien aunque el navegador atrase los temporizadores.
const DEFAULTS = { work: 25, short: 5, long: 15, rounds: 4, auto: false };
const PHASES = { work: ['Trabajo', 'mauve'], short: ['Descanso corto', 'green'], long: ['Descanso largo', 'blue'] };

const P = () => (S.settings.pomo ??= { cfg: { ...DEFAULTS }, run: null, day: { date: '', n: 0 } });
const num = (v, lo, hi, d) => (Number.isFinite(+v) && +v > 0 ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
// Los valores se corrigen al leerlos: un respaldo manipulado no puede dejar la cuenta en cero ni en infinito.
const cfg = () => {
  const c = P().cfg ?? {};
  return {
    work: num(c.work, 1, 180, DEFAULTS.work), short: num(c.short, 1, 60, DEFAULTS.short), long: num(c.long, 1, 120, DEFAULTS.long),
    rounds: num(c.rounds, 1, 12, DEFAULTS.rounds), auto: !!c.auto,
  };
};
const ms = phase => cfg()[phase] * 60000;
const run = () => {
  const p = P();
  if (!PHASES[p.run?.phase]) p.run = { phase: 'work', round: 1, left: ms('work'), endsAt: null };
  return p.run;
};
const running = () => !!run().endsAt;
const remaining = () => (running() ? Math.max(0, run().endsAt - Date.now()) : run().left);
const doneToday = () => (P().day?.date === today() ? P().day.n : 0);

const pad = n => String(n).padStart(2, '0');
const fmt = t => { const s = Math.ceil(t / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };

// El sonido, la vibración y la pantalla encendida son los mismos que usa el descanso del Gimnasio (aviso.js).
const holdScreen = on => keepAwake('pomodoro', on);

// ---------- cuenta regresiva ----------
let timer = null;
const startTick = () => { timer ??= setInterval(tick, 250); };
const stopTick = () => { clearInterval(timer); timer = null; };

function paint() {
  const txt = fmt(remaining()), total = ms(run().phase);
  document.querySelectorAll('[data-pomo-clock]').forEach(e => { if (e.textContent !== txt) e.textContent = txt; });
  const bar = $('[data-pomo-bar]');
  if (bar) bar.style.width = `${Math.min(100, (1 - remaining() / total) * 100)}%`;
}

function tick() {
  if (!running()) return stopTick();
  if (run().endsAt - Date.now() <= 0) return finish();
  paint();
}

// Pasa a la fase siguiente. `completed` suma un pomodoro si terminó una fase de trabajo.
function advance(completed) {
  const r = run(), c = cfg();
  let phase, round = Math.min(r.round, c.rounds);
  if (r.phase === 'work') {
    if (completed) {
      const d = P().day;
      P().day = d?.date === today() ? { date: d.date, n: d.n + 1 } : { date: today(), n: 1 };
    }
    phase = round >= c.rounds ? 'long' : 'short';
  } else {
    phase = 'work';
    round = r.phase === 'long' ? 1 : round + 1;
  }
  P().run = { phase, round, left: ms(phase), endsAt: c.auto ? Date.now() + ms(phase) : null };
}

async function finish(sound = true) {
  const wasWork = run().phase === 'work';
  if (sound) alarm();
  advance(true);
  toast(wasWork ? 'Pomodoro terminado' : 'Descanso terminado');
  await refresh();
}

// Deja todo coherente con el estado actual: temporizador, pantalla encendida, vistas y estado guardado.
async function refresh(save = true) {
  if (running()) { startTick(); holdScreen(true); } else { stopTick(); holdScreen(false); }
  if (save) await saveSettings();
  if (S.tab === 'pomodoro' && !$('#dlg[open]')) hooks.render(); else paint();
}

// Al abrir la app (o importar un respaldo): si estaba corriendo, sigue; si terminó mientras estaba cerrada, avanza.
export function resume() {
  if (!running()) return stopTick();
  // Si terminó mientras la app estaba cerrada, avanza sin sonar: el momento ya pasó.
  if (run().endsAt <= Date.now()) { finish(false); return; }
  startTick();
  holdScreen(true);
  tick();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running()) { holdScreen(true); tick(); }
});

// ---------- pantalla completa (negra, solo el contador) ----------
// En pantallas AMOLED los píxeles negros están apagados: solo se iluminan los dígitos.
function overlay() {
  let o = $('#pomo-full');
  if (!o) {
    o = document.createElement('div');
    o.id = 'pomo-full';
    o.hidden = true;
    o.tabIndex = 0;
    o.setAttribute('role', 'button');
    o.setAttribute('aria-label', 'Tocar para salir de pantalla completa');
    o.dataset.act = 'pomo-exit';
    o.innerHTML = '<span data-pomo-clock></span>';
    document.body.append(o);
  }
  return o;
}
const fullOpen = () => !!$('#pomo-full') && !$('#pomo-full').hidden;

function enterFull() {
  overlay().hidden = false;
  paint();
  holdScreen(true); // con la pantalla negra y encendida, el aviso sigue sonando a tiempo
  document.documentElement.requestFullscreen?.().catch(() => { /* el aviso negro funciona igual sin ocultar las barras */ });
}
function exitFull() {
  if (!fullOpen()) return;
  overlay().hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!running()) holdScreen(false);
}
// Salir con el gesto del sistema (atrás) también cierra el aviso negro.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitFull(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') exitFull(); });

// ---------- vista ----------
export function pomodoroView() {
  const r = run(), c = cfg(), [name, color] = PHASES[r.phase];
  const on = running();
  const sub = r.phase === 'work' ? `Pomodoro ${Math.min(r.round, c.rounds)} de ${c.rounds}` : (r.phase === 'long' ? 'Ciclo completo' : `Después del pomodoro ${Math.min(r.round, c.rounds)}`);
  return `
    <section class="pomo" style="--c:var(--${color})">
      <div class="pomo-phase"><b>${name}</b><small>${sub}</small></div>
      <div class="pomo-clock" data-pomo-clock role="timer" aria-label="Tiempo restante">${fmt(remaining())}</div>
      <div class="bar"><i data-pomo-bar style="width:${Math.min(100, (1 - remaining() / ms(r.phase)) * 100)}%"></i></div>
      <div class="pomo-controls">
        <button class="icon" data-act="pomo-reset" aria-label="Reiniciar esta fase">${icon('reset')}</button>
        <button class="pomo-main" data-act="pomo-toggle" aria-label="${on ? 'Pausar' : 'Iniciar'}">${icon(on ? 'pause' : 'play')}</button>
        <button class="icon" data-act="pomo-skip" aria-label="Saltar a la siguiente fase">${icon('skip')}</button>
      </div>
      <div class="pomo-tools">
        <button class="btn" data-act="pomo-full">${icon('expand')} Pantalla completa</button>
        <button class="btn ghost" data-act="pomo-cfg">${icon('sliders')} Configurar</button>
      </div>
      <small class="muted">Hoy: ${doneToday()} ${doneToday() === 1 ? 'pomodoro' : 'pomodoros'}</small>
      ${on ? '<small class="muted">La pantalla se mantiene encendida mientras corre para que el aviso suene a tiempo.</small>' : ''}
    </section>`;
}

function configForm() {
  const c = cfg();
  modal('Configurar Pomodoro', `
    <label>Trabajo (minutos) <input name="work" type="number" inputmode="numeric" min="1" max="180" required value="${c.work}"></label>
    <label>Descanso corto (minutos) <input name="short" type="number" inputmode="numeric" min="1" max="60" required value="${c.short}"></label>
    <label>Descanso largo (minutos) <input name="long" type="number" inputmode="numeric" min="1" max="120" required value="${c.long}"></label>
    <label>Pomodoros antes del descanso largo <input name="rounds" type="number" inputmode="numeric" min="1" max="12" required value="${c.rounds}"></label>
    <label class="check"><input type="checkbox" name="auto" ${c.auto ? 'checked' : ''}><span>Iniciar la siguiente fase automáticamente</span></label>
    <small class="muted">Si el temporizador está corriendo, los cambios se aplican desde la fase siguiente.</small>`, {
    async onSubmit(fd) {
      P().cfg = {
        work: num(fd.get('work'), 1, 180, DEFAULTS.work), short: num(fd.get('short'), 1, 60, DEFAULTS.short),
        long: num(fd.get('long'), 1, 120, DEFAULTS.long), rounds: num(fd.get('rounds'), 1, 12, DEFAULTS.rounds), auto: !!fd.get('auto'),
      };
      const r = run();
      r.round = Math.min(r.round, cfg().rounds);
      if (!running()) r.left = ms(r.phase); // en pausa o detenido, la fase actual toma la duración nueva
      await saveSettings();
    },
  });
}

export const actions = {
  async 'pomo-toggle'() {
    const r = run();
    if (running()) { r.left = remaining(); r.endsAt = null; }
    else { prepAudio(); r.endsAt = Date.now() + r.left; }
    await refresh();
  },
  async 'pomo-reset'() {
    const r = run();
    r.endsAt = null;
    r.left = ms(r.phase);
    await refresh();
  },
  async 'pomo-skip'() { advance(false); await refresh(); },
  'pomo-full': () => { prepAudio(); enterFull(); },
  'pomo-exit': () => exitFull(),
  'pomo-cfg': () => configForm(),
};
