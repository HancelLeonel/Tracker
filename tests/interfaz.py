import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
os.makedirs(OUT, exist_ok=True)
import subprocess, time, re, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
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
        check('los iconos usan el color de texto del tema (claro, no blanco puro)', strokes and all(s in ('rgb(232, 234, 238)', 'rgb(154, 161, 173)') for s in strokes), set(strokes))
        # --- tema Grafito: contraste (fórmula WCAG) de los pares clave, leídos de las variables CSS
        V = page.evaluate("""() => { const s = getComputedStyle(document.documentElement); const g = n => s.getPropertyValue(n).trim();
          return Object.fromEntries(['text','subtext0','base','mantle','accent','accent-ink','red','green','yellow','mauve','blue','peach','pink','teal','lavender'].map(n => [n, g('--' + n)])); }""")
        def lum(h):
            h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
            c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        ratio = lambda a, b: (max(lum(a), lum(b)) + 0.05) / (min(lum(a), lum(b)) + 0.05)
        pairs = [('text', 'mantle', 7), ('text', 'base', 7), ('subtext0', 'mantle', 4.5), ('subtext0', 'base', 4.5), ('accent-ink', 'accent', 4.5),
                 ('accent', 'mantle', 4.5), ('red', 'mantle', 4.5), ('green', 'mantle', 4.5), ('yellow', 'mantle', 4.5)] + [(c, 'mantle', 3) for c in ('mauve','blue','peach','pink','teal','lavender')]
        bad = [(x, y, round(ratio(V[x], V[y]), 2), need) for x, y, need in pairs if ratio(V[x], V[y]) < need]
        check('contraste del tema: texto ≥ 7:1, secundario/semánticos/acento ≥ 4.5:1, colores de iconos ≥ 3:1', not bad, bad)
        # el tema claro cumple los mismos mínimos (Configuración › Apariencia)
        page.evaluate("document.documentElement.dataset.theme = 'light'")
        V = page.evaluate("""() => { const s = getComputedStyle(document.documentElement); const g = n => s.getPropertyValue(n).trim();
          return Object.fromEntries(['text','subtext0','base','mantle','accent','accent-ink','red','green','yellow','mauve','blue','peach','pink','teal','lavender'].map(n => [n, g('--' + n)])); }""")
        bad = [(x, y, round(ratio(V[x], V[y]), 2), need) for x, y, need in pairs if ratio(V[x], V[y]) < need]
        check('contraste del tema claro: mismos mínimos', not bad, bad)
        page.evaluate("document.documentElement.dataset.theme = 'dark'")
        # --- hoja inferior y áreas de toque
        page.click('[data-act=edit-acc] >> nth=0'); page.wait_for_timeout(300)
        geo = page.evaluate("(() => { const r = document.querySelector('#dlg').getBoundingClientRect(); return { bottom: r.bottom, h: innerHeight, w: r.width, vw: innerWidth, top: r.top, rad: getComputedStyle(document.querySelector('#dlg')).borderTopLeftRadius }; })()")
        check('los formularios son una hoja pegada abajo, de ancho completo y con esquinas superiores redondeadas', abs(geo['bottom'] - geo['h']) < 2 and geo['w'] >= geo['vw'] - 1 and geo['rad'] == '24px' and geo['top'] > 0, geo)
        page.locator('#dlg #cancel').click(); page.wait_for_timeout(150)
        small = page.evaluate("[...document.querySelectorAll('#topbar button')].map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length")
        check('botones de la barra superior ≥ 44 px', small == 0, small)
        page.click('[data-act=menu-open]'); page.wait_for_timeout(300)
        small = page.evaluate("[...document.querySelectorAll('#tabs button')].map(b => b.getBoundingClientRect()).filter(r => r.height < 44).length")
        check('opciones del menú ≥ 44 px de alto', small == 0, small)
        check('la opción activa del menú se distingue', page.evaluate("getComputedStyle(document.querySelector('#tabs button.on'), '::before').backgroundColor === 'rgb(154, 167, 245)'"))
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        check('el botón de menú es fantasma (sin relleno)', page.evaluate("getComputedStyle(document.querySelector('#topbar .icon')).backgroundColor") in ('rgba(0, 0, 0, 0)', 'transparent'))
        page.click('[data-act=sub][data-sub=reports]'); page.screenshot(path=OUT + 'x_reports.png', full_page=True)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
