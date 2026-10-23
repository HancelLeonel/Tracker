"""Sistema visual: color por sección (reversible), sin etiquetas en mayúsculas, movimiento solo como respuesta a un toque."""
import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
from _nav import ir
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
TOKEN = "t => getComputedStyle(document.documentElement).getPropertyValue(t).trim()"
SEC = "getComputedStyle(document.body).getPropertyValue('--sec').trim()"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800})
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        tok = lambda t: page.evaluate(TOKEN, t)

        # ---- color por sección
        for tab, token in (('money','--teal'), ('habits','--yellow'), ('lists','--blue'), ('home','--accent'), ('notes','--accent')):
            ir(page, tab)
            check(f'--sec en {tab} vale {token}', page.evaluate(SEC) == tok(token), (page.evaluate(SEC), tok(token)))
        ir(page, 'money')
        same = page.evaluate("""() => {
          const v = document.querySelector('#view'); v.insertAdjacentHTML('beforeend', '<button class="btn primary" id="probe-b">x</button><div id="probe-s" style="background:var(--sec)"></div>');
          const a = getComputedStyle(document.querySelector('#probe-b')).backgroundColor, c = getComputedStyle(document.querySelector('#probe-s')).backgroundColor;
          document.querySelector('#probe-b').remove(); document.querySelector('#probe-s').remove(); return a === c; }""")
        check('el botón principal usa el color de la sección', same)
        page.evaluate("document.body.dataset.sec = ''")
        check('volver a un solo acento: sin sección, --sec vuelve a --accent', page.evaluate(SEC) == tok('--accent'))

        # ---- sin etiquetas en mayúsculas, en todas las secciones
        up = []
        for tab in ('home','money','habits','lists','purchases','pomodoro','gym','notes','data'):
            ir(page, tab); page.wait_for_timeout(80)
            up += [f'{tab}:{c}' for c in page.evaluate("""() => [...document.querySelectorAll('#view *, #nav *, #topbar *')].filter(e => getComputedStyle(e).textTransform === 'uppercase').map(e => e.className || e.tagName).slice(0, 5)""")]
        check('ninguna etiqueta visible va en mayúsculas', not up, up)
        ir(page, 'home')
        fs = page.evaluate("""() => { const v = document.querySelector('#view'); v.insertAdjacentHTML('beforeend', '<span class="overline" id="probe-o">x</span>');
          const r = getComputedStyle(document.querySelector('#probe-o')); const out = [parseFloat(r.fontSize), parseFloat(r.letterSpacing) || 0]; document.querySelector('#probe-o').remove(); return out; }""")
        check('.overline: al menos 0,8 rem y sin espaciado entre letras', fs[0] >= 12.8 and fs[1] == 0, fs)

        # ---- movimiento
        ir(page, 'habits')
        check('el cambio de sección ya no usa fundido', page.evaluate("getComputedStyle(document.querySelector('#view')).animationName") == 'none')
        tp = page.evaluate("""() => { const v = document.querySelector('#view'); v.insertAdjacentHTML('beforeend', '<button class="btn" id="probe-m">x</button><span class="bar"><i id="probe-i"></i></span>');
          const g = id => getComputedStyle(document.querySelector(id)); const o = [g('#probe-m').transitionProperty + ' ' + g('#probe-m').transitionDuration, g('#probe-i').transitionProperty + ' ' + g('#probe-i').transitionDuration];
          document.querySelector('#probe-m').remove(); document.querySelector('.bar:has(#probe-i)').remove(); return o; }""")
        check('los botones animan transform y las barras animan width, con duración', 'transform' in tp[0] and 'width' in tp[1] and not tp[0].endswith(' 0s') and not tp[1].endswith(' 0s'), tp)

        ctx2 = b.new_context(viewport={'width':390,'height':800}, reduced_motion='reduce')
        q = ctx2.new_page(); q.goto('http://localhost:8765/'); q.wait_for_selector('#view .home')
        r = q.evaluate("""() => { const v = document.querySelector('#view'); v.insertAdjacentHTML('beforeend', '<button class="btn" id="probe-m">x</button><span class="dot on pop" id="probe-d"></span><span class="bar"><i id="probe-i"></i></span>');
          const g = id => getComputedStyle(document.querySelector(id));
          return [g('#probe-m').transitionDuration, g('#probe-i').transitionDuration, g('#probe-d').animationName]; }""")
        check('con «reducir movimiento» no hay transiciones ni animaciones', r[0] == '0s' and r[1] == '0s' and r[2] == 'none', r)

        page.screenshot(path=OUT+'estilo.png')
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
