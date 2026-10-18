import { esc, safeUrl } from './util.js';
import { icon } from './icons.js';

// Markdown sencillo y ligero, sin dependencias. Todo el texto se escapa con esc() ANTES de interpretar nada y solo se enlazan URLs
// http(s) (`safeUrl`): lo que se escribe nunca se vuelve HTML ni `javascript:`. Soporta: títulos (#), negrita, cursiva, tachado,
// `código`, bloques ```, listas (con sangría), listas de tareas (- [ ] / - [x]), citas (>), líneas (---) y enlaces ([texto](url) o
// una URL suelta). No hay imágenes, tablas ni HTML en línea.

// ---------- en línea ----------
// Lo que no debe volver a interpretarse (código, enlaces, escapes) se aparta como \u0000n\u0000 y se restaura al final.
function inline(text) {
  const stash = [];
  const put = html => `\u0000${stash.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!~])/g, (_, c) => put(esc(c)));
  s = esc(s);
  const href = u => safeUrl(u.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  const a = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t, u) => { const url = href(u); return url ? put(a(url, emphasis(t))) : m; });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g, (m, pre, u) => { const url = href(u); return url ? pre + put(a(url, u)) : m; });
  s = emphasis(s);
  while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]);
  return s;
}

function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

// ---------- bloques ----------
const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?/;
const startsBlock = l => FENCE.test(l) || HEADING.test(l) || RULE.test(l) || ITEM.test(l) || QUOTE.test(l);

function list(items) {
  let html = '';
  const stack = [];
  const close = () => { const top = stack.pop(); html += `</li></${top.ord ? 'ol' : 'ul'}>`; };
  for (const it of items) {
    while (stack.length && it.ind < stack.at(-1).ind) close();
    if (stack.length && it.ind === stack.at(-1).ind) html += '</li>';
    else { stack.push({ ind: it.ind, ord: it.ord }); html += it.ord ? '<ol>' : '<ul>'; }
    const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
    html += task
      ? `<li class="task ${task[1] === ' ' ? '' : 'done'}"><span class="md-box" role="img" aria-label="${task[1] === ' ' ? 'Pendiente' : 'Hecho'}">${task[1] === ' ' ? '' : icon('check')}</span>${inline(task[2])}`
      : `<li>${inline(it.text)}`;
  }
  while (stack.length) close();
  return html;
}

export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (FENCE.test(line)) {
      const buf = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) buf.push(lines[i]);
      i++; // la valla de cierre (si falta, el bloque llega hasta el final)
      out.push(`<pre class="code">${esc(buf.join('\n'))}</pre>`);
      continue;
    }
    let m = line.match(HEADING);
    if (m) { const n = Math.min(6, m[1].length + 2); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (RULE.test(line)) { out.push('<hr>'); i++; continue; }
    if (QUOTE.test(line)) {
      const buf = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) buf.push(lines[i].replace(QUOTE, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }
    if ((m = line.match(ITEM))) {
      const items = [];
      for (; i < lines.length; i++) {
        const it = lines[i].match(ITEM);
        if (it) items.push({ ind: it[1].replace(/\t/g, '    ').length >> 1, ord: /\d/.test(it[2]), text: it[3] });
        else if (items.length && /^\s+\S/.test(lines[i]) && !startsBlock(lines[i])) items.at(-1).text += '\n' + lines[i].trim(); // continuación
        else break;
      }
      out.push(list(items));
      continue;
    }
    const buf = [];
    for (; i < lines.length && lines[i].trim() && !(buf.length && startsBlock(lines[i])); i++) buf.push(lines[i]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

// Primera línea con contenido, sin marcas, para la lista de notas.
export function plainLine(src) {
  for (const l of String(src ?? '').split('\n')) {
    const t = l.replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').replace(/[*_~`]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
    if (t && !RULE.test(l) && !FENCE.test(l)) return t;
  }
  return '';
}

// ---------- editor ----------
// Campo de texto con barra de formato y vista previa. Se lee del formulario como un textarea normal (`name`).
export function mdEditor(name, value, label) {
  const btn = (act, ic, tip) => `<button type="button" class="icon" data-md="${act}" aria-label="${tip}">${icon(ic)}</button>`;
  return `<div class="md-ed">
    <small class="muted">${esc(label)}</small>
    <div class="seg" role="tablist"><button type="button" class="on" data-mdtab="edit">Escribir</button><button type="button" data-mdtab="prev">Vista previa</button></div>
    <div class="md-bar" role="toolbar" aria-label="Formato">
      ${btn('bold', 'bold', 'Negrita')}${btn('italic', 'italic', 'Cursiva')}${btn('head', 'heading', 'Título')}${btn('list', 'listul', 'Lista')}
      ${btn('task', 'checklist', 'Lista de tareas')}${btn('quote', 'quote', 'Cita')}${btn('code', 'code', 'Código')}${btn('link', 'link', 'Enlace')}
    </div>
    <textarea class="md-in" name="${esc(name)}" rows="9" maxlength="20000" aria-label="${esc(label)}" placeholder="Escribe en Markdown…">${esc(value ?? '')}</textarea>
    <div class="md md-prev" hidden></div>
  </div>`;
}

function edit(ta, fn) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const r = fn(value, a, b);
  ta.value = r.value;
  ta.setSelectionRange(r.start, r.end ?? r.start);
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// Envuelve la selección (o un marcador) con `pre`/`post`.
const wrap = (pre, post, ph) => (v, a, b) => {
  const sel = v.slice(a, b) || ph;
  return { value: v.slice(0, a) + pre + sel + post + v.slice(b), start: a + pre.length, end: a + pre.length + sel.length };
};

// Aplica `fn(línea)` a cada línea tocada por la selección. Sin selección el cursor queda al final de la línea (para seguir escribiendo);
// con selección, queda seleccionado el bloque.
const lines = fn => (v, a, b) => {
  const from = v.lastIndexOf('\n', a - 1) + 1;
  let to = v.indexOf('\n', b);
  if (to < 0) to = v.length;
  const block = v.slice(from, to).split('\n').map(fn).join('\n');
  const value = v.slice(0, from) + block + v.slice(to);
  return a === b ? { value, start: from + block.length } : { value, start: from, end: from + block.length };
};

const ACTIONS = {
  bold: wrap('**', '**', 'texto'),
  italic: wrap('*', '*', 'texto'),
  // Título: sin marca -> «## » -> «### » -> sin marca
  head: lines(l => { const m = l.match(/^(#{1,6})\s+/); if (!m) return '## ' + l; return m[1].length >= 3 ? l.slice(m[0].length) : '#'.repeat(m[1].length + 1) + ' ' + l.slice(m[0].length); }),
  list: lines(l => (/^\s*[-*+]\s+/.test(l) ? l.replace(/^(\s*)[-*+]\s+/, '$1') : '- ' + l)),
  task: lines(l => (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(l) ? l.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, '$1') : '- [ ] ' + l.replace(/^\s*[-*+]\s+/, ''))),
  quote: lines(l => (QUOTE.test(l) ? l.replace(QUOTE, '') : '> ' + l)),
  code: (v, a, b) => (v.slice(a, b).includes('\n') ? wrap('```\n', '\n```', '')(v, a, b) : wrap('`', '`', 'código')(v, a, b)),
  link: (v, a, b) => {
    const label = v.slice(a, b) || 'texto', url = 'https://';
    const start = a + label.length + 3; // dentro del paréntesis: queda seleccionada la dirección
    return { value: v.slice(0, a) + `[${label}](${url})` + v.slice(b), start, end: start + url.length };
  },
};

// Conecta los editores de un formulario: barra de formato y pestañas Escribir / Vista previa.
export function wireMarkdown(root) {
  // Tocar la barra no debe quitarle el foco al texto (si no, en el teléfono se cierra y reabre el teclado).
  root.addEventListener('mousedown', e => { if (e.target.closest('.md-bar')) e.preventDefault(); });
  root.addEventListener('click', e => {
    const ed = e.target.closest('.md-ed');
    if (!ed) return;
    const ta = ed.querySelector('textarea');
    const tab = e.target.closest('[data-mdtab]');
    if (tab) {
      const prev = tab.dataset.mdtab === 'prev';
      ed.querySelectorAll('[data-mdtab]').forEach(t => t.classList.toggle('on', t === tab));
      ed.querySelector('.md-prev').innerHTML = prev ? renderMarkdown(ta.value) || '<p class="muted">Nada que mostrar todavía.</p>' : '';
      ed.querySelector('.md-prev').hidden = !prev;
      ta.hidden = ed.querySelector('.md-bar').hidden = prev;
      return;
    }
    const b = e.target.closest('[data-md]');
    if (b) edit(ta, ACTIONS[b.dataset.md]);
  });
}
