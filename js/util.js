export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Orden alfabético para listas de nombres: sin distinguir mayúsculas ni tildes, y con números naturales (Cat 2 < Cat 10).
export const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
export const byText = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

// Texto sin tildes ni mayúsculas, para buscar.
export const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad = n => String(n).padStart(2, '0');
export const r2 = n => Math.round(n * 100) / 100;
// «1 serie», «3 series»; `many` para plurales irregulares (sesión → sesiones).
export const pl = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// Milisegundos restantes como «mm:ss» (redondeando hacia arriba: «00:01» hasta el final).
export const clock = t => { const s = Math.ceil(t / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
export const sum = (arr, fn) => r2(arr.reduce((t, x) => t + fn(x), 0));

// ---------- fechas (siempre 'YYYY-MM-DD' en hora local) ----------
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ymd(new Date());
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
export const lastDayOf = (y, m0) => new Date(y, m0 + 1, 0).getDate();
// Suma meses; si el día no existe en el mes destino, usa el último (31 ene + 1 mes = 28/29 feb).
export function addMonths(s, n) {
  const d = parseYmd(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, lastDayOf(t.getFullYear(), t.getMonth())));
  return ymd(t);
}
export const fmtDate = s => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDateY = s => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// ---------- periodos (quincena / mes / año / todo) ----------
export function periodFor(kind, ref) {
  const d = parseYmd(ref), y = d.getFullYear(), m = d.getMonth(), last = lastDayOf(y, m);
  if (kind === 'q') {
    const first = d.getDate() <= 15;
    const [a, b] = first ? [1, 15] : [16, last];
    return { kind, start: ymd(new Date(y, m, a)), end: ymd(new Date(y, m, b)), label: `${a}–${b} ${MONTHS[m]} ${y}`, half: first ? 1 : 2 };
  }
  if (kind === 'm') return { kind, start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m, last)), label: `${MONTHS_FULL[m]} ${y}` };
  if (kind === 'y') return { kind, start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
  return { kind: 'all', start: '0000-01-01', end: '9999-12-31', label: 'Todo el tiempo' };
}
export function shiftRef(kind, ref, n) {
  if (kind === 'q') {
    let r = ref;
    for (let i = 0; i < Math.abs(n); i++) { const p = periodFor('q', r); r = n > 0 ? addDays(p.end, 1) : addDays(p.start, -1); }
    return r;
  }
  if (kind === 'm') return addMonths(ref.slice(0, 8) + '01', n);
  if (kind === 'y') return addMonths(ref.slice(0, 5) + '01-01', 12 * n);
  return ref;
}

// Quetzales: Q1,250.00
export function money(n) {
  const s = 'Q' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '−' + s : s;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove('show'), 2400);
}

// Solo se abren enlaces http(s): un `javascript:` pegado en una nota nunca se vuelve clicable.
export function safeUrl(v) {
  try { const u = new URL(String(v).trim()); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}
