"""Arranque: que la app nunca se quede muda en la pantalla del logo."""
import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
URL = 'http://localhost:8765/'
OLD_DB = """() => new Promise(r => { const q = indexedDB.open('mi-quincena', 4);
  q.onupgradeneeded = () => { const db = q.result; for (const s of ['habits','accounts','moves','plan','bills','purchases','templates','lists','files']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, {keyPath:'id'}); if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'k'}); };
  q.onsuccess = () => { window.__db = q.result; r(); }; })"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---- 1) otra ventana con la versión anterior mantiene abierta la base
        ctx = b.new_context(viewport={'width':390,'height':800})
        old = ctx.new_page(); old.goto(URL + 'icons/icon.svg'); old.evaluate(OLD_DB)
        new = ctx.new_page(); errs = []
        new.on('pageerror', lambda e: errs.append(str(e)))
        new.goto(URL); new.wait_for_timeout(1500)
        txt = new.locator('#view').inner_text()
        check('base bloqueada por otra ventana: se explica qué hacer (no solo el logo)', 'otra ventana' in txt and 'versión anterior' in txt and new.locator('.boot').count()==0, txt)
        old.evaluate('window.__db.close()')
        new.wait_for_selector('#view .home', timeout=8000)
        check('al cerrar la otra ventana la app abre sola', new.locator('#view .home').count()==1 and 'otra ventana' not in new.locator('#view').inner_text())
        check('sin errores de página', errs == [], errs)
        ctx.close()

        # ---- 2) una versión más nueva de la base: esta ventana se aparta y no la bloquea
        ctx = b.new_context(viewport={'width':390,'height':800})
        a = ctx.new_page(); a.goto(URL); a.wait_for_selector('#view .home'); a.evaluate('window.__marca = 1')
        c = ctx.new_page(); c.goto(URL + 'icons/icon.svg')
        t0 = time.time()
        c.evaluate("() => new Promise((res, rej) => { const q = indexedDB.open('mi-quincena', 8); q.onsuccess = () => { q.result.close(); res(); }; q.onblocked = () => rej(new Error('bloqueada')); q.onerror = () => rej(q.error); })")
        check('otra ventana puede actualizar la base: esta cierra su conexión (no la bloquea)', time.time() - t0 < 5)
        a.wait_for_timeout(1500)
        check('y se recarga sola', a.evaluate('window.__marca') is None)
        ctx.close()

        # ---- 3) un módulo que no carga: aviso con detalle y botones
        ctx = b.new_context(viewport={'width':390,'height':800})
        ctx.add_init_script('window.__bootWatchdogMs = 1500')
        pg = ctx.new_page(); pg.route('**/js/pomodoro.js', lambda r: r.abort())
        pg.goto(URL); pg.wait_for_timeout(2600)
        boot = pg.locator('.boot').inner_text()
        check('arranque fallido: «no pudo iniciar» con instrucciones y detalle', 'no pudo iniciar' in boot and 'Reintentar' in boot and 'Actualizar la app' in boot and 'Detalle' in boot, boot)
        pg.evaluate("caches.open('tracker-prueba')")
        pg.click('#boot-reset'); pg.wait_for_timeout(1200)
        keys = pg.evaluate('caches.keys()')
        check('«Actualizar la app» borra las cachés', 'tracker-prueba' not in keys, keys)
        ctx.close()

        # ---- 4) datos dañados: un pago roto se omite; un hábito roto no impide abrir Inicio
        ctx = b.new_context(viewport={'width':390,'height':800})
        pg = ctx.new_page(); errlogs = []; warns = []; errs = []
        pg.on('console', lambda m: (errlogs if m.type == 'error' else warns if m.type == 'warning' else []).append(m.text))
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#view .home')
        pg.evaluate("""async () => { const db = await import('/js/db.js'); await db.commit({ put: { bills: [{ id: 'x', title: 'Dato raro', freq: 'monthly', day: 5, start: 5, active: true, paid: {} }] } }); }""")
        pg.reload(); pg.wait_for_selector('#view .home', timeout=8000)
        check('con un pago dañado Inicio abre igual y su tarjeta de pagos sigue', pg.locator('.home').count()==1 and pg.locator('.tile:has-text("Pagos")').count()==1)
        check('el pago dañado se omite con un aviso (no un error)', any('Pago con datos dañados' in w for w in warns) and errs == [], (warns, errs))
        pg.click('[data-act=menu-open]'); pg.click('#tabs [data-tab=money]'); pg.wait_for_timeout(300)
        pg.click('[data-act=sub][data-sub=bills]'); pg.wait_for_timeout(200)
        check('y Finanzas › Pagos también abre con ese pago dañado', pg.locator('#topbar h1').inner_text()=='Pagos' and errs == [], errs)
        pg.evaluate("""async () => { const db = await import('/js/db.js'); await db.commit({ put: { habits: [{ id: 'h', name: 'Roto', color: 'blue', dates: null, order: 1 }] } }); }""")
        pg.reload(); pg.wait_for_selector('#view .home', timeout=8000)
        check('con un hábito dañado Inicio abre igual: omite solo esa tarjeta', pg.locator('.home').count()==1 and pg.locator('.tile:has-text("Hábitos")').count()==0 and pg.locator('.tile:has-text("Pagos")').count()==1 and pg.locator('.quick-exp').count()==1, pg.locator('.tile').count())
        check('el problema queda registrado en consola y no es un error de página', len(errlogs) >= 1 and errs == [], (errlogs, errs))
        ctx.close()
        b.close()
finally:
    srv.terminate()
print('errors: []')
print('FALLAS:', fails)
