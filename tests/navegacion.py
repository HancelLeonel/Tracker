"""Barra inferior: cambiar de sección con un toque, hoja «Más», orden personalizado y sin cajón lateral."""
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
        ctx = b.new_context(viewport={'width':390,'height':800})
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        bar = lambda: page.evaluate("[...document.querySelectorAll('#nav button')].map(b => b.textContent.trim())")
        title = lambda: page.locator('#topbar h1').inner_text().strip()

        check('la barra tiene Inicio, Finanzas, Hábitos, Listas y Más', bar() == ['Inicio','Finanzas','Hábitos','Listas','Más'], bar())
        check('ya no existe el cajón lateral ni su botón', page.locator('#drawer').count() == 0 and page.locator('[data-act=menu-open]').count() == 0)
        check('Inicio está marcado al abrir', page.locator('#nav [data-tab=home].on').count() == 1)

        page.click('#nav [data-tab=habits]'); page.wait_for_timeout(60)
        check('un toque en Hábitos cambia de sección', title() == 'Hábitos' and page.locator('#nav [data-tab=habits].on').count() == 1 and page.locator('#nav .on').count() == 1)

        page.click('#nav [data-act=more]'); page.wait_for_selector('#dlg[open]')
        more = page.evaluate("[...document.querySelectorAll('#dlg [data-tab]')].map(b => b.textContent.trim())")
        check('«Más» lista el resto de destinos', more == ['Compras','Pomodoro','Gimnasio','Notas','Configuración'], more)
        page.click('#dlg [data-tab=notes]'); page.wait_for_timeout(120)
        check('tocar un destino de «Más» cierra la hoja y navega', not page.evaluate("document.querySelector('#dlg').open") and title() == 'Notas')
        check('«Más» queda marcado cuando la sección está dentro de él', page.locator('#nav [data-act=more].on').count() == 1 and page.locator('#nav [data-tab].on').count() == 0)

        # tocar la sección activa dentro de una vista de detalle vuelve a su vista general
        page.evaluate("import('/js/state.js').then(st => { st.S.lists.push({ id: 'L1', name: 'Prueba', tplId: null, color: 'blue', created: '2026-01-01', t: 1, items: [] }); st.S.tab = 'lists'; st.S.listId = 'L1'; st.hooks.render(); })")
        page.wait_for_timeout(100)
        check('dentro de una lista abierta la barra sigue visible', title() == 'Prueba' and page.locator('#nav').is_visible())
        page.click('#nav [data-tab=lists]'); page.wait_for_timeout(100)
        check('tocar la sección activa vuelve a su vista general', title() == 'Listas')
        page.evaluate("import('/js/state.js').then(st => { st.S.lists = []; })")

        # con la hoja abierta, el diálogo modal tapa la barra: un clic real en su lugar cae en el diálogo
        page.click('#nav [data-act=more]'); page.wait_for_selector('#dlg[open]')
        r = page.locator('#nav').bounding_box()
        check('con la hoja abierta la barra queda tapada', page.evaluate("([x, y]) => !document.elementFromPoint(x, y).closest('#nav')", [r['x'] + 20, r['y'] + 20]))
        page.keyboard.press('Escape'); page.wait_for_timeout(100)

        # orden personalizado: Inicio siempre primero y una sola vez, 3 destinos sin repetir
        page.evaluate("import('/js/state.js').then(async st => { st.S.settings.tabOrder = ['data','notes','home','money','habits','lists','purchases','pomodoro','gym']; await st.saveSettings(); st.hooks.render(); })")
        page.wait_for_timeout(150)
        check('con un orden propio la barra es Inicio + los 3 primeros sin repetir', bar() == ['Inicio','Configuración','Notas','Finanzas','Más'], bar())
        ir(page, 'habits')
        check('ir() llega a un destino que está en «Más»', title() == 'Hábitos')

        # 390 px con la fuente ancha: sin desborde y con áreas táctiles de al menos 44 px
        page.evaluate("document.documentElement.dataset.font = 'jetbrains'"); page.wait_for_timeout(100)
        check('con JetBrains Mono no hay desborde horizontal', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        check('cada botón de la barra mide al menos 44 px de alto', page.evaluate("[...document.querySelectorAll('#nav button')].every(b => b.getBoundingClientRect().height >= 44)"))
        page.screenshot(path=OUT+'nav.png')

        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
