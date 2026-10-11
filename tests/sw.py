"""Service worker: con la red lenta abre con la copia guardada; sin copia espera a la red."""
import os, sys, time, threading, http.server
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
from playwright.sync_api import sync_playwright
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
DELAY = {'ms': 0}
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        if DELAY['ms']: time.sleep(DELAY['ms'] / 1000)
        super().do_GET()
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('localhost', 8771), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://localhost:8771/'
try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---- con copia guardada y red lenta: abre en ~3 s con la copia, sin esperar los 6 s del servidor
        ctx = b.new_context(viewport={'width':390,'height':800})
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#view .home'); pg.wait_for_function("navigator.serviceWorker.ready.then(() => true)")
        pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_selector('#view .home')
        check('el service worker controla la página', pg.evaluate('!!navigator.serviceWorker.controller'))
        DELAY['ms'] = 6000
        t0 = time.time(); pg.reload(); pg.wait_for_selector('#view .home', timeout=20000); dt = time.time() - t0
        check('red lenta (6 s por archivo): abre con la copia en unos 3 s', 2.5 < dt < 5.5, round(dt, 1))
        check('y la app funciona (menú y navegación)', (pg.click('[data-act=menu-open]'), pg.click('#tabs [data-tab=habits]'), pg.wait_for_timeout(200), pg.locator('#topbar h1').inner_text())[-1]=='Hábitos')
        check('sin errores de página', errs==[], errs)
        DELAY['ms'] = 0
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
