"""Recordar la sesión: si la app (instalada) se cierra o Android la mata, al volver a abrirla en menos de 30 min regresa a la misma pantalla."""
import os, sys, tempfile, json, datetime
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
import subprocess
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
from _nav import ir
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)

# ---- datos: cuenta con 40 gastos (para poder desplazarse), una lista y hábitos en tres momentos
T = datetime.date.today()
D = lambda n: (T - datetime.timedelta(days=n)).isoformat()
data = {'app':'tracker','version':3,'exportedAt':'2026-01-01T00:00:00Z','settings':{},
  'habits':[{'id':f'h{k}','name':f'H{k}','color':'blue','dates':{},'icon':'drop','slot':s,'order':k} for k,s in enumerate(['morning','day','night'])],
  'accounts':[{'id':'a1','name':'Banco','order':0,'type':'normal','limit':0,'cats':[{'id':'c1','name':'Comida','balance':2000}]}],
  'moves':[{'id':f'm{i}','t':i,'type':'expense','date':D(i),'note':'','total':10+i,'title':f'Gasto {i}','parts':[{'acc':'a1','cat':'c1','amount':10+i}],'files':[]} for i in range(40)],
  'bills':[],'purchases':[],'templates':[],'noteGroups':[],'notes':[],'inbox':[],'routines':[],'workouts':[],'exercises':[],
  'lists':[{'id':'L1','name':'Mudanza','tplId':None,'color':'blue','created':D(0),'t':1,'items':[{'id':'i1','text':'Cajas','done':False}]}]}
FILE = os.path.join(tempfile.mkdtemp(), 'respaldo.json'); open(FILE, 'w').write(json.dumps(data))
KEY = 'tracker-session'
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # La restauración solo actúa en la app instalada (display-mode: standalone). Las pruebas corren en una pestaña normal: el ajuste
        # `tracker-restore=always` la fuerza (y existe para poder probarla).
        ctx = b.new_context(viewport={'width':390,'height':800})
        ctx.add_init_script("try { if (!sessionStorage.getItem('__t')) { sessionStorage.setItem('__t', '1'); } localStorage.setItem('tracker-restore', 'always'); } catch (e) {}")
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        ir(page, 'data'); page.set_input_files('#file', FILE); page.wait_for_timeout(900)
        title = lambda: page.locator('#topbar h1').inner_text().strip()
        st = lambda js: page.evaluate("import('/js/state.js').then(st => " + js + ")")
        def leave(): page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        def back():
            page.reload(); page.wait_for_selector('#topbar h1'); page.wait_for_timeout(250)
        def stored(**kw):
            page.evaluate("([k, v]) => localStorage.setItem(k, v)", [KEY, json.dumps(kw)])

        # ---- dónde estabas: pestaña, sub-pantalla y posición
        ir(page, 'money'); page.wait_for_selector('.moves .move')
        page.evaluate("window.scrollTo(0, 700)"); page.wait_for_timeout(100)
        y = page.evaluate("scrollY")
        leave(); back()
        check('al reabrir vuelve a Finanzas', title() == 'Finanzas', title())
        check('y a la misma posición de scroll (±8 px)', abs(page.evaluate("scrollY") - y) <= 8 and y > 300, (y, page.evaluate("scrollY")))
        page.click('[data-act=sub][data-sub=bills]'); page.wait_for_timeout(80)
        leave(); back()
        check('recuerda la sub-pantalla (Finanzas › Pagos)', title() == 'Pagos', title())

        # ---- lista abierta, momento de los hábitos y bloques plegados de Inicio
        ir(page, 'lists'); st("{ st.S.listId = 'L1'; st.hooks.render(); }"); page.wait_for_timeout(80)
        leave(); back()
        check('recuerda la lista abierta', title() == 'Mudanza' and page.locator('[data-act=list-back]').count() == 1, title())
        ir(page, 'habits'); st("{ st.S.habitSlot = 'night'; st.hooks.render(); }"); page.wait_for_timeout(80)
        leave(); back()
        check('recuerda el momento del día de los hábitos', st("st.S.habitSlot") == 'night' and title() == 'Hábitos')
        ir(page, 'home'); st("{ st.S.homePendingClosed = true; st.S.homeDoneOpen = true; st.hooks.render(); }")
        leave(); back()
        check('recuerda los hábitos plegados/desplegados de Inicio', st("[st.S.homePendingClosed, st.S.homeDoneOpen]") == [True, True])

        # ---- también se guarda al pasar a segundo plano (visibilitychange), no solo al descargar la página
        ir(page, 'purchases')
        page.evaluate("localStorage.removeItem('tracker-session'); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });")
        s = json.loads(page.evaluate("localStorage.getItem('tracker-session')") or 'null')
        check('al pasar a segundo plano se guarda la pestaña actual', s and s['tab'] == 'purchases' and abs(s['t'] - page.evaluate("Date.now()")) < 5000, s)

        # ---- cuándo NO restaura. Al recargar la app guarda su propio estado (pagehide) y pisaría el valor de prueba, así que cada caso abre una
        # página nueva que escribe el valor ANTES de cargar la app (desde un archivo del mismo origen que no corre ningún código de la app).
        def start(value, url='http://localhost:8765/'):
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
            pg.goto('http://localhost:8765/icons/icon.svg')
            pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [KEY, value])
            pg.goto(url); pg.wait_for_selector('#topbar h1'); pg.wait_for_timeout(300)
            return pg
        ttl = lambda pg: pg.locator('#topbar h1').inner_text().strip()
        now = page.evaluate("Date.now()")
        pg = start(json.dumps({'t': now - 31 * 60000, 'tab': 'money', 'sub': 'accounts', 'scroll': 0}))
        check('pasados 30 minutos abre en Inicio', ttl(pg) == 'Inicio', ttl(pg)); pg.close()
        pg = start(json.dumps({'t': now - 29 * 60000, 'tab': 'money', 'sub': 'accounts', 'scroll': 0}))
        check('a los 29 minutos todavía restaura', ttl(pg) == 'Finanzas', ttl(pg)); pg.close()
        pg = start(json.dumps({'t': now + 5 * 3600000, 'tab': 'money'}))
        check('una hora «del futuro» (reloj raro) abre en Inicio', ttl(pg) == 'Inicio', ttl(pg)); pg.close()
        pg = start(json.dumps({'t': now, 'tab': 'zzz'}))
        check('una pestaña desconocida abre en Inicio', ttl(pg) == 'Inicio', ttl(pg)); pg.close()
        pg = start('esto no es json {')
        check('un valor dañado abre en Inicio sin errores', ttl(pg) == 'Inicio' and errs == [], (ttl(pg), errs)); pg.close()
        pg = start(json.dumps({'t': now, 'tab': 'lists', 'listId': 'no-existe', 'listSub': 'raro', 'noteGroup': 'tampoco', 'scroll': -50}))
        check('con ids que ya no existen abre la sección sin esa lista y sin errores', ttl(pg) == 'Listas' and pg.locator('[data-act=list-back]').count() == 0 and errs == [], (ttl(pg), errs)); pg.close()
        pg = start(json.dumps({'t': now, 'tab': 'money'}), 'http://localhost:8765/?text=hola%20mundo')
        check('lo compartido desde otra app gana: abre en Inicio con la nota guardada', ttl(pg) == 'Inicio' and pg.evaluate("import('/js/state.js').then(st => st.S.inbox.some(q => q.text.includes('hola mundo')))"), ttl(pg))
        check('tocar «Inicio» sigue funcionando tras restaurar', (ir(pg, 'money'), ir(pg, 'home'), ttl(pg))[-1] == 'Inicio'); pg.close()

        # ---- en una pestaña normal del navegador (no instalada) no se restaura
        ctx2 = b.new_context(viewport={'width':390,'height':800})
        q = ctx2.new_page(); q.goto('http://localhost:8765/'); q.wait_for_selector('#view .home')
        q.evaluate("([k, v]) => localStorage.setItem(k, v)", [KEY, json.dumps({'t': q.evaluate('Date.now()'), 'tab': 'money'})])
        q.reload(); q.wait_for_selector('#topbar h1'); q.wait_for_timeout(200)
        check('fuera de la app instalada (pestaña normal) abre en Inicio', q.locator('#topbar h1').inner_text().strip() == 'Inicio')
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
