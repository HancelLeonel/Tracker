"""Inicio: tarjeta de Ejercicio (círculos de los últimos 7 días) y tarjeta con los botones Gasto / Ingreso / Mover."""
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
        ctx = b.new_context(viewport={'width':390,'height':800})
        q = ctx.new_page(); errs=[]
        q.on('pageerror', lambda e: errs.append(str(e)))
        q.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        q.on('dialog', lambda d: d.accept())
        q.goto(URL); q.wait_for_selector('#view .home')
        dlg = q.locator('#dlg')
        def go(tab): q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(80)
        def seed(js):
            q.evaluate("""async (js) => { const st = await import('/js/state.js'); const ut = await import('/js/util.js'); const db = await import('/js/db.js');
              await (new Function('st', 'ut', 'db', 'return (async () => {' + js + '})()'))(st, ut, db); st.hooks.render(); }""", js)
            q.wait_for_timeout(80)
        gym = lambda: q.locator('.tile:has-text("Ejercicio")')
        dots = lambda: gym().locator('.tile-dots i')
        on = lambda: [i for i, c in enumerate(dots().evaluate_all('l => l.map(e => e.className)')) if c == 'on']
        is_open = lambda: q.evaluate("document.querySelector('#dlg').open")

        # ---- disposición: cuatro tarjetas de media pantalla; ya no hay tarjeta de dinero con saldo
        boxes = q.evaluate("""() => [...document.querySelectorAll('.tiles > *')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; })""")
        check('cuatro tarjetas en dos filas de dos, cada una de media pantalla', len(boxes)==4 and boxes[0][1]==boxes[1][1] and boxes[2][1]==boxes[3][1] and boxes[2][1]>boxes[0][1] and all(150<w<190 for _, _, w in boxes), boxes)
        check('Inicio ya no tiene tarjeta de dinero (ni ojo ni ajustes)', q.locator('.tile-money, [data-act=home-eye], [data-act=home-money-cfg]').count()==0 and 'Q ••••' not in q.locator('.home').inner_text())
        check('la tarjeta de Ejercicio y la de botones comparten fila', 'ejercicio' in q.locator('.tiles > *').nth(2).inner_text().lower() and q.locator('.tiles > *').nth(3).get_attribute('class')=='tile-acts')

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

        # ---- ejercicio: sin datos
        check('sin entrenamientos: 0/7, siete círculos apagados y un texto claro', '0/7' in gym().inner_text().replace('\n','') and dots().count()==7 and on()==[] and 'Sin entrenamientos' in gym().inner_text(), gym().inner_text())
        gym().click(); q.wait_for_timeout(100)
        check('tocarla sin datos abre Gimnasio › Entrenar', q.locator('#topbar h1').inner_text()=='Gimnasio' and 'on' in q.locator('[data-act=gym-sub][data-sub=train]').get_attribute('class'))
        go('home')

        # ---- ejercicio: con entrenamientos (el último círculo es hoy)
        seed(f"""const set = {{ weight: 20, reps: 10, done: true, at: 5 }};
          const wk = (id, name, date) => ({{ id, name, routineId: null, color: 'mauve', date, t: Date.parse(date + 'T10:00:00'), end: Date.parse(date + 'T11:00:00'), exercises: [{{ id: id + 'e', name: 'Ej', sets: [set] }}] }});
          const ws = [wk('w0', 'Pecho', '{D(0)}'), wk('w0b', 'Cardio', '{D(0)}'), wk('w2', 'Pierna', '{D(-2)}'), wk('w5', 'Espalda', '{D(-5)}'), wk('w6', 'Brazo', '{D(-6)}'), wk('w7', 'Fuera de rango', '{D(-7)}'), wk('w30', 'Viejo', '{D(-30)}')];
          ws.forEach(w => st.S.workouts.push(w)); await db.commit({{ put: {{ workouts: ws }} }});""")
        check('con color los días entrenados de los últimos 7 (hace 6, 5, 2 días y hoy) y no los demás', on()==[0,1,4,6], on())
        check('el conteo es de días, no de entrenamientos (4/7) y dice cuándo fue el último', '4/7' in gym().inner_text().replace('\n','') and 'Último: hoy' in gym().inner_text(), gym().inner_text())
        check('los círculos con color se distinguen de los apagados', q.evaluate("""() => { const c = [...document.querySelectorAll('.tile-dots i')].map(e => getComputedStyle(e).backgroundColor); return c[6] !== c[5] && c[0] === c[6]; }"""))
        check('son círculos pequeños (≤ 14 px)', dots().first.bounding_box()['width']<=14 and dots().first.bounding_box()['height']<=14)
        gb = gym().bounding_box()
        check('la tarjeta mide al menos 100 px de alto y sus círculos caben dentro', gb['height']>=100 and all(dots().nth(i).bounding_box()['x']+dots().nth(i).bounding_box()['width']<=gb['x']+gb['width'] for i in range(7)), gb)
        q.screenshot(path=OUT+'inicio_tarjetas.png', full_page=True)
        for f in ('system', 'jetbrains'):
            q.evaluate(f"document.documentElement.dataset.font='{f}'"); q.wait_for_timeout(80)
            check(f'sin desborde horizontal en 390 px ({f})', q.evaluate('document.documentElement.scrollWidth')<=390, q.evaluate('document.documentElement.scrollWidth'))
            gb = gym().bounding_box()
            check(f'los círculos caben en la tarjeta ({f})', all(dots().nth(i).bounding_box()['x']+dots().nth(i).bounding_box()['width']<=gb['x']+gb['width'] for i in range(7)))
        q.screenshot(path=OUT+'inicio_tarjetas_jb.png', full_page=True)
        q.evaluate("document.documentElement.dataset.font='system'")
        gym().click(); q.wait_for_timeout(100)
        check('tocarla con datos abre Gimnasio › Historial', q.locator('#topbar h1').inner_text()=='Gimnasio' and 'on' in q.locator('[data-act=gym-sub][data-sub=history]').get_attribute('class') and q.locator('.list-card').count()>0)
        go('home')

        # ---- último hace 2 días, y un entrenamiento en curso
        seed("""st.S.workouts = st.S.workouts.filter(w => w.id !== 'w0' && w.id !== 'w0b'); await db.commit({ remove: { workouts: ['w0', 'w0b'] } });""")
        check('si el último fue hace 2 días: «Último: hace 2 días» y hoy apagado', 'Último: hace 2 días' in gym().inner_text() and 6 not in on(), (gym().inner_text(), on()))
        seed("""const w = { id: 'live', name: 'Pecho hoy', routineId: null, color: 'mauve', date: ut.today(), t: Date.now(), exercises: [{ id: 'e1', name: 'Press', sets: [{ weight: 50, reps: 10, done: false }] }] };
          st.S.workouts.push(w); await db.commit({ put: { workouts: [w] } });""")
        check('con un entrenamiento en curso: «Entrenando ahora» (aún no cuenta como día entrenado)', 'Entrenando ahora' in gym().inner_text() and 6 not in on(), (gym().inner_text(), on()))
        gym().click(); q.wait_for_timeout(100)
        check('y tocarla abre el entrenamiento', q.locator('.gx').count()==1 and 'on' in q.locator('[data-act=gym-sub][data-sub=train]').get_attribute('class'))
        go('home')
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
