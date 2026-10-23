"""Inicio: botones Gasto / Ingreso / Mover (la tarjeta de Ejercicio salió de Inicio en el rediseño de oct 2026)."""
import os, sys, tempfile, json
from datetime import date, timedelta
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
from _nav import ir
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
D = lambda n: (date.today() + timedelta(days=n)).isoformat()
URL = 'http://localhost:8765/'
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800})
        q = ctx.new_page(); errs=[]
        q.on('pageerror', lambda e: errs.append(str(e)))
        q.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        q.on('dialog', lambda d: d.accept())
        q.goto(URL); q.wait_for_selector('#view .home')
        dlg = q.locator('#dlg')
        def go(tab): ir(q, tab); q.wait_for_timeout(80)
        def seed(js):
            q.evaluate("""async (js) => { const st = await import('/js/state.js'); const ut = await import('/js/util.js'); const db = await import('/js/db.js');
              await (new Function('st', 'ut', 'db', 'return (async () => {' + js + '})()'))(st, ut, db); st.hooks.render(); }""", js)
            q.wait_for_timeout(80)
        is_open = lambda: q.evaluate("document.querySelector('#dlg').open")

        # ---- disposición: sin tarjetas de media pantalla; los tres botones comparten fila
        boxes = q.evaluate("""() => [...document.querySelectorAll('.tile-acts .btn')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; })""")
        check('los tres botones comparten fila', len(boxes)==3 and len({t for _, t, _ in boxes})==1 and all(90<w<140 for _, _, w in boxes), boxes)
        check('Inicio ya no tiene tarjetas ni tarjeta de dinero con saldo', q.locator('.tile, .tile-money, [data-act=home-eye], [data-act=home-money-cfg]').count()==0 and 'Q ••••' not in q.locator('.home').inner_text())
        check('ya no hay tarjeta de Ejercicio en Inicio', 'Ejercicio' not in q.locator('.home').inner_text())

        # ---- botones de dinero
        acts = q.locator('.tile-acts .btn')
        check('tres botones: Gasto, Ingreso y Mover', [t.strip() for t in acts.all_inner_texts()]==['Gasto','Ingreso','Mover'], acts.all_inner_texts())
        check('cada botón mide al menos 44 px de alto', all(acts.nth(i).bounding_box()['height']>=44 for i in range(3)))
        for i, lab in enumerate(['Gasto','Ingreso','Mover dinero']):
            acts.nth(i).click(); q.wait_for_timeout(100)
            check(f'«{lab}» sin cuentas avisa en vez de abrir un formulario roto', not is_open() and 'cuenta' in q.locator('#toast').inner_text(), q.locator('#toast').inner_text())
        seed("""const a = { id: 'a1', name: 'Banco', type: 'normal', limit: 0, order: 1, cats: [{ id: 'c1', name: 'Comida', balance: 500 }, { id: 'c2', name: 'Ahorro', balance: 100 }] }; st.S.accounts.push(a); await st.saveAccount(a);""")
        for i, lab in enumerate(['Gasto','Ingreso','Mover dinero']):
            acts.nth(i).click(); q.wait_for_timeout(120)
            check(f'«{lab}» abre su formulario sobre Inicio', is_open() and lab.lower() in dlg.locator('h2').inner_text().lower() and q.locator('#topbar h1').inner_text()=='Inicio', dlg.locator('h2').inner_text() if is_open() else 'cerrado')
            dlg.locator('#cancel').click(); q.wait_for_timeout(80)
        acts.nth(1).click(); q.wait_for_timeout(100)
        dlg.locator('[name=amount]').fill('250'); dlg.locator('button.primary').click(); q.wait_for_timeout(200)
        saldo = q.evaluate("import('/js/state.js').then(m => m.S.accounts[0].cats.reduce((t, c) => t + c.balance, 0))")
        check('registrar un ingreso desde Inicio cambia el saldo (850) y se queda en Inicio', saldo==850 and q.locator('#topbar h1').inner_text()=='Inicio', saldo)

        for f in ('system', 'jetbrains'):
            q.evaluate(f"document.documentElement.dataset.font='{f}'"); q.wait_for_timeout(80)
            check(f'sin desborde horizontal en 390 px ({f})', q.evaluate('document.documentElement.scrollWidth')<=390, q.evaluate('document.documentElement.scrollWidth'))
        q.evaluate("document.documentElement.dataset.font='system'")
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
