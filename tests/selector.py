"""Selector propio: los <select> de los diálogos abren una hoja con el diseño de la app (no la lista nativa de Android)."""
import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for theme in ('dark', 'light'):
            ctx = b.new_context(viewport={'width':390,'height':800})
            page = ctx.new_page(); errs=[]
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
            page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
            dlg = page.locator('#dlg'); pk = page.locator('#picker')
            ev = lambda js: page.evaluate(f"import('/js/state.js').then(async st => {{ {js} }})")
            ev("""await st.saveAccount({ id: 'a1', name: 'Banco', order: 1, type: 'normal', limit: 0, cats: [{ id: 'c1', name: 'Comida', balance: 50 }, { id: 'c2', name: 'Transporte', balance: 100 }] });
                  await st.saveAccount({ id: 'a2', name: 'Efectivo', order: 2, type: 'normal', limit: 0, cats: [{ id: 'c3', name: 'Bolsillo', balance: 20 }] });""")
            page.reload(); page.wait_for_selector('#view .home')
            ev(f"await st.saveSettings.call(null, (st.S.settings.theme = '{theme}', undefined)); (await import('/js/ui.js')).applyTheme('{theme}')")
            check(f'[{theme}] el tema efectivo es {theme}', page.evaluate('document.documentElement.dataset.theme')==theme)
            T = f'[{theme}] '

            page.click('[data-act=new-exp] >> nth=0')
            btn = dlg.locator('.part .sel-btn')
            check(T+'el select nativo queda invisible y hay un botón propio', btn.count()==1 and dlg.locator('.part select').evaluate('s => getComputedStyle(s).opacity')=='0')
            check(T+'el botón muestra el marcador de posición', 'Elegir' in btn.inner_text() and 'ph' in btn.get_attribute('class').split(), btn.inner_text())
            btn.click(); page.wait_for_timeout(300)
            check(T+'tocar el botón abre la hoja con las cuentas (no todas las categorías)', pk.evaluate('d => d.open') and pk.locator('.pk-grp').count()==2 and pk.locator('.pk-o:not(.pk-grp)').count()==0)
            check(T+'cada cuenta muestra su nombre y lo que suma', pk.locator('.pk-grp').first.locator('.pk-t').inner_text()=='Banco' and 'Q150.00' in pk.locator('.pk-grp').first.locator('small').inner_text(), pk.locator('.pk-grp').first.inner_text())
            check(T+'el primer paso pide la cuenta', pk.locator('h2').inner_text()=='Elegir cuenta', pk.locator('h2').inner_text())
            page.screenshot(path=OUT+f'selector-cuentas-{theme}.png')
            pk.locator('.pk-grp', has_text='Banco').click(); page.wait_for_timeout(150)
            check(T+'al elegir la cuenta se ven solo sus categorías, con su monto', pk.locator('.pk-o').count()==2 and pk.locator('h2').inner_text()=='Banco' and pk.locator('.pk-o').first.locator('.pk-t').inner_text()=='Comida' and 'Q' in pk.locator('.pk-o').first.locator('small').inner_text())
            check(T+'hay un botón para volver a las cuentas', pk.locator('[data-back]').count()==1)
            pk.locator('[data-back]').click(); page.wait_for_timeout(100)
            check(T+'volver muestra otra vez las cuentas', pk.locator('.pk-grp').count()==2)
            pk.locator('.pk-grp', has_text='Banco').click(); page.wait_for_timeout(100)
            check(T+'sin más de 12 opciones no hay buscador', pk.locator('.pk-q').count()==0)
            page.screenshot(path=OUT+f'selector-{theme}.png')
            pk.locator('.pk-o', has_text='Transporte').click(); page.wait_for_timeout(200)
            check(T+'elegir una opción cierra la hoja, deja el formulario abierto y fija el valor',
                  not pk.evaluate('d => d.open') and dlg.evaluate('d => d.open') and dlg.locator('.part select').input_value()=='a1|c2')
            check(T+'el botón se repinta con cuenta y categoría', 'Banco · Transporte' in btn.inner_text() and 'ph' not in btn.get_attribute('class').split(), btn.inner_text())
            btn.click(); page.wait_for_timeout(250)
            check(T+'la cuenta actual aparece marcada', pk.locator('.pk-grp.on').count()==1 and 'Banco' in pk.locator('.pk-grp.on').inner_text())
            pk.locator('.pk-grp', has_text='Banco').click(); page.wait_for_timeout(150)
            check(T+'la categoría actual aparece marcada', pk.locator('.pk-o.on').count()==1 and 'Transporte' in pk.locator('.pk-o.on').inner_text())
            page.keyboard.press('Escape'); page.wait_for_timeout(200)
            check(T+'Escape cierra solo la hoja del selector', not pk.evaluate('d => d.open') and dlg.evaluate('d => d.open'))
            # el valor cambiado por la hoja dispara `change` (el formulario recalcula con él)
            ev_n = dlg.locator('.part select').evaluate("s => new Promise(r => { let n = 0; s.addEventListener('change', () => n++); window.__n = () => n; r(0); })")
            btn.click(); page.wait_for_timeout(250); pk.locator('.pk-grp', has_text='Banco').click(); page.wait_for_timeout(100); pk.locator('.pk-o', has_text='Comida').click(); page.wait_for_timeout(150)
            check(T+'elegir dispara un solo evento change', page.evaluate('window.__n()')==1)
            check(T+'select_option sobre el select oculto sigue funcionando y repinta el botón',
                  (dlg.locator('.part select').select_option('a2|c3'), page.wait_for_timeout(100), 'Efectivo · Bolsillo' in btn.inner_text())[2])

            # tipo de gasto: «Nuevo tipo» sigue creando el tipo desde el selector
            kind = dlg.locator('label:has-text("Tipo de gasto") .sel-btn')
            check(T+'el título de la hoja es el de la etiqueta del campo', (kind.click(), page.wait_for_timeout(250), pk.locator('h2').inner_text().startswith('Tipo de gasto'))[2], pk.locator('h2').inner_text())
            page.once('dialog', lambda d: d.accept('Tipo prueba'))
            pk.locator('.pk-o', has_text='Nuevo tipo').click(); page.wait_for_timeout(300)
            check(T+'«Nuevo tipo» crea el tipo y lo deja elegido en el botón', 'Tipo prueba' in kind.inner_text(), kind.inner_text())

            # validación: el select requerido sin elegir bloquea el envío
            dlg.locator('[name=title]').fill('Algo'); dlg.locator('[name=amount]').fill('5')
            dlg.locator('.part select').evaluate("s => { s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }")
            dlg.locator('button.primary').click(); page.wait_for_timeout(200)
            check(T+'sin categoría el formulario no se envía', dlg.evaluate('d => d.open'))

            # buscador con muchas opciones (catálogo de ejercicios)
            page.keyboard.press('Escape'); page.wait_for_timeout(200)
            check(T+'sin errores de consola', errs==[], errs)
            ctx.close()
        # buscador: un select con más de 12 opciones
        ctx = b.new_context(viewport={'width':390,'height':800}); page = ctx.new_page()
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        page.evaluate("""import('/js/ui.js').then(ui => ui.modal('Prueba', '<label>Número <select name="n">' + Array.from({length: 20}, (_, i) => `<optgroup label="Grupo ${i < 10 ? 'A' : 'B'}"><option value="${i}">Opción ${i}</option></optgroup>`).join('') + '</select></label>', { onSubmit() {} }))""")
        page.wait_for_timeout(200)
        page.locator('#dlg .sel-btn').click(); page.wait_for_timeout(250)
        pk = page.locator('#picker')
        check('con más de 12 opciones aparece el buscador', pk.locator('.pk-q').count()==1)
        pk.locator('.pk-q').fill('opcion 15'); page.wait_for_timeout(100)
        vis = pk.locator('.pk-o:not([hidden])')
        check('buscar filtra sin distinguir tildes ni mayúsculas', vis.count()==1 and 'Opción 15' in vis.inner_text(), vis.count())
        check('los encabezados de grupo sin resultados se ocultan', pk.locator('.pk-g:not([hidden])').count()==1)
        check('sin desborde horizontal en la hoja', pk.evaluate('d => d.scrollWidth <= d.clientWidth'))
        # con una sola cuenta no hace falta el paso de elegir cuenta: salen sus categorías directo
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        page.evaluate("""import('/js/ui.js').then(ui => ui.modal('Prueba 2', '<label>Cuenta única <select name="n" data-nest><optgroup label="Banco"><option value="a|1">Uno</option><option value="a|2">Dos</option></optgroup></select></label>', { onSubmit() {} }))""")
        page.wait_for_timeout(200)
        page.locator('#dlg .sel-btn').click(); page.wait_for_timeout(250)
        check('con una sola cuenta se muestran directo sus categorías, sin botón de volver', pk.locator('.pk-grp').count()==0 and pk.locator('.pk-o').count()==2 and pk.locator('[data-back]').count()==0)
        ctx.close()
        b.close()
finally:
    srv.terminate()
print('errors: []')
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
