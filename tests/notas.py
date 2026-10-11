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
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        ctx.grant_permissions(['clipboard-read','clipboard-write'], origin='http://localhost:8765')
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        title = lambda: page.locator('#topbar h1').inner_text().strip()
        def go(tab):
            if page.locator('[data-act=note-back]').count(): page.click('[data-act=note-back]'); page.wait_for_timeout(60)
            page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(80)
        rows = lambda: [t.split('\n')[0].strip() for t in page.locator('.note-row .card.note').all_inner_texts()]
        def new_group(preset, name=None):
            page.click('#topbar [data-act=new-ngroup]'); page.wait_for_timeout(80)
            if preset: dlg.locator('[name=preset]').select_option(preset)
            if name: dlg.locator('[name=name]').fill(name)
            save()
        def new_note(ttl, fields=None, tags=None):
            page.click('#topbar [data-act=new-note]'); page.wait_for_timeout(80)
            dlg.locator('[name=title]').fill(ttl)
            for label, v in (fields or {}).items(): dlg.get_by_label(label, exact=True).fill(v)
            if tags is not None: dlg.locator('[name=tags]').fill(tags)
            save()

        # ---- sin grupos
        go('notes')
        check('sin grupos: estado vacío', 'Aún no tienes grupos de notas' in txt() and page.locator('[data-act=new-ngroup]').count()>=1)

        # ---- grupo «Enlaces» desde un ejemplo
        page.click('#topbar [data-act=new-ngroup]'); page.wait_for_timeout(80)
        dlg.locator('[name=preset]').select_option('links')
        check('el ejemplo rellena nombre y campos', dlg.locator('[name=name]').input_value()=='Enlaces' and dlg.locator('.frow').count()==2 and dlg.locator('.frow [data-k=name]').first.input_value()=='Enlace')
        check('el ejemplo marca su icono', dlg.locator('input[name=icon]:checked').get_attribute('value')=='link')
        save()
        check('al crear el grupo se abre listo para llenar', title()=='Enlaces' and 'Aún no hay notas' in txt(), (title(), txt()[:80]))

        # ---- notas: normalización de enlaces, resumen, etiquetas
        new_note('Documentación de Playwright', {'Enlace':'playwright.dev/python','Descripción':'Guía oficial'}, 'dev, #Docs')
        check('la nota aparece con el dominio y las etiquetas', rows()==['Documentación de Playwright'] and 'playwright.dev' in txt() and '#dev #Docs' in txt(), txt())
        a = page.locator('.note-row a.icon')
        check('el enlace sin esquema se guarda con https:// y abre en pestaña nueva', a.get_attribute('href')=='https://playwright.dev/python' and a.get_attribute('target')=='_blank' and 'noopener' in a.get_attribute('rel'))
        new_note('Malicioso <img src=x onerror=window.__x=1>', {'Enlace':'javascript:alert(1)'}, '')
        check('un javascript: no se vuelve enlace', page.locator('.note-row a').count()==1)
        check('el texto de usuario se escapa (sin ejecutar HTML)', page.evaluate('window.__x') is None and 'Malicioso <img' in txt())
        page.click('.note-row:has-text("Malicioso") .card.note'); page.wait_for_timeout(80)
        check('en el detalle tampoco hay enlace peligroso', dlg.locator('dd a').count()==0 and 'javascript:alert(1)' in dlg.inner_text())
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)
        check('más reciente primero', rows()[0].startswith('Malicioso'), rows())

        # ---- búsqueda y etiquetas
        page.fill('#nsearch', 'PLAYWRIGHT'); page.wait_for_timeout(60)
        check('buscar por título (sin importar mayúsculas)', len(rows())==1 and page.evaluate("document.activeElement.id")=='nsearch')
        page.fill('#nsearch', 'guia'); page.wait_for_timeout(60)
        check('buscar dentro de los campos, sin tildes', len(rows())==1 and rows()[0].startswith('Documentación'))
        page.fill('#nsearch', 'docs'); page.wait_for_timeout(60)
        check('buscar por etiqueta', len(rows())==1)
        page.fill('#nsearch', 'zzz'); page.wait_for_timeout(60)
        check('sin coincidencias', 'No hay notas que coincidan' in txt())
        page.fill('#nsearch', ''); page.wait_for_timeout(60)
        check('limpiar muestra todas', len(rows())==2)
        page.click('[data-act=note-tag][data-tag=dev]'); page.wait_for_timeout(60)
        check('filtro por etiqueta', len(rows())==1 and page.locator('[data-tag=dev]').get_attribute('aria-pressed')=='true')
        page.click('[data-act=note-tag][data-tag=dev]'); page.wait_for_timeout(60)
        check('tocar la etiqueta otra vez quita el filtro', len(rows())==2)

        # ---- detalle y edición (la editada sube al principio)
        page.click('.note-row:has-text("Documentación") .card.note'); page.wait_for_timeout(80)
        check('detalle: enlace clicable, campos y etiquetas', dlg.locator('dd a[href="https://playwright.dev/python"]').count()==1 and 'Guía oficial' in dlg.inner_text() and '#dev' in dlg.inner_text())
        page.screenshot(path=OUT+'n_detail.png')
        dlg.locator('[data-act=note-edit]').click(); page.wait_for_timeout(80)
        check('editar: formulario con los valores actuales', dlg.locator('[name=title]').input_value()=='Documentación de Playwright' and dlg.get_by_label('Enlace', exact=True).input_value()=='https://playwright.dev/python' and dlg.locator('[name=tags]').input_value()=='dev, Docs')
        dlg.locator('[name=title]').fill('Docs de Playwright'); save()
        check('la nota editada pasa al principio', rows()[0]=='Docs de Playwright', rows())
        page.screenshot(path=OUT+'n_links.png', full_page=True)

        # ---- grupo «Comandos»: copiar
        page.click('[data-act=note-back]'); page.wait_for_timeout(80)
        new_group('cmds')
        new_note('Últimos commits', {'Comando':'git log --oneline -5','Plataforma':'git'}, 'git')
        check('comando: resumen con comando y plataforma', 'git log --oneline -5 · git' in txt(), txt())
        page.click('.note-row [data-act=note-copy]'); page.wait_for_timeout(150)
        check('el botón de la lista copia el comando', page.evaluate('navigator.clipboard.readText()')=='git log --oneline -5' and 'Copiado' in page.locator('#toast').inner_text())
        page.click('.note-row .card.note'); page.wait_for_timeout(80)
        check('detalle: bloque de código con botón Copiar', dlg.locator('pre.code').inner_text()=='git log --oneline -5' and dlg.locator('[data-act=note-copy]').count()==1)
        page.evaluate("navigator.clipboard.writeText('x')"); dlg.locator('[data-act=note-copy]').click(); page.wait_for_timeout(150)
        check('Copiar del detalle también funciona', page.evaluate('navigator.clipboard.readText()')=='git log --oneline -5')
        dlg.locator('#cancel').click(); page.wait_for_timeout(60)

        # ---- grupo «Libros»: opciones y calificación
        page.click('[data-act=note-back]'); page.wait_for_timeout(80)
        new_group('books')
        page.click('#topbar [data-act=new-note]'); page.wait_for_timeout(80)
        dlg.locator('[name=title]').fill('Cien años de soledad'); dlg.get_by_label('Autor', exact=True).fill('García Márquez')
        dlg.locator('label:has-text("Estado") select').select_option('Leyendo'); dlg.locator('[data-star="4"]').click()
        dlg.get_by_label('Notas', exact=True).fill('Muy bueno')
        check('las estrellas se marcan hasta la elegida', dlg.locator('.star.on').count()==4)
        save()
        check('libro: resumen Autor · Estado · Calificación', 'García Márquez · Leyendo · 4/5' in txt(), txt())
        page.click('.note-row .card.note'); page.wait_for_timeout(80)
        check('detalle: calificación con 4 estrellas llenas', dlg.locator('.stars-ro .star.on').count()==4 and 'Muy bueno' in dlg.inner_text())
        dlg.locator('[data-act=note-edit]').click(); page.wait_for_timeout(80)
        dlg.locator('[data-star="4"]').click()
        check('tocar la misma estrella la quita', dlg.locator('.star.on').count()==0 and dlg.locator('input[type=hidden]').input_value()=='0')
        save()
        check('sin calificación no aparece en el resumen', '4/5' not in txt() and 'García Márquez · Leyendo' in txt(), txt())

        # ---- configurar el grupo: agregar, mover y quitar campos
        page.click('[data-act=edit-ngroup]'); page.wait_for_timeout(80)
        dlg.locator('#addf').click()
        dlg.locator('.frow').last.locator('[data-k=name]').fill('Páginas'); dlg.locator('.frow').last.locator('[data-k=type]').select_option('number')
        dlg.locator('.frow').last.locator('[data-k=list]').check()
        for i in (4, 3, 2): dlg.locator('.frow').nth(i).locator('[data-mv="-1"]').click()
        names = dlg.locator('.frow [data-k=name]').evaluate_all('els => els.map(e => e.value)')
        check('agregar y subir campos', names==['Autor','Páginas','Estado','Calificación','Notas'], names)
        dlg.locator('.frow').last.locator('[data-rm]').click()   # quita «Notas»
        check('quitar un campo', dlg.locator('.frow').count()==4)
        dlg.locator('.frow').nth(1).locator('[data-k=name]').fill('')
        save()
        check('un campo sin nombre no se guarda', page.evaluate("document.querySelector('#dlg').open"))
        dlg.locator('.frow').nth(1).locator('[data-k=name]').fill('Páginas'); save()
        page.click('.note-row .card.note'); page.wait_for_timeout(80)
        check('el campo quitado ya no aparece en las notas', 'Muy bueno' not in dlg.inner_text() and 'Notas' not in dlg.inner_text())
        dlg.locator('[data-act=note-edit]').click(); page.wait_for_timeout(80)
        check('el formulario refleja los campos nuevos (número)', dlg.get_by_label('Páginas', exact=True).get_attribute('type')=='number')
        dlg.get_by_label('Páginas', exact=True).fill('471'); save()
        check('el número se muestra en la lista (campo marcado «En la lista»)', '471' in txt() and 'García Márquez · 471 · Leyendo' in txt(), txt())
        page.screenshot(path=OUT+'n_books.png', full_page=True)

        # ---- grupo en blanco con un solo campo; nota solo con título
        page.click('[data-act=note-back]'); page.wait_for_timeout(80)
        new_group('', 'Recetas')
        page.click('[data-act=edit-ngroup]'); page.wait_for_timeout(80)
        check('grupo en blanco sin campos', dlg.locator('.frow').count()==0 and 'Sin campos' in dlg.inner_text())
        dlg.locator('#addf').click(); dlg.locator('.frow [data-k=name]').fill('Tiempo (min)'); dlg.locator('.frow [data-k=type]').select_option('choice')
        dlg.locator('.frow [data-k=options]').fill('Rápida, Normal ,Lenta'); save()
        new_note('Arepas')
        page.click('.note-row .card.note'); page.wait_for_timeout(80)
        check('nota solo con título', 'solo tiene título' in dlg.inner_text())
        dlg.locator('[data-act=note-edit]').click(); page.wait_for_timeout(80)
        opts = dlg.locator('label:has-text("Tiempo (min)") select option').all_inner_texts()
        check('las opciones se separan por coma y se limpian', opts==['—','Rápida','Normal','Lenta'], opts)
        dlg.locator('#cancel').click(); page.wait_for_timeout(60)

        # ---- vista general: orden alfabético y conteo
        page.click('[data-act=note-back]'); page.wait_for_timeout(80)
        gn = [t.split('\n')[0].strip() for t in page.locator('.ngroup').all_inner_texts()]
        check('grupos en orden alfabético', gn==['Comandos','Enlaces','Libros','Recetas'], gn)
        check('conteo de notas por grupo', '2 notas' in page.locator('.ngroup:has-text("Enlaces")').inner_text() and '1 nota' in page.locator('.ngroup:has-text("Libros")').inner_text())
        page.screenshot(path=OUT+'n_home.png', full_page=True)

        # ---- paginación
        page.evaluate("""async () => { const st = await import('/js/state.js'); const g = st.S.noteGroups.find(g => g.name === 'Enlaces');
          for (let i = 0; i < 45; i++) { const n = { id: 'bulk' + i, group: g.id, title: 'Masiva ' + String(i).padStart(2, '0'), values: {}, tags: [], created: i, updated: i }; st.S.notes.push(n); await st.saveNote(n); } }""")
        page.reload(); page.wait_for_selector('#view .home'); go('notes'); page.click('.ngroup:has-text("Enlaces")'); page.wait_for_timeout(100)
        check('paginado: 40 filas y «Ver más»', len(rows())==40 and page.locator('[data-act=more-notes]').count()==1, len(rows()))
        page.click('[data-act=more-notes]'); page.wait_for_timeout(80)
        check('«Ver más» muestra el resto (47 en total)', len(rows())==47 and page.locator('[data-act=more-notes]').count()==0, len(rows()))
        page.fill('#nsearch', 'masiva 07'); page.wait_for_timeout(60)
        check('la búsqueda recorre todas, no solo las visibles', len(rows())==1)
        page.fill('#nsearch', '')

        # ---- exportar / borrar todo / importar
        go('data')
        with page.expect_download() as dl: page.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        g = {x['name']: x for x in data['noteGroups']}
        check('respaldo: grupos con campos y notas', sorted(g)==['Comandos','Enlaces','Libros','Recetas'] and len(data['notes'])==50 and [f['type'] for f in g['Libros']['fields']]==['text','number','choice','rating'], sorted(g))
        libro = [n for n in data['notes'] if n['title']=='Cien años de soledad'][0]
        check('respaldo: el valor del campo quitado se eliminó de la nota', 'Muy bueno' not in json.dumps(libro['values']) and 471 in libro['values'].values(), libro)
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        go('notes'); check('borrar todo vacía las notas', 'Aún no tienes grupos de notas' in txt())
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); page.wait_for_timeout(800)
        go('notes')
        check('importar restaura grupos y notas', page.locator('.ngroup').count()==4 and '47 notas' in page.locator('.ngroup:has-text("Enlaces")').inner_text())

        # ---- respaldo con datos raros: se sanea
        weird = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],
          'noteGroups':[{'id':'g1','name':'Raro','color':'nope','icon':'nada','fields':[{'id':'a','name':'Uno','type':'inventado','list':1},{'id':'b','name':'Dos','type':'choice','options':[1,'x']},{'name':'sin id','type':'text'}]}],
          'notes':[{'id':'n1','group':'g1','title':'Vale','values':{'a':'v','b':{'x':1},'c':[1],'d':True,'e':float('inf') if False else 5},'tags':['t',3]},
                   {'id':'n2','group':'no-existe','title':'Huérfana','values':{}}]}
        Path(tempfile.gettempdir(), 'weird-notes.json').write_text(json.dumps(weird))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-notes.json')); page.wait_for_timeout(800)
        go('notes'); page.click('.ngroup:has-text("Raro")'); page.wait_for_timeout(100)
        check('importación sanea: campo de tipo desconocido pasa a texto, nota huérfana descartada, valores no válidos fuera', rows()==['Vale'])
        page.click('.note-row .card.note'); page.wait_for_timeout(80)
        check('importación sanea: se muestran solo los valores válidos', 'v' in dlg.inner_text() and '#t' in dlg.inner_text() and '#3' in dlg.inner_text())
        dlg.locator('#cancel').click(); page.wait_for_timeout(60)
        page.click('[data-act=note-back]'); page.wait_for_timeout(60)
        check('icono y color inválidos se corrigen', page.locator('.ngroup .h-ic svg').count()==1)

        # ---- borrar nota y grupo
        page.click('.ngroup:has-text("Raro")'); page.wait_for_timeout(100)
        page.click('.note-row .card.note'); dlg.locator('[data-act=note-edit]').click(); page.wait_for_timeout(80)
        dlg.locator('#del').click(); page.wait_for_timeout(150)
        check('eliminar nota', 'Aún no hay notas' in txt())
        page.click('[data-act=edit-ngroup]'); page.wait_for_timeout(80); dlg.locator('#del').click(); page.wait_for_timeout(150)
        check('eliminar grupo vuelve a la vista general', page.locator('.ngroup').count()==0 and 'Aún no tienes grupos de notas' in txt())

        # ---- respaldo antiguo sin notas
        Path(tempfile.gettempdir(), 'old-notes.json').write_text(json.dumps({'app':'mi-quincena','version':2,'habits':[],'accounts':[],'moves':[]}))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'old-notes.json')); page.wait_for_timeout(800)
        go('notes'); check('respaldo antiguo: sin grupos', 'Aún no tienes grupos de notas' in txt())
        check('sin errores de consola', errs == [], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
