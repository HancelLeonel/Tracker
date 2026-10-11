"""Inicio: notas rápidas (bandeja), recibir lo compartido, tarjetas de dinero y Pomodoro."""
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
        alerts = []
        q.on('dialog', lambda d: (alerts.append(d.message), d.accept()))
        q.goto(URL); q.wait_for_selector('#view .home')
        dlg = q.locator('#dlg')
        def go(tab): q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(70)
        def seed(js):
            q.evaluate("""async (js) => { const st = await import('/js/state.js'); const ut = await import('/js/util.js'); const db = await import('/js/db.js');
              await (new Function('st', 'ut', 'db', 'return (async () => {' + js + '})()'))(st, ut, db); st.hooks.render(); }""", js)
            q.wait_for_timeout(80)
        notes = lambda: [t.strip().split('\n')[0] for t in q.locator('.qn .qn-text').all_inner_texts()]
        add = lambda t: (q.locator('#qn-new').fill(t), q.locator('#qn-new').press('Enter'), q.wait_for_timeout(120))

        # ---- anotar rápido
        check('sin notas rápidas no hay bandeja', q.locator('.inbox').count()==0)
        check('el campo de nota rápida está en Inicio', q.locator('#qn-new').is_visible())
        add('Pedir presupuesto del techo')
        check('Enter guarda la nota en la bandeja', notes()==['Pedir presupuesto del techo'] and 'ahora' in q.locator('.qn').inner_text())
        check('el foco vuelve al campo y queda vacío para la siguiente', q.evaluate("document.activeElement.id")=='qn-new' and q.locator('#qn-new').input_value()=='')
        add('Llamar a Ana el martes'); q.locator('#qn-new').fill('Idea para el viaje'); q.click('[data-act=qn-add]'); q.wait_for_timeout(120)
        check('también con el botón; la más nueva primero', notes()==['Idea para el viaje','Llamar a Ana el martes','Pedir presupuesto del techo'], notes())
        q.locator('#qn-new').press('Enter'); q.wait_for_timeout(80)
        check('un campo vacío no agrega nada', len(notes())==3)
        check('el encabezado cuenta las notas', '3' in q.locator('.inbox .overline').inner_text())
        q.screenshot(path=OUT+'inbox.png', full_page=True)

        # ---- persistencia, respaldo
        q.reload(); q.wait_for_selector('#view .home')
        check('persisten al recargar', len(notes())==3)
        go('data')
        with q.expect_download() as dl: q.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        check('el respaldo incluye las notas rápidas', sorted(x['text'] for x in data['inbox'])==sorted(['Idea para el viaje','Llamar a Ana el martes','Pedir presupuesto del techo']), data.get('inbox'))
        q.click('[data-act=wipe]'); q.wait_for_timeout(300); go('home')
        check('borrar todo vacía la bandeja', q.locator('.inbox').count()==0)
        go('data')
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); q.wait_for_timeout(800); go('home')
        check('importar la restaura', len(notes())==3)

        # ---- editar y dejar en la bandeja
        q.click('.qn:has-text("Llamar a Ana")'); q.wait_for_timeout(100)
        check('al tocar una nota se abre para editarla o archivarla', dlg.locator('[name=text]').input_value()=='Llamar a Ana el martes' and dlg.locator('[name=dest]').input_value()=='keep')
        dlg.locator('[name=text]').fill('Llamar a Ana el miércoles'); dlg.locator('button.primary').click(); q.wait_for_timeout(120)
        check('editar sin archivar la deja en la bandeja con el texto nuevo', 'Llamar a Ana el miércoles' in notes() and len(notes())==3)

        # ---- archivar como nota de un grupo
        q.click('.qn:has-text("presupuesto")'); q.wait_for_timeout(100)
        check('sin destinos las opciones de archivar están desactivadas', q.evaluate("['note','list'].every(v => document.querySelector(`#dlg [name=dest] option[value=${v}]`).disabled)"), q.evaluate("[...document.querySelectorAll('#dlg [name=dest] option')].map(o => o.value + ':' + o.disabled)"))
        dlg.locator('#cancel').click(); q.wait_for_timeout(80)
        seed("""const f = (id, name, type) => ({ id, name, type });
          const g1 = { id: 'g1', name: 'Enlaces', color: 'blue', icon: 'link', fields: [f('fu', 'Enlace', 'url'), f('fd', 'Descripción', 'long')] };
          const g2 = { id: 'g2', name: 'Solo título', color: 'green', icon: 'note', fields: [] };
          st.S.noteGroups.push(g1, g2); await db.commit({ put: { noteGroups: [g1, g2] } });
          const l1 = { id: 'L1', name: 'Súper', tplId: null, color: 'mauve', created: '2026-01-01', t: 1, items: [{ id: 'i1', text: 'Leche', done: false }] };
          st.S.lists.push(l1); await db.commit({ put: { lists: [l1] } });
          const x = { id: 'qx', text: 'Mira https://playwright.dev/python muy útil\\nsegunda línea', t: Date.now() }; st.S.inbox.unshift(x); await st.saveInbox(x);""")
        q.click('.qn:has-text("Mira https")'); q.wait_for_timeout(100)
        dlg.locator('[name=dest]').select_option('note'); q.wait_for_timeout(60)
        check('al elegir «nota» aparecen el grupo y el título sugerido', dlg.locator('[name=group]').is_visible() and dlg.locator('[name=title]').input_value().startswith('Mira https://playwright.dev'), dlg.locator('[name=title]').input_value())
        dlg.locator('[name=group]').select_option('g1'); dlg.locator('[name=title]').fill('Playwright en Python'); dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        n = q.evaluate("import('/js/state.js').then(st => st.S.notes.find(n => n.title === 'Playwright en Python'))")
        check('se crea la nota: el enlace al campo de enlace y el texto completo al campo de texto largo', n and n['group']=='g1' and n['values'].get('fu')=='https://playwright.dev/python' and 'segunda línea' in n['values'].get('fd',''), n)
        check('y sale de la bandeja con aviso', 'Mira https' not in ' '.join(notes()) and 'Archivada en Enlaces' in q.locator('#toast').inner_text())
        # grupo sin campo de texto: no se pierde nada
        seed("""const x = { id: 'qy', text: 'Texto largo\\ncon dos líneas que no caben en un título', t: Date.now() }; st.S.inbox.unshift(x); await st.saveInbox(x);""")
        before = len(notes()); alerts.clear()
        q.click('.qn:has-text("Texto largo")'); q.wait_for_timeout(100)
        dlg.locator('[name=dest]').select_option('note'); dlg.locator('[name=group]').select_option('g2'); dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        check('a un grupo sin campo de texto no se guarda a medias: avisa y deja el diálogo abierto', alerts and 'no tiene un campo de texto' in alerts[0] and q.evaluate("document.querySelector('#dlg').open") and len(notes())==before, alerts)
        dlg.locator('[name=dest]').select_option('list'); dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        li = q.evaluate("import('/js/state.js').then(st => st.S.lists.find(l => l.id === 'L1').items.at(-1))")
        check('archivar en una lista agrega un elemento adicional (en una sola línea)', li and li['extra'] is True and li['text']=='Texto largo con dos líneas que no caben en un título' and li['done'] is False, li)
        check('y sale de la bandeja', len(notes())==before-1)

        # ---- eliminar
        q.click('.qn:has-text("Idea para el viaje")'); q.wait_for_timeout(100); dlg.locator('#del').click(); q.wait_for_timeout(150)
        check('eliminar desde el diálogo', 'Idea para el viaje' not in notes())

        # ---- «Ver más»
        seed("""for (let i = 0; i < 6; i++) { const x = { id: 'm' + i, text: 'Masiva ' + i, t: 1000 + i }; st.S.inbox.push(x); await st.saveInbox(x); }""")
        check('se muestran 5 y un enlace al resto', len(notes())==5 and q.locator('[data-act=qn-more]').count()==1)
        q.click('[data-act=qn-more]'); q.wait_for_timeout(80)
        total = q.evaluate("import('/js/state.js').then(st => st.S.inbox.length)")
        check('«Ver más» las muestra todas y ofrece «Ver menos»', len(notes())==total and q.locator('[data-act=qn-less]').count()==1)

        # ---- lo compartido desde otra app
        q2 = ctx.new_page(); q2.on('dialog', lambda d: d.accept())
        q2.goto(URL + '?title=Art%C3%ADculo%20genial&text=Mira%20esto%20https%3A%2F%2Fejemplo.com%2Fa&url=https%3A%2F%2Fejemplo.com%2Fa'); q2.wait_for_selector('#view .home'); q2.wait_for_timeout(200)
        first = q2.locator('.qn .qn-text').first.inner_text()
        check('compartir desde otra app guarda título y texto en la bandeja, sin repetir el enlace', first=='Artículo genial\nMira esto https://ejemplo.com/a', repr(first))
        check('la dirección queda limpia (recargar no la guarda otra vez)', '?' not in q2.url)
        n0 = q2.locator('.qn').count(); q2.reload(); q2.wait_for_selector('#view .home')
        check('recargar no duplica', q2.locator('.qn').count()==n0 or q2.locator('.qn').count()==5)
        man = json.loads(q2.evaluate("fetch('manifest.webmanifest').then(r => r.text())"))
        check('el manifiesto declara el destino de «Compartir»', man.get('share_target', {}).get('params', {}).get('text')=='text' and man['share_target']['method']=='GET')
        q2.close()

        # ---- tarjeta de dinero
        go('home')
        check('sin cuentas no hay tarjeta de dinero', q.locator('.tile-money').count()==0)
        seed("""const a = { id: 'a1', name: 'Banco', type: 'normal', limit: 0, order: 1, cats: [{ id: 'c1', name: 'Comida', balance: 1234.5 }] }; st.S.accounts.push(a); await st.saveAccount(a);""")
        check('el dinero arranca oculto', 'Q ••••' in q.locator('.tile-money').inner_text() and '1,234' not in q.locator('.tile-money').inner_text())
        q.click('.tile-money .eye'); q.wait_for_timeout(80)
        check('el ojo lo muestra', 'Q1,234.50' in q.locator('.tile-money').inner_text() and q.locator('.tile-money .eye').get_attribute('aria-pressed')=='true')
        q.click('.tile-money .eye'); q.wait_for_timeout(80)
        check('y lo vuelve a ocultar', 'Q ••••' in q.locator('.tile-money').inner_text())
        q.reload(); q.wait_for_selector('#view .home')
        check('al reabrir la app vuelve a estar oculto', 'Q ••••' in q.locator('.tile-money').inner_text())
        q.click('.tile-money .tile-main'); q.wait_for_timeout(100)
        check('tocar la tarjeta abre Finanzas', q.locator('#topbar h1').inner_text()=='Finanzas')

        # ---- Inicio ya no trae tarjeta de Pomodoro (ahora hay un resumen de ejercicio; ver inicio_resumen.py)
        go('home')
        check('Inicio no tiene tarjeta de Pomodoro', q.locator('.tile:has-text("Pomodoro")').count()==0)
        q.screenshot(path=OUT+'home3.png', full_page=True)
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
