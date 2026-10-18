"""Listas: orden (recientes / por fecha / manual), fijar, ordenar pendientes por fecha, agenda y fechas relativas en plantillas."""
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
        ctx = b.new_context(viewport={'width':390,'height':800}, accept_downloads=True)
        q = ctx.new_page(); errs=[]
        q.on('pageerror', lambda e: errs.append(str(e)))
        q.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        q.on('dialog', lambda d: d.accept())
        q.goto(URL); q.wait_for_selector('#view .home')
        dlg = q.locator('#dlg')
        def go(tab):
            if q.locator('[data-act=list-back]').count(): q.click('[data-act=list-back]'); q.wait_for_timeout(60)
            q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(80)
        def seed(js):
            q.evaluate("""async (js) => { const st = await import('/js/state.js'); const ut = await import('/js/util.js'); const db = await import('/js/db.js');
              await (new Function('st', 'ut', 'db', 'return (async () => {' + js + '})()'))(st, ut, db); st.hooks.render(); }""", js)
            q.wait_for_timeout(80)
        names = lambda: [t.split('\n')[0].strip() for t in q.locator('.list-card b').all_inner_texts()]
        sub = lambda k: (q.click(f'[data-act=list-sub][data-sub={k}]'), q.wait_for_timeout(70))
        order = lambda m: (q.click(f'[data-act=list-order][data-mode={m}]'), q.wait_for_timeout(100))
        seed(f"""const it = (id, text, due) => ({{ id, text, done: false, ...(due ? {{ due }} : {{}}) }});
          const mk = (id, name, created, items) => ({{ id, name, tplId: null, color: 'mauve', created, t: 1, items }});
          const ls = [mk('A', 'Alfa', '2026-01-01', [it('a1', 'a1', '{D(10)}')]), mk('B', 'Beta', '2026-02-01', [it('b1', 'b1')]),
                      mk('C', 'Gamma', '2026-03-01', [it('c1', 'c1', '{D(2)}'), it('c2', 'c2', '{D(1)}'), it('c3', 'c3', '{D(0)}')]), mk('D', 'Delta', '2026-04-01', [it('d1', 'd1', '{D(-1)}')])];
          ls.forEach(l => st.S.lists.push(l)); await db.commit({{ put: {{ lists: ls }} }});""")
        go('lists')

        # ---- orden de la vista de listas
        check('por defecto: recientes primero', names()==['Delta','Gamma','Beta','Alfa'], names())
        check('hay barra de orden con tres modos y «Recientes» activo', q.locator('[data-act=list-order]').count()==3 and 'on' in q.locator('[data-act=list-order][data-mode=recent]').get_attribute('class'))
        order('due')
        check('por fecha: la próxima fecha límite pendiente (vencidas primero, sin fecha al final)', names()==['Delta','Gamma','Alfa','Beta'], names())
        order('manual')
        check('manual: parte del orden que se veía', names()==['Delta','Gamma','Alfa','Beta'], names())
        check('en manual aparecen las flechas (la primera no sube, la última no baja)', q.locator('[data-act=list-up]').count()==4 and q.locator('[data-act=list-up]').first.is_disabled() and q.locator('[data-act=list-down]').last.is_disabled())
        q.click('[data-act=list-up][aria-label="Subir Beta"]'); q.wait_for_timeout(100)
        check('subir una lista la intercambia con la de arriba', names()==['Delta','Gamma','Beta','Alfa'], names())
        q.click('[data-act=list-down][aria-label="Bajar Delta"]'); q.wait_for_timeout(100)
        check('bajar también', names()==['Gamma','Delta','Beta','Alfa'], names())
        q.reload(); q.wait_for_selector('#view .home'); go('lists')
        check('el modo y el orden manual se conservan al recargar', names()==['Gamma','Delta','Beta','Alfa'] and 'on' in q.locator('[data-act=list-order][data-mode=manual]').get_attribute('class'), names())
        q.screenshot(path=OUT+'lo_manual.png', full_page=True)

        # ---- lista nueva en manual: arriba
        q.click('#topbar [data-act=new-list]'); q.wait_for_timeout(80); dlg.locator('[name=name]').fill('Zeta nueva'); dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        q.click('[data-act=list-back]'); q.wait_for_timeout(80)
        check('una lista nueva queda arriba en el orden manual', names()[0]=='Zeta nueva' and len(names())==5, names())

        # ---- fijar
        q.click('[data-act=list-pin][aria-label="Fijar Alfa"]'); q.wait_for_timeout(100)
        check('fijar la sube al principio y muestra el icono', names()[0]=='Alfa' and q.locator('.list-card:has-text("Alfa") .pin-mark').count()==1 and q.locator('[data-act=list-pin][aria-label="Quitar de fijadas Alfa"]').get_attribute('aria-pressed')=='true', names())
        check('las fijadas se mueven solo entre fijadas (con una sola, no hay hacia dónde)', q.locator('[data-act=list-up][aria-label="Subir Alfa"]').is_disabled() and q.locator('[data-act=list-down][aria-label="Bajar Alfa"]').is_disabled())
        order('recent')
        check('en «Recientes» las fijadas siguen primero', names()==['Alfa','Zeta nueva','Delta','Gamma','Beta'], names())
        order('due')
        check('y en «Por fecha» también', names()[0]=='Alfa', names())
        q.click('[data-act=list-pin][aria-label="Fijar Beta"]'); q.wait_for_timeout(100)
        check('varias fijadas se ordenan entre ellas con el modo elegido (por fecha: Alfa antes que Beta)', names()[:2]==['Alfa','Beta'], names())
        # desde las opciones de la lista
        q.click('.list-card:has-text("Gamma")'); q.wait_for_timeout(80); q.click('[data-act=list-opts]'); q.wait_for_timeout(80)
        check('las opciones muestran «Fijar arriba» sin marcar', not dlg.locator('[name=pinned]').is_checked())
        dlg.locator('[name=pinned]').check(); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        q.click('[data-act=list-back]'); q.wait_for_timeout(80)
        check('fijar desde las opciones', 'Gamma' in names()[:3] and q.locator('.list-card:has-text("Gamma") .pin-mark').count()==1, names())
        for n in ('Alfa','Beta','Gamma'): q.click(f'[data-act=list-pin][aria-label="Quitar de fijadas {n}"]'); q.wait_for_timeout(60)
        check('quitar las fijadas', q.locator('.pin-mark').count()==0)

        # ---- ordenar los pendientes de una lista por fecha límite
        seed("""const l = st.S.lists.find(l => l.id === 'C'); l.items = [{ id: 'x', text: 'sin fecha uno', done: false }, { id: 'y', text: 'lejana', done: false, due: '%s' }, { id: 'z', text: 'cercana', done: false, due: '%s' }, { id: 'w', text: 'sin fecha dos', done: false }]; await st.saveList(l);""" % (D(5), D(1)))
        q.click('.list-card:has-text("Gamma")'); q.wait_for_timeout(100)
        rows = lambda: [t.strip() for t in q.locator('.li .li-t').all_inner_texts()]
        check('sin la opción conserva el orden original', rows()==['sin fecha uno','lejana','cercana','sin fecha dos'], rows())
        q.click('[data-act=list-opts]'); q.wait_for_timeout(80); dlg.locator('[name=sortDue]').check(); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('con «Ordenar por fecha límite» los pendientes con fecha van primero, la más próxima arriba', rows()==['cercana','lejana','sin fecha uno','sin fecha dos'], rows())
        q.click('.li:has-text("cercana") .li-main'); q.wait_for_timeout(100)
        check('lo hecho sigue yendo al final', rows()[-1]=='cercana' and rows()[:3]==['lejana','sin fecha uno','sin fecha dos'], rows())
        q.click('.li:has-text("cercana") .li-main'); q.click('[data-act=list-opts]'); q.wait_for_timeout(80); dlg.locator('[name=sortDue]').uncheck(); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('al quitar la opción vuelve el orden original', rows()==['sin fecha uno','lejana','cercana','sin fecha dos'], rows())

        # ---- agenda
        seed(f"""const l = st.S.lists.find(l => l.id === 'C'); l.items = [{{ id: 'g0', text: 'para hoy', done: false, due: '{D(0)}' }}, {{ id: 'g1', text: 'para mañana', done: false, due: '{D(1)}' }}, {{ id: 'g2', text: 'esta semana', done: false, due: '{D(4)}' }}, {{ id: 'g3', text: 'más adelante', done: false, due: '{D(30)}' }}, {{ id: 'g4', text: 'hecha', done: true, due: '{D(0)}' }}]; await st.saveList(l);""")
        q.click('[data-act=list-back]'); sub('agenda')
        import re
        heads = [re.sub(r'\s*\d+$', '', h.strip().upper()) for h in q.locator('.today .overline').all_inner_texts()]
        check('agenda: grupos por vencimiento, en orden', heads==['VENCIDAS','HOY','MAÑANA','ESTA SEMANA','MÁS ADELANTE'], heads)
        check('agenda: 6 tareas (una vencida de Delta, hoy, mañana, esta semana y dos más adelante); las hechas no salen', q.locator('.trow').count()==6 and q.locator('.trow:has-text("hecha")').count()==0, q.locator('.trow').count())
        check('cada fila dice de qué lista es', 'Delta' in q.locator('.trow').first.inner_text() and 'Gamma' in q.locator('.trow').nth(1).inner_text())
        q.click('.trow:has-text("para hoy") .chk'); q.wait_for_timeout(120)
        check('la casilla marca como hecha y la quita de la agenda', q.locator('.trow:has-text("para hoy")').count()==0 and q.locator('.trow').count()==5)
        q.click('.trow:has-text("para mañana") .t-main'); q.wait_for_timeout(100)
        check('tocar el texto abre su lista', q.locator('#topbar h1').inner_text()=='Gamma')
        q.click('[data-act=list-back]'); sub('lists')

        # ---- plantillas con fechas relativas
        sub('templates'); q.click('#topbar [data-act=new-tpl]'); q.wait_for_timeout(80)
        dlg.locator('[name=name]').fill('Mensual'); dlg.locator('[name=items]').fill('# Pagos\nPagar luz @3\nRevisar @0\nSin fecha\nTexto @abc\nLarga @1000'); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        q.click('[data-act=edit-tpl]'); q.wait_for_timeout(80)
        body = dlg.locator('[name=items]').input_value()
        check('al editar la plantilla se conserva la fecha relativa (@N); lo que no es @número queda como texto', body=='# Pagos\nPagar luz @3\nRevisar @0\nSin fecha\nTexto @abc\nLarga @1000', body)
        dlg.locator('#cancel').click(); q.wait_for_timeout(80)
        q.click('[data-act=use-tpl]'); q.wait_for_timeout(150)
        check('la lista creada pone la fecha: hoy + 3 días y hoy', 'Vence el' in q.locator('.li:has(.li-t:text-is("Pagar luz")) .li-meta').inner_text() and 'en 3 días' in q.locator('.li:has(.li-t:text-is("Pagar luz")) .li-meta').inner_text() and q.locator('.li:has(.li-t:text-is("Revisar")) .li-meta').inner_text()=='Vence hoy')
        check('los demás elementos (y los @ que no son un número válido) no llevan fecha', q.locator('.li:has(.li-t:text-is("Sin fecha")) .li-meta').count()==0 and q.locator('.li:has(.li-t:text-is("Texto @abc")) .li-meta').count()==0 and q.locator('.li:has(.li-t:text-is("Larga @1000")) .li-meta').count()==0)
        check('la plantilla no pierde elementos en el conteo', q.locator('.li').count()==5, q.locator('.li').count())

        # ---- respaldo
        go('data')
        with q.expect_download() as dl: q.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        lists = {l['name']: l for l in data['lists']}
        tpl = data['templates'][0]
        check('respaldo: orden manual, fijar y orden por fecha', all(isinstance(l.get('order'), (int, float)) for l in data['lists'] if l['id'] in ('A','B','C','D')) and data['settings']['listSort']=='due' and any(i.get('dueIn')==3 for i in tpl['items']), (data['settings'].get('listSort'), tpl['items']))
        weird = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'listSort':'inventado'},
          'templates':[{'id':'t1','name':'R','color':'mauve','freq':'','items':[{'text':'a','dueIn':-5},{'text':'b','dueIn':'x'},{'text':'c','dueIn':7},{'text':'d','dueIn':999},{'text':'e','head':True,'dueIn':3}]}],
          'lists':[{'id':'w','name':'Rara','created':'2026-01-01','t':1,'pinned':'sí','order':'x','sortDue':1,'items':[]}]}
        Path(tempfile.gettempdir(), 'weird-order.json').write_text(json.dumps(weird))
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-order.json')); q.wait_for_timeout(800)
        t = q.evaluate("import('/js/state.js').then(st => ({ items: st.S.templates[0].items, list: st.S.lists[0], sort: st.S.settings.listSort }))")
        check('importar sanea fechas relativas fuera de rango, orden no numérico y modo desconocido', [i.get('dueIn') for i in t['items']]==[None,None,7,None,None] and t['list'].get('order') is None and t['list'].get('pinned') is True and t['list'].get('sortDue') is True, t)
        go('lists')
        check('con un modo de orden desconocido usa «Recientes» (y la lista se ve)', 'Rara' in q.locator('#view').inner_text())
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
