import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
os.makedirs(OUT, exist_ok=True)
import subprocess, time, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
# index.html (modulepreload) y sw.js (SHELL) deben listar exactamente los módulos de js/.
import re
mods = sorted(f.name for f in Path(ROOT, 'js').glob('*.js'))
html = Path(ROOT, 'index.html').read_text(); sw = Path(ROOT, 'sw.js').read_text()
pre = sorted(re.findall(r'rel="modulepreload" href="js/([\w.]+)"', html))
shell = sorted(re.findall(r"'js/([\w.]+)'", sw))
print(('PASS ' if pre == mods else 'FAIL ') + 'index.html precarga todos los módulos', '' if pre == mods else (set(mods) ^ set(pre)))
print(('PASS ' if shell == mods else 'FAIL ') + 'sw.js (SHELL) lista todos los módulos', '' if shell == mods else (set(mods) ^ set(shell)))
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page()
        errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.goto('http://localhost:8765/')
        page.wait_for_selector('#view .home')
        page.screenshot(path=OUT + 's0.png')
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
