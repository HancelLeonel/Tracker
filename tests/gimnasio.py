"""Gimnasio: rutinas, entrenamiento en curso, descanso entre series (reloj simulado), historial, progreso, respaldo y datos raros."""
import os, sys, tempfile, json
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
# Vibración y pantalla encendida simuladas para poder comprobarlas.
STUBS = """
window.__vib = []; navigator.vibrate = p => (window.__vib.push(p), true);
window.__wl = 0;
Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl++; return { release: async () => {}, addEventListener() {} }; } } });
"""
T0 = 1_700_000_000  # Playwright (Python) recibe segundos desde 1970
URL = 'http://localhost:8765/'
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.add_init_script(STUBS)
        page.clock.install(time=T0)
        page.goto(URL); page.wait_for_selector('#view .home')
        page.clock.pause_at(T0 + 10)
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(120)
        txt = lambda: page.locator('#view').inner_text()
        def go(tab): ir(page, tab); page.wait_for_timeout(80)
        def gsub(k): page.click(f'[data-act=gym-sub][data-sub={k}]'); page.wait_for_timeout(80)
        def run_for(ms): page.clock.run_for(ms); page.wait_for_timeout(60)
        rest = lambda: page.locator('[data-rest-clock]').first.inner_text().strip() if page.locator('.rest-bar').count() else None
        W = lambda: page.evaluate("import('/js/state.js').then(m => JSON.parse(JSON.stringify(m.S.workouts)))")
        card = lambda n: page.locator('.gx').nth(n)
        rows = lambda n: card(n).locator('.gx-set')
        def mark(c, r, weight=None, reps=None):
            row = rows(c).nth(r)
            if weight is not None: row.locator('input').nth(0).fill(str(weight))
            if reps is not None: row.locator('input').nth(1).fill(str(reps))
            row.locator('.set-chk').click(); page.wait_for_timeout(80)
        def routine(name, exs):  # exs: (ejercicio del catálogo, series, repeticiones, peso, descanso)
            page.click('[data-act=new-routine] >> nth=0'); dlg.locator('[name=name]').fill(name)
            for i, (ex, sets, reps, weight, rest) in enumerate(exs):
                if i: dlg.locator('#rx-add').click()
                row = dlg.locator('.rx').nth(i)
                row.locator('select').select_option(ex)
                row.locator('[data-k=sets]').fill(str(sets)); row.locator('[data-k=reps]').fill(str(reps))
                if weight: row.locator('[data-k=weight]').fill(str(weight))
                if rest is not None: row.locator('[data-k=rest]').fill(str(rest))
            save()
        rx_rows = lambda: dlg.locator('.rx').evaluate_all("l => l.map(r => [r.querySelector('select').value, ...[...r.querySelectorAll('input')].map(i => i.value)])")

        # ---- base v7 y viewport que deja subir la hoja con el teclado
        v = page.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('mi-quincena'); q.onsuccess = () => r(q.result); });
          return { v: db.version, s: [...db.objectStoreNames] }; }""")
        check('la base es v8 y tiene los almacenes routines, workouts y exercises', v['v']==8 and all(x in v['s'] for x in ('routines','workouts','exercises')), v)
        check('el viewport usa interactive-widget=resizes-content (el teclado no tapa las hojas)', 'interactive-widget=resizes-content' in page.locator('meta[name=viewport]').get_attribute('content'))

        # ---- vacío
        go('gym')
        check('Gimnasio: título, cuatro secciones y estado vacío', page.locator('#topbar h1').inner_text()=='Gimnasio' and page.locator('.seg button').all_inner_texts()==['Entrenar','Rutinas','Historial','Progreso'] and 'Aún no tienes rutinas' in txt(), txt()[:200])
        gsub('history'); check('historial vacío', 'Aquí aparecerán tus entrenamientos' in txt())
        gsub('progress'); check('progreso vacío', 'cómo avanzas' in txt())

        # ---- configuración
        gsub('train'); page.click('[data-act=gym-cfg]')
        check('configuración: kg y 90 s por omisión', dlg.locator('[name=unit]').input_value()=='kg' and dlg.locator('[name=rest]').input_value()=='90')
        dlg.locator('[name=unit]').select_option('lb'); dlg.locator('[name=rest]').fill('30'); save()
        page.click('[data-act=gym-cfg]')
        check('la configuración se guarda', dlg.locator('[name=unit]').input_value()=='lb' and dlg.locator('[name=rest]').input_value()=='30')
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)

        # ---- rutinas
        gsub('routines'); check('con la sección Rutinas el + de la barra crea rutinas', page.locator('#topbar [data-act=new-routine]').count()==1)
        routine('Pecho', [('Press de banca', 4, 10, 60, 45), ('Fondos en paralelas', 3, 12, None, None), ('Curl con barra', 3, 10, None, None)])
        c = page.locator('.habit').first.inner_text()
        check('tarjeta de rutina: 3 ejercicios y 10 series', 'Pecho' in c and '3 ejercicios' in c and '10 series' in c and 'Press de banca' in c, c)
        page.click('[data-act=edit-routine]')
        check('al editar, cada fila trae su ejercicio, series, repeticiones, peso y descanso', rx_rows()==[['Press de banca','4','10','60','45'],['Fondos en paralelas','3','12','',''],['Curl con barra','3','10','','']], rx_rows())
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)
        page.click('[data-act=new-routine] >> nth=0'); dlg.locator('[name=name]').fill('Vacía'); dlg.locator('button.primary').click(); page.wait_for_timeout(100)
        check('una rutina con una fila sin ejercicio elegido no se guarda (el diálogo sigue abierto)', page.evaluate("document.querySelector('#dlg').open") and page.locator('.habit').count()==1)
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)

        # ---- empezar: se copia la rutina
        gsub('train'); page.click('[data-act=start-routine]'); page.wait_for_timeout(120)
        check('entrenamiento en curso: 3 ejercicios con 4, 3 y 3 series', page.locator('.gx').count()==3 and [rows(i).count() for i in range(3)]==[4,3,3] and '0/10 series' in txt(), txt()[:200])
        check('el peso de la rutina llega a las series y las repeticiones también', rows(0).nth(0).locator('input').nth(0).input_value()=='60' and rows(0).nth(0).locator('input').nth(1).input_value()=='10' and rows(1).nth(0).locator('input').nth(0).input_value()=='', rows(0).nth(0).locator('input').nth(0).input_value())
        check('con un entrenamiento en curso no se ofrece empezar otro', page.locator('[data-act=start-routine]').count()==0 and page.locator('[data-act=start-empty]').count()==0)
        gsub('routines'); check('en Rutinas se avisa que hay uno en curso', 'Termina el entrenamiento en curso' in txt() and page.locator('[data-act=start-routine]').count()==0); gsub('train')
        check('las casillas de marcar miden al menos 44 px', page.locator('.set-chk').first.bounding_box()['height']>=44)
        page.screenshot(path=OUT+'g_activo.png', full_page=True)

        # ---- marcar una serie: lo escrito se guarda aunque se toque la casilla de inmediato
        mark(0, 0, weight=62.5, reps=8)
        w = W()[0]
        check('marcar guarda el peso y las repeticiones escritos y la hora', w['exercises'][0]['sets'][0]=={'reps':8,'weight':62.5,'done':True,'at':w['exercises'][0]['sets'][0]['at']} and w['exercises'][0]['sets'][0]['at']>0, w['exercises'][0]['sets'][0])
        check('al marcar empieza el descanso del ejercicio (45 s) y se mantiene la pantalla encendida', rest()=='00:45' and page.evaluate('window.__wl')>=1, rest())
        check('el avance se actualiza', '1/10 series' in txt() and card(0).locator('.gx-h small').inner_text()=='1/4')
        run_for(10_000); check('el descanso corre', rest()=='00:35', rest())
        page.click('[data-act=gym-rest-more]'); page.wait_for_timeout(60); check('+15 s', rest()=='00:50', rest())
        page.click('[data-act=gym-rest-less]'); page.wait_for_timeout(60); check('−15 s', rest()=='00:35', rest())
        check('el descanso queda fijo bajo la barra superior', page.evaluate("getComputedStyle(document.querySelector('.rest-bar')).position")=='sticky')
        page.screenshot(path=OUT+'g_descanso.png', full_page=False)
        run_for(36_000)
        check('al terminar el descanso: desaparece, suena (vibra) y avisa', rest() is None and len(page.evaluate('window.__vib'))==1 and 'Descanso terminado' in page.locator('#toast').inner_text(), (rest(), page.evaluate('window.__vib')))
        mark(0, 1); check('otra serie: descanso de nuevo', rest()=='00:45', rest())
        page.click('[data-act=gym-rest-skip]'); page.wait_for_timeout(60)
        check('«Saltar» quita el descanso sin sonar', rest() is None and len(page.evaluate('window.__vib'))==1)
        mark(1, 0); check('un ejercicio sin descanso propio usa el predeterminado (30 s)', rest()=='00:30', rest())
        mark(1, 0); check('desmarcar una serie no inicia ni quita el descanso', rest()=='00:30' and '2/10 series' in txt(), (rest(), txt()[:120]))
        mark(1, 1, weight=25, reps=12)  # esta sí se queda marcada: de aquí saldrá el peso de «la última vez»

        # ---- escribir sin marcar guarda sin repintar
        inp = rows(2).nth(0).locator('input').nth(0); inp.fill('15'); inp.blur(); page.wait_for_timeout(120)
        check('un cambio de peso se guarda sin marcar la serie', W()[0]['exercises'][2]['sets'][0]['weight']==15 and not W()[0]['exercises'][2]['sets'][0]['done'])

        # ---- series y ejercicios
        card(2).locator('[data-act=gym-add-set]').click(); page.wait_for_timeout(80)
        check('«+ Serie» agrega una serie copiando la anterior', rows(2).count()==4 and rows(2).nth(3).locator('input').evaluate_all('l => l.map(i => i.value)')==rows(2).nth(2).locator('input').evaluate_all('l => l.map(i => i.value)'), rows(2).count())
        card(2).locator('[data-act=gym-ex-opts]').click()
        dlg.locator('[name=name]').select_option('Curl martillo'); dlg.locator('[name=sets]').fill('2'); dlg.locator('[name=rest]').fill('0'); save()
        check('opciones: renombrar, bajar a 2 series y sin descanso', page.locator('.gx-name').nth(2).inner_text()=='Curl martillo' and rows(2).count()==2)
        page.click('[data-act=gym-rest-skip]'); page.wait_for_timeout(60)
        mark(2, 1); check('con descanso 0 no empieza el descanso', rest() is None, rest())
        page.click('[data-act=gym-add-ex]')
        check('el ejercicio se elige del catálogo (lista, sin texto libre)', dlg.locator('select[name=name] option').count()>=60 and dlg.locator('input[name=name]').count()==0)
        dlg.locator('[name=name]').select_option('Press de banca inclinado'); dlg.locator('[name=sets]').fill('2'); dlg.locator('[name=reps]').fill('12'); save()
        check('agregar un ejercicio al entrenamiento', page.locator('.gx').count()==4 and page.locator('.gx-name').nth(3).inner_text()=='Press de banca inclinado' and rows(3).count()==2)
        card(3).locator('[data-act=gym-ex-opts]').click(); dlg.locator('#del').click(); page.wait_for_timeout(120)
        check('quitar un ejercicio', page.locator('.gx').count()==3)

        # ---- terminar: las series sin marcar no se guardan
        page.click('[data-act=gym-finish]'); page.wait_for_timeout(200)
        check('al terminar pasa al Historial con el entrenamiento', 'Pecho' in txt() and page.locator('.list-card').count()==1 and rest() is None, txt()[:200])
        wk = W()[0]
        n_sets = sum(len(e['sets']) for e in wk['exercises'])
        check('solo se guardan las series marcadas (y los ejercicios que quedan con alguna)', 'end' in wk and n_sets==4 and all(s['done'] for e in wk['exercises'] for s in e['sets']), [(e['name'], len(e['sets'])) for e in wk['exercises']])
        c = page.locator('.list-card').inner_text()
        vol = 62.5*8 + 60*10 + 25*12
        check('tarjeta: ejercicios, series y volumen', '3 ejercicios' in c and '4 series' in c and f'{round(vol):,}' in c, c)
        page.screenshot(path=OUT+'g_historial.png', full_page=True)

        # ---- segundo entrenamiento: prellenado con la última vez y récord
        gsub('train')
        check('Entrenar muestra el resumen de la semana', page.locator('.summary b').first.inner_text()=='1' and 'Hoy' in page.locator('.summary').inner_text(), page.locator('.summary').inner_text())
        page.click('[data-act=start-routine]'); page.wait_for_timeout(120)
        check('muestra «Última vez» con las series anteriores', 'Última vez: 62.5 lb × 8' in card(0).inner_text(), card(0).inner_text()[:200])
        check('el peso de la rutina manda; sin peso en la rutina se usa el de la última vez', rows(0).nth(0).locator('input').nth(0).input_value()=='60' and rows(1).nth(0).locator('input').nth(0).input_value()=='25' and 'Última vez: 25 lb × 12' in card(1).inner_text(), (rows(0).nth(0).locator('input').nth(0).input_value(), rows(1).nth(0).locator('input').nth(0).input_value()))
        mark(0, 0, weight=70, reps=10)
        check('un peso mayor al mejor anterior avisa el récord', 'Nuevo récord en Press de banca: 70 lb' in page.locator('#toast').inner_text(), page.locator('#toast').inner_text())
        page.click('[data-act=gym-rest-skip]'); page.wait_for_timeout(60)
        page.click('[data-act=gym-finish]'); page.wait_for_timeout(200)
        check('el historial muestra los dos, el más reciente primero', page.locator('.list-card').count()==2)

        # ---- progreso
        gsub('progress')
        names = page.locator('.list-card b').all_inner_texts()
        check('progreso: un ejercicio por tarjeta, en orden alfabético', names==sorted(names, key=str.lower) and 'Press de banca' in names, names)
        page.locator('.list-card:has-text("Press de banca")').click(); page.wait_for_timeout(100)
        check('detalle: mejor serie, gráfica de 2 sesiones y tabla', '70 lb × 10' in dlg.inner_text() and dlg.locator('.spark .col').count()==2 and dlg.locator('.moves li').count()==2, dlg.inner_text()[:200])
        page.screenshot(path=OUT+'g_progreso.png')
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)

        # ---- detalle de un entrenamiento, guardar como rutina, eliminar
        gsub('history'); page.locator('.list-card').first.click(); page.wait_for_timeout(100)
        check('detalle del entrenamiento con sus series', 'Press de banca' in dlg.inner_text() and '70 lb × 10' in dlg.inner_text())
        dlg.locator('[data-act=workout-to-routine]').click(); page.wait_for_timeout(100)
        check('«Guardar como rutina» abre el formulario con los ejercicios', rx_rows()[0]==['Press de banca','1','10','70',''], rx_rows())
        dlg.locator('[name=name]').fill('Pecho copia'); save()
        gsub('routines'); check('la nueva rutina aparece', page.locator('.habit').count()==2)
        gsub('history'); page.locator('.list-card').first.click(); page.wait_for_timeout(100); dlg.locator('#del').click(); page.wait_for_timeout(150)
        check('eliminar un entrenamiento del historial', page.locator('.list-card').count()==1)

        # ---- entrenamiento libre y descartar
        gsub('train'); page.click('[data-act=start-empty]'); page.wait_for_timeout(100)
        check('entrenamiento libre: sin ejercicios, se pueden agregar', 'Aún no hay ejercicios' in txt() and page.locator('[data-act=gym-add-ex]').count()==1)
        page.click('[data-act=gym-discard]'); page.wait_for_timeout(120)
        check('descartar no guarda nada', len(W())==1 and page.locator('[data-act=start-empty]').count()==1)
        page.click('[data-act=start-empty]'); page.wait_for_timeout(80); page.click('[data-act=gym-finish]'); page.wait_for_timeout(120)
        check('terminar sin series marcadas lo descarta', len(W())==1)

        # ---- sin desborde horizontal con las dos fuentes
        page.click('[data-act=start-routine] >> nth=0'); page.wait_for_timeout(100)
        for f in ('system','jetbrains'):
            page.evaluate(f"document.documentElement.dataset.font='{f}'"); page.wait_for_timeout(80)
            check(f'sin desborde horizontal en 390 px ({f})', page.evaluate("document.documentElement.scrollWidth")<=390, page.evaluate("document.documentElement.scrollWidth"))
        page.screenshot(path=OUT+'g_jetbrains.png', full_page=True)
        page.evaluate("document.documentElement.dataset.font='system'")
        page.click('[data-act=gym-discard]'); page.wait_for_timeout(120)

        # ---- respaldo: exportar, borrar todo, importar
        go('data')
        with page.expect_download() as dl: page.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        check('el respaldo incluye el catálogo', len(data['exercises'])>=60 and data['settings'].get('gymCatalogSeeded') is True)
        check('el respaldo incluye rutinas, entrenamientos y la configuración', len(data['routines'])==2 and len(data['workouts'])==1 and data['settings']['gym']['cfg']['unit']=='lb', (len(data['routines']), len(data['workouts'])))
        check('Configuración cuenta los entrenamientos', '1 entrenamiento' in txt())
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        go('gym'); gsub('routines'); check('borrar todo vacía rutinas', 'Aún no tienes rutinas' in txt()); gsub('history'); check('y el historial', 'Aquí aparecerán' in txt())
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); page.wait_for_timeout(800)
        go('gym'); gsub('routines'); n1 = page.locator('.habit').count(); gsub('history'); n2 = page.locator('.list-card').count()
        check('importar restaura rutinas y entrenamientos', n1==2 and n2==1, (n1, n2))

        # ---- respaldo con datos raros: se sanea
        weird = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],
          'settings': {'gym': {'cfg': {'unit': 'stone', 'rest': 99999}, 'rest': {'endsAt': 'ya', 'total': -3}}},
          'routines':[{'id':'r1','name':'Rara','color':'nope','exercises':[{'name':'Sentadilla','sets':500,'reps':-4,'weight':'mucho'},{'name':'  '},{'sets':3},{'name':'Remo','sets':3,'reps':8,'weight':20,'rest':'x'}]},
                      {'id':'r2','name':'Sin lista'}],
          'workouts':[{'id':'w1','name':'Viejo','date':'ayer','t':5,'exercises':[{'name':'Peso muerto','sets':[{'reps':5,'weight':100,'done':True,'at':'nunca'},None,{'reps':'x','weight':-9,'done':False}]},{'name':'Sin series'}]},
                      {'id':'w2','name':'En curso A','date':'2026-01-01','t':100,'exercises':[]},
                      {'id':'w3','name':'En curso B','date':'2026-01-02','t':200,'exercises':[]}]}
        # r2 no tiene `exercises`: el respaldo se rechaza entero con un mensaje claro
        Path(tempfile.gettempdir(), 'weird-gym.json').write_text(json.dumps(weird))
        msgs = []
        page.remove_listener('dialog', page.listeners('dialog')[0]) if False else None
        page.on('dialog', lambda d: msgs.append(d.message))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-gym.json')); page.wait_for_timeout(600)
        check('una rutina inválida rechaza el respaldo con un mensaje', any('rutina inválida' in m for m in msgs), msgs)
        weird['routines'].pop()
        Path(tempfile.gettempdir(), 'weird-gym.json').write_text(json.dumps(weird))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-gym.json')); page.wait_for_timeout(800)
        R = page.evaluate("import('/js/state.js').then(m => JSON.parse(JSON.stringify({ r: m.S.routines, w: m.S.workouts })))")
        r = R['r'][0]
        check('saneo de rutinas: color, series y repeticiones acotadas, ejercicios sin nombre fuera', r['color']=='mauve' and [e['name'] for e in r['exercises']]==['Sentadilla','Remo'] and r['exercises'][0]['sets']==20 and r['exercises'][0]['reps']==0 and r['exercises'][0]['weight']==0 and 'rest' not in r['exercises'][1], r)
        ws = {x['id']: x for x in R['w']}
        check('saneo de entrenamientos: fecha, series nulas y números inválidos', ws['w1']['date'] and ws['w1']['date']!='ayer' and len(ws['w1']['exercises'])==1 and len(ws['w1']['exercises'][0]['sets'])==2 and ws['w1']['exercises'][0]['sets'][1]=={'reps':0,'weight':0,'done':False} and 'at' not in ws['w1']['exercises'][0]['sets'][0], ws['w1'])
        check('solo queda un entrenamiento en curso (el más reciente)', [x['id'] for x in R['w'] if 'end' not in x and x['id'] in ('w2','w3')]==['w3'] and 'end' in ws['w2'], [(x['id'], 'end' in x) for x in R['w']])
        go('gym'); gsub('train')
        check('con ajustes raros la sección sigue abierta y los valores se corrigen', page.locator('.rest-bar').count()==0 and 'En curso B' in txt(), txt()[:150])
        page.click('[data-act=gym-cfg]')
        check('unidad inválida → kg y descanso acotado a 600', dlg.locator('[name=unit]').input_value()=='kg' and dlg.locator('[name=rest]').input_value()=='600', (dlg.locator('[name=unit]').input_value(), dlg.locator('[name=rest]').input_value()))
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)
        check('sin errores de consola', errs == [], errs)

        # ---- persistencia con tiempo real (contexto sin reloj simulado)
        ctx2 = b.new_context(viewport={'width':390,'height':800}, accept_downloads=True)
        q = ctx2.new_page(); errs2=[]
        q.on('pageerror', lambda e: errs2.append(str(e))); q.on('console', lambda m: errs2.append(m.text) if m.type=='error' else None)
        q.on('dialog', lambda d: d.accept())
        q.goto(URL); q.wait_for_selector('#view .home')
        qd = q.locator('#dlg')
        def go2(tab): ir(q, tab); q.wait_for_timeout(80)
        go2('gym'); q.click('[data-act=start-empty]'); q.wait_for_timeout(80)
        q.click('[data-act=gym-add-ex]'); qd.locator('[name=name]').select_option('Dominadas'); qd.locator('[name=sets]').fill('2'); qd.locator('button.primary').click(); q.wait_for_timeout(120)
        q.locator('.set-chk').first.click(); q.wait_for_timeout(1300)
        c1 = q.locator('[data-rest-clock]').first.inner_text().strip()
        q.reload(); q.wait_for_selector('#view .home'); go2('gym')
        c2 = q.locator('[data-rest-clock]').first.inner_text().strip() if q.locator('.rest-bar').count() else None
        check('al recargar el entrenamiento sigue en curso y el descanso continúa', q.locator('.gx').count()==1 and q.locator('.set-chk.on').count()==1 and bool(c2) and c2.startswith('01:2'), (c1, c2))
        # el descanso terminó mientras la app estaba cerrada: se quita sin sonar
        q.evaluate("""async () => { const st = await import('/js/state.js'); st.S.settings.gym.rest.endsAt = Date.now() - 5000; await st.saveSettings(); }""")
        q.reload(); q.wait_for_selector('#view .home'); go2('gym')
        check('si el descanso terminó con la app cerrada, desaparece sin avisar', q.locator('.rest-bar').count()==0 and q.locator('.gx').count()==1)
        check('sin errores de consola (tiempo real)', errs2 == [], errs2)
        print('errors:', errs + errs2); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
