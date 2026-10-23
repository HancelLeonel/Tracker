"""Deslizar entre las pestañas de la barra inferior (carrusel): gesto horizontal con animación, sin dar la vuelta y sin estorbar a otros gestos."""
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
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, has_touch=True, is_mobile=True)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        cdp = ctx.new_cdp_session(page)
        def swipe(x0, y0, x1, y1, steps=8):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
            for i in range(1, steps + 1):
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * i / steps, 'y': y0 + (y1 - y0) * i / steps}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
            page.wait_for_timeout(250)
        left = lambda y=400: swipe(320, y, 120, y)    # dedo hacia la izquierda: siguiente pestaña
        right = lambda y=400: swipe(70, y, 270, y)    # dedo hacia la derecha: pestaña anterior
        title = lambda: page.locator('#topbar h1').inner_text().strip()

        # ---- avanzar y retroceder por la barra (Inicio · Finanzas · Hábitos · Listas)
        left()
        check('deslizar a la izquierda va a la pestaña siguiente (Finanzas)', title() == 'Finanzas' and page.locator('#nav [data-tab=money].on').count() == 1, title())
        check('la pantalla nueva entra con un deslizamiento corto', page.evaluate("document.querySelector('#view').classList.contains('slide-l')"))
        left(); left()
        check('sigue por Hábitos y Listas', title() == 'Listas', title())
        left()
        check('en la última de la barra no pasa nada (no da la vuelta)', title() == 'Listas', title())
        right()
        check('deslizar a la derecha vuelve a la anterior', title() == 'Hábitos', title())
        right(); right(); right()
        check('en la primera (Inicio) tampoco da la vuelta', title() == 'Inicio', title())
        check('con la pestaña nueva la barra superior y el color de sección se actualizan', page.evaluate("document.body.dataset.sec") == 'home')

        # ---- gestos que no deben cambiar de pestaña
        swipe(320, 300, 240, 500)
        check('un gesto casi vertical (desplazarse) no cambia de pestaña', title() == 'Inicio', title())
        swipe(260, 400, 220, 400)
        check('un gesto corto (40 px) no cambia de pestaña', title() == 'Inicio', title())
        swipe(8, 400, 208, 400)
        check('un toque que empieza en el borde de la pantalla (gesto del sistema) se ignora', title() == 'Inicio', title())
        swipe(382, 400, 182, 400)
        check('lo mismo en el borde derecho', title() == 'Inicio', title())
        page.click('#nav [data-act=more]'); page.wait_for_selector('#dlg[open]')
        swipe(320, 600, 120, 600)
        check('con una hoja abierta no se cambia de pestaña', title() == 'Inicio' and page.evaluate("document.querySelector('#dlg').open"), title())
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        ir(page, 'purchases'); page.wait_for_timeout(100)
        left(); right()
        check('desde una sección de «Más» (Compras) no se desliza', title() == 'Compras', title())
        ir(page, 'home')

        # ---- el carrusel de hábitos conserva su gesto y solo cede en los extremos
        page.evaluate("""import('/js/state.js').then(st => { st.S.habits = ['morning', 'day', 'night'].flatMap((slot, k) => [0, 1].map(i => ({ id: slot + i, name: slot + i, color: 'blue', icon: 'drop', slot, order: k * 2 + i, dates: {} }))); st.hooks.render(); })""")
        ir(page, 'habits'); page.wait_for_selector('#hcar .slot-card')
        page.evaluate("document.querySelector('#hcar').scrollLeft = 0"); page.wait_for_timeout(200)
        cy = page.locator('#hcar .slot-card').first.bounding_box()
        y = int(cy['y'] + 40)
        left(y)
        check('sobre el carrusel de hábitos, con más tarjetas a la izquierda, el gesto lo usa el carrusel (sigue en Hábitos)', title() == 'Hábitos', title())
        page.wait_for_timeout(700)  # deja que el carrusel termine de asentarse tras el gesto anterior
        page.evaluate("const c = document.querySelector('#hcar'); c.scrollLeft = c.scrollWidth"); page.wait_for_timeout(400)
        at_end = page.evaluate("(() => { const c = document.querySelector('#hcar'); return c.scrollLeft + c.clientWidth >= c.scrollWidth - 2; })()")
        check('(preparación) el carrusel está en su última tarjeta', at_end)
        left(y)
        check('en la última tarjeta el gesto pasa a la pestaña siguiente (Listas)', title() == 'Listas', title())

        # ---- con un orden propio la barra manda
        page.evaluate("import('/js/state.js').then(async st => { st.S.settings.tabOrder = ['data','notes','home','money','habits','lists']; await st.saveSettings(); st.S.tab = 'home'; st.hooks.render(); })")
        page.wait_for_timeout(120)
        left()
        check('con orden propio el siguiente es el que muestra la barra (Configuración)', title() == 'Configuración', title())
        left(); left()
        check('y sigue Notas y Finanzas', title() == 'Finanzas', title())
        page.screenshot(path=OUT+'deslizar.png')
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
