import os, sys, tempfile, shutil, re, json
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

# Simula Web Share: el modo decide qué tipos acepta canShare y cómo responde share()
MOCK = """
window.__calls = []; window.__mode = 'txt-only';
Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => window.__mode === 'none' ? false : d.files.every(f => f.type === 'text/plain' || window.__mode === 'all') });
Object.defineProperty(navigator, 'share', { configurable: true, value: async d => {
  window.__calls.push({ name: d.files[0].name, type: d.files[0].type });
  if (window.__mode === 'throw') throw new DOMException('denied', 'NotAllowedError');
  if (window.__mode === 'abort') throw new DOMException('closed', 'AbortError');
} });
"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page(); errs=[]
        page.add_init_script(MOCK)
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        downloads = []
        page.on('download', lambda d: downloads.append(d))

        # ---------- pantalla de carga (con el JS bloqueado se ve el arranque) ----------
        page2 = ctx.new_page()
        page2.route('**/*.js', lambda r: r.abort())
        page2.goto('http://localhost:8765/')
        boot = page2.locator('.boot')
        check('pantalla de carga visible', boot.is_visible() and 'Tracker' in boot.inner_text() and boot.locator('svg').count()==1)
        check('no menciona «Mi Quincena»', 'Quincena' not in page2.locator('body').inner_text())
        page2.screenshot(path=OUT + 'boot.png'); page2.close()
        man = json.loads(Path(ROOT, 'manifest.webmanifest').read_text())
        check('manifest: Tracker + id', man['name']=='Tracker' and man['short_name']=='Tracker' and man['id']=='./')

        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home'); ir(page, 'money'); page.wait_for_selector('#view .card')
        check('la carga se reemplaza por la app', page.locator('.boot').count()==0)
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        def go(tab): ir(page, tab); page.wait_for_timeout(80)

        # ---------- orden alfabético ----------
        def acc(n): page.click('[data-act=new-acc] >> nth=0'); dlg.locator('[name=name]').fill(n); save()
        def cat(acc_name, n, v):
            idx = [t.strip() for t in page.locator('.acc-name h3').all_inner_texts()].index(acc_name)
            page.click(f'[data-act=new-cat] >> nth={idx}'); dlg.locator('[name=name]').fill(n); dlg.locator('[name=balance]').fill(str(v)); save()
        for n in ['Zeta', 'alfa', 'Beta']: acc(n)
        names = [t.strip() for t in page.locator('.acc-name h3').all_inner_texts()]
        check('cuentas en orden alfabético', names==['alfa','Beta','Zeta'], names)
        for n in ['Cat 10', 'Zorro', 'árbol', 'Cat 2', 'beta']: cat('Beta', n, 100)
        cats = [t.split('\n')[0].strip() for t in page.locator('.cat-main').all_inner_texts()]
        check('categorías: sin distinguir tildes/mayúsculas y con números naturales', cats==['árbol','beta','Cat 2','Cat 10','Zorro'], cats)
        # selectores
        page.click('#fab'); opts = dlg.locator('.part select optgroup option').all_inner_texts()
        check('selector del gasto ordenado', [o.split(' ·')[0] for o in opts]==['árbol','beta','Cat 2','Cat 10','Zorro'], opts)
        kinds = [o for o in dlg.locator('[name=kind] option').all_inner_texts() if not o.startswith('+')]
        check('tipos de gasto ordenados', kinds==sorted(kinds, key=lambda x: x.lower().replace('á','a')), kinds)
        dlg.locator('#cancel').click()
        # tarjeta: apartado por categoría ordenado
        page.click('[data-act=sub][data-sub=accounts]')
        acc('Visa')
        page.click('[data-act=acc-moves] >> nth=0'); dlg.locator('#cancel').click()
        names2 = [t.strip() for t in page.locator('.acc-name h3').all_inner_texts()]
        check('cuentas siguen ordenadas con la tarjeta', names2==['alfa','Beta','Visa','Zeta'], names2)
        # el orden persiste al recargar y tras importar
        page.reload(); page.wait_for_selector('#view .home'); ir(page, 'money'); page.wait_for_selector('#view .card')
        names3 = [t.strip() for t in page.locator('.acc-name h3').all_inner_texts()]
        check('orden tras recargar', names3==['alfa','Beta','Visa','Zeta'], names3)

        # ---------- compartir ----------
        go('data'); 
        def share(mode):
            page.evaluate("m => { window.__mode = m; window.__calls = []; }", mode)
            n = len(downloads)
            page.click('[data-act=share]'); page.wait_for_timeout(500)
            return page.evaluate("window.__calls"), len(downloads) - n, page.locator('#toast').inner_text()
        last = lambda: page.locator('.kv:has-text("Último respaldo") span').last.inner_text()
        check('antes: sin respaldo', last()=='nunca')
        calls, dls, toast = share('txt-only')
        check('comparte como .json.txt (text/plain)', len(calls)==1 and calls[0]['name'].endswith('.json.txt') and calls[0]['type']=='text/plain', calls)
        check('sin descarga cuando se comparte', dls==0 and 'compartido' in toast, (dls, toast))
        check('registra el último respaldo', last()!='nunca', last())
        calls, dls, toast = share('all')
        check('aunque se permita JSON usa texto plano', calls and calls[0]['type']=='text/plain', calls)
        calls, dls, toast = share('throw')
        check('si falla (NotAllowedError): descarga y lo avisa', len(calls)==1 and dls==1 and 'NotAllowedError' in toast and 'descargó' in toast, (calls, dls, toast))
        shutil.copy(downloads[-1].path(), '/tmp/respaldo.json')   # copia el respaldo descargado
        calls, dls, toast = share('none')
        check('sin soporte de archivos: descarga', len(calls)==0 and dls==1, (calls, dls, toast))
        # cancelar el menú de compartir no es un error
        page.evaluate("localStorage.clear()")
        calls, dls, toast = share('abort')
        check('cancelar (AbortError): sin descarga ni error', len(calls)==1 and dls==0 and 'No se pudo' not in toast, (calls, dls, toast))

        # ---------- importar el .json.txt compartido ----------
        shutil.copy('/tmp/respaldo.json', '/tmp/tracker-test.json.txt')
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        check('borrado', '0 cuentas' in txt())
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        check('el selector de archivos admite .txt', 'txt' in page.locator('#file').get_attribute('accept'))
        fc.value.set_files('/tmp/tracker-test.json.txt'); page.wait_for_timeout(700)
        check('importa el respaldo compartido (.json.txt)', '4 cuentas' in txt(), txt()[:300])
        go('money'); names4 = [t.strip() for t in page.locator('.acc-name h3').all_inner_texts()]
        check('orden tras importar', names4==['alfa','Beta','Visa','Zeta'], names4)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
