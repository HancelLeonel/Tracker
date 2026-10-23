"""Logo e iconos de la app: aro de tres arcos con los colores de las secciones y palomita, en los tres PNG del manifiesto, en icon.svg y en la pantalla de arranque."""
import os, sys, json, math, re
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
import subprocess
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)

# Arcos centrados en estos ángulos (grados, en sentido horario desde la derecha) y su color de sección (tokens oscuros de style.css).
ARCS = [(-60, '--yellow', 'Hábitos'), (60, '--blue', 'Listas'), (180, '--teal', 'Finanzas')]
PIXELS = """async ([src, pts, scale, off]) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return { w: img.naturalWidth, h: img.naturalHeight, px: pts.map(([x, y]) => Array.from(g.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data)) };
}"""
def hexrgb(h): return [int(h[i:i+2], 16) for i in (1, 3, 5)]
def near(px, rgb, tol=16): return all(abs(px[i] - rgb[i]) <= tol for i in range(3)) and px[3] > 240
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_context(viewport={'width':390,'height':800}).new_page()
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        tok = {t: hexrgb(page.evaluate("t => getComputedStyle(document.documentElement).getPropertyValue(t).trim()", t)) for _, t, _ in ARCS}
        bg = hexrgb('#111317'); ink = hexrgb('#e8eaee')
        man = json.loads(page.evaluate("fetch('manifest.webmanifest').then(r => r.text())"))
        icons = {i['src']: i for i in man['icons']}
        check('el manifiesto sigue declarando los 3 iconos', sorted(icons) == ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'], sorted(icons))
        for src, size, maskable in (('icons/icon-512.png', 512, False), ('icons/icon-192.png', 192, False), ('icons/icon-maskable-512.png', 512, True)):
            k = 0.8 if maskable else 1                         # el maskable lleva la marca al 80 %
            at = lambda x, y: (256 + (x - 256) * k, 256 + (y - 256) * k)
            pt = lambda ang: at(256 + 184 * math.cos(math.radians(ang)), 256 + 184 * math.sin(math.radians(ang)))
            pts = [pt(m) for m, _, _ in ARCS] + [pt(m + 60) for m, _, _ in ARCS] + [at(237, 328), at(256, 256)]
            r = page.evaluate(PIXELS, [src, pts, size / 512, 0])
            check(f'{src}: mide {size}×{size}', r['w'] == size and r['h'] == size, (r['w'], r['h']))
            for i, (m, t, name) in enumerate(ARCS):
                check(f'{src}: el arco de {name} tiene el color de su sección', near(r['px'][i], tok[t]), (r['px'][i], tok[t]))
            check(f'{src}: entre los arcos hay hueco (fondo oscuro)', all(near(r['px'][3 + i], bg) for i in range(3)), r['px'][3:6])
            check(f'{src}: la palomita es clara', near(r['px'][6], ink), r['px'][6])
            check(f'{src}: el centro es fondo', near(r['px'][7], bg), r['px'][7])
        svg = Path(ROOT, 'icons/icon.svg').read_text()
        boot = re.search(r'<div class="boot".*?</svg>', Path(ROOT, 'index.html').read_text(), re.S).group(0)
        for name, text in (('icon.svg', svg), ('la pantalla de arranque de index.html', boot)):
            hexes = [page.evaluate("t => getComputedStyle(document.documentElement).getPropertyValue(t).trim()", t) for _, t, _ in ARCS]
            check(f'{name} usa los tres colores de sección', all(h.lower() in text.lower() for h in hexes), hexes)
            check(f'{name} ya no usa el lavanda antiguo de la palomita', '#9aa7f5' not in text.lower())
        check('el fondo del manifiesto sigue siendo el del tema oscuro', man['background_color'].lower() == '#111317' and man['theme_color'].lower() == '#111317')
        b.close()
finally:
    srv.terminate()
print('errors: []')
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
