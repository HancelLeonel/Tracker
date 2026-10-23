"""Service worker: abre al instante con la copia guardada (aunque la red sea lenta), busca la versión nueva en segundo plano y la ofrece sin
mezclar versiones; sin copia (primera visita) espera a la red."""
import os, sys, time, shutil, tempfile, threading, http.server
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
from playwright.sync_api import sync_playwright
from _nav import ir
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
# Copia del proyecto para poder "publicar una versión nueva" cambiando un archivo.
SITE = os.path.join(tempfile.mkdtemp(), 'site')
shutil.copytree(ROOT, SITE, ignore=shutil.ignore_patterns('.git', '.venv', 'tests', '__pycache__'))
DELAY = {'ms': 0}
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SITE, **k)
    def do_GET(self):
        if DELAY['ms']: time.sleep(DELAY['ms'] / 1000)
        super().do_GET()
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('localhost', 8771), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://localhost:8771/'
marker = lambda pg: pg.evaluate("getComputedStyle(document.body).getPropertyValue('--marker').trim()")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---- con copia guardada: abre al instante aunque la red tarde 2,5 s por archivo
        ctx = b.new_context(viewport={'width':390,'height':800})
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#view .home'); pg.wait_for_function("navigator.serviceWorker.ready.then(() => true)")
        pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_selector('#view .home')
        check('el service worker controla la página', pg.evaluate('!!navigator.serviceWorker.controller'))
        names = pg.evaluate("caches.keys()")
        check('hay una sola caché de versión además de la de control', len([n for n in names if n != 'tracker-meta']) == 1, names)
        DELAY['ms'] = 2500
        t0 = time.time(); pg.reload(); pg.wait_for_selector('#view .home', timeout=20000); dt = time.time() - t0
        check('red muy lenta (2,5 s por archivo): abre con la copia mucho antes de que la red responda (< 2 s)', dt < 2.0, round(dt, 1))
        check('y la app funciona (menú y navegación)', (ir(pg, 'habits'), pg.wait_for_timeout(300), pg.locator('#topbar h1').inner_text())[-1]=='Hábitos')
        check('sin errores de página', errs==[], errs)
        DELAY['ms'] = 0
        pg.wait_for_timeout(3500) # la comprobación en segundo plano de la red lenta termina (tarda ~2,5 s)

        # ---- sin cambios en el servidor: no se ofrece ninguna actualización
        pg.reload(); pg.wait_for_selector('#view .home'); pg.wait_for_timeout(1500)
        check('sin versión nueva no aparece el aviso', pg.locator('#upd').count()==0)

        # ---- se publica una versión nueva: abre con la vieja y ofrece actualizar
        with open(os.path.join(SITE, 'css/style.css'), 'a') as f: f.write('\nbody { --marker: v2; }\n')
        check('antes de publicar no hay marca', marker(pg) == '')
        pg.reload(); pg.wait_for_selector('#view .home')
        check('abre al instante con la versión que ya tenía (no espera a la red)', marker(pg) == '')
        pg.wait_for_selector('#upd', timeout=10000)
        check('en segundo plano baja la nueva y ofrece actualizar', 'versión nueva' in pg.locator('#upd').inner_text())
        check('mientras no se acepte sigue la versión anterior (nada se mezcla)', marker(pg) == '')
        pg.screenshot(path=os.path.join(tempfile.gettempdir(), 'tracker-shots', 'sw-aviso.png')) if os.path.isdir(os.path.join(tempfile.gettempdir(), 'tracker-shots')) else None
        with pg.expect_navigation(): pg.click('#upd-go')
        pg.wait_for_selector('#view .home'); pg.wait_for_timeout(300)
        check('«Actualizar» recarga con la versión nueva', marker(pg) == 'v2', marker(pg))
        names = pg.evaluate("caches.keys()")
        check('de la versión anterior solo queda la caché vigente y, un minuto como máximo, la anterior (por si una pestaña aún carga con ella)', 1 <= len([n for n in names if n != 'tracker-meta']) <= 2, names)
        check('el aviso ya no aparece tras actualizar', (pg.wait_for_timeout(1500), pg.locator('#upd').count())[1]==0)

        # ---- ahora no: se puede descartar, y sin red la app abre igual
        with open(os.path.join(SITE, 'css/style.css'), 'a') as f: f.write('\nbody { --marker: v3; }\n')
        pg.reload(); pg.wait_for_selector('#upd', timeout=10000); pg.click('#upd-x')
        check('«Ahora no» cierra el aviso', pg.locator('#upd').count()==0)
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_selector('#view .home', timeout=10000)
        check('sin red abre con la copia', pg.locator('#view .home').count()==1)
        check('sin red no hay aviso ni errores', pg.locator('#upd').count()==0 and errs==[], errs)
        ctx.set_offline(False)
        ctx.close()

        # ---- sin copia (primera visita) y red lenta: espera a la red en vez de fallar
        ctx = b.new_context(viewport={'width':390,'height':800})
        pg = ctx.new_page(); DELAY['ms'] = 1200
        t0 = time.time(); pg.goto(URL); pg.wait_for_selector('#view .home', timeout=60000); dt = time.time() - t0
        check('primera visita con red lenta: abre cuando llega todo (no hay copia que usar)', dt > 1.2 and pg.locator('#view .home').count()==1, round(dt, 1))
        DELAY['ms'] = 0
        ctx.close()
        b.close()
finally:
    srv.shutdown()
print('errors: []')
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
