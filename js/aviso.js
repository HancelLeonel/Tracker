// Avisos compartidos por Pomodoro y Gimnasio: sonido, vibración y pantalla encendida.

let audio = null;
// El navegador solo deja sonar el audio si el contexto se crea tras un toque: se prepara al iniciar.
export const prepAudio = () => { try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* sin audio */ } };

// `beeps` pitidos de `freq` Hz y la vibración correspondiente.
export function alarm({ beeps = 3, freq = 880 } = {}) {
  // Chrome bloquea vibrar antes del primer toque en la página (y deja un error en consola).
  if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(beeps > 2 ? [250, 120, 250, 120, 500] : [250, 120, 250]);
  if (!audio) return;
  const t0 = audio.currentTime;
  for (let k = 0; k < beeps; k++) {
    const d = k * 0.28, o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.25);
  }
}

// Sin esto Android apaga la pantalla y puede congelar la página, y el aviso no sonaría a tiempo.
// Varios módulos pueden pedirla a la vez: se suelta cuando ya ninguno la necesita.
const owners = new Set();
let lock = null, pending = false;
export async function keepAwake(owner, on) {
  if (on) owners.add(owner); else owners.delete(owner);
  try {
    if (owners.size && !lock && !pending && 'wakeLock' in navigator) {
      pending = true;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } finally { pending = false; }
    }
    if (!owners.size && lock) {
      const l = lock;
      lock = null;
      await l.release();
    }
  } catch { /* el navegador puede negarlo (batería baja, pestaña oculta) */ }
}
