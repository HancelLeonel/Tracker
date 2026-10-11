"""Bandeja de Inicio: seleccionar varias notas rápidas y archivarlas juntas (como notas, en una lista o eliminarlas) y sugerencia de grupo."""
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
        ctx = b.new_context(viewport={'width':390,'height':800})
        q = ctx.new_page(); errs=[]; msgs=[]
        q.on('pageerror', lambda e: errs.append(str(e)))
        q.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        q.on('dialog', lambda d: (msgs.append(d.message), d.accept()))
        q.goto(URL); q.wait_for_selector('#view .home')
        dlg = q.locator('#dlg')
        is_open = lambda: q.evaluate("document.querySelector('#dlg').open")
        def save(): dlg.locator('button.primary').click(); q.wait_for_timeout(200)
        def seed(js):
            q.evaluate("""async (js) => { const st = await import('/js/state.js'); const db = await import('/js/db.js');
              await (new Function('st', 'db', 'return (async () => {' + js + '})()'))(st, db); st.hooks.render(); }""", js)
            q.wait_for_timeout(100)
        S = lambda js: q.evaluate("import('/js/state.js').then(m => " + js + ")")
        def add(*texts):
            seed("const qs = %s.map((text, i) => ({ id: 'q' + Date.now() + i, text, t: Date.now() + i })); qs.forEach(x => st.S.inbox.unshift(x)); await db.commit({ put: { inbox: qs } });" % json.dumps(list(texts)))
        rows = lambda: q.locator('.inbox .qn')
        pick = lambda i: (rows().nth(i).click(), q.wait_for_timeout(60))

        # ---- grupos y una lista para archivar
        seed("""const gs = [{ id: 'gl', name: 'Enlaces', color: 'blue', icon: 'link', fields: [{ id: 'u', name: 'Enlace', type: 'url', list: true }, { id: 'd', name: 'Descripción', type: 'long' }] },
                       { id: 'ga', name: 'Apuntes', color: 'mauve', icon: 'note', fields: [{ id: 'c', name: 'Contenido', type: 'long' }] },
                       { id: 'gs', name: 'Solo título', color: 'green', icon: 'note', fields: [] }];
          gs.forEach(g => st.S.noteGroups.push(g)); st.S.noteGroups.sort((a, b) => a.name.localeCompare(b.name));
          const l = { id: 'L', name: 'Pendientes', tplId: null, color: 'mauve', created: '2026-01-01', t: 1, items: [] }; st.S.lists.push(l);
          await db.commit({ put: { noteGroups: gs, lists: [l] } });""")

        add('Una sola')
        check('con una sola nota rápida no se ofrece «Seleccionar»', q.locator('[data-act=qn-select]').count()==0)
        add('Llamar al dentista', 'Mira esto\nhttps://ejemplo.com/a', 'Comprar foco')
        check('con varias aparece «Seleccionar»', q.locator('[data-act=qn-select]').count()==1)
        q.click('[data-act=qn-select]'); q.wait_for_timeout(80)
        check('en modo selección se ven todas, con casillas, y la barra con «Archivar (0)» desactivado', rows().count()==4 and q.locator('.qn.pick').count()==4 and q.locator('[data-act=qn-batch]').is_disabled() and 'Archivar (0)' in q.locator('[data-act=qn-batch]').inner_text())
        pick(0); pick(2)
        check('tocar marca y desmarca; el botón cuenta las elegidas', q.locator('.qn.pick.on').count()==2 and 'Archivar (2)' in q.locator('[data-act=qn-batch]').inner_text() and not q.locator('[data-act=qn-batch]').is_disabled())
        pick(2)
        check('tocar otra vez desmarca', q.locator('.qn.pick.on').count()==1)
        q.click('[data-act=qn-pick-all]'); q.wait_for_timeout(60)
        check('«Todas» marca todas y pasa a «Ninguna»', q.locator('.qn.pick.on').count()==4 and q.locator('[data-act=qn-pick-all]').inner_text().strip()=='Ninguna')
        q.click('[data-act=qn-pick-all]'); q.wait_for_timeout(60)
        check('«Ninguna» desmarca todas', q.locator('.qn.pick.on').count()==0)
        check('la barra cabe en una línea a 390 px', q.locator('.qn-bar').bounding_box()['height'] < 60, q.locator('.qn-bar').bounding_box())
        q.screenshot(path=OUT+'bv_seleccion.png', full_page=True)
        q.click('[data-act=qn-cancel]'); q.wait_for_timeout(60)
        check('«Cancelar» vuelve a la bandeja normal (tocar abre la nota)', q.locator('.qn.pick').count()==0 and q.locator('[data-act=qn-open]').count()==4)

        # ---- archivar como notas, con grupo sugerido
        q.click('[data-act=qn-select]'); q.wait_for_timeout(60)
        texts = rows().all_inner_texts()
        for i, t in enumerate(texts):
            if 'ejemplo.com' in t or 'dentista' in t: pick(i)
        q.click('[data-act=qn-batch]'); q.wait_for_timeout(100)
        check('si alguna trae un enlace se sugiere el grupo con campo de enlace', dlg.locator('[name=group]').input_value()=='gl', dlg.locator('[name=group]').input_value())
        dlg.locator('[name=group]').select_option('gs'); dlg.locator('button.primary').click(); q.wait_for_timeout(150)
        check('si el grupo no tiene dónde guardar el texto, no archiva ninguna y avisa', is_open() and any('campo de texto' in m for m in msgs) and S("m.S.inbox.length")==4 and S("m.S.notes.length")==0)
        dlg.locator('[name=group]').select_option('gl'); save()
        notes = S("m.S.notes.map(n => ({ t: n.title, v: n.values }))")
        by = {n['t']: n['v'] for n in notes}
        check('se archivan las dos como notas del grupo, con título y sin perder texto', set(by)=={'Mira esto','Llamar al dentista'} and by['Mira esto']=={'u':'https://ejemplo.com/a','d':'Mira esto\nhttps://ejemplo.com/a'} and by['Llamar al dentista']=={}, notes)
        check('salen de la bandeja y se sale del modo selección', S("m.S.inbox.length")==2 and q.locator('.qn.pick').count()==0 and 'notas archivadas' in q.locator('#toast').inner_text())

        # ---- agregar a una lista
        q.click('[data-act=qn-select]'); q.wait_for_timeout(60); q.click('[data-act=qn-pick-all]'); q.wait_for_timeout(60)
        q.click('[data-act=qn-batch]'); q.wait_for_timeout(100)
        dlg.locator('[name=dest]').select_option('list')
        check('al elegir lista se oculta el grupo y aparece la lista', dlg.locator('#d-note').is_hidden() and dlg.locator('#d-list').is_visible())
        save()
        items = S("m.S.lists.find(l => l.id === 'L').items.map(i => [i.text, !!i.extra])")
        check('todas pasan a la lista como adicionales y la bandeja queda vacía', sorted(i[0] for i in items)==['Comprar foco','Una sola'] and all(i[1] for i in items) and S("m.S.inbox.length")==0 and q.locator('.inbox').count()==0, items)

        # ---- eliminar varias
        add('borrar 1', 'borrar 2', 'quedarse')
        q.click('[data-act=qn-select]'); q.wait_for_timeout(60)
        for i, t in enumerate(rows().all_inner_texts()):
            if 'borrar' in t: pick(i)
        q.click('[data-act=qn-batch]'); q.wait_for_timeout(100)
        dlg.locator('[name=dest]').select_option('delete'); save()
        check('eliminar varias pide confirmación y deja solo las no elegidas', any('¿Eliminar 2 notas rápidas?' in m for m in msgs) and S("m.S.inbox.map(x => x.text)")==['quedarse'])
        q.reload(); q.wait_for_selector('#view .home')
        check('los cambios quedan guardados', S("m.S.inbox.length")==1 and S("m.S.notes.length")==2)

        # ---- la nota individual también sugiere el grupo de enlaces
        add('https://otro.com/x')
        q.locator('[data-act=qn-open]').first.click(); q.wait_for_timeout(100)
        check('al archivar una sola con enlace se sugiere el grupo con campo de enlace', dlg.locator('[name=group]').input_value()=='gl')
        check('los campos que no aplican al destino no se ven', dlg.locator('#d-note').is_hidden() and dlg.locator('#d-list').is_hidden())
        dlg.locator('[name=dest]').select_option('note')
        check('al elegir «Archivar como nota» aparece solo lo del grupo', dlg.locator('#d-note').is_visible() and dlg.locator('#d-list').is_hidden())
        dlg.locator('#cancel').click(); q.wait_for_timeout(60)
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
