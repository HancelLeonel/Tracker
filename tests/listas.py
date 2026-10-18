import os, sys, tempfile, json
from datetime import date, timedelta
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess, time, re
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card')
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        def go(tab):
            if page.locator('[data-act=list-back]').count(): page.click('[data-act=list-back]'); page.wait_for_timeout(60)
            page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(80)
        rows = lambda: [t.strip() for t in page.locator('.li .li-t').all_inner_texts()]
        prog = lambda: page.locator('.progress-ring b').inner_text().strip()

        check('el menú tiene la opción Listas', page.evaluate("document.querySelector('#tabs [data-tab=lists]') !== null"))
        go('lists')
        check('sin datos: estado vacío con acceso a plantillas', 'No tienes listas activas' in txt() and page.locator('[data-act=new-tpl]').count()>=1, txt())

        # ---- plantilla
        page.click('#topbar [data-act=new-tpl]') if page.locator('#topbar [data-act=new-tpl]').count() else page.click('[data-act=new-tpl] >> nth=0')
        dlg.locator('[name=name]').fill('Súper quincenal')
        dlg.locator('[name=freq]').select_option('biweekly')
        # los elementos se escriben por filas: Enter agrega otra debajo, una fila vacía no se guarda
        dlg.locator('.tr-in').first.click(); dlg.locator('.tr:focus-within [data-tr=head]').click()
        page.keyboard.type('Frutas y verduras'); page.keyboard.press('Enter'); page.keyboard.type('Tomate'); page.keyboard.press('Enter')
        page.keyboard.type('Cebolla'); page.keyboard.press('Enter'); page.keyboard.press('Enter')
        dlg.locator('[data-tr-add=head]').click(); page.keyboard.type('Lácteos'); page.keyboard.press('Enter')
        page.keyboard.type('Leche'); page.keyboard.press('Enter'); page.keyboard.type('Queso')
        check('Enter agrega una fila debajo y el foco queda en ella', dlg.locator('.tr').count()==8 and dlg.locator('.tr-in:focus').input_value()=='Queso', dlg.locator('.tr').count())
        dlg.locator('.swatches label:has(input[value=green])').click()
        save()
        check('la plantilla aparece con 4 elementos', 'Súper quincenal' in txt() and '4 elementos' in txt() and 'Cada 15 días' in txt(), txt())
        check('encabezados # no cuentan como elementos', '6 elementos' not in txt())
        page.screenshot(path=OUT+'l_templates.png', full_page=True)

        # ---- crear lista desde plantilla
        page.click('[data-act=use-tpl]'); page.wait_for_timeout(150)
        check('abre el detalle de la lista nueva', page.locator('#topbar h1').inner_text().startswith('Súper quincenal ·'), page.locator('#topbar h1').inner_text())
        check('copia los elementos de la plantilla', rows()==['Tomate','Cebolla','Leche','Queso'], rows())
        check('copia los encabezados de sección', [h.strip().upper() for h in page.locator('#view .slot-h').all_inner_texts()]==['FRUTAS Y VERDURAS','LÁCTEOS'])
        check('progreso inicial 0/4', prog()=='0/4', prog())

        # ---- marcar
        page.click('.li:has-text("Tomate")'); page.click('.li:has-text("Leche")'); page.wait_for_timeout(100)
        check('marcar actualiza el progreso', prog()=='2/4', prog())
        check('marcados se tachan', page.locator('.li.done').count()==2)
        check('lo hecho baja al final de su sección (los pendientes conservan su orden)', rows()==['Cebolla','Tomate','Queso','Leche'], rows())
        check('se registra la fecha en que se hizo', page.locator('.li:has-text("Tomate") .li-meta').inner_text().startswith('Hecho el '), page.locator('.li:has-text("Tomate") .li-meta').inner_text())
        page.click('.li:has-text("Tomate")'); page.wait_for_timeout(80)
        check('al desmarcar vuelve a su lugar y pierde la fecha', rows()==['Tomate','Cebolla','Queso','Leche'] and page.locator('.li:has-text("Tomate") .li-meta').count()==0, rows())
        page.click('.li:has-text("Tomate")'); page.wait_for_timeout(80)

        # ---- agregar adicionales (con Enter y sin perder el foco)
        inp = page.locator('#li-new'); inp.fill('Pilas AA'); inp.press('Enter'); page.wait_for_timeout(150)
        check('adicional agregado en su sección', rows()[-1]=='Pilas AA' and 'ADICIONALES' in txt().upper(), rows())
        check('el foco vuelve al campo', page.evaluate("document.activeElement && document.activeElement.id") == 'li-new')
        page.locator('#li-new').fill('Detergente'); page.click('[data-act=li-add]'); page.wait_for_timeout(150)
        check('segundo adicional con el botón', rows()[-2:]==['Pilas AA','Detergente'] and prog()=='2/6', (rows(), prog()))
        page.locator('#li-new').press('Enter'); page.wait_for_timeout(100)
        check('campo vacío no agrega nada', len(rows())==6)
        page.screenshot(path=OUT+'l_detail.png', full_page=True)

        # ---- la plantilla no cambia
        page.click('[data-act=list-back]'); page.click('[data-act=list-sub][data-sub=templates]'); page.wait_for_timeout(80)
        check('la plantilla sigue igual (4 elementos)', '4 elementos' in txt() and 'última vez' in txt(), txt())
        page.click('[data-act=list-sub][data-sub=lists]'); page.wait_for_timeout(80)
        check('la lista activa muestra su avance', '2/6' in txt(), txt())

        # ---- persistencia
        page.reload(); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card'); go('lists')
        check('persiste tras recargar', '2/6' in txt())
        page.click('[data-act=open-list]'); page.wait_for_timeout(100)
        check('persisten los marcados', page.locator('.li.done').count()==2 and rows()[-1]=='Detergente')

        # ---- modo editar: quitar un elemento
        page.click('[data-act=list-edit]'); page.wait_for_timeout(80)
        check('modo editar muestra botones para quitar', page.locator('[data-act=li-del]').count()==6)
        page.click('[data-act=li-del][aria-label="Quitar Queso"]'); page.wait_for_timeout(100)
        check('quita el elemento', 'Queso' not in rows() and len(rows())==5, rows())
        # editar el texto y la fecha de un elemento
        TOMORROW = (date.today() + timedelta(days=1)).isoformat()
        page.click('[data-act=li-edit-item][aria-label="Editar Cebolla"]'); page.wait_for_timeout(80)
        check('editar elemento: formulario con texto y fecha', dlg.locator('[name=text]').input_value()=='Cebolla' and dlg.locator('[name=due]').input_value()=='')
        dlg.locator('[name=text]').fill('Cebolla morada'); dlg.locator('[name=due]').fill(TOMORROW); save()
        check('se guardó el texto nuevo', 'Cebolla morada' in rows(), rows())
        page.click('[data-act=li-edit-item][aria-label="Editar Cebolla morada"]'); page.wait_for_timeout(80)
        dlg.locator('#clear-due').click()
        check('«Quitar fecha» vacía el campo', dlg.locator('[name=due]').input_value()=='')
        dlg.locator('[name=due]').fill(TOMORROW); save()
        page.click('[data-act=list-edit]'); page.wait_for_timeout(80)
        check('fecha límite mañana: aviso «Vence mañana»', page.locator('.li:has-text("Cebolla morada") .li-meta').inner_text()=='Vence mañana', page.locator('.li:has-text("Cebolla morada") .li-meta').inner_text())

        # ---- fechas límite desde el calendario de cada elemento
        D = lambda n: (date.today() + timedelta(days=n)).isoformat()
        cal = lambda t: page.locator(f'.li:has-text("{t}") input[type=date]')
        meta = lambda t: page.locator(f'.li:has-text("{t}") .li-meta').inner_text()
        cal('Pilas AA').fill(D(-3)); page.wait_for_timeout(100)
        check('fecha pasada: «Venció» con los días', meta('Pilas AA').startswith('Venció el') and 'hace 3 días' in meta('Pilas AA'), meta('Pilas AA'))
        check('vencida: clase de alerta', 'neg' in page.locator('.li:has-text("Pilas AA") .li-meta').get_attribute('class') and 'late' in page.locator('.li:has-text("Pilas AA") .li-cal').get_attribute('class'))
        page.click('[data-act=list-back]'); page.wait_for_timeout(80)
        check('la tarjeta de la lista cuenta las vencidas', '1 vencida' in txt(), txt())
        page.click('[data-act=open-list]'); page.wait_for_timeout(80)
        cal('Pilas AA').fill(D(0)); page.wait_for_timeout(100)
        check('hoy: «Vence hoy»', meta('Pilas AA')=='Vence hoy')
        cal('Pilas AA').fill(D(5)); page.wait_for_timeout(100)
        check('futuro: «Vence el … (en 5 días)»', meta('Pilas AA').startswith('Vence el') and 'en 5 días' in meta('Pilas AA'), meta('Pilas AA'))
        page.click('[data-act=list-back]'); page.wait_for_timeout(80)
        check('la tarjeta muestra la próxima fecha (mañana es la más cercana)', 'Próxima:' in txt(), txt())
        page.click('[data-act=open-list]'); page.wait_for_timeout(80)
        page.screenshot(path=OUT+'l_dates.png', full_page=True)

        # ---- completar -> botón «Finalizar lista»
        for t in ['Cebolla morada','Pilas AA']: page.click(f'.li:has-text("{t}")')
        page.wait_for_timeout(100)
        check('todavía falta uno: no hay botón de finalizar', prog()=='4/5' and page.locator('[data-act=list-finish]').count()==0, prog())
        page.click('.li:has-text("Detergente")'); page.wait_for_timeout(100)
        check('con todo marcado aparece «Finalizar lista»', prog()=='5/5' and page.locator('[data-act=list-finish]').count()==1 and 'Finalizar lista' in txt(), txt()[:80])
        check('un elemento hecho ya no ofrece calendario', page.locator('.li:has-text("Detergente") input[type=date]').count()==0)
        page.click('[data-act=list-back]'); page.wait_for_timeout(80)
        check('en la vista general: «Lista para finalizar»', 'Lista para finalizar' in txt())
        page.click('[data-act=open-list]'); page.fill('#li-new', 'Pan'); page.press('#li-new', 'Enter'); page.wait_for_timeout(100)
        check('agregar algo quita el botón', page.locator('[data-act=list-finish]').count()==0 and prog()=='5/6', prog())
        page.click('.li:has-text("Pan")'); page.wait_for_timeout(100)
        page.screenshot(path=OUT+'l_finish.png', full_page=True)
        page.click('[data-act=list-finish]'); page.wait_for_timeout(150)
        check('finalizar archiva y vuelve a la vista general', page.locator('#topbar h1').inner_text()=='Listas' and 'Lista finalizada y archivada' in page.locator('#toast').inner_text())
        check('ya no está entre las activas', page.locator('.list-card').count()==0 and 'No tienes listas activas' in txt(), txt())
        check('el Archivo cuenta una lista', page.locator('[data-act=list-sub][data-sub=archive]').inner_text().replace('\n',' ').strip()=='Archivo 1', page.locator('[data-act=list-sub][data-sub=archive]').inner_text())
        page.click('[data-act=list-sub][data-sub=archive]'); page.wait_for_timeout(80)
        check('en el Archivo aparece con su fecha de finalización', page.locator('.list-card.compact').count()==1 and 'Finalizada el' in txt() and '6/6' in txt(), txt())
        page.screenshot(path=OUT+'l_archive.png', full_page=True)
        page.click('[data-act=open-list]'); page.wait_for_timeout(100)
        check('lista archivada: aviso, sin agregar, sin marcar, sin editar', 'Lista finalizada el' in txt() and page.locator('#li-new').count()==0 and page.locator('[data-act=li-toggle]').count()==0 and page.locator('[data-act=list-edit]').count()==0 and page.locator('#view input[type=date]').count()==0)
        check('lista archivada: se siguen viendo las fechas de lo hecho', 'Hecho el' in page.locator('#view').inner_text())
        page.click('[data-act=list-restore]'); page.wait_for_timeout(100)
        check('restaurar la vuelve editable', page.locator('#li-new').count()==1 and page.locator('[data-act=list-restore]').count()==0 and 'Finalizar lista' in txt(), txt()[:80])
        page.click('[data-act=list-back]'); page.click('[data-act=list-sub][data-sub=archive]'); page.wait_for_timeout(80)
        check('al restaurar sale del Archivo', 'Aquí aparecen las listas que finalices' in txt())
        page.click('[data-act=list-sub][data-sub=lists]'); page.click('[data-act=open-list]'); page.wait_for_timeout(100)
        page.click('[data-act=list-finish]'); page.wait_for_timeout(150)   # queda finalizada para el resto de las pruebas

        # ---- «Ya toca»: se simula una lista vieja de la plantilla
        page.evaluate("""async () => {
          const db = await new Promise(r => { const q = indexedDB.open('mi-quincena'); q.onsuccess = () => r(q.result); });
          const tx = db.transaction('lists', 'readwrite'); const st = tx.objectStore('lists');
          const all = await new Promise(r => { const q = st.getAll(); q.onsuccess = () => r(q.result); });
          for (const l of all) { l.created = '2020-01-01'; st.put(l); }
          await new Promise(r => tx.oncomplete = r);
        }""")
        page.reload(); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card'); go('lists')
        check('plantilla vencida: aviso «Ya toca» en Listas', page.locator('.card.due').count()==1 and 'Ya toca' in txt(), txt())
        page.screenshot(path=OUT+'l_due.png', full_page=True)
        page.click('.card.due [data-act=use-tpl]'); page.wait_for_timeout(150)
        check('crear desde el aviso abre la lista nueva', rows()==['Tomate','Cebolla','Leche','Queso'], rows())
        page.click('[data-act=list-back]'); page.wait_for_timeout(100)
        check('tras crearla ya no avisa', page.locator('.card.due').count()==0)

        # ---- nueva lista desde el diálogo (con plantilla y vacía)
        page.click('#topbar [data-act=new-list]'); page.wait_for_timeout(100)
        dlg.locator('[name=tpl]').select_option(index=1)
        check('el nombre sugerido sigue a la plantilla', dlg.locator('[name=name]').input_value().startswith('Súper quincenal ·'), dlg.locator('[name=name]').input_value())
        dlg.locator('[name=name]').fill('Super de fin de mes'); save()
        check('lista con nombre propio', page.locator('#topbar h1').inner_text()=='Super de fin de mes' and len(rows())==4)
        page.click('[data-act=list-back]'); page.click('#topbar [data-act=new-list]'); page.wait_for_timeout(100)
        dlg.locator('[name=name]').fill('Ferretería'); save()
        check('lista vacía', 'La lista está vacía' in txt() and rows()==[])

        # ---- guardar una lista como plantilla (sin los adicionales)
        page.click('[data-act=list-back]'); page.click('[data-act=open-list]:has-text("Súper quincenal ·") >> nth=0'); page.wait_for_timeout(100)
        page.fill('#li-new', 'Extra de una vez'); page.press('#li-new', 'Enter'); page.wait_for_timeout(100)
        page.click('[data-act=list-opts]'); page.click('[data-act=list-to-tpl]'); page.wait_for_timeout(100)
        body = dlg.locator('.tr-in').evaluate_all('els => els.map(e => e.value)')
        check('formulario precargado con los elementos fijos', body[:2]==['Frutas y verduras','Tomate'] and 'Extra de una vez' not in body and dlg.locator('.tr.head').count()==2, body)
        check('nombre sin la fecha', dlg.locator('[name=name]').input_value()=='Súper quincenal', dlg.locator('[name=name]').input_value())
        dlg.locator('[name=name]').fill('Copia desde lista'); save()
        page.click('[data-act=list-back]'); page.click('[data-act=list-sub][data-sub=templates]'); page.wait_for_timeout(80)
        check('la plantilla nueva existe junto a la original', page.locator('[data-act=edit-tpl]').count()==2 and 'Copia desde lista' in txt(), txt())
        page.click('[data-act=edit-tpl]:has-text("Copia desde lista")'); dlg.locator('#del').click(); page.wait_for_timeout(150)
        page.click('[data-act=list-sub][data-sub=lists]'); page.click('[data-act=open-list]:has-text("Ferretería")'); page.wait_for_timeout(100)

        # ---- renombrar y eliminar lista
        page.click('[data-act=list-opts]'); dlg.locator('[name=name]').fill('Ferretería 2'); save()
        check('renombrar', page.locator('#topbar h1').inner_text()=='Ferretería 2')
        page.click('[data-act=list-opts]'); dlg.locator('#del').click(); page.wait_for_timeout(200)
        check('eliminar lista vuelve a la vista general', 'Ferretería' not in txt() and page.locator('[data-act=list-back]').count()==0)

        # ---- exportar / importar
        go('data')
        with page.expect_download() as dl: page.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        check('export: plantillas y listas', len(data['templates'])==1 and len(data['lists'])==3 and data['templates'][0]['freq']=='biweekly' and data['templates'][0]['items'][0]=={'text':'Frutas y verduras','head':True}, data.get('templates'))
        n_lists = len(data['lists'])
        arch = [l for l in data['lists'] if l.get('archived')]
        its = [i for l in data['lists'] for i in l['items']]
        check('export: lista archivada, fecha de hecho y fecha límite', len(arch)==1 and re.fullmatch(r'\d{4}-\d{2}-\d{2}', arch[0]['archived']) and any(i.get('doneAt') for i in its) and any(i.get('due') for i in its) and data['settings'].get('listsArchiveMigrated') is True, arch)
        n_active = n_lists - 1
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        go('lists')
        check('borrar todo vacía listas y plantillas', 'No tienes listas activas' in txt())
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); page.wait_for_timeout(700)
        go('lists')
        check('import: listas activas de vuelta', page.locator('.list-card').count()==n_active, page.locator('.list-card').count())
        page.click('[data-act=list-sub][data-sub=archive]'); page.wait_for_timeout(80)
        check('import: la archivada sigue en el Archivo (no se re-archiva nada más)', page.locator('.list-card.compact').count()==1)
        page.click('[data-act=list-sub][data-sub=lists]'); page.wait_for_timeout(60)
        page.click('[data-act=list-sub][data-sub=templates]'); page.wait_for_timeout(80)
        check('import: plantilla de vuelta', 'Súper quincenal' in txt() and '4 elementos' in txt())

        # ---- editar plantilla (las listas ya creadas no cambian) y eliminarla
        page.click('[data-act=edit-tpl]'); check('editar: una fila por elemento, con los encabezados como sección', dlg.locator('.tr-in').first.input_value()=='Frutas y verduras' and dlg.locator('.tr.head').count()==2 and dlg.locator('.tr').count()==6, dlg.locator('.tr').count())
        for _ in range(5): dlg.locator('.tr >> nth=0').locator('.tr-in').click(); dlg.locator('.tr:focus-within [data-tr=rm]').click()
        dlg.locator('.tr-in').first.fill('Solo esto'); save()
        check('plantilla editada', '1 elemento' in txt() and '1 elementos' not in txt(), txt())
        page.click('[data-act=edit-tpl]'); dlg.locator('#del').click(); page.wait_for_timeout(200)
        check('plantilla eliminada', 'Aún no tienes plantillas' in txt())
        page.click('[data-act=list-sub][data-sub=lists]'); page.wait_for_timeout(80)
        check('las listas creadas con ella siguen', page.locator('.list-card').count()==n_active)

        # ---- migración única: las listas ya completadas (de antes de «Finalizar») se archivan solas
        page.evaluate("""async () => {
          const st = await import('/js/state.js'); const db = await import('/js/db.js');
          const mk = (id, items) => ({ id, name: id, tplId: null, color: 'mauve', created: '2026-01-05', t: 1, items });
          const done = mk('mig-done', [{ id: 'a', text: 'x', done: true }]), open = mk('mig-open', [{ id: 'b', text: 'y', done: false }]);
          st.S.lists.push(done, open); st.S.settings.listsArchiveMigrated = false;
          await db.commit({ put: { lists: [done, open], meta: [{ k: 'settings', v: st.S.settings }] } });
        }""")
        page.reload(); page.wait_for_selector('#view .home'); go('lists')
        check('migración: la lista completa de antes pasa al Archivo con su fecha de creación', 'mig-open' in txt() and 'mig-done' not in txt())
        page.click('[data-act=list-sub][data-sub=archive]'); page.wait_for_timeout(80)
        check('migración: aparece archivada con la fecha de creación', 'mig-done' in txt() and 'Finalizada el 5 ene' in txt(), txt())
        page.reload(); page.wait_for_selector('#view .home'); go('lists'); page.click('[data-act=list-sub][data-sub=archive]'); page.wait_for_timeout(80)
        check('la migración no se repite (una lista nueva completa sigue activa)', 'mig-done' in txt())

        # ---- importar un respaldo con fechas inválidas: se sanea
        weird = {'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'listsArchiveMigrated':True},
          'lists':[{'id':'w1','name':'Rara','created':'2026-02-01','t':1,'archived':'ayer','items':[
             {'id':'i1','text':'a','done':True,'doneAt':'2026-02-03','due':'mañana'},
             {'id':'i2','text':'b','done':False,'doneAt':'2026-02-03','due':'2026-02-10'}]}]}
        Path(tempfile.gettempdir(), 'weird-lists.json').write_text(json.dumps(weird))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-lists.json')); page.wait_for_timeout(800)
        go('lists'); page.click('[data-act=list-sub][data-sub=lists]'); page.wait_for_timeout(80)
        check('importar: archivado inválido se descarta (la lista queda activa)', 'Rara' in txt())
        page.click('[data-act=open-list]'); page.wait_for_timeout(100)
        ma = page.locator('.li:has(.li-t:text-is("a")) .li-meta').all_inner_texts(); mb = page.locator('.li:has(.li-t:text-is("b")) .li-meta').all_inner_texts()
        check('importar: fecha límite inválida se descarta y se conserva la fecha de hecho', ma==['Hecho el 3 feb'], ma)
        check('importar: en un elemento sin hacer solo cuenta la fecha límite (no la de hecho)', len(mb)==1 and mb[0].startswith('Venció el 10 feb'), mb)

        # ---- respaldo antiguo (sin plantillas ni listas) se importa
        old = {'app':'mi-quincena','version':2,'habits':[],'accounts':[],'moves':[]}
        Path(tempfile.gettempdir(), 'old-lists.json').write_text(json.dumps(old))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'old-lists.json')); page.wait_for_timeout(700)
        go('lists')
        check('respaldo antiguo: sin listas ni plantillas', 'No tienes listas activas' in txt())
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
