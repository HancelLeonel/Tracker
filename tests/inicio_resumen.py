"""Inicio: tarjeta de Dinero configurable (total / una cuenta / varias) y resumen de los últimos 7 días de ejercicio."""
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
        money = lambda: q.locator('.tile-money').inner_text()
        def reveal():
            if q.locator('.tile-money .eye').get_attribute('aria-pressed')=='false': q.click('.tile-money .eye'); q.wait_for_timeout(80)
        def cfg(): q.click('.tile-money .cog'); q.wait_for_timeout(100)
        def save(): dlg.locator('button.primary').click(); q.wait_for_timeout(120)

        # ---- Inicio sin Pomodoro y con el nuevo orden
        check('sin tarjeta de Pomodoro; Hábitos y Pagos siguen en la fila de tarjetas', q.locator('.tile:has-text("Pomodoro")').count()==0 and q.locator('.tiles .tile').count()==2)

        # ---- dinero: total, una cuenta, varias
        seed("""const mk = (id, name, type, cats) => ({ id, name, type, limit: 0, order: 1, cats });
          const as = [mk('a1', 'Banco', 'normal', [{ id: 'c1', name: 'Comida', balance: 1000 }, { id: 'c2', name: 'Ahorro', balance: 500 }]),
                      mk('a2', 'Efectivo', 'normal', [{ id: 'c3', name: 'Bolsillo', balance: 200 }]),
                      mk('a3', 'Visa', 'credit', [{ id: 'c4', name: 'Deuda', balance: -300 }])];
          for (const a of as) { st.S.accounts.push(a); await st.saveAccount(a); }""")
        reveal()
        check('por omisión: total neto de todas las cuentas (dinero menos deuda de tarjetas)', 'Q1,400.00' in money() and 'Total de tus cuentas' in money(), money())
        check('la tarjeta de dinero ocupa todo el ancho', q.locator('.tile-money').bounding_box()['width']>340, q.locator('.tile-money').bounding_box())
        check('el botón de ajustes mide al menos 44 px', q.locator('.tile-money .cog').bounding_box()['height']>=44 and q.locator('.tile-money .cog').bounding_box()['width']>=44)
        cfg()
        check('el diálogo ofrece total y las cuentas en orden alfabético, con la tarjeta marcada como tal', dlg.locator('[name=mode]:checked').get_attribute('value')=='total' and dlg.locator('[name=acc]').count()==3 and dlg.locator('.acc-pick').inner_text().replace('\n',' ').startswith('Banco Efectivo Visa (tarjeta)'), dlg.locator('.acc-pick').inner_text())
        dlg.locator('[name=acc][value=a2]').check()
        check('marcar una cuenta cambia solo a «Solo las cuentas que elija»', dlg.locator('[name=mode]:checked').get_attribute('value')=='accounts')
        save()
        check('una sola cuenta: su saldo y su nombre (sin desglose)', 'Q200.00' in money() and 'Efectivo' in money() and 'Total' not in money() and q.locator('.money-lines').count()==0, money())
        cfg(); dlg.locator('[name=acc][value=a1]').check(); save()
        m = money()
        check('varias cuentas: suma, «2 cuentas» y una línea por cuenta', 'Q1,700.00' in m and '2 cuentas' in m and q.locator('.money-lines .kv').count()==2 and 'Q1,500.00' in q.locator('.money-lines').inner_text(), m)
        cfg(); dlg.locator('[name=acc][value=a3]').check(); save()
        check('una tarjeta suma su deuda (negativa)', 'Q1,400.00' in money() and '3 cuentas' in money(), money())
        q.click('.tile-money .eye'); q.wait_for_timeout(80)
        check('oculto: ni el total ni el desglose muestran cifras', '1,' not in money() and money().count('Q ••••')==4 and q.locator('.tile-money .eye').get_attribute('aria-pressed')=='false', money())
        reveal()
        q.screenshot(path=OUT+'inicio_dinero.png', full_page=True)
        cfg(); dlg.locator('[name=acc]').evaluate_all('l => l.forEach(i => { i.checked = false; })'); dlg.locator('[name=mode][value=accounts]').check(); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('«solo las que elija» sin ninguna cuenta no se guarda (diálogo abierto y aviso)', q.evaluate("document.querySelector('#dlg').open") and 'al menos una' in q.locator('#toast').inner_text())
        dlg.locator('[name=mode][value=total]').check(); save()
        check('volver a «total»', 'Total de tus cuentas' in money() and 'Q1,400.00' in money())
        # la elección se conserva (y la cuenta elegida se ve tras recargar, con el dinero otra vez oculto)
        cfg(); dlg.locator('[name=acc][value=a1]').check(); save()
        q.reload(); q.wait_for_selector('#view .home')
        check('al recargar se conserva la elección, y el dinero vuelve a estar oculto', 'Banco' in money() and 'Q ••••' in money() and '1,500' not in money(), money())
        data = q.evaluate("import('/js/state.js').then(m => m.S.settings.homeMoney)")
        check('se guarda en los ajustes (viaja en el respaldo)', data=={'mode':'accounts','ids':['a1']}, data)
        # cuenta borrada: la elección se corrige sola
        seed("""st.S.accounts = st.S.accounts.filter(a => a.id !== 'a1'); st.bump(); await db.commit({ remove: { accounts: ['a1'] } });""")
        reveal()
        check('si se borra la única cuenta elegida, vuelve al total', 'Total de tus cuentas' in money() and '−Q100.00' in money(), money())
        # ajustes raros: no rompen Inicio
        seed("""st.S.settings.homeMoney = { mode: 'accounts', ids: 'x' };""")
        check('ids inválidos: total', 'Total de tus cuentas' in money())
        seed("""st.S.settings.homeMoney = 7;""")
        check('ajuste que no es un objeto: total, sin errores', 'Total de tus cuentas' in money() and q.locator('.home').count()==1)
        seed("""st.S.settings.homeMoney = { mode: 'accounts', ids: ['a2', 'no-existe', 5] };""")
        reveal()
        check('ids con cuentas inexistentes: solo cuenta la que existe', 'Efectivo' in money() and 'Q200.00' in money(), money())

        # ---- ejercicio: sin datos
        ex = lambda: q.locator('.home-sec')
        check('sin entrenamientos: invitación a registrar el primero', 'Registrar tu primer entrenamiento' in ex().inner_text() and ex().locator('.xrow').count()==0)
        q.click('[data-act=home-gym]'); q.wait_for_timeout(100)
        check('esa invitación abre Gimnasio › Entrenar', q.locator('#topbar h1').inner_text()=='Gimnasio' and 'on' in q.locator('[data-act=gym-sub][data-sub=train]').get_attribute('class'))
        go('home')

        # ---- ejercicio: 9 días distintos (+ 2 entrenamientos el mismo día)
        seed(f"""const set = (w, r) => ({{ weight: w, reps: r, done: true, at: 5 }});
          const wk = (id, name, date, exs) => ({{ id, name, routineId: null, color: 'mauve', date, t: Date.parse(date + 'T10:00:00'), end: Date.parse(date + 'T11:00:00'),
            exercises: exs.map((sets, i) => ({{ id: id + i, name: 'Ej ' + i, sets }})) }});
          const ws = [wk('w0', 'Pecho', '{D(0)}', [[set(60, 10), set(60, 10)], [set(20, 12)]]),
                      wk('w0b', 'Cardio', '{D(0)}', [[set(0, 30)]]),
                      wk('w1', 'Pierna', '{D(-1)}', [[set(100, 5)]]),
                      wk('w3', 'Espalda', '{D(-3)}', [[set(40, 10)]]), wk('w4', 'Hombro', '{D(-4)}', [[set(15, 10)]]),
                      wk('w5', 'Brazo', '{D(-5)}', [[set(10, 10)]]), wk('w6', 'Core', '{D(-6)}', [[set(0, 20)]]),
                      wk('w8', 'Séptimo día', '{D(-8)}', [[set(10, 10)]]), wk('w9', 'Muy viejo', '{D(-9)}', [[set(10, 10)]])];
          ws.forEach(w => st.S.workouts.push(w)); await db.commit({{ put: {{ workouts: ws }} }});""")
        rows = ex().locator('.xrow')
        check('muestra los últimos 7 días CON ejercicio (no los últimos 7 del calendario), el más reciente primero', rows.count()==7 and 'Muy viejo' not in ex().inner_text() and 'Séptimo día' in rows.nth(6).inner_text(), rows.count())
        t0 = rows.nth(0).inner_text().replace('\n',' ')
        check('un día con dos entrenamientos se junta en una fila: nombres, ejercicios, series y volumen', 'Hoy' in t0 and 'Pecho + Cardio' in t0 and '3 ejercicios' in t0 and '4 series' in t0 and '1,440 kg' in t0, t0)
        check('«Ayer» y los demás días con su fecha', 'Ayer' in rows.nth(1).inner_text() and 'Pierna' in rows.nth(1).inner_text() and '1 ejercicio · 1 serie · 500 kg' in rows.nth(1).inner_text().replace('\n',' '), rows.nth(1).inner_text())
        check('los días sin ejercicio no aparecen (saltan de hace 1 a hace 3 días)', 'Espalda' in rows.nth(2).inner_text() and 'Pierna' in rows.nth(1).inner_text())
        check('cada fila mide al menos 44 px', rows.nth(0).bounding_box()['height']>=44)
        check('la tarjeta va después de Dinero', q.evaluate("""() => { const m = document.querySelector('.tile-money'), e = document.querySelector('.home-sec'); return !!(m.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING); }"""))
        for f in ('system', 'jetbrains'):
            q.evaluate(f"document.documentElement.dataset.font='{f}'"); q.wait_for_timeout(80)
            check(f'sin desborde horizontal en 390 px ({f})', q.evaluate('document.documentElement.scrollWidth')<=390, q.evaluate('document.documentElement.scrollWidth'))
        q.screenshot(path=OUT+'inicio_ejercicio_jb.png', full_page=True)
        q.evaluate("document.documentElement.dataset.font='system'")
        rows.nth(1).click(); q.wait_for_timeout(100)
        check('tocar una fila abre Gimnasio › Historial', q.locator('#topbar h1').inner_text()=='Gimnasio' and 'on' in q.locator('[data-act=gym-sub][data-sub=history]').get_attribute('class') and q.locator('.list-card').count()>0)
        go('home')

        # ---- entrenamiento en curso arriba
        seed("""const w = { id: 'live', name: 'Pecho hoy', routineId: null, color: 'mauve', date: ut.today(), t: Date.now(), exercises: [{ id: 'e1', name: 'Press', sets: [{ weight: 50, reps: 10, done: true, at: 1 }, { weight: 50, reps: 10, done: false }, { weight: 50, reps: 10, done: false }] }] };
          st.S.workouts.push(w); await db.commit({ put: { workouts: [w] } });""")
        live = ex().locator('.xrow.live')
        check('el entrenamiento en curso aparece primero con su avance, sin contarse como día hecho', live.count()==1 and 'live' in ex().locator('.xrow').nth(0).get_attribute('class') and '1/3 series' in live.inner_text() and ex().locator('.xrow').count()==8 and 'Hoy' in ex().locator('.xrow').nth(1).inner_text(), live.inner_text())
        live.click(); q.wait_for_timeout(100)
        check('tocarlo abre Gimnasio › Entrenar', 'on' in q.locator('[data-act=gym-sub][data-sub=train]').get_attribute('class') and q.locator('.gx').count()==1)
        go('home')

        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
