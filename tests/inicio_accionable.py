"""Inicio accionable con muchos hábitos: franja de resumen, «Hoy» con pendientes primero, pulsación larga = «no toca», tareas y Bandeja plegada."""
import os, sys, tempfile, json, datetime
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
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

# ---- datos: 15 hábitos (de día y de noche; pendientes los i%3==0 → 5, hechos 10), 5 tareas de hoy, 5 notas rápidas y 2 pagos vencidos
T = datetime.date.today().isoformat()
HAB = [(f'h{i}', f'Hábito {i}', 'day' if i < 8 else 'night') for i in range(15)]
data = {'app':'tracker','version':3,'exportedAt':'2026-01-01T00:00:00Z','settings':{},
  'habits':[{'id':i,'name':n,'color':'blue','dates':({} if k % 3 == 0 else {T:1}),'icon':'drop','slot':s,'order':k} for k,(i,n,s) in enumerate(HAB)],
  'accounts':[],'moves':[],'purchases':[],'templates':[],'noteGroups':[],'notes':[],'routines':[],'workouts':[],'exercises':[],
  'inbox':[{'id':f'n{k}','text':f'Nota {k}','t':k} for k in range(5)],
  'bills':[{'id':f'b{k}','title':t,'amount':100,'freq':'monthly','day':1,'start':'2026-01-01','active':True,'paid':{}} for k,t in enumerate(['Internet','Luz'])],
  'lists':[{'id':'l1','name':'Mudanza','tplId':None,'color':'blue','created':T,'t':1,'items':[{'id':f'i{k}','text':f'Tarea {k}','done':False,'due':T} for k in range(5)]}]}
FILE = os.path.join(tempfile.mkdtemp(), 'respaldo.json'); open(FILE, 'w').write(json.dumps(data))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800})
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')

        # ---- estados vacíos (sin datos)
        check('sin hábitos: invita a crear el primero', 'Crea tu primer hábito' in page.locator('#today-habits').inner_text() and page.locator('#today-habits [data-act=new-habit]').count() == 1)
        check('sin tareas: «Nada pendiente para hoy.»', 'Nada pendiente para hoy.' in page.locator('#view .home').inner_text())

        ir(page, 'data'); page.set_input_files('#file', FILE); page.wait_for_timeout(900)
        ir(page, 'home'); page.wait_for_selector('#today-habits .th-row')
        txt = lambda sel: page.locator(sel).inner_text().replace('\n', ' ').strip()
        rows = lambda: page.locator('#today-habits .th-row').count()
        pressed = lambda i: page.locator(f'#today-habits [data-id={i}]').get_attribute('aria-pressed')
        head = lambda: page.locator('#today-habits .th-count').inner_text().strip()
        foot = lambda: page.locator('#today-habits .th-more').inner_text().replace('\n', ' ').strip()
        same = "window.__ref.isConnected && window.__ref === document.querySelector('.home-top h2')"

        # ---- franja de resumen
        chips = page.locator('.home-sum .home-chip')
        check('la franja de resumen tiene 3 chips: Hábitos, Tareas y Pagos', chips.count() == 3 and 'Hábitos' in chips.nth(0).inner_text() and 'Tareas' in chips.nth(1).inner_text())
        check('el chip de hábitos dice 10/15 y el de tareas 5', '10/15' in chips.nth(0).inner_text() and '5' in chips.nth(1).inner_text(), chips.all_inner_texts())
        check('el chip de pagos dice «2» y «vencidos»', '2' in chips.nth(2).inner_text() and 'vencidos' in chips.nth(2).inner_text(), chips.nth(2).inner_text())
        check('la franja va justo bajo el saludo y «Hoy» después', page.evaluate("[...document.querySelector('.home').children].slice(1, 3).map(e => e.className.split(' ')[0] + '|' + e.id)") == ['home-sum|', 'card|today-habits'])

        # ---- «Hoy»: solo lo pendiente; lo hecho, plegado
        check('«Hoy» muestra solo los 5 pendientes', rows() == 5 and head() == 'Faltan 5', (rows(), head()))
        check('el pie dice «10 hechos» y está plegado', '10 hechos' in foot() and page.locator('#today-habits .th-more').get_attribute('aria-expanded') == 'false')
        h = page.evaluate("document.querySelector('.home').getBoundingClientRect().height")
        check('con 15 hábitos Inicio mide menos de 1,7 pantallas (antes 2,4)', h < 1360, h)
        page.click('#today-habits .th-more'); page.wait_for_timeout(80)
        check('el pie despliega los hechos en el sitio (15 filas)', rows() == 15 and page.locator('#today-habits .th-more').get_attribute('aria-expanded') == 'true')
        page.click('#today-habits .th-more'); page.wait_for_timeout(80)
        check('y los vuelve a plegar', rows() == 5)

        # ---- los pendientes también se pliegan (como los hechos)
        tog = page.locator('#today-habits .th-toggle')
        check('el encabezado «Faltan 5» es un botón que pliega los pendientes', tog.count() == 1 and tog.get_attribute('aria-expanded') == 'true')
        tog.click(); page.wait_for_timeout(80)
        check('plegados: no se ve ningún pendiente pero el encabezado, la barra y «10 hechos» siguen', rows() == 0 and head() == 'Faltan 5' and '10 hechos' in foot() and tog.get_attribute('aria-expanded') == 'false', (rows(), head()))
        h2 = page.evaluate("document.querySelector('.home').getBoundingClientRect().height")
        check('con los pendientes plegados Inicio mide menos de 1,2 pantallas', h2 < 960, h2)
        tog.click(); page.wait_for_timeout(80)
        check('al desplegar vuelven los 5 pendientes', rows() == 5 and tog.get_attribute('aria-expanded') == 'true')

        # ---- un toque: hecho ↔ pendiente, en el sitio
        page.evaluate("window.__ref = document.querySelector('.home-top h2'); window.scrollTo(0, 40)")
        y0 = page.evaluate("scrollY")
        page.click('#today-habits [data-id=h0]'); page.wait_for_timeout(120)
        check('un toque marca el hábito y la fila se queda donde está', pressed('h0') == 'true' and rows() == 5)
        check('baja a «Faltan 4» y el pie a «11 hechos»', head() == 'Faltan 4' and '11 hechos' in foot(), (head(), foot()))
        check('no se repinta la pantalla ni se mueve el scroll', page.evaluate(same) and page.evaluate("scrollY") == y0)
        page.click('#today-habits [data-id=h0]'); page.wait_for_timeout(120)
        check('otro toque lo deja pendiente otra vez (nunca «no toca»)', pressed('h0') == 'false' and head() == 'Faltan 5')
        page.click('#today-habits [data-id=h0]'); page.wait_for_timeout(120)
        page.reload(); page.wait_for_selector('#today-habits .th-row')
        check('al recargar lo hecho ya está plegado y el cambio persiste', rows() == 4 and head() == 'Faltan 4' and '11 hechos' in foot(), (rows(), head()))

        # ---- pulsación larga = «no toca»
        box = page.locator('#today-habits [data-id=h3]').bounding_box(); cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(cx, cy); page.mouse.down(); page.wait_for_timeout(700); page.mouse.up(); page.wait_for_timeout(150)
        check('la pulsación larga marca «no toca» (y el clic que sigue no la deshace)', pressed('h3') == 'mixed', pressed('h3'))
        check('un «no toca» no cuenta: «Faltan 3»', head() == 'Faltan 3', head())
        check('avisa con un mensaje', 'no toca' in page.locator('#toast').inner_text())
        page.mouse.move(cx, cy); page.mouse.down(); page.wait_for_timeout(700); page.mouse.up(); page.wait_for_timeout(150)
        check('otra pulsación larga lo quita', pressed('h3') == 'false' and head() == 'Faltan 4', (pressed('h3'), head()))
        ir(page, 'home')
        check('al volver a tocar Inicio se ordena: lo recién hecho baja al pie', rows() == 4 and '11 hechos' in foot(), (rows(), foot()))

        # ---- tareas de hoy
        check('«Tareas de hoy» muestra 3 y «Ver 2 más»', page.locator('#today-tasks .trow').count() == 3 and 'Ver 2 más' in txt('#today-tasks'), txt('#today-tasks'))
        check('el contador de tareas dice 5', page.locator('#today-tasks .count').inner_text().strip() == '5')
        page.evaluate("window.__ref = document.querySelector('.home-top h2')")
        page.click('#today-tasks .trow >> nth=0 >> .chk'); page.wait_for_timeout(120)
        check('marcar una tarea la tacha, baja el contador a 4 y no repinta', page.locator('#today-tasks .trow.done').count() == 1 and page.locator('#today-tasks .count').inner_text().strip() == '4' and page.evaluate(same))

        # ---- Bandeja plegada por defecto
        check('la Bandeja está plegada: una línea con «5 pendientes»', page.locator('.inbox-fold').count() == 1 and '5 pendientes' in txt('.inbox-fold') and page.locator('.qn').count() == 0, txt('.inbox-fold') if page.locator('.inbox-fold').count() else '')
        page.click('.inbox-fold'); page.wait_for_timeout(100)
        check('al tocarla se despliegan las notas', page.locator('.qn').count() == 5)
        page.reload(); page.wait_for_selector('#today-habits .th-row')
        check('queda desplegada al recargar (se recuerda)', page.locator('.qn').count() == 5)
        page.click('[data-act=inbox-fold]'); page.wait_for_timeout(100)
        check('y se vuelve a plegar', page.locator('.qn').count() == 0 and page.locator('.inbox-fold').count() == 1)

        # ---- accesos, colores y navegación desde la franja
        check('Gasto, Ingreso y Mover siguen a un toque, en una fila', all(page.locator(f'.home [data-act={a}]').count() == 1 for a in ('new-exp','new-inc','new-xfer')) and page.locator('.home-line, .tile').count() == 0)
        sec = page.evaluate("""() => { const r = t => getComputedStyle(document.documentElement).getPropertyValue(t).trim(); const g = s => getComputedStyle(document.querySelector(s)).getPropertyValue('--sec').trim();
          return [g('#today-habits') === r('--yellow'), g('#today-tasks') === r('--blue')]; }""")
        check('cada bloque lleva el color de su sección (hábitos ámbar, tareas azul)', sec == [True, True], sec)
        page.click('.home-sum .home-chip >> nth=0'); page.wait_for_timeout(100)
        check('el chip de hábitos lleva a Hábitos', page.locator('#topbar h1').inner_text() == 'Hábitos')
        ir(page, 'home'); page.click('.home-sum .home-chip >> nth=1'); page.wait_for_timeout(100)
        check('el chip de tareas lleva a Listas › Agenda', page.locator('#topbar h1').inner_text() == 'Listas' and 'on' in page.locator('[data-act=list-sub][data-sub=agenda]').get_attribute('class'))
        ir(page, 'home'); page.click('.home-sum .home-chip >> nth=2'); page.wait_for_timeout(100)
        check('el chip de pagos lleva a Finanzas › Pagos', page.locator('#topbar h1').inner_text() == 'Pagos')
        ir(page, 'home')

        # ---- respaldos viejos y fuente ancha
        page.evaluate("import('/js/state.js').then(async st => { st.S.settings.homeOrder = ['quote','quick','tiles','inbox','tasks']; st.S.settings.tileOrder = ['gym','habits','bills','actions']; await st.saveSettings(); })")
        page.reload(); page.wait_for_selector('#today-habits .th-row')
        check('con un orden guardado antiguo Inicio abre y «Hoy» sigue bajo la franja', page.evaluate("document.querySelector('.home').children[2].id") == 'today-habits' and page.locator('.tile-acts').count() == 1)
        for f in ('system', 'jetbrains'):
            page.evaluate(f"document.documentElement.dataset.font='{f}'"); page.wait_for_timeout(80)
            check(f'sin desborde horizontal a 390 px ({f})', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        page.evaluate("document.documentElement.dataset.font='system'")
        page.screenshot(path=OUT+'inicio_accionable.png', full_page=True)
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
