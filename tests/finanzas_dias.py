"""Finanzas: movimientos agrupados por día, filas de dos líneas sin cortar, rojo solo en problemas y contenido que sale libre del botón flotante."""
import os, sys, tempfile, json, datetime
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

# ---- datos: 35 gastos (los dos primeros el mismo día, hoy), 1 ingreso hoy, una categoría en negativo y un nombre largo
D = lambda n: (datetime.date.today() - datetime.timedelta(days=n)).isoformat()
LARGA = 'Categoría con un nombre bastante largo para comprobar que no se corta'
moves = []
for i in range(35):
    moves.append({'id':f'm{i}','t':i,'type':'expense','date':D(max(0, i-1)),'note':'','total':10+i,'title':f'Gasto {i}','parts':[{'acc':'a1','cat':'c3' if i == 5 else 'c1','amount':10+i}],'files':[]})
moves.append({'id':'inc','t':99,'type':'income','date':D(0),'note':'','total':500,'title':'Quincena','parts':[{'acc':'a1','cat':'c1','amount':500}],'files':[]})
data = {'app':'tracker','version':3,'exportedAt':'2026-01-01T00:00:00Z','settings':{},'habits':[],'bills':[],'purchases':[],'templates':[],'lists':[],'noteGroups':[],'notes':[],'inbox':[],'routines':[],'workouts':[],'exercises':[],
  'accounts':[{'id':'a1','name':'Banco Industrial','order':0,'type':'normal','limit':0,'cats':[{'id':'c1','name':'Comida','balance':2000},{'id':'c2','name':'Ahorro','balance':-50},{'id':'c3','name':LARGA,'balance':100}]}],
  'moves':moves}
FILE = os.path.join(tempfile.mkdtemp(), 'respaldo.json'); open(FILE, 'w').write(json.dumps(data))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800})
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        ir(page, 'data'); page.set_input_files('#file', FILE); page.wait_for_timeout(900)
        ir(page, 'money'); page.wait_for_selector('.moves .move')
        heads = lambda: page.evaluate("[...document.querySelectorAll('.moves .day-h')].map(e => e.textContent.trim())")

        # ---- agrupación por día
        h = heads()
        check('la lista arranca con «Hoy» y «Ayer»', h[:2] == ['Hoy', 'Ayer'], h[:3])
        check('un encabezado por día (28 días en las primeras 30 filas) y «Hoy» una sola vez', len(h) == 28 and h.count('Hoy') == 1, (len(h), h[:4]))
        check('los 3 movimientos de hoy quedan bajo un único encabezado', page.evaluate("""() => { const li = [...document.querySelectorAll('.moves > li')]; const i = li.findIndex(e => e.classList.contains('day-h')); let n = 0;
          for (let k = i + 1; k < li.length && !li[k].classList.contains('day-h'); k++) n++; return n; }""") == 3)
        check('los encabezados de otros días llevan la fecha (p. ej. «21 oct»)', all(any(c.isdigit() for c in x) for x in h[2:]), h[2:5])
        check('la fila ya no repite la fecha ni dice «Sin tipo»', page.evaluate("[...document.querySelectorAll('.moves .move small')].every(s => !/Sin tipo/.test(s.textContent))"))
        check('la segunda línea trae cuenta y categoría', 'Banco Industrial' in page.locator('.moves .move small').first.inner_text() and 'Comida' in page.locator('.moves .move small').first.inner_text(), page.locator('.moves .move small').first.inner_text())

        # ---- filas completas, sin cortar
        check('ninguna fila corta su texto con puntos suspensivos', page.evaluate("[...document.querySelectorAll('.moves .move span, .moves .move small')].every(e => getComputedStyle(e).textOverflow !== 'ellipsis' && e.scrollWidth <= e.clientWidth + 1)"))
        check('un nombre de categoría largo se muestra entero (se parte en líneas)', LARGA in page.locator('.moves .move small', has_text='nombre bastante largo').first.inner_text())

        # ---- color: el rojo solo para problemas
        col = page.evaluate("""() => { const tx = getComputedStyle(document.body).color, g = getComputedStyle(document.documentElement).getPropertyValue('--green').trim(), r = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
          const probe = c => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
          return { out: getComputedStyle(document.querySelector('.amt.out')).color, inn: getComputedStyle(document.querySelector('.amt.in')).color, neg: getComputedStyle(document.querySelector('.cat-row b.neg')).color, tx, g: probe(g), r: probe(r) }; }""")
        check('un gasto va en el color del texto, no en rojo', col['out'] == col['tx'], col)
        check('un ingreso va en verde', col['inn'] == col['g'], col)
        check('el saldo negativo de una categoría sigue en rojo', col['neg'] == col['r'], col)

        # ---- paginación con encabezados
        check('se pintan 30 filas y hay «Ver más»', page.locator('.moves .move').count() == 30 and page.locator('[data-act=more-moves]').count() == 1, page.locator('.moves .move').count())
        page.click('[data-act=more-moves]'); page.wait_for_timeout(100)
        check('«Ver más» agrega el resto (36) sin repetir encabezados', page.locator('.moves .move').count() == 36 and len(set(heads())) == len(heads()), (page.locator('.moves .move').count(), len(heads())))

        # ---- el contenido sale libre de la barra y del botón flotante
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); page.wait_for_timeout(100)
        geo = page.evaluate("""() => { const last = document.querySelector('#view').lastElementChild.getBoundingClientRect(), fab = document.querySelector('#fab'), nav = document.querySelector('#nav').getBoundingClientRect();
          return { lastBottom: last.bottom, fabTop: fab.hidden ? null : fab.getBoundingClientRect().top, navTop: nav.top }; }""")
        check('al final del scroll, lo último queda por encima del botón flotante y de la barra', geo['fabTop'] is not None and geo['lastBottom'] <= geo['fabTop'] and geo['lastBottom'] <= geo['navTop'], geo)

        # ---- movimientos de una cuenta (diálogo): mismos encabezados
        page.evaluate("window.scrollTo(0, 0)")
        page.click('[data-act=acc-moves]'); page.wait_for_selector('#dlg[open] .acc-moves .move')
        dh = page.evaluate("[...document.querySelectorAll('#dlg .day-h')].map(e => e.textContent.trim())")
        check('el diálogo de la cuenta también agrupa por día', dh[:2] == ['Hoy', 'Ayer'], dh[:3])
        page.screenshot(path=OUT+'finanzas_dias.png')
        page.keyboard.press('Escape')
        check('sin desborde horizontal a 390 px', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
