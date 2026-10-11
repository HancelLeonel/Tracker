"""Gimnasio (segunda parte): cardio (tiempo · distancia), notas por serie, reordenar ejercicios y editar un entrenamiento terminado."""
import os, sys, tempfile, json
from datetime import date, timedelta
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
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
        txt = lambda: q.locator('#view').inner_text()
        is_open = lambda: q.evaluate("document.querySelector('#dlg').open")
        def go(tab): q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(80)
        def gsub(k): q.click(f'[data-act=gym-sub][data-sub={k}]'); q.wait_for_timeout(80)
        def save(): dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        W = lambda: q.evaluate("import('/js/state.js').then(m => JSON.parse(JSON.stringify(m.S.workouts)))")
        card = lambda n: q.locator('.gx').nth(n)
        rows = lambda n: card(n).locator('.gx-set')

        # ---- rutina con un ejercicio de cardio: la fila cambia de casillas
        go('gym'); gsub('routines'); q.click('#topbar [data-act=new-routine]'); q.wait_for_timeout(100)
        dlg.locator('[name=name]').fill('Mixta')
        row = dlg.locator('.rx').nth(0)
        check('una fila de fuerza pide reps y peso', row.locator('[data-k=reps]').count()==1 and row.locator('[data-k=weight]').count()==1 and row.locator('[data-k=min]').count()==0)
        row.locator('select').select_option('Caminadora'); q.wait_for_timeout(80)
        row = dlg.locator('.rx').nth(0)
        check('al elegir un ejercicio de cardio la fila pide minutos y kilómetros (y 1 serie)', row.locator('[data-k=min]').count()==1 and row.locator('[data-k=km]').count()==1 and row.locator('[data-k=reps]').count()==0 and row.locator('[data-k=sets]').input_value()=='1')
        row.locator('[data-k=min]').fill('20'); row.locator('[data-k=km]').fill('2.5')
        dlg.locator('#rx-add').click(); dlg.locator('.rx').nth(1).locator('select').select_option('Press de banca')
        dlg.locator('.rx').nth(1).locator('[data-k=weight]').fill('50')
        save()
        r = q.evaluate("import('/js/state.js').then(m => m.S.routines.find(r => r.name === 'Mixta'))")
        check('la rutina guarda el cardio con tiempo y distancia, y la fuerza con reps y peso', r['exercises'][0]=={'name':'Caminadora','sets':1,'cardio':True,'min':20,'km':2.5} and r['exercises'][1]['weight']==50 and 'min' not in r['exercises'][1], r)

        # ---- entrenamiento: casillas de cardio, sin descanso automático
        gsub('train'); q.click('[data-act=start-routine]'); q.wait_for_timeout(120)
        heads = card(0).locator('.gx-cols small').all_inner_texts()
        check('el cardio muestra «Tiempo (min)» y «Distancia (km)» con lo de la rutina', heads==['Tiempo (min)','Distancia (km)'] and rows(0).nth(0).locator('input').nth(0).input_value()=='20' and rows(0).nth(0).locator('input').nth(1).input_value()=='2.5', heads)
        check('las casillas de cardio aceptan decimales', rows(0).nth(0).locator('input').nth(1).get_attribute('inputmode')=='decimal')
        rows(0).nth(0).locator('input').nth(0).fill('22.5'); rows(0).nth(0).locator('.set-chk').click(); q.wait_for_timeout(100)
        check('marcar una serie de cardio guarda tiempo y distancia, y no inicia el descanso', W()[0]['exercises'][0]['sets'][0]['min']==22.5 and W()[0]['exercises'][0]['sets'][0]['done'] and q.locator('.rest-bar').count()==0, W()[0]['exercises'][0]['sets'][0])
        rows(1).nth(0).locator('.set-chk').click()
        try: q.wait_for_selector('.rest-bar', timeout=3000)
        except Exception: pass
        check('la fuerza sí inicia el descanso', q.locator('.rest-bar').count()==1, (q.locator('.gx-name').all_inner_texts(), [e['sets'][0].get('done') for e in W()[0]['exercises']], q.evaluate("import('/js/state.js').then(m => m.S.settings.gym)")))
        q.click('[data-act=gym-rest-skip]'); q.wait_for_timeout(60)

        # ---- notas por serie y reordenar
        card(1).locator('[data-act=gym-ex-opts]').click(); q.wait_for_timeout(100)
        check('las opciones traen una nota por serie', dlg.locator('.set-notes input').count()==3)
        dlg.locator('[name=note_0]').fill('agarre cerrado'); save()
        check('la nota se ve debajo de su serie', card(1).locator('.gx-note').inner_text()=='agarre cerrado' and W()[0]['exercises'][1]['sets'][0]['note']=='agarre cerrado')
        card(1).locator('[data-act=gym-ex-opts]').click(); q.wait_for_timeout(100)
        check('«Bajar» no está disponible para el último', dlg.locator('#ex-down').is_disabled() and not dlg.locator('#ex-up').is_disabled())
        dlg.locator('#ex-up').click(); q.wait_for_timeout(150)
        check('«Subir» lo mueve arriba, guarda y cierra el diálogo', not is_open() and q.locator('.gx-name').all_inner_texts()==['Press de banca','Caminadora'] and [e['name'] for e in W()[0]['exercises']]==['Press de banca','Caminadora'])
        card(0).locator('[data-act=gym-ex-opts]').click(); q.wait_for_timeout(100)
        dlg.locator('[name=note_0]').fill(''); dlg.locator('[name=note_1]').fill('última pesada'); save()
        check('borrar una nota la quita; otra serie puede tener la suya', [s.get('note') for s in W()[0]['exercises'][0]['sets']][:2]==[None,'última pesada'])
        # cambiar un ejercicio de fuerza por uno de cardio cambia sus casillas
        card(0).locator('[data-act=gym-ex-opts]').click(); q.wait_for_timeout(100)
        dlg.locator('[name=name]').select_option('Elíptica'); save()
        e0 = W()[0]['exercises'][0]
        check('cambiar a un ejercicio de cardio cambia las casillas (y conserva las notas)', e0['name']=='Elíptica' and e0.get('cardio') and all('min' in s and 'weight' not in s for s in e0['sets']) and e0['sets'][1].get('note')=='última pesada', e0)
        card(0).locator('[data-act=gym-ex-opts]').click(); dlg.locator('[name=name]').select_option('Press de banca'); save()
        rows(0).nth(0).locator('input').nth(0).fill('62.5'); rows(0).nth(0).locator('input').nth(1).fill('8'); rows(0).nth(0).locator('.set-chk').click(); q.wait_for_timeout(100)
        q.click('[data-act=gym-rest-skip]') if q.locator('.rest-bar').count() else None
        card(0).locator('[data-act=gym-add-set]').click(); q.wait_for_timeout(80)
        q.screenshot(path=OUT+'gm_activo.png', full_page=True)

        # ---- terminar: resumen con km y sin volumen de cardio
        q.click('[data-act=gym-finish]'); q.wait_for_timeout(200)
        c = q.locator('.list-card').first.inner_text()
        check('la tarjeta del historial suma kilómetros y el volumen solo cuenta la fuerza', '2.5 km' in c and '500 lb' not in c and ('500 kg' in c), c)
        q.locator('.list-card').first.click(); q.wait_for_timeout(100)
        d = dlg.inner_text()
        check('el detalle muestra cada serie de cardio como «min · km»', '22.5 min · 2.5 km' in d, d)

        # ---- editar el entrenamiento terminado
        dlg.locator('[data-act=workout-edit]').click(); q.wait_for_timeout(120)
        check('«Editar» abre el editor con nombre, fecha y cada serie', 'Editar entrenamiento' in dlg.locator('h2').inner_text() and dlg.locator('[name=date]').input_value()==D(0) and dlg.locator('.we-set').count()==2, dlg.locator('.we-set').count())
        ex0 = dlg.locator('[data-e="0"]')
        ex0.locator('.we-set').nth(0).locator('[data-f=weight]').fill('65')
        ex0.locator('.we-set').nth(0).locator('[data-f=note]').fill('corregido')
        ex0.locator('[data-add-set]').click(); q.wait_for_timeout(60)
        ex0 = dlg.locator('[data-e="0"]')
        check('«+ Serie» en el editor agrega una copia de la última', ex0.locator('.we-set').count()==2 and ex0.locator('.we-set').nth(1).locator('[data-f=weight]').input_value()=='65')
        ex0.locator('.we-set').nth(1).locator('[data-f=reps]').fill('6')
        dlg.locator('[data-e="1"] [data-rm-set]').click(); q.wait_for_timeout(60)
        check('quitar la única serie de un ejercicio lo deja vacío (se quitará al guardar)', dlg.locator('[data-e="1"] .we-set').count()==0)
        dlg.locator('[name=name]').fill('Mixta (corregida)'); dlg.locator('[name=date]').fill(D(-2))
        save()
        w = [x for x in W() if x.get('end')][0]
        e = w['exercises']
        check('al guardar: nombre, fecha, valores, nota, serie nueva y sin el ejercicio vacío', w['name']=='Mixta (corregida)' and w['date']==D(-2) and [x['name'] for x in e]==['Press de banca'] and [(s['weight'], s['reps'], s.get('note')) for s in e[0]['sets']]==[(65, 8, 'corregido'), (65, 6, None)] and all(s['done'] for s in e[0]['sets']), w)
        check('el historial se ordena por la fecha corregida', 'Mixta (corregida)' in q.locator('.list-card').first.inner_text())
        q.locator('.list-card').first.click(); dlg.locator('[data-act=workout-edit]').click(); q.wait_for_timeout(100)
        dlg.locator('[data-rm-ex]').click(); q.wait_for_timeout(60); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('un entrenamiento sin series no se guarda (avisa)', is_open() and 'al menos una serie' in q.locator('#toast').inner_text())
        dlg.locator('#cancel').click(); q.wait_for_timeout(80)

        # ---- progreso del cardio
        seed_js = f"""const st = await import('/js/state.js'), db = await import('/js/db.js');
          const mk = (id, d, min, km) => ({{ id, name: 'C', routineId: null, color: 'mauve', date: d, t: Date.parse(d + 'T07:00:00'), end: 1,
            exercises: [{{ id: id + 'e', name: 'Caminadora', cardio: true, sets: [{{ min, km, done: true }}, {{ min: 5, km: 0.5, done: true }}] }}] }});
          const ws = [mk('c1', '{D(-9)}', 20, 2), mk('c2', '{D(-6)}', 30, 3.2), mk('c3', '{D(-4)}', 25, 2.6)];
          ws.forEach(w => st.S.workouts.push(w)); await db.commit({{ put: {{ workouts: ws }} }}); st.hooks.render();"""
        q.evaluate("async js => { await (new Function('return (async () => {' + js + '})()'))(); }", seed_js); q.wait_for_timeout(100)
        go('gym'); gsub('progress')
        c = q.locator('.list-card:has-text("Caminadora")').inner_text()
        check('progreso del cardio: mejor sesión por distancia total (tiempo y km sumados)', 'Mejor: 35 min · 3.7 km' in c, c)
        q.locator('.list-card:has-text("Caminadora")').click(); q.wait_for_timeout(100)
        check('el detalle grafica la distancia por sesión', 'Distancia por sesión (km)' in dlg.inner_text() and dlg.locator('.spark .col').count()==3, dlg.inner_text()[:200])
        dlg.locator('#cancel').click(); q.wait_for_timeout(60)

        # ---- agregar un ejercicio de cardio al vuelo
        gsub('train'); q.click('[data-act=start-empty]'); q.wait_for_timeout(80)
        q.click('[data-act=gym-add-ex]'); q.wait_for_timeout(100)
        dlg.locator('[name=name]').select_option('Caminadora'); q.wait_for_timeout(60)
        check('al elegir cardio se ocultan las repeticiones y queda 1 serie', dlg.locator('#ax-reps').is_hidden() and dlg.locator('[name=sets]').input_value()=='1' and 'tiempo y distancia' in dlg.inner_text())
        save()
        check('el cardio nuevo trae tiempo y distancia de la última vez', rows(0).nth(0).locator('input').nth(0).input_value()=='25' and rows(0).nth(0).locator('input').nth(1).input_value()=='2.6', [rows(0).nth(0).locator('input').nth(i).input_value() for i in (0, 1)])
        q.click('[data-act=gym-discard]'); q.wait_for_timeout(100)

        # ---- respaldo: cardio y notas viajan y se sanean
        go('data')
        with q.expect_download() as dl: q.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        wk = next(x for x in data['workouts'] if x['name']=='Mixta (corregida)')
        check('el respaldo lleva las notas por serie', wk['exercises'][0]['sets'][0]['note']=='corregido')
        weird = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],
          'routines':[{'id':'r','name':'R','exercises':[{'name':'Caminadora','cardio':True,'sets':2,'min':'x','km':-3}]}],
          'workouts':[{'id':'w','name':'W','date':D(0),'t':1,'end':2,'exercises':[{'id':'e','name':'Caminadora','cardio':True,'sets':[{'min':9999,'km':'2.5','done':True,'note':'  ok  '},{'reps':10,'weight':50,'done':True,'note':5}]}]}]}
        Path(tempfile.gettempdir(), 'weird-cardio.json').write_text(json.dumps(weird))
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-cardio.json')); q.wait_for_timeout(900)
        R = q.evaluate("import('/js/state.js').then(m => JSON.parse(JSON.stringify({ r: m.S.routines[0], w: m.S.workouts[0] })))")
        check('saneo de rutinas de cardio: tiempo y distancia válidos', R['r']['exercises'][0]=={'name':'Caminadora','sets':2,'cardio':True,'min':0,'km':0}, R['r'])
        check('saneo de series de cardio: acotadas, sin campos de fuerza, nota recortada y notas no-texto fuera', R['w']['exercises'][0]['sets']==[{'min':1440,'km':2.5,'done':True,'note':'ok'},{'min':0,'km':0,'done':True}], R['w']['exercises'][0]['sets'])
        go('gym'); gsub('history'); check('se muestra sin errores', 'W' in txt())
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
