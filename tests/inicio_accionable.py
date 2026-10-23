"""Inicio accionable: hábitos y tareas de hoy se marcan en el sitio (sin repintar), pagos y accesos en una línea, sin tarjeta de Ejercicio."""
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

# ---- datos: 6 hábitos en 3 momentos (todos hechos hoy salvo «Meditar»), 2 tareas con fecha de hoy y 2 pagos vencidos
T = datetime.date.today().isoformat()
HAB = [('h0','Tomar agua','morning'),('h1','Leer','night'),('h2','Estirar','morning'),('h3','Gimnasio','day'),('h4','Meditar','morning'),('h5','Sin azúcar','day')]
data = {'app':'tracker','version':3,'exportedAt':'2026-01-01T00:00:00Z','settings':{},
  'habits':[{'id':i,'name':n,'color':'blue','dates':({} if i == 'h4' else {T:1}),'icon':'drop','slot':s,'order':k} for k,(i,n,s) in enumerate(HAB)],
  'accounts':[],'moves':[],'purchases':[],'templates':[],'noteGroups':[],'notes':[],'inbox':[],'routines':[],'workouts':[],'exercises':[],
  'bills':[{'id':f'b{k}','title':t,'amount':100,'freq':'monthly','day':1,'start':'2026-01-01','active':True,'paid':{}} for k,t in enumerate(['Internet','Luz'])],
  'lists':[{'id':'l1','name':'Mudanza','tplId':None,'color':'blue','created':T,'t':1,
            'items':[{'id':'i1','text':'Cajas','done':False,'due':T},{'id':'i2','text':'Contratar flete','done':False,'due':T},{'id':'i3','text':'Más adelante','done':False,'due':'2099-01-01'}]}]}
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
        ir(page, 'home'); page.wait_for_selector('#today-habits .dot')
        home = lambda: page.locator('#view .home').inner_text()
        counter = lambda: page.locator('#today-habits .th-count').inner_text().strip()
        pressed = lambda i: page.locator(f'#today-habits [data-id={i}]').get_attribute('aria-pressed')

        # ---- Hoy: todos los hábitos a la vez
        check('«Hoy» muestra los 6 hábitos a la vez', page.locator('#today-habits .dot').count() == 6)
        check('«Hoy» queda justo bajo el saludo', page.evaluate("document.querySelector('.home').children[1].id") == 'today-habits')
        check('el contador dice «5 de 6»', counter() == '5 de 6', counter())
        check('el orden sigue los momentos del día (mañana, día, noche)', page.evaluate("[...document.querySelectorAll('#today-habits .th-name')].map(e => e.textContent.trim())") == ['Tomar agua','Estirar','Meditar','Gimnasio','Sin azúcar','Leer'])

        # ---- marcar en el sitio: sin repintar y sin mover el scroll
        page.evaluate("window.__ref = document.querySelector('.home-top h2'); window.scrollTo(0, 40)")
        y0 = page.evaluate("scrollY")
        page.click('#today-habits [data-id=h4]'); page.wait_for_timeout(120)
        check('un toque marca el hábito y el contador pasa a «6 de 6»', pressed('h4') == 'true' and counter() == '6 de 6', (pressed('h4'), counter()))
        check('no se repinta la pantalla (el saludo sigue siendo el mismo nodo)', page.evaluate("window.__ref.isConnected && window.__ref === document.querySelector('.home-top h2')"))
        check('el scroll no se mueve', page.evaluate("scrollY") == y0, (y0, page.evaluate("scrollY")))
        page.reload(); page.wait_for_selector('#today-habits .dot')
        check('el cambio sobrevive a recargar', pressed('h4') == 'true' and counter() == '6 de 6')
        page.click('#today-habits [data-id=h4]'); page.wait_for_timeout(120)
        check('el segundo toque lo pasa a «no toca» y no cuenta en el total («5 de 5»)', pressed('h4') == 'mixed' and counter() == '5 de 5', (pressed('h4'), counter()))
        page.click('#today-habits [data-id=h4]'); page.wait_for_timeout(120)
        check('el tercer toque lo deja sin marcar («5 de 6»)', pressed('h4') == 'false' and counter() == '5 de 6', (pressed('h4'), counter()))
        ir(page, 'habits')
        check('Hábitos ve lo mismo que Inicio (un solo camino de escritura)', page.locator('#view').inner_text().count('Hoy 5/6') == 1, page.locator('#view').inner_text()[:80])
        ir(page, 'home'); page.wait_for_selector('#today-habits .dot')

        # ---- tareas de hoy
        check('«Tareas de hoy» lista las 2 con fecha de hoy', page.locator('#today-tasks .trow').count() == 2 and 'Más adelante' not in page.locator('#today-tasks').inner_text())
        check('el contador de tareas dice 2', page.locator('#today-tasks .count').inner_text().strip() == '2')
        page.evaluate("window.__ref = document.querySelector('.home-top h2')")
        page.click('#today-tasks .trow >> nth=0 >> .chk'); page.wait_for_timeout(120)
        check('marcar una tarea la tacha y baja el contador sin repintar', page.locator('#today-tasks .trow.done').count() == 1 and page.locator('#today-tasks .count').inner_text().strip() == '1'
              and page.evaluate("window.__ref.isConnected && window.__ref === document.querySelector('.home-top h2')"))
        page.reload(); page.wait_for_selector('#today-habits .dot')
        check('la tarea hecha persiste y ya no aparece pendiente', page.locator('#today-tasks .trow').count() == 1)

        # ---- pagos, accesos y lo que ya no está
        line = page.locator('.home-line')
        check('los pagos vencidos van en una línea', line.count() == 1 and 'vencid' in line.inner_text(), line.inner_text() if line.count() else '')
        check('Gasto, Ingreso y Mover siguen a un toque', all(page.locator(f'.home [data-act={a}]').count() == 1 for a in ('new-exp','new-inc','new-xfer')))
        check('ya no hay tarjeta de Ejercicio', page.locator('[data-act=home-gym]').count() == 0 and 'Ejercicio' not in home())
        check('ya no hay tarjeta de Hábitos aparte', page.locator('.tile').count() == 0)
        check('la frase sigue al final y es discreta', page.evaluate("(() => { const k = [...document.querySelector('.home').children]; return k[k.length - 1].classList.contains('home-quote'); })()"))
        page.click('.home-line'); page.wait_for_timeout(120)
        check('tocar los pagos lleva a Finanzas › Pagos', page.locator('#topbar h1').inner_text() == 'Pagos')
        ir(page, 'home')

        # ---- respaldos viejos: homeOrder/tileOrder con claves que ya no existen
        page.evaluate("import('/js/state.js').then(async st => { st.S.settings.homeOrder = ['quote','quick','tiles','inbox','tasks']; st.S.settings.tileOrder = ['gym','habits','bills','actions']; await st.saveSettings(); })")
        page.reload(); page.wait_for_selector('#today-habits .dot')
        check('con un orden guardado antiguo Inicio abre y «Hoy» sigue bajo el saludo', page.evaluate("document.querySelector('.home').children[1].id") == 'today-habits' and page.locator('.home-line').count() == 1)
        check('sin desborde horizontal a 390 px', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        page.screenshot(path=OUT+'inicio_accionable.png', full_page=True)
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
