"""Configuración › Orden: reordenar el menú lateral y las secciones y tarjetas de Inicio."""
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
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
DEFAULT = ['Inicio','Finanzas','Hábitos','Listas','Compras','Pomodoro','Gimnasio','Notas','Configuración']
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800})
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        dlg = page.locator('#dlg')
        ev = lambda js: page.evaluate(f"import('/js/state.js').then(async st => {{ {js} }})")
        def go(tab): page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(150)
        def menu(): return page.evaluate("[...document.querySelectorAll('#tabs button')].map(b => b.textContent.trim())")
        def reload(): page.reload(); page.wait_for_selector('#view .home')
        up = lambda name: dlg.locator(f'[aria-label="Subir {name}"]').click()
        down = lambda name: dlg.locator(f'[aria-label="Bajar {name}"]').click()
        rows = lambda n=0: dlg.locator('.ord').nth(n).locator('li > span').all_inner_texts()
        save = lambda: (dlg.locator('button.primary').click(), page.wait_for_timeout(250))

        go('data')
        check('Configuración tiene la tarjeta Orden con sus dos botones', page.locator('[data-act=order-tabs]').count()==1 and page.locator('[data-act=order-home]').count()==1)
        check('el menú empieza en el orden original', menu()==DEFAULT, menu())

        # ================= menú lateral =================
        page.click('[data-act=order-tabs]'); page.wait_for_timeout(250)
        check('el diálogo lista las 9 pestañas en el orden actual', rows()==DEFAULT, rows())
        check('la primera no puede subir y la última no puede bajar', dlg.locator('[aria-label="Subir Inicio"]').is_disabled() and dlg.locator('[aria-label="Bajar Configuración"]').is_disabled())
        up('Pomodoro'); up('Pomodoro')
        check('subir mueve la pestaña una posición cada vez', rows()[:6]==['Inicio','Finanzas','Hábitos','Pomodoro','Listas','Compras'], rows())
        check('el foco sigue en el botón para poder repetir', dlg.evaluate("d => d.querySelector(':focus')?.getAttribute('aria-label')")=='Subir Pomodoro')
        down('Inicio')
        check('bajar también funciona', rows()[:2]==['Finanzas','Inicio'], rows())
        page.screenshot(path=OUT+'orden-menu.png')
        dlg.locator('#cancel').click(); page.wait_for_timeout(200)
        check('Cancelar no cambia el menú ni guarda el orden', menu()==DEFAULT and page.evaluate("import('/js/state.js').then(st => st.S.settings.tabOrder === undefined)"))

        page.click('[data-act=order-tabs]'); page.wait_for_timeout(250)
        up('Pomodoro'); up('Pomodoro'); save()
        EXP = ['Inicio','Finanzas','Hábitos','Pomodoro','Listas','Compras','Gimnasio','Notas','Configuración']
        check('Guardar cambia el menú lateral', menu()==EXP, menu())
        check('el orden queda en los ajustes (con las claves internas)', page.evaluate("import('/js/state.js').then(st => st.S.settings.tabOrder)")==['home','money','habits','pomodoro','lists','purchases','gym','notes','data'])
        reload()
        check('el orden se conserva al recargar', (page.click('[data-act=menu-open]'), menu())[1]==EXP, menu())
        page.click('#tabs [data-tab=pomodoro]'); page.wait_for_timeout(200)
        check('las pestañas siguen funcionando y la app abre en Inicio', page.locator('#topbar h1').inner_text()=='Pomodoro')
        reload()
        check('al abrir siempre se ve Inicio, esté donde esté en el menú', page.locator('#topbar h1').inner_text()=='Inicio')

        go('data'); page.click('[data-act=order-tabs]'); page.wait_for_timeout(250)
        check('al reabrir el diálogo muestra el orden guardado', rows()==EXP, rows())
        dlg.locator('#ord-reset').click()
        check('Restablecer vuelve al orden original dentro del diálogo', rows()==DEFAULT, rows())
        save()
        check('guardar el orden original borra el ajuste', page.evaluate("import('/js/state.js').then(st => st.S.settings.tabOrder === undefined)") and menu()==DEFAULT, menu())

        # ================= Inicio =================
        page.click('[data-act=order-home]'); page.wait_for_timeout(250)
        check('Inicio tiene dos listas: secciones y tarjetas', dlg.locator('.ord').count()==2 and rows(0)==['Frase','Nota rápida','Tarjetas','Bandeja','Tareas de hoy'] and rows(1)==['Hábitos','Pagos','Ejercicio','Gasto, Ingreso y Mover'], (rows(0), rows(1)))
        for _ in range(4): up('Tareas de hoy')
        for _ in range(2): up('Ejercicio')
        check('las dos listas se ordenan por separado', rows(0)[0]=='Tareas de hoy' and rows(1)[0]=='Ejercicio', (rows(0), rows(1)))
        save()
        go('home')
        order = page.evaluate("[...document.querySelector('.home').children].map(e => e.tagName === 'HEADER' ? 'header' : e.className.split(' ')[0] || e.tagName)")
        check('el saludo sigue arriba y Tareas de hoy va primero', order[0]=='header' and order[1]=='today', order)
        check('la frase pasó después de las tareas', order.index('home-quote') > order.index('today'), order)
        check('la tarjeta de Ejercicio es la primera', page.locator('.tiles').locator('> *').first.get_attribute('data-act')=='home-gym')
        check('las demás tarjetas siguen en su orden', page.evaluate("[...document.querySelectorAll('.tiles > *')].map(e => e.dataset.act || e.className.split(' ')[0])")==['home-gym','tab','home-bills','tile-acts'])
        page.screenshot(path=OUT+'orden-inicio.png')
        reload()
        check('el orden de Inicio se conserva al recargar', page.evaluate("document.querySelector('.home').children[1].className.split(' ')[0]")=='today')

        # ================= valores raros y novedades =================
        ev("st.S.settings.tabOrder = ['gym', 'gym', 'zzz', 5]; st.S.settings.homeOrder = 'x'; st.S.settings.tileOrder = null; await st.saveSettings();")
        reload()
        page.click('[data-act=menu-open]')
        check('un orden dañado se corrige: lo válido primero y el resto como siempre', menu()==['Gimnasio','Inicio','Finanzas','Hábitos','Listas','Compras','Pomodoro','Notas','Configuración'], menu())
        check('Inicio con orden dañado se ve normal (frase antes de las tarjetas)', page.evaluate("(() => { const k = [...document.querySelector('.home').children].map(e => e.className.split(' ')[0]); return k.indexOf('home-quote') < k.indexOf('tiles'); })()"))
        page.keyboard.press('Escape')
        ev("st.S.settings.tabOrder = ['notes']; delete st.S.settings.homeOrder; delete st.S.settings.tileOrder; await st.saveSettings();")
        reload(); page.click('[data-act=menu-open]')
        check('una pestaña que falta en el orden guardado se agrega en su lugar original', menu()==['Notas','Inicio','Finanzas','Hábitos','Listas','Compras','Pomodoro','Gimnasio','Configuración'], menu())
        page.keyboard.press('Escape')

        # ================= respaldo y sincronización =================
        ev("st.S.settings.tabOrder = ['notes', 'home']; st.S.settings.homeOrder = ['tasks']; await st.saveSettings();")
        exp = page.evaluate("import('/js/data.js').then(d => d.buildExport(false))")
        check('el respaldo guarda el orden', exp['settings']['tabOrder']==['notes','home'] and exp['settings']['homeOrder']==['tasks'])
        back = page.evaluate("d => import('/js/data.js').then(m => m.validateImport(d).settings)", exp)
        check('al importar se restaura', back['tabOrder']==['notes','home'] and back['homeOrder']==['tasks'])
        sync = (Path(ROOT)/'js'/'sync.js').read_text()
        check('el orden es un ajuste del dispositivo: no viaja por la sincronización', all(k in sync.split('DEVICE_KEYS = ')[1].split(']')[0] for k in ("'tabOrder'","'homeOrder'","'tileOrder'")))

        # ================= tema claro + JetBrains Mono, sin desborde =================
        ev("delete st.S.settings.tabOrder; delete st.S.settings.homeOrder; st.S.settings.theme = 'light'; st.S.settings.font = 'jetbrains'; await st.saveSettings();")
        reload(); go('data'); page.click('[data-act=order-home]'); page.wait_for_timeout(300)
        page.screenshot(path=OUT+'orden-claro.png')
        check('el diálogo no se desborda con tema claro y JetBrains Mono', dlg.evaluate('d => d.scrollWidth <= d.clientWidth'))
        dlg.locator('#cancel').click()
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
