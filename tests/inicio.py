import os, sys, tempfile
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
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        quote = lambda: page.locator('.home-quote p').inner_text().strip() + ' | ' + page.locator('.home-quote footer').inner_text().strip()
        def go(tab): ir(page, tab); page.wait_for_timeout(60)
        N = page.evaluate("import('/js/home.js').then(m => m.QUOTES.length)")

        # ---- ninguna se repite hasta haberlas visto todas (la inicial + N-1 toques)
        seen = [quote()]
        for _ in range(N - 1):
            page.click('[data-act=home-quote]'); page.wait_for_timeout(15); seen.append(quote())
        check('al tocar la frase cambia y no se repite hasta mostrar todas', len(set(seen)) == N and all(seen[i] != seen[i+1] for i in range(N-1)), (N, len(set(seen))))
        page.click('[data-act=home-quote]'); page.wait_for_timeout(15)
        check('al iniciar otra ronda no repite la última', quote() != seen[-1])

        # ---- predeterminada y contenido
        page2 = ctx.new_page(); page2.goto('http://localhost:8765/'); page2.wait_for_selector('#view .home')
        check('la app abre en Inicio', page2.locator('#topbar h1').inner_text()=='Inicio' and page2.locator('#view .home').count()==1)
        check('Inicio es la primera opción de la barra inferior y está marcada', page2.evaluate("document.querySelector('#nav button').dataset.tab") == 'home' and page2.evaluate("document.querySelector('#nav button').classList.contains('on')"))
        h = page2.evaluate("new Date().getHours()")
        want = 'Buenos días' if h < 12 else 'Buenas tardes' if h < 19 else 'Buenas noches'
        check('saludo según la hora', page2.locator('.home-top h2').inner_text().strip() == want, (want, page2.locator('.home-top h2').inner_text()))
        date = page2.locator('.home-top .overline').inner_text().strip()
        check('fecha: día de la semana y fecha corta', ' · ' in date and any(d in date.lower() for d in ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']) and any(m in date.lower() for m in ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']), date)
        txt = page2.locator('.home-quote p').inner_text().strip(); au = page2.locator('.home-quote footer').inner_text().strip()
        ok = page2.evaluate("([t, a]) => import('/js/home.js').then(m => m.QUOTES.some(q => q[0] === t && a.endsWith(q[1])))", [txt, au])
        check('la frase y su autor salen de la lista', ok and len(txt) > 10 and len(au) > 2, (txt, au))
        check('sin desbordamiento horizontal', page2.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        page2.screenshot(path=OUT+'home.png')

        # ---- no cambia al repintar (abrir/cerrar menú), sí al volver a mostrarla
        q0 = page2.locator('.home-quote p').inner_text()
        page2.click('#nav [data-act=more]'); page2.keyboard.press('Escape'); page2.wait_for_timeout(60)
        check('abrir y cerrar «Más» no cambia la frase', page2.locator('.home-quote p').inner_text() == q0)
        seen = {q0}
        for _ in range(5):
            ir(page2, 'habits'); page2.wait_for_timeout(40)
            ir(page2, 'home'); page2.wait_for_timeout(40)
            seen.add(page2.locator('.home-quote p').inner_text())
        check('cada vez que se vuelve a Inicio hay otra frase', len(seen) == 6, len(seen))
        before = page2.locator('.home-quote p').inner_text()
        ir(page2, 'home'); page2.wait_for_timeout(40)
        check('elegir Inicio estando en Inicio también cambia la frase', page2.locator('.home-quote p').inner_text() != before)

        # ---- al regresar a la app desde segundo plano (visibilitychange) se elige otra, solo si se está en Inicio
        fire = "() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
        a = page2.locator('.home-quote p').inner_text(); page2.evaluate(fire); page2.wait_for_timeout(40)
        check('al volver a la app en Inicio cambia la frase', page2.locator('.home-quote p').inner_text() != a)
        go_ = lambda t: (ir(page2, t), page2.wait_for_timeout(40))
        go_('habits'); page2.evaluate(fire); page2.wait_for_timeout(40)
        check('fuera de Inicio no se repinta', page2.locator('#topbar h1').inner_text() == 'Hábitos')

        # ================= tarjetas, tareas y gasto rápido =================
        q = page2
        def go2(tab): ir(q, tab); q.wait_for_timeout(60)
        def seed(js, arg=None):
            q.evaluate("""async ([js, arg]) => { const st = await import('/js/state.js'); const ut = await import('/js/util.js'); const db = await import('/js/db.js');
              await (new Function('st', 'ut', 'db', 'arg', 'return (async () => {' + js + '})()'))(st, ut, db, arg); st.hooks.render(); }""", [js, arg])
            q.wait_for_timeout(80)
        home_txt = lambda: q.locator('.home').inner_text()
        go2('home')

        # ---- estado vacío de cada parte
        check('sin datos: hábitos y tareas lo dicen con calma y los pagos están al día', 'Crea tu primer hábito' in home_txt() and 'Pagos al día' in q.locator('.home-chip.hc-money').inner_text() and 'Nada pendiente para hoy' in home_txt(), home_txt())
        check('Inicio ya no tiene el botón grande de Nuevo gasto (el gasto rápido está en la tarjeta de botones)', q.locator('.quick-exp').count()==0 and q.locator('.tile-acts [data-act=new-exp]').is_visible())
        q.click('.tile-acts [data-act=new-exp]'); q.wait_for_timeout(120)
        check('gasto rápido sin cuentas avisa en vez de abrir un formulario roto', not q.evaluate("document.querySelector('#dlg').open") and 'cuenta' in q.locator('#toast').inner_text())

        # ---- hábitos de hoy
        seed("""const t = ut.today();
          for (const [i, n] of ['Agua', 'Leer', 'Correr'].entries()) { const h = { id: 'h' + i, name: n, color: 'blue', icon: 'drop', slot: '', order: i + 1, dates: i < 2 ? { [t]: 1 } : {} }; st.S.habits.push(h); await st.saveHabit(h); }""")
        check('Hábitos: falta 1 de 3, con barra al 66 %', 'Falta 1' in q.locator('#today-habits').inner_text() and q.locator('#today-habits .bar i').get_attribute('style').startswith('width:66'), q.locator('#today-habits').inner_text())

        # ---- pagos: solo se muestran vencidos o los que vencen en los próximos 3 días
        D = lambda n: __import__('datetime').date.today().__add__(__import__('datetime').timedelta(days=n)).isoformat()
        bill = lambda id, title, n: f"const b = {{ id: '{id}', title: '{title}', amount: 100, freq: 'once', day: null, dueDate: '{D(n)}', start: '2020-01-01', card: null, active: true, paid: {{}} }}; st.S.bills.push(b); await st.saveBill(b);"
        pt = lambda: q.locator('.home-chip.hc-money')
        ok_ = lambda: 'Pagos al día' in pt().inner_text()
        check('sin pagos registrados: «Pagos al día»', ok_(), pt().inner_text())
        seed(bill('b1', 'Seguro', 45))
        check('un pago a 45 días: sigue al día', ok_() and 'Seguro' not in pt().inner_text())
        seed(bill('b2', 'Internet', 5))
        check('un pago a 5 días tampoco se muestra', ok_(), pt().inner_text())
        seed(bill('b2b', 'Cable', 4))
        check('a 4 días todavía no', ok_())
        seed(bill('b2c', 'Gimnasio mensual', 3))
        check('a 3 días sí: título y fecha', 'Gimnasio mensual' in pt().inner_text() and 'vence el' in pt().inner_text(), pt().inner_text())
        seed(bill('b3', 'Luz', 1))
        check('el más cercano manda: «vence mañana»', 'Luz' in pt().inner_text() and 'vence mañana' in pt().inner_text(), pt().inner_text())
        seed(bill('b3b', 'Agua hoy', 0))
        check('uno de hoy: «vence hoy»', 'Agua hoy' in pt().inner_text() and 'vence hoy' in pt().inner_text(), pt().inner_text())
        seed(bill('b4', 'Agua potable', -2))
        check('pago vencido: el chip dice «1 Pago vencido» con el número en rojo', pt().inner_text().split() == ['1', 'Pago', 'vencido'] and pt().locator('b.neg').count() == 1, pt().inner_text())
        seed(bill('b5', 'Gas', -1))
        check('varios vencidos: plural, con el número una sola vez', pt().inner_text().split() == ['2', 'Pagos', 'vencidos'], pt().inner_text())
        q.click('.home-chip.hc-money'); q.wait_for_timeout(100)
        check('tocar la tarjeta de pagos abre Finanzas › Pagos', q.locator('#topbar h1').inner_text()=='Pagos' and 'Vencidos' in q.locator('#view').inner_text(), q.locator('#topbar h1').inner_text())
        go2('home')

        # ---- tareas de hoy (de las listas)
        seed(f"""const mk = (id, text, due, done) => ({{ id, text, done: !!done, ...(due ? {{ due }} : {{}}) }});
          const l1 = {{ id: 'L1', name: 'Súper', tplId: null, color: 'green', created: '2026-01-01', t: 1, items: [mk('i1', 'Comprar leche', '{D(0)}'), mk('i2', 'Pagar parqueo', '{D(-1)}'), mk('i3', 'Mañana no cuenta', '{D(1)}'), mk('i4', 'Ya hecha', '{D(0)}', true), mk('i5', 'Sin fecha', null)] }};
          const l2 = {{ id: 'L2', name: 'Archivada', tplId: null, color: 'blue', created: '2026-01-01', t: 2, archived: '2026-02-01', items: [mk('i6', 'De lista archivada', '{D(-3)}')] }};
          st.S.lists.push(l1, l2); await db.commit({{ put: {{ lists: [l1, l2] }} }});""")
        rows = lambda: [r.split('\n')[0].strip() for r in q.locator('.trow .t-text').all_inner_texts()]
        check('solo tareas pendientes con fecha de hoy o vencida, de listas activas, la más vieja primero', rows()==['Pagar parqueo','Comprar leche'], rows())
        check('cada tarea dice cuándo vence y de qué lista es', 'Venció el' in q.locator('.trow').first.inner_text() and 'Súper' in q.locator('.trow').first.inner_text() and 'Vence hoy' in q.locator('.trow').nth(1).inner_text(), q.locator('.trow').first.inner_text())
        check('encabezado con el conteo', '2' in q.locator('#today-tasks .home-h').inner_text())
        q.click('.trow:has-text("Comprar leche") .chk'); q.wait_for_timeout(120)
        check('la casilla tacha la tarea en el sitio y baja el conteo a 1', q.locator('.trow:has-text("Comprar leche")').get_attribute('class').split().count('done')==1 and q.locator('#today-tasks .count').inner_text().strip()=='1', q.locator('#today-tasks .count').inner_text())
        ok = q.evaluate("import('/js/state.js').then(st => { const i = st.S.lists.find(l => l.id === 'L1').items.find(i => i.id === 'i1'); return i.done === true && /^\\d{4}-\\d{2}-\\d{2}$/.test(i.doneAt); })")
        check('queda hecha en la lista con su fecha de hecho', ok)
        q.click('.trow:has-text("Pagar parqueo") .t-main'); q.wait_for_timeout(100)
        check('tocar el texto abre esa lista', q.locator('#topbar h1').inner_text()=='Súper' and 'Listas' not in q.locator('#topbar h1').inner_text() and q.locator('[data-act=list-back]').count()==1)
        q.click('[data-act=list-back]'); go2('home')
        check('al volver a Inicio la tarea hecha ya no aparece', rows()==['Pagar parqueo'], rows())
        q.click('.trow .chk'); q.wait_for_timeout(120); go2('home')
        check('sin tareas pendientes vuelve el mensaje tranquilo', 'Nada pendiente para hoy' in home_txt() and q.locator('#today-tasks .count').count()==0)
        seed(f"""const l = st.S.lists.find(l => l.id === 'L1'); for (let k = 0; k < 8; k++) l.items.push({{ id: 'm' + k, text: 'Mucha ' + k, done: false, due: '{D(0)}' }}); await st.saveList(l);""")
        check('más de 3 tareas: se muestran 3 y un enlace al resto', len(rows())==3 and 'más en Listas' in home_txt(), (len(rows()), home_txt()[-80:]))
        q.click('#today-tasks >> text=más en Listas'); q.wait_for_timeout(80)
        check('«Ver más» lleva a Listas', q.locator('#topbar h1').inner_text()=='Listas')
        go2('home')

        # ---- gasto rápido con una cuenta
        seed("""const a = { id: 'a1', name: 'Efectivo', type: 'normal', limit: 0, order: 1, cats: [{ id: 'c1', name: 'Comida', balance: 500 }] }; st.S.accounts.push(a); await st.saveAccount(a);""")
        q0 = q.locator('.home-quote p').inner_text()
        q.click('.tile-acts [data-act=new-exp]'); q.wait_for_timeout(150)
        check('gasto rápido abre el formulario de gasto sobre Inicio', q.evaluate("document.querySelector('#dlg').open") and 'Nuevo gasto' in q.locator('#dlg h2').inner_text())
        check('el formulario es una hoja inferior', q.evaluate("(() => { const r = document.querySelector('#dlg').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2 && r.width >= innerWidth - 1; })()"))
        q.locator('#dlg [name=title]').fill('Café'); q.locator('#dlg [name=amount]').fill('25')
        q.locator('#dlg .part select').first.select_option(index=1); q.locator('#dlg button.primary').click(); q.wait_for_timeout(200)
        check('al guardar se vuelve a Inicio con la misma frase', q.locator('#topbar h1').inner_text()=='Inicio' and q.locator('.home-quote p').inner_text()==q0)
        saldo = q.evaluate("import('/js/state.js').then(st => st.S.accounts[0].cats[0].balance)")
        check('el gasto se descontó (500 - 25)', saldo==475, saldo)
        check('Inicio sin desbordamiento horizontal y con contenido', q.evaluate("document.documentElement.scrollWidth <= innerWidth") and q.locator('.home').bounding_box()['height'] > 500)
        q.screenshot(path=OUT+'home2.png', full_page=True)

        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
