import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
os.makedirs(OUT, exist_ok=True)
import subprocess, time, re, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿＋‹›⇄▲▼⬜✓✎✕]')
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card'); page.wait_for_timeout(350)
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        # --- nombre
        check('título Tracker', page.title()=='Tracker')
        man = json.loads(page.evaluate("fetch('manifest.webmanifest').then(r=>r.text())"))
        check('manifest Tracker', man['name']=='Tracker' and man['short_name']=='Tracker')
        # --- menú lateral
        check('sin barra inferior', page.locator('#tabs').evaluate("e=>getComputedStyle(e.closest('aside')).visibility")=='hidden')
        hb = page.locator('[data-act=menu-open]').first.bounding_box(); h1 = page.locator('#topbar h1').bounding_box()
        check('hamburguesa a la izquierda del título', hb['x'] < h1['x'] and abs((hb['y']+hb['height']/2)-(h1['y']+h1['height']/2))<20, (hb, h1))
        page.click('[data-act=menu-open]'); page.wait_for_timeout(300)
        check('drawer visible', page.locator('#drawer').is_visible() and 'Tracker' in page.locator('#drawer').inner_text())
        page.screenshot(path=OUT + 'x_drawer.png')
        page.click('#scrim', position={'x':370,'y':400}); page.wait_for_timeout(300)
        check('cierra con el fondo', not page.locator('#drawer').is_visible())
        page.click('[data-act=menu-open]'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
        check('cierra con Escape', not page.locator('#drawer').is_visible())
        page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=habits]'); page.wait_for_timeout(300)
        check('navega y cierra', page.locator('#topbar h1').inner_text()=='Hábitos' and not page.locator('#drawer').is_visible())
        page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_timeout(300)

        # --- datos
        def acc(n): page.click('[data-act=new-acc] >> nth=0'); dlg.locator('[name=name]').fill(n); save()
        def cat(n, v, i): page.click(f'[data-act=new-cat] >> nth={i}'); dlg.locator('[name=name]').fill(n); dlg.locator('[name=balance]').fill(str(v)); save()
        acc('Banco'); cat('A', 100, 0); cat('B', 0, 0); cat('C', 50, 0)
        acc('Efectivo'); cat('X', 20, 1)

        # --- plegar categorías
        check('categorías visibles por defecto', page.locator('.cat-main').count()==4)
        page.click('[data-act=toggle-acc][data-acc] >> nth=0'); page.wait_for_timeout(100)
        check('al plegar se ocultan las de Banco', page.locator('.cat-main').count()==1 and 'Banco' in txt())
        check('aria-expanded false', page.locator('[data-act=toggle-acc] >> nth=0').get_attribute('aria-expanded')=='false')
        page.screenshot(path=OUT + 'x_folded.png')
        page.reload(); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card')
        check('el plegado se recuerda', page.locator('.cat-main').count()==1)
        page.click('[data-act=toggle-acc] >> nth=0'); page.wait_for_timeout(100)
        check('al desplegar vuelven', page.locator('.cat-main').count()==4)

        # --- selector de gasto: uno solo, vacío, solo categorías con dinero
        page.click('#fab')
        check('un selector', dlg.locator('.part select').count()==1)
        check('sin selección previa', dlg.locator('.part select').first.input_value()=='')
        opts = dlg.locator('.part select option:not([disabled])').all_inner_texts()
        check('solo categorías con dinero (sin B en 0)', any('A ·' in o for o in opts) and any('C ·' in o for o in opts) and not any(o.startswith('B ·') for o in opts), opts)
        dlg.locator('[name=title]').fill('Cena'); dlg.locator('[name=amount]').fill('120')
        check('antes de elegir pide la categoría', 'Elige de qué categoría' in dlg.locator('#remain').inner_text())
        dlg.locator('.part select').first.select_option(label='A · Q100.00')
        check('A solo cubre 100: sin asumir otra', dlg.locator('.part select').count()==1 and dlg.locator('.part input').first.input_value()=='100')
        check('ofrece agregar otra', dlg.locator('#addpart').is_visible() and 'Falta asignar Q20.00' in dlg.locator('#remain').inner_text())
        dlg.locator('#addpart').click()
        opts2 = dlg.locator('.part select').nth(1).locator('option:not([disabled])').all_inner_texts()
        check('segundo selector: sin A ni B, con C', any('C ·' in o for o in opts2) and not any(o.startswith(('A ·','B ·')) for o in opts2), opts2)
        page.screenshot(path=OUT + 'x_expense.png')
        dlg.locator('.part select').nth(1).select_option(label='C · Q50.00')
        check('el segundo toma el resto 20', dlg.locator('.part input').nth(1).input_value()=='20')
        check('ya no ofrece más', not dlg.locator('#addpart').is_visible())
        save()
        t = txt(); check('gasto guardado repartido', 'Cena' in t and '−Q120.00' in t)

        # --- movimientos de la cuenta
        page.click('[data-act=acc-moves] >> nth=0'); page.wait_for_timeout(200)
        check('abre movimientos de Banco', dlg.locator('h2').inner_text()=='Banco' and 'Cena' in dlg.inner_text() and '−Q120.00' in dlg.inner_text(), dlg.inner_text())
        check('solo de esa cuenta (no hay movimientos de Efectivo)', 'Efectivo' not in dlg.locator('ul').inner_text())
        page.screenshot(path=OUT + 'x_accmoves.png')
        dlg.locator('[data-act=edit-move]').first.click(); page.wait_for_timeout(200)
        check('desde la lista se abre editar gasto', dlg.locator('h2').inner_text()=='Editar gasto')
        dlg.locator('#cancel').click()
        page.click('[data-act=acc-moves] >> nth=1'); page.wait_for_timeout(100)
        check('cuenta sin movimientos', 'aún no tiene movimientos' in dlg.inner_text()); dlg.locator('#cancel').click()

        # --- íconos: sin emojis y en blanco
        for tab in ['money','habits','purchases','data']:
            page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(150)
            body = page.locator('body').inner_text()
            check(f'sin emojis en {tab}', not EMOJI.search(body), EMOJI.findall(body))
        page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_timeout(150)
        strokes = page.evaluate("""() => [...document.querySelectorAll('.i')].filter(i=>!i.closest('.btn.primary, .fab')).map(i=>getComputedStyle(i).stroke)""")
        check('todos los iconos son blancos', strokes and all(s=='rgb(255, 255, 255)' for s in strokes), set(strokes))
        page.click('[data-act=sub][data-sub=reports]'); page.screenshot(path=OUT + 'x_reports.png', full_page=True)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
