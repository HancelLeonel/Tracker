"""Revisión general: datos dañados en todas las pantallas (reparación al cargar y red de seguridad por sección), pagos vencidos
agrupados por pago, campos ocultos de los formularios (`hidden`) y limpieza de ajustes que ya no se usan."""
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
# Todas las pantallas: [pestaña, acción extra (selector) o None]
SCREENS = [('home', None), ('money', None), ('money', '[data-act=sub][data-sub=bills]'), ('money', '[data-act=sub][data-sub=reports]'),
           ('habits', None), ('lists', None), ('lists', '[data-act=list-sub][data-sub=agenda]'), ('lists', '[data-act=list-sub][data-sub=templates]'), ('lists', '[data-act=list-sub][data-sub=archive]'),
           ('purchases', None), ('pomodoro', None), ('gym', None), ('gym', '[data-act=gym-sub][data-sub=routines]'), ('gym', '[data-act=gym-sub][data-sub=history]'),
           ('gym', '[data-act=gym-sub][data-sub=progress]'), ('notes', None), ('data', None)]
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
        txt = lambda: q.locator('#view').inner_text()
        def go(tab, extra=None):
            q.evaluate("() => import('/js/state.js').then(m => { m.S.listId = null; m.S.noteGroup = null; m.S.gymSub = 'train'; m.S.sub = 'accounts'; m.S.listSub = 'lists'; })")
            ir(q, tab); q.wait_for_timeout(80)
            if extra: q.click(extra); q.wait_for_timeout(80)
        def raw(js):  # escribe directo en la base, sin pasar por la app (como un respaldo editado a mano)
            q.evaluate("async js => { const db = await import('/js/db.js'); await (new Function('db', 'return (async () => {' + js + '})()'))(db); }", js)

        # ---- 1) registros con forma rota en todas las tiendas: la app los repara al cargar
        raw(f"""await db.commit({{ put: {{
          habits: [{{ id: 'h', name: 5, color: 'blue', icon: 'nada', slot: '', order: 1, dates: null }}],
          accounts: [{{ id: 'a', name: 'Rota', type: 'normal', cats: null }}, {{ id: 'a2', name: 'Bien', type: 'normal', cats: [{{ id: 'c', name: null, balance: 'cien' }}, null] }}],
          moves: [{{ id: 'm', type: 'expense', date: null, total: 'x', parts: null, title: 'Gasto roto' }}, {{ id: 'm2', type: 'transfer', date: '{D(0)}', total: 5, parts: [{{ acc: 'a2', cat: 'c', amount: 5 }}], to: null }}],
          bills: [{{ id: 'b', title: null, amount: 10, freq: 'monthly', day: 5, start: '{D(-10)}', active: true, paid: null }}],
          purchases: [{{ id: 'p', name: null, date: null, price: 1, files: null }}],
          templates: [{{ id: 't', name: 'Plantilla rota', color: 'mauve', freq: '', items: null }}],
          lists: [{{ id: 'l', name: 'Lista rota', created: 'ayer', t: 1, items: null }}, {{ id: 'l2', name: 'Con nulos', created: '{D(0)}', t: 2, items: [null, {{ id: 'i', text: 3, done: false }}] }}],
          noteGroups: [{{ id: 'g', name: 'Grupo roto', color: 'mauve', icon: 'note', fields: null }}],
          notes: [{{ id: 'n', group: 'g', title: 7, values: 'texto', tags: 'x', created: 1, updated: 1 }}],
          inbox: [{{ id: 'qq', text: null, t: 'x' }}],
          routines: [{{ id: 'r', name: 'Rutina rota', color: 'mauve', exercises: null }}],
          workouts: [{{ id: 'w', name: 'Entreno roto', date: 'x', t: 1, end: 2, exercises: [{{ id: 'e', name: 'Sentadilla', sets: null }}, null] }}],
        }} }});""")
        q.reload(); q.wait_for_selector('#view .home')
        bad = []
        for tab, extra in SCREENS:
            go(tab, extra)
            if 'No se pudo mostrar' in txt(): bad.append((tab, extra, txt()[:160]))
        check('con datos dañados en todas las tiendas, ninguna pantalla falla', not bad, bad)
        go('lists'); check('la lista con elementos nulos se ve y conserva el elemento válido', 'Con nulos' in txt() and 'Lista rota' in txt())
        q.click('[data-act=open-list][data-id=l2]'); q.wait_for_timeout(80)
        check('su detalle abre (el texto que no era texto se muestra)', '3' in txt() and 'No se pudo mostrar' not in txt())
        q.click('[data-act=list-back]'); q.wait_for_timeout(60)
        go('notes'); q.click('[data-act=open-ngroup]'); q.wait_for_timeout(80)
        check('un grupo de notas dañado abre y su nota se puede ver', '7' in txt() and 'No se pudo mostrar' not in txt())
        q.click('[data-act=note-back]'); q.wait_for_timeout(60)
        check('sin errores de consola con datos dañados', errs==[], errs)

        # ---- 2) si aun así una sección falla al pintarse, solo esa muestra el aviso y el menú sigue
        q.evaluate("() => import('/js/state.js').then(m => { m.S.lists.find(l => l.id === 'l2').items = 5; })")  # roto después de cargar
        errs.clear()
        go('lists')
        check('la sección que falla muestra un aviso con el detalle y un botón a Inicio', 'No se pudo mostrar esta sección' in txt() and 'Detalle:' in txt() and q.locator('#view [data-act=tab][data-tab=home]').count()==1, txt()[:200])
        check('la barra inferior sigue disponible', q.locator('#nav [data-tab]').count()==4 and q.locator('#nav [data-act=more]').count()==1 and q.locator('#topbar h1').inner_text()=='Listas')
        check('el error queda en consola (para diagnosticarlo)', any('items' in e or 'filter' in e for e in errs), errs)
        q.click('#view [data-act=tab][data-tab=home]'); q.wait_for_timeout(100)
        check('desde el aviso se vuelve a Inicio y la app sigue', q.locator('#view .home').count()==1)
        go('habits'); check('las demás secciones siguen funcionando', 'No se pudo mostrar' not in txt())
        q.reload(); q.wait_for_selector('#view .home'); errs.clear()

        # ---- 3) pagos: un pago periódico olvidado no llena la lista; se cuenta una vez
        q.evaluate("async () => { const db = await import('/js/db.js'); await db.replaceAll({ habits: [], accounts: [], moves: [], plan: [], bills: [], purchases: [], templates: [], lists: [], noteGroups: [], notes: [], inbox: [], routines: [], workouts: [], exercises: [], settings: (await import('/js/state.js')).S.settings }); }")
        q.reload(); q.wait_for_selector('#view .home')
        first = date.today().replace(day=1)
        start = (first - timedelta(days=100)).replace(day=1).isoformat()
        raw(f"""await db.commit({{ put: {{ bills: [{{ id: 'bm', title: 'Internet', amount: 300, freq: 'monthly', day: 1, start: '{start}', card: null, active: true, paid: {{}} }},
          {{ id: 'bo', title: 'Seguro', amount: 100, freq: 'once', dueDate: '{D(-3)}', start: '{start}', card: null, active: true, paid: {{}} }}] }} }});""")
        q.reload(); q.wait_for_selector('#view .home')
        tile = q.locator('.home-chip.hc-money').inner_text()
        check('Inicio cuenta pagos vencidos, no vencimientos (2 pagos aunque Internet debe varios meses)', tile.split() == ['2', 'Pagos', 'vencidos'], tile)
        go('money', '[data-act=sub][data-sub=bills]')
        rows = q.locator('.card.alert .bill')
        check('en Vencidos, una fila por pago (la más antigua) con cuántos vencimientos más hay', rows.count()==2 and 'vencimientos más' in q.locator('.card.alert').inner_text(), q.locator('.card.alert').inner_text())
        check('el aviso de la pestaña Pagos cuenta 2', q.locator('[data-sub=bills] .badge').inner_text().strip()=='2')
        n0 = q.locator('.card.alert').inner_text()
        q.locator('.card.alert .bill:has-text("Internet") [data-act=pay-bill]').click(); q.wait_for_timeout(100)
        dlg.locator('button.primary').click(); q.wait_for_timeout(200)
        n1 = q.locator('.card.alert').inner_text()
        check('al pagar el más antiguo, Internet muestra el siguiente con uno menos', n0 != n1 and 'Internet' in n1, (n0, n1))

        # ---- 4) los campos ocultos de los formularios se ocultan de verdad
        q.click('[data-act=new-bill] >> nth=0'); q.wait_for_timeout(100)
        check('nuevo pago mensual: se ve el día del mes y no la fecha de vencimiento', dlg.locator('#f-day').is_visible() and dlg.locator('#f-once').is_hidden())
        dlg.locator('[name=freq]').select_option('once')
        check('al elegir «una sola vez» se invierten', dlg.locator('#f-once').is_visible() and dlg.locator('#f-day').is_hidden())
        dlg.locator('#cancel').click(); q.wait_for_timeout(60)
        check('ninguna regla de la hoja de estilos le gana a [hidden]', q.evaluate("(() => { const l = document.createElement('label'); l.hidden = true; l.className = 'check stack'; document.body.append(l); const d = getComputedStyle(l).display; l.remove(); return d; })()")=='none')

        # ---- 5) ajustes que ya no se usan se limpian al cargar
        q.evaluate("async () => { const st = await import('/js/state.js'); st.S.settings.homeMoney = { mode: 'accounts', ids: ['x'] }; await st.saveSettings(); }")
        q.reload(); q.wait_for_selector('#view .home')
        check('el ajuste de la antigua tarjeta de dinero ya no está', q.evaluate("import('/js/state.js').then(m => 'homeMoney' in m.S.settings)")==False)
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
