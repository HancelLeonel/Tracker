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
        names = lambda: [t.strip() for t in page.locator('.habit .name').all_inner_texts()]
        heads = lambda: [t.split('\n')[0].strip() for t in page.locator('.slot-h').all_inner_texts()]
        go('habits')
        def habit(name, icon, slot, color=None):
            page.click('[data-act=new-habit] >> nth=0'); dlg.locator('[name=name]').fill(name)
            dlg.locator(f'.icon-grid label:has(input[value={icon}])').click()
            dlg.locator('[name=slot]').select_option(slot)
            if color: dlg.locator(f'.swatches label:has(input[value={color}])').click()
            save()
        # ---- crear con icono y momento
        habit('Tomar agua', 'drop', 'morning', 'blue'); habit('Leer', 'book', 'night'); habit('Caminar', 'run', 'day'); habit('Meditar', 'leaf', 'morning')
        habit('Sin hora', 'star', '')
        check('encabezados en orden: mañana, día, noche, sin horario', heads()==['MAÑANA','DURANTE EL DÍA','NOCHE','SIN HORARIO'] or [h.upper() for h in heads()]==['MAÑANA','DURANTE EL DÍA','NOCHE','SIN HORARIO'], heads())
        check('dentro de cada momento, en orden de creación', names()==['Tomar agua','Meditar','Caminar','Leer','Sin hora'], names())
        icons = page.locator('.habit .h-ic svg').count(); check('cada hábito muestra su icono', icons==5, icons)
        paths = page.evaluate("[...document.querySelectorAll('.habit .h-ic svg')].map(s => s.innerHTML)")
        check('iconos distintos', len(set(paths))==5)
        check('iconos blancos', page.evaluate("[...document.querySelectorAll('.h-ic .i')].every(i => getComputedStyle(i).stroke === 'rgb(255, 255, 255)')"))
        page.screenshot(path=OUT+'h_sections.png', full_page=True)

        # ---- progreso por momento
        page.locator('.habit:has-text("Tomar agua") .day.today .dot').click()
        page.wait_for_function("document.querySelector('.slot-h small').textContent.trim() === '1/2'", timeout=3000)
        check('contador por momento (1/2)', '1/2' in page.locator('.slot-h').first.inner_text())
        check('contador general (1/5)', 'Hoy 1/5' in txt(), txt()[:80])

        # ---- editar: el formulario muestra icono, momento y color actuales
        page.click('[data-act=edit-habit]:has-text("Tomar agua")')
        check('edición: icono marcado', dlg.locator('input[name=icon]:checked').get_attribute('value')=='drop')
        check('edición: momento', dlg.locator('[name=slot]').input_value()=='morning')
        check('edición: color', dlg.locator('input[name=color]:checked').get_attribute('value')=='blue')
        dlg.locator('#cancel').click()

        # ---- reordenar
        page.click('[data-act=habits-sort]'); page.wait_for_timeout(100)
        check('modo ordenar: sin tiras de días', page.locator('.week').count()==0 and page.locator('[data-act=habit-up]').count()==5)
        check('no se puede subir el primero de cada momento', page.locator('.habit:has-text("Tomar agua") [data-act=habit-up]').is_disabled() and page.locator('.habit:has-text("Meditar") [data-act=habit-down]').is_disabled())
        page.screenshot(path=OUT+'h_sort.png', full_page=True)
        page.click('.habit:has-text("Meditar") [data-act=habit-up]'); page.wait_for_timeout(100)
        check('Meditar sube sobre Tomar agua', names()==['Meditar','Tomar agua','Caminar','Leer','Sin hora'] or [n for n in names()]==['Meditar','Tomar agua','Caminar','Leer','Sin hora'], names())
        page.click('.habit:has-text("Meditar") [data-act=habit-down]'); page.wait_for_timeout(100)
        check('y vuelve a bajar', names()[:2]==['Tomar agua','Meditar'], names())
        page.click('.habit:has-text("Meditar") [data-act=habit-up]'); page.wait_for_timeout(100)
        page.click('[data-act=habits-sort]'); page.wait_for_timeout(100)
        check('al salir vuelven las tiras de días', page.locator('.week').count()==5)
        page.reload(); page.wait_for_selector('#view .card'); go('habits')
        check('el orden persiste al recargar', names()[:2]==['Meditar','Tomar agua'], names())

        # ---- cambiar de momento por edición
        page.click('[data-act=edit-habit]:has-text("Sin hora")'); dlg.locator('[name=slot]').select_option('night'); save()
        check('pasa a la sección de noche, al final', names()==['Meditar','Tomar agua','Caminar','Leer','Sin hora'], names())
        check('ya no hay «Sin horario»', not any('SIN HORARIO' in h.upper() for h in heads()), heads())
        page.click('[data-act=habits-sort]')
        page.click('.habit:has-text("Sin hora") [data-act=habit-up]'); page.wait_for_timeout(100)
        check('reordena solo dentro de su momento', names()[3:]==['Sin hora','Leer'], names())
        page.click('[data-act=habits-sort]')

        # ---- exportar / importar conserva icono, momento y orden
        go('data')
        with page.expect_download() as dl: page.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        hs = {h['name']: h for h in data['habits']}
        check('export: icono, momento y orden', hs['Tomar agua']['icon']=='drop' and hs['Tomar agua']['slot']=='morning' and hs['Leer']['icon']=='book' and all('order' in h for h in hs.values()), hs['Tomar agua'])
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); page.wait_for_timeout(700)
        go('habits')
        check('import: mismo orden y secciones', names()==['Meditar','Tomar agua','Caminar','Sin hora','Leer'] and heads()!=[], (names(), heads()))
        check('import: iconos', page.locator('.habit .h-ic svg').count()==5)

        # ---- respaldo antiguo sin icono/momento/orden
        old = {'app':'mi-quincena','version':2,'habits':[{'id':'h1','name':'Zeta','color':'blue','dates':{}},{'id':'h2','name':'Alfa','color':'bogus','dates':{}, 'icon':'no-existe','slot':'tarde'}],'accounts':[],'moves':[]}
        Path('/tmp/old-habits.json').write_text(json.dumps(old))
        go('data')
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files('/tmp/old-habits.json'); page.wait_for_timeout(700)
        go('habits')
        check('respaldo antiguo: orden alfabético estable y sin encabezados', names()==['Alfa','Zeta'] and page.locator('.slot-h').count()==0, (names(), page.locator('.slot-h').count()))
        check('respaldo antiguo: valores inválidos se corrigen', page.locator('.habit .h-ic svg').count()==2)
        page.reload(); page.wait_for_selector('#view .card'); go('habits')
        check('orden estable tras recargar', names()==['Alfa','Zeta'])

        # ---- eliminar
        page.click('[data-act=edit-habit]:has-text("Zeta")'); dlg.locator('#del').click(); page.wait_for_timeout(200)
        check('eliminar', names()==['Alfa'])
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
