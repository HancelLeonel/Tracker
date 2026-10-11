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
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .card')
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        def go(tab): page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(80)
        rows = lambda: [t.strip() for t in page.locator('.li .li-t').all_inner_texts()]
        prog = lambda: page.locator('.progress-ring b').inner_text().strip()

        check('el menú tiene la opción Listas', page.evaluate("document.querySelector('#tabs [data-tab=lists]') !== null"))
        go('lists')
        check('sin datos: estado vacío con acceso a plantillas', 'Aún no tienes listas' in txt() and page.locator('[data-act=new-tpl]').count()>=1, txt())

        # ---- plantilla
        page.click('#topbar [data-act=new-tpl]') if page.locator('#topbar [data-act=new-tpl]').count() else page.click('[data-act=new-tpl] >> nth=0')
        dlg.locator('[name=name]').fill('Súper quincenal')
        dlg.locator('[name=freq]').select_option('biweekly')
        dlg.locator('[name=items]').fill('# Frutas y verduras\nTomate\nCebolla\n\n# Lácteos\nLeche\nQueso\n')
        dlg.locator('.swatches label:has(input[value=green])').click()
        save()
        check('la plantilla aparece con 4 elementos', 'Súper quincenal' in txt() and '4 elementos' in txt() and 'Cada 15 días' in txt(), txt())
        check('encabezados # no cuentan como elementos', '6 elementos' not in txt())
        page.screenshot(path=OUT+'l_templates.png', full_page=True)

        # ---- crear lista desde plantilla
        page.click('[data-act=use-tpl]'); page.wait_for_timeout(150)
        check('abre el detalle de la lista nueva', page.locator('#topbar h1').inner_text().startswith('Súper quincenal ·'), page.locator('#topbar h1').inner_text())
        check('copia los elementos de la plantilla', rows()==['Tomate','Cebolla','Leche','Queso'], rows())
        check('copia los encabezados de sección', [h.strip().upper() for h in page.locator('.li-list .slot-h').all_inner_texts()]==['FRUTAS Y VERDURAS','LÁCTEOS'])
        check('progreso inicial 0/4', prog()=='0/4', prog())

        # ---- marcar
        page.click('.li:has-text("Tomate")'); page.click('.li:has-text("Leche")'); page.wait_for_timeout(100)
        check('marcar actualiza el progreso', prog()=='2/4', prog())
        check('marcados se tachan', page.locator('.li.done').count()==2)

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
        page.reload(); page.wait_for_selector('#view .card'); go('lists')
        check('persiste tras recargar', '2/6' in txt())
        page.click('[data-act=open-list]'); page.wait_for_timeout(100)
        check('persisten los marcados', page.locator('.li.done').count()==2 and rows()[-1]=='Detergente')

        # ---- modo editar: quitar un elemento
        page.click('[data-act=list-edit]'); page.wait_for_timeout(80)
        check('modo editar muestra botones para quitar', page.locator('[data-act=li-del]').count()==6)
        page.click('[data-act=li-del][aria-label="Quitar Queso"]'); page.wait_for_timeout(100)
        check('quita el elemento', 'Queso' not in rows() and len(rows())==5, rows())
        page.click('[data-act=list-edit]')

        # ---- completar -> pasa a «Completadas»
        for t in ['Cebolla','Pilas AA','Detergente']: page.click(f'.li:has-text("{t}")')
        page.wait_for_timeout(100)
        check('todo marcado: lista completa', prog()=='5/5' and 'Lista completa' in txt(), txt()[:60])
        page.click('[data-act=list-back]'); page.wait_for_timeout(100)
        check('aparece en Completadas', 'COMPLETADAS' in txt().upper() and page.locator('.list-card.compact').count()==1)
        page.click('[data-act=open-list]'); page.fill('#li-new', 'Pan'); page.press('#li-new', 'Enter'); page.wait_for_timeout(100)
        page.click('[data-act=list-back]'); page.wait_for_timeout(100)
        check('agregar algo la reactiva', 'COMPLETADAS' not in txt().upper() and '5/6' in txt(), txt())

        # ---- «Ya toca»: se simula una lista vieja de la plantilla
        page.evaluate("""async () => {
          const db = await new Promise(r => { const q = indexedDB.open('mi-quincena'); q.onsuccess = () => r(q.result); });
          const tx = db.transaction('lists', 'readwrite'); const st = tx.objectStore('lists');
          const all = await new Promise(r => { const q = st.getAll(); q.onsuccess = () => r(q.result); });
          for (const l of all) { l.created = '2020-01-01'; st.put(l); }
          await new Promise(r => tx.oncomplete = r);
        }""")
        page.reload(); page.wait_for_selector('#view .card'); go('lists')
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
        body = dlg.locator('[name=items]').input_value()
        check('formulario precargado con los elementos fijos', body.startswith('# Frutas y verduras\nTomate') and 'Extra de una vez' not in body, body)
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
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        go('lists')
        check('borrar todo vacía listas y plantillas', 'Aún no tienes listas' in txt())
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); page.wait_for_timeout(700)
        go('lists')
        check('import: listas de vuelta', page.locator('.list-card').count()==n_lists, page.locator('.list-card').count())
        page.click('[data-act=list-sub][data-sub=templates]'); page.wait_for_timeout(80)
        check('import: plantilla de vuelta', 'Súper quincenal' in txt() and '4 elementos' in txt())

        # ---- editar plantilla (las listas ya creadas no cambian) y eliminarla
        page.click('[data-act=edit-tpl]'); check('editar: texto con encabezados', dlg.locator('[name=items]').input_value().startswith('# Frutas y verduras\nTomate'))
        dlg.locator('[name=items]').fill('Solo esto'); save()
        check('plantilla editada', '1 elemento' in txt() and '1 elementos' not in txt(), txt())
        page.click('[data-act=edit-tpl]'); dlg.locator('#del').click(); page.wait_for_timeout(200)
        check('plantilla eliminada', 'Aún no tienes plantillas' in txt())
        page.click('[data-act=list-sub][data-sub=lists]'); page.wait_for_timeout(80)
        check('las listas creadas con ella siguen', page.locator('.list-card').count()==n_lists)

        # ---- respaldo antiguo (sin plantillas ni listas) se importa
        old = {'app':'mi-quincena','version':2,'habits':[],'accounts':[],'moves':[]}
        Path(tempfile.gettempdir(), 'old-lists.json').write_text(json.dumps(old))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'old-lists.json')); page.wait_for_timeout(700)
        go('lists')
        check('respaldo antiguo: sin listas ni plantillas', 'Aún no tienes listas' in txt())
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
