"""Catálogo de ejercicios del Gimnasio: siembra, selección sin texto libre, alta/edición/baja, renombrar en cascada, migración y respaldo."""
import os, sys, tempfile, json
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
        def go(tab): q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(80)
        def save(): dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        S = lambda js: q.evaluate("import('/js/state.js').then(m => " + js + ")")
        def seed(js):
            q.evaluate("""async (js) => { const st = await import('/js/state.js'); const ut = await import('/js/util.js'); const db = await import('/js/db.js');
              await (new Function('st', 'ut', 'db', 'return (async () => {' + js + '})()'))(st, ut, db); st.hooks.render(); }""", js)
            q.wait_for_timeout(80)
        def catalog():
            go('gym'); q.click('[data-act=gym-sub][data-sub=routines]'); q.click('[data-act=gym-catalog]'); q.wait_for_timeout(100)
        names = lambda: q.locator('.exrow .xr-t').all_inner_texts()
        sel_opts = lambda sel: sel.evaluate("s => [...s.options].map(o => o.value)")

        # ---- siembra
        n = S("m.S.exercises.length")
        check('el catálogo arranca con unos 60+ ejercicios iniciales, agrupados por músculo', n>=60, n)
        check('la siembra se hace una sola vez (marca guardada)', S("m.S.settings.gymCatalogSeeded")==True)
        go('gym'); q.click('[data-act=gym-sub][data-sub=routines]'); q.wait_for_timeout(80)
        check('Rutinas ofrece el catálogo con su conteo', q.locator('[data-act=gym-catalog]').inner_text().strip()==f'Catálogo de ejercicios · {n}', q.locator('[data-act=gym-catalog]').inner_text())
        q.click('[data-act=gym-catalog]'); q.wait_for_timeout(100)
        check('barra superior del catálogo: volver, título y +', q.locator('#topbar [data-act=gym-sub][data-sub=routines]').count()==1 and 'Catálogo' in q.locator('#topbar h1').inner_text() and q.locator('#topbar [data-act=new-ex]').count()==1)
        heads = q.locator('.today .overline').all_inner_texts()
        check('los grupos salen en el orden de músculos, cada uno con su cuenta', [h.rsplit(' ', 1)[0].strip().title() for h in heads][:4]==['Pecho','Espalda','Hombros','Bíceps'] and heads[0].endswith('10') and 'Otro' not in ' '.join(heads), heads)
        pecho = q.locator('.today:has(.overline:has-text("Pecho")) .exrow .xr-t').all_inner_texts()
        check('dentro de un grupo, alfabético', pecho==sorted(pecho, key=lambda x: x.lower().replace('á','a')) and 'Press de banca' in pecho, pecho)
        check('las filas del catálogo miden al menos 44 px', q.locator('.exrow').first.bounding_box()['height']>=44)
        q.screenshot(path=OUT+'c_catalogo.png', full_page=False)

        # ---- búsqueda
        q.fill('#gsearch', 'curl'); q.wait_for_timeout(100)
        check('buscar filtra sin repintar el campo', names() and all('curl' in x.lower() for x in names()) and q.locator('#gsearch').input_value()=='curl' and 'Press de banca' not in names(), names())
        q.fill('#gsearch', 'ELEVACION'); q.wait_for_timeout(100)
        check('la búsqueda ignora tildes y mayúsculas («ELEVACION» encuentra «Elevaciones…» y «Elevación…»)', len(names())>=4 and any('Elevación de talones' == x for x in names()), names())
        q.fill('#gsearch', 'zzzz'); q.wait_for_timeout(100)
        check('sin coincidencias lo dice', 'Ningún ejercicio coincide' in txt())
        q.fill('#gsearch', ''); q.wait_for_timeout(100)

        # ---- alta
        q.click('#topbar [data-act=new-ex]')
        dlg.locator('[name=name]').fill('  Press   Arnold '); dlg.locator('[name=group]').select_option('Hombros'); save()
        check('un ejercicio nuevo se guarda limpio (espacios) en su grupo', S("m.S.exercises.find(e => e.name === 'Press Arnold')?.group")=='Hombros' and 'Press Arnold' in q.locator('.today:has(.overline:has-text("Hombros"))').inner_text())
        q.click('#topbar [data-act=new-ex]'); dlg.locator('[name=name]').fill('PRESS ARNOLD'); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('no se admite un nombre repetido (ni con otras mayúsculas o tildes)', q.evaluate("document.querySelector('#dlg').open") and 'Ya existe' in q.locator('#toast').inner_text() and S("m.S.exercises.filter(e => e.name.toLowerCase().includes('arnold')).length")==1)
        dlg.locator('[name=name]').fill('Sentadilla'); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('ni uno que ya viene en el catálogo', q.evaluate("document.querySelector('#dlg').open") and 'Ya existe' in q.locator('#toast').inner_text())
        dlg.locator('#cancel').click(); q.wait_for_timeout(80)

        # ---- el nuevo aparece en los selectores de rutinas y de entrenamiento
        q.click('#topbar [data-act=gym-sub]'); q.wait_for_timeout(80)
        q.click('#topbar [data-act=new-routine]'); q.wait_for_timeout(100)
        sel = dlg.locator('.rx select').first
        opts = sel_opts(sel)
        check('el editor de rutina ofrece el catálogo agrupado por músculo y el nuevo ejercicio', 'Press Arnold' in opts and 'Press de banca' in opts and dlg.locator('.rx optgroup').count()>=8 and opts[0]=='', (len(opts), dlg.locator('.rx optgroup').count()))
        check('no hay campo de texto para escribir ejercicios', dlg.locator('.rx input:not([type=number])').count()==0)
        dlg.locator('[name=name]').fill('Hombro y brazo')
        sel.select_option('Press Arnold'); dlg.locator('#rx-add').click()
        dlg.locator('.rx').nth(1).locator('select').select_option('Curl martillo')
        dlg.locator('.rx').nth(1).locator('[data-k=sets]').fill('4'); dlg.locator('.rx').nth(1).locator('[data-k=weight]').fill('12.5')
        dlg.locator('.rx').nth(0).locator('[data-mv="1"]').click()  # bajar el primero
        check('mover filas del editor: el primero baja', dlg.locator('.rx').evaluate_all("l => l.map(r => r.querySelector('select').value)")==['Curl martillo','Press Arnold'])
        check('la fila elegida conserva sus números al moverse', dlg.locator('.rx').nth(0).locator('[data-k=sets]').input_value()=='4' and dlg.locator('.rx').nth(0).locator('[data-k=weight]').input_value()=='12.5')
        dlg.locator('#rx-add').click(); dlg.locator('.rx').nth(2).locator('[data-rm]').click()
        check('quitar una fila', dlg.locator('.rx').count()==2)
        save()
        r = S("m.S.routines.find(r => r.name === 'Hombro y brazo')")
        check('la rutina guarda los nombres elegidos, en el orden de las filas', [e['name'] for e in r['exercises']]==['Curl martillo','Press Arnold'] and r['exercises'][0]['sets']==4 and r['exercises'][0]['weight']==12.5, r)

        # ---- no se puede eliminar un ejercicio que está en una rutina
        catalog(); q.fill('#gsearch', 'arnold'); q.wait_for_timeout(80)
        q.locator('.exrow').first.click(); q.wait_for_timeout(100)
        check('el ejercicio de una rutina avisa en cuál está y no ofrece eliminar', 'Hombro y brazo' in dlg.inner_text() and dlg.locator('#del').count()==0)
        # ---- renombrar: cambia en rutinas e historial
        seed("""const w = { id: 'w1', name: 'Hombro', routineId: null, color: 'mauve', date: ut.today(), t: 5, end: 9, exercises: [{ id: 'e1', name: 'Press Arnold', sets: [{ reps: 8, weight: 20, done: true, at: 6 }] }] };
          st.S.workouts.push(w); await db.commit({ put: { workouts: [w] } });""")
        dlg.locator('[name=name]').fill('Arnold press'); save()
        check('renombrar actualiza las rutinas', S("m.S.routines.find(r => r.name === 'Hombro y brazo').exercises.map(e => e.name)")==['Curl martillo','Arnold press'])
        check('y el historial (así Progreso y «Última vez» no se parten)', S("m.S.workouts.find(w => w.id === 'w1').exercises[0].name")=='Arnold press')
        check('y el catálogo, que sigue sin repetidos', S("m.S.exercises.filter(e => e.name.toLowerCase().includes('arnold')).length")==1)
        # editar solo el grupo no toca nada más
        q.fill('#gsearch', 'arnold'); q.wait_for_timeout(80); q.locator('.exrow').first.click(); q.wait_for_timeout(100)
        check('el formulario trae el nombre y el grupo actuales', dlg.locator('[name=name]').input_value()=='Arnold press' and dlg.locator('[name=group]').input_value()=='Hombros')
        dlg.locator('[name=group]').select_option('Otro'); save()
        check('cambiar el grupo lo mueve de sección', 'Arnold press' in q.locator('.today:has(.overline:has-text("Otro"))').inner_text())

        # ---- eliminar uno libre (el historial lo conserva)
        seed("""const e = { id: 'x1', name: 'Ejercicio suelto', group: 'Cardio' }; st.S.exercises.push(e); await st.saveExercise(e);
          const w = { id: 'w2', name: 'Suelto', routineId: null, color: 'mauve', date: ut.today(), t: 5, end: 9, exercises: [{ id: 'e2', name: 'Ejercicio suelto', sets: [{ reps: 8, weight: 0, done: true, at: 6 }] }] };
          st.S.workouts.push(w); await db.commit({ put: { workouts: [w] } });""")
        q.fill('#gsearch', 'suelto'); q.wait_for_timeout(80); q.locator('.exrow').first.click(); q.wait_for_timeout(100)
        check('uno que no está en ninguna rutina sí se puede eliminar', dlg.locator('#del').count()==1)
        dlg.locator('#del').click(); q.wait_for_timeout(150)
        check('se quita del catálogo pero el historial lo conserva', S("m.S.exercises.some(e => e.name === 'Ejercicio suelto')")==False and S("m.S.workouts.find(w => w.id === 'w2').exercises[0].name")=='Ejercicio suelto')
        q.reload(); q.wait_for_selector('#view .home')
        check('y no vuelve a aparecer al recargar (la siembra es de una sola vez)', S("m.S.exercises.some(e => e.name === 'Ejercicio suelto')")==False)

        # ---- entrenamiento: elegir del catálogo, crear uno nuevo desde ahí, y una rutina con un ejercicio fuera del catálogo
        seed("""const w = { id: 'live', name: 'Libre', routineId: null, color: 'mauve', date: ut.today(), t: Date.now(), exercises: [] }; st.S.workouts.push(w); await db.commit({ put: { workouts: [w] } });""")
        go('gym'); q.click('[data-act=gym-sub][data-sub=train]'); q.wait_for_timeout(80)
        q.click('[data-act=gym-add-ex]'); q.wait_for_timeout(100)
        check('agregar ejercicio al entrenamiento: lista del catálogo, sin texto libre', dlg.locator('select[name=name] option').count()>=60 and dlg.locator('input[name=name]').count()==0)
        dlg.locator('button.primary').click(); q.wait_for_timeout(100)
        check('sin elegir ejercicio no se agrega', q.evaluate("document.querySelector('#dlg').open") and q.locator('.gx').count()==0)
        dlg.locator('#new-ex').click(); q.wait_for_timeout(100)
        check('«Crear un ejercicio nuevo» abre el formulario del catálogo', 'Nuevo ejercicio' in dlg.locator('h2').inner_text())
        dlg.locator('[name=name]').fill('Remo Pendlay'); dlg.locator('[name=group]').select_option('Espalda'); save(); q.wait_for_timeout(100)
        check('al guardarlo se vuelve al formulario con ese ejercicio ya elegido', 'Agregar ejercicio' in dlg.locator('h2').inner_text() and dlg.locator('select[name=name]').input_value()=='Remo Pendlay')
        dlg.locator('[name=sets]').fill('2'); save()
        check('y se agrega al entrenamiento', q.locator('.gx-name').all_inner_texts()==['Remo Pendlay'] and q.locator('.gx').first.locator('.gx-set').count()==2)
        q.locator('[data-act=gym-ex-opts]').click(); q.wait_for_timeout(100)
        check('las opciones del ejercicio también lo eligen del catálogo y lo traen seleccionado', dlg.locator('select[name=name]').input_value()=='Remo Pendlay')
        dlg.locator('#cancel').click(); q.wait_for_timeout(80)
        seed("""const r = { id: 'rx', name: 'Vieja', color: 'mauve', exercises: [{ name: 'Ejercicio raro', sets: 3, reps: 10, weight: 0 }] }; st.S.routines.push(r); await db.commit({ put: { routines: [r] } });""")
        go('gym'); q.click('[data-act=gym-sub][data-sub=routines]'); q.wait_for_timeout(80)
        q.locator('[data-act=edit-routine][data-id=rx]').click(); q.wait_for_timeout(100)
        check('una rutina con un ejercicio que ya no está en el catálogo lo muestra marcado y no lo pierde', 'fuera del catálogo' in dlg.locator('.rx select').first.inner_text() and dlg.locator('.rx select').first.input_value()=='Ejercicio raro')
        save()
        check('al guardarla conserva ese nombre', S("m.S.routines.find(r => r.id === 'rx').exercises[0].name")=='Ejercicio raro')

        # ---- respaldo: el catálogo viaja
        go('data')
        with q.expect_download() as dl: q.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        mine = {e['name'] for e in data['exercises']}
        check('el respaldo incluye el catálogo con los cambios', 'Remo Pendlay' in mine and 'Arnold press' in mine and 'Ejercicio suelto' not in mine and len(mine)==len(data['exercises']), len(mine))
        q.click('[data-act=wipe]'); q.wait_for_timeout(400)
        check('borrar todo devuelve el catálogo inicial', 60 <= S("m.S.exercises.length") and S("m.S.exercises.some(e => e.name === 'Remo Pendlay')")==False)
        go('data')
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); q.wait_for_timeout(900)
        check('importar restaura el catálogo del respaldo', S("m.S.exercises.some(e => e.name === 'Remo Pendlay')")==True and S("m.S.exercises.length")==len(mine))

        # ---- respaldo de antes del catálogo: se siembra y entran los nombres que ya usaba
        old = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],
               'routines':[{'id':'r1','name':'Antigua','color':'mauve','exercises':[{'name':'Sentadilla','sets':3,'reps':10,'weight':0},{'name':'Remo raro','sets':3,'reps':8,'weight':20}]}],
               'workouts':[{'id':'w1','name':'Viejo','date':'2026-01-01','t':5,'end':9,'exercises':[{'id':'e','name':'Prensa  de PIERNAS','sets':[{'reps':5,'weight':100,'done':True}]},{'id':'f','name':'Ejercicio perdido','sets':[{'reps':5,'weight':10,'done':True}]}]}]}
        Path(tempfile.gettempdir(), 'old-gym.json').write_text(json.dumps(old))
        go('data')
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'old-gym.json')); q.wait_for_timeout(900)
        ex = {e['name']: e['group'] for e in S("m.S.exercises")}
        check('un respaldo sin catálogo se siembra con los iniciales', 60 <= len(ex) and ex.get('Sentadilla')=='Piernas' and 'Press de banca' in ex, len(ex))
        check('los nombres que ya usaban las rutinas y el historial entran como «Otro» si no estaban', ex.get('Remo raro')=='Otro' and ex.get('Ejercicio perdido')=='Otro', {k: v for k, v in ex.items() if v == 'Otro'})
        check('uno escrito distinto pero igual (mayúsculas y espacios) no se duplica', not any('prensa' in k.lower() and k != 'Prensa de piernas' for k in ex), [k for k in ex if 'prensa' in k.lower()])

        # ---- respaldo con catálogo raro: se sanea
        weird = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'gymCatalogSeeded':True},
                 'exercises':[{'id':'a','name':'  Uno  raro ','group':'inventado'},{'id':'b','name':'UNO RARO','group':'Pecho'},{'name':'Sin id','group':'Pecho'},{'id':'c','name':'   '},{'id':'d'},None,{'id':'e','name':'X'*80,'group':'Cardio'}]}
        Path(tempfile.gettempdir(), 'weird-cat.json').write_text(json.dumps(weird))
        go('data')
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-cat.json')); q.wait_for_timeout(900)
        ex = S("m.S.exercises")
        check('saneo: nombre limpio, grupo inválido → Otro, repetidos y vacíos fuera, nombre largo recortado', sorted(e['name'] for e in ex)==sorted(['Uno raro','Sin id','X'*50]) and next(e for e in ex if e['name']=='Uno raro')['group']=='Otro', [e['name'] for e in ex])
        check('con la marca en el respaldo no se vuelve a sembrar', len(ex)==3)
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
