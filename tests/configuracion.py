"""Configuración (antes «Datos»): selector de fuente (sistema / JetBrains Mono)."""
import os, sys, tempfile, json
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
        family = lambda: q.evaluate("getComputedStyle(document.body).fontFamily")
        def go(tab): q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(120)

        # ---- nombre
        names = q.evaluate("(() => { document.querySelector('[data-act=menu-open]').click(); return [...document.querySelectorAll('#tabs button')].map(b => b.innerText.trim()); })()")
        check('el menú dice «Configuración» y ya no «Datos»', names[-1]=='Configuración' and 'Datos' not in names, names)
        q.keyboard.press('Escape'); q.wait_for_timeout(300)
        go('data')
        check('la pantalla se titula «Configuración» y trae Apariencia, Respaldo y lo demás', q.locator('#topbar h1').inner_text()=='Configuración' and all(t in q.locator('#view').inner_text() for t in ['Apariencia','Respaldo','Tipos de gasto','Zona de peligro']))

        # ---- fuente por defecto
        check('por defecto usa la fuente del sistema', family().startswith('system-ui') and q.evaluate("document.documentElement.dataset.font")=='system', family())
        check('«Predeterminada del sistema» está marcada y explica cuál es', q.locator('input[name=font][value=system]').is_checked() and 'Roboto' in q.locator('.font-opt:has(input[name=font])').first.inner_text())
        check('cada opción se muestra con su propia letra', q.evaluate("[...document.querySelectorAll('.fo-sample')].map(e => getComputedStyle(e).fontFamily)").__len__()==2 and 'JetBrains' in q.evaluate("getComputedStyle(document.querySelectorAll('.fo-sample')[1]).fontFamily"))
        base = q.evaluate("getComputedStyle(document.documentElement).fontSize")

        # ---- elegir JetBrains Mono
        q.click('.font-opt:has(input[value=jetbrains])'); q.wait_for_timeout(400)
        check('al elegir JetBrains Mono toda la interfaz cambia de fuente', 'JetBrains Mono' in family() and q.evaluate("document.documentElement.dataset.font")=='jetbrains', family())
        loaded = q.evaluate("document.fonts.ready.then(() => [...document.fonts].filter(f => f.family.includes('JetBrains') && f.status === 'loaded').length)")
        check('el archivo de la fuente se descarga y carga (viene dentro de la app, funciona sin conexión)', loaded >= 1, loaded)
        check('la opción queda marcada', q.locator('input[name=font][value=jetbrains]').is_checked())
        check('se reduce un poco el tamaño base para que quepa', q.evaluate("parseFloat(getComputedStyle(document.documentElement).fontSize)") < float(base.replace('px','')))
        # la fuente de los controles también cambia
        ff = q.evaluate("[document.querySelector('button.btn') , document.querySelector('#topbar h1')].filter(Boolean).map(e => getComputedStyle(e).fontFamily)")
        check('botones y títulos usan la nueva fuente', all('JetBrains Mono' in f for f in ff), ff)
        q.screenshot(path=OUT+'cfg_mono.png', full_page=True)

        # ---- se conserva
        q.reload(); q.wait_for_selector('#view .home')
        check('al reabrir la app se mantiene', 'JetBrains Mono' in family() and q.evaluate("document.documentElement.dataset.font")=='jetbrains')
        check('se guardó en los ajustes (viaja en el respaldo)', q.evaluate("import('/js/state.js').then(st => st.S.settings.font)")=='jetbrains')
        go('data')
        with q.expect_download() as dl: q.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        check('el respaldo incluye la fuente elegida', data['settings']['font']=='jetbrains')

        # ---- nada se sale de la pantalla con la monoespaciada (390 px)
        bad = []
        for tab in ['home','money','habits','lists','purchases','pomodoro','gym','notes','data']:
            go(tab)
            if tab == 'money':
                for sub in ['accounts','bills','reports']:
                    q.click(f'[data-act=sub][data-sub={sub}]'); q.wait_for_timeout(80)
                    if q.evaluate("document.documentElement.scrollWidth > innerWidth"): bad.append(f'money/{sub}')
            if tab == 'lists':
                for sub in ['lists','agenda','templates','archive']:
                    q.click(f'[data-act=list-sub][data-sub={sub}]'); q.wait_for_timeout(80)
                    if q.evaluate("document.documentElement.scrollWidth > innerWidth"): bad.append(f'lists/{sub}')
            if q.evaluate("document.documentElement.scrollWidth > innerWidth"): bad.append(tab)
        check('ninguna pantalla se desborda en horizontal con JetBrains Mono', not bad, bad)
        go('home'); q.screenshot(path=OUT+'home_mono.png', full_page=True)

        # ---- volver a la del sistema
        go('data'); q.click('.font-opt:has(input[value=system])'); q.wait_for_timeout(300)
        check('volver a la del sistema', family().startswith('system-ui') and q.evaluate("document.documentElement.dataset.font")=='system')

        # ---- importar un respaldo con una fuente inválida no rompe nada
        Path(tempfile.gettempdir(), 'weird-font.json').write_text(json.dumps({'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'font':'comic'}}))
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-font.json')); q.wait_for_timeout(800)
        check('una fuente desconocida en un respaldo se corrige a la del sistema', q.evaluate("import('/js/state.js').then(st => st.S.settings.font)")=='system' and q.evaluate("document.documentElement.dataset.font")=='system')
        # un respaldo que trae JetBrains la aplica al importar
        Path(tempfile.gettempdir(), 'jb-font.json').write_text(json.dumps({'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'font':'jetbrains'}}))
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'jb-font.json')); q.wait_for_timeout(800)
        check('un respaldo con JetBrains Mono la aplica al importar', 'JetBrains Mono' in family())

        # ---- tema: oscuro, claro o automático
        theme = lambda pg=q: pg.evaluate("document.documentElement.dataset.theme")
        bar = lambda pg=q: pg.evaluate("document.querySelector('meta[name=theme-color]').content")
        bg = lambda pg=q: pg.evaluate("getComputedStyle(document.body).backgroundColor")
        saved = lambda: q.evaluate("import('/js/state.js').then(st => st.S.settings.theme)")
        go('data')
        check('Apariencia ofrece Oscuro, Claro y Automático; por defecto oscuro', q.locator('input[name=theme]').count()==3 and q.locator('input[name=theme][value=dark]').is_checked() and theme()=='dark' and bar()=='#111317' and bg()=='rgb(17, 19, 23)', (theme(), bar(), bg()))
        q.click('.font-opt:has(input[value=light])'); q.wait_for_timeout(200)
        check('«Claro» cambia toda la interfaz, los controles nativos y la barra del sistema', theme()=='light' and bar()=='#f3f4f6' and bg()=='rgb(243, 244, 246)' and q.evaluate("getComputedStyle(document.documentElement).colorScheme")=='light', (theme(), bar(), bg()))
        check('se guarda en los ajustes (viaja en el respaldo)', saved()=='light')
        q.reload(); q.wait_for_selector('#view .home')
        check('al reabrir la app se mantiene', theme()=='light' and bar()=='#f3f4f6')
        q.screenshot(path=OUT+'tema_claro.png', full_page=True)
        # desde el primer pintado: aunque la app aún no haya cargado (la pantalla de carga ya sale clara)
        q.evaluate("navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))")  # sin él, la app sale de su copia
        q2 = ctx.new_page(); q2.route('**/js/**', lambda r: r.abort()); q2.goto(URL); q2.wait_for_timeout(300)
        check('la pantalla de carga ya usa el tema elegido (antes de cargar los módulos)', theme(q2)=='light' and bg(q2)=='rgb(243, 244, 246)' and q2.locator('.boot').count()==1, (theme(q2), bg(q2)))
        q2.close()
        # automático: sigue al sistema, también si cambia con la app abierta
        q.emulate_media(color_scheme='dark'); go('data')
        q.click('.font-opt:has(input[value=auto])'); q.wait_for_timeout(200)
        check('«Automático» con el sistema en oscuro: oscuro', theme()=='dark' and saved()=='auto' and bar()=='#111317')
        q.emulate_media(color_scheme='light'); q.wait_for_timeout(200)
        check('si el sistema pasa a claro, la app cambia sola', theme()=='light' and bar()=='#f3f4f6')
        q.emulate_media(color_scheme='dark'); q.wait_for_timeout(200)
        check('y de vuelta a oscuro', theme()=='dark')
        q.emulate_media(color_scheme='light'); q.reload(); q.wait_for_selector('#view .home')
        check('al abrir con el sistema en claro arranca en claro', theme()=='light')
        q.emulate_media(color_scheme='dark')
        go('data'); q.click('.font-opt:has(input[value=dark])'); q.wait_for_timeout(200)
        q.emulate_media(color_scheme='light'); q.wait_for_timeout(200)
        check('con «Oscuro» fijo, el sistema en claro no lo cambia', theme()=='dark')
        # respaldo con un tema inválido
        Path(tempfile.gettempdir(), 'weird-theme.json').write_text(json.dumps({'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'theme':'neón'}}))
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'weird-theme.json')); q.wait_for_timeout(800)
        check('un tema desconocido en un respaldo se corrige a oscuro', saved()=='dark' and theme()=='dark')
        Path(tempfile.gettempdir(), 'light-theme.json').write_text(json.dumps({'app':'tracker','version':3,'habits':[],'accounts':[],'moves':[],'settings':{'theme':'light'}}))
        with q.expect_file_chooser() as fc: q.click('[data-act=import]')
        fc.value.set_files(os.path.join(tempfile.gettempdir(), 'light-theme.json')); q.wait_for_timeout(800)
        check('un respaldo con tema claro lo aplica al importar', theme()=='light')
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
