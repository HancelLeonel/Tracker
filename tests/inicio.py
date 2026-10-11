import os, sys, tempfile
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
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        quote = lambda: page.locator('.home-quote p').inner_text().strip() + ' | ' + page.locator('.home-quote footer').inner_text().strip()
        def go(tab): page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(60)
        N = page.evaluate("import('/js/home.js').then(m => m.QUOTES.length)")

        # ---- ninguna se repite hasta haberlas visto todas (la inicial + N-1 toques)
        seen = [quote()]
        for _ in range(N - 1):
            page.click('[data-act=home-quote]'); page.wait_for_timeout(15); seen.append(quote())
        check('al tocar la frase cambia y no se repite hasta mostrar todas', len(set(seen)) == N and all(seen[i] != seen[i+1] for i in range(N-1)), (N, len(set(seen))))
        page.click('[data-act=home-quote]'); page.wait_for_timeout(15)
        check('al iniciar otra ronda no repite la última', quote() != seen[-1])

        # ---- predeterminada y contenido
        page2 = ctx.new_page(); page2.goto('http://localhost:8765/'); page2.wait_for_selector('#view .home')
        check('la app abre en Inicio', page2.locator('#topbar h1').inner_text()=='Inicio' and page2.locator('#view .card').count()==0)
        check('Inicio es la primera opción del menú y está marcada', page2.evaluate("document.querySelector('#tabs button').dataset.tab") == 'home' and page2.evaluate("document.querySelector('#tabs button').classList.contains('on')"))
        h = page2.evaluate("new Date().getHours()")
        want = 'Buenos días' if h < 12 else 'Buenas tardes' if h < 19 else 'Buenas noches'
        check('saludo según la hora', page2.locator('.home-top h2').inner_text().strip() == want, (want, page2.locator('.home-top h2').inner_text()))
        date = page2.locator('.home-top small').inner_text().strip()
        check('fecha en español con inicial mayúscula', date[0].isupper() and any(m in date for m in ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']), date)
        txt = page2.locator('.home-quote p').inner_text().strip(); au = page2.locator('.home-quote footer').inner_text().strip()
        ok = page2.evaluate("([t, a]) => import('/js/home.js').then(m => m.QUOTES.some(q => q[0] === t && a.endsWith(q[1])))", [txt, au])
        check('la frase y su autor salen de la lista', ok and len(txt) > 10 and len(au) > 2, (txt, au))
        check('sin desbordamiento horizontal', page2.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        page2.screenshot(path=OUT+'home.png')

        # ---- no cambia al repintar (abrir/cerrar menú), sí al volver a mostrarla
        q0 = page2.locator('.home-quote p').inner_text()
        page2.click('[data-act=menu-open]'); page2.click('[data-act=menu-close] >> nth=0'); page2.wait_for_timeout(60)
        check('abrir y cerrar el menú no cambia la frase', page2.locator('.home-quote p').inner_text() == q0)
        seen = {q0}
        for _ in range(5):
            page2.click('[data-act=menu-open]'); page2.click('#tabs [data-tab=habits]'); page2.wait_for_timeout(40)
            page2.click('[data-act=menu-open]'); page2.click('#tabs [data-tab=home]'); page2.wait_for_timeout(40)
            seen.add(page2.locator('.home-quote p').inner_text())
        check('cada vez que se vuelve a Inicio hay otra frase', len(seen) == 6, len(seen))
        before = page2.locator('.home-quote p').inner_text()
        page2.click('[data-act=menu-open]'); page2.click('#tabs [data-tab=home]'); page2.wait_for_timeout(40)
        check('elegir Inicio estando en Inicio también cambia la frase', page2.locator('.home-quote p').inner_text() != before)

        # ---- al regresar a la app desde segundo plano (visibilitychange) se elige otra, solo si se está en Inicio
        fire = "() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
        a = page2.locator('.home-quote p').inner_text(); page2.evaluate(fire); page2.wait_for_timeout(40)
        check('al volver a la app en Inicio cambia la frase', page2.locator('.home-quote p').inner_text() != a)
        go_ = lambda t: (page2.click('[data-act=menu-open]'), page2.click(f'#tabs [data-tab={t}]'), page2.wait_for_timeout(40))
        go_('habits'); page2.evaluate(fire); page2.wait_for_timeout(40)
        check('fuera de Inicio no se repinta', page2.locator('#topbar h1').inner_text() == 'Hábitos')
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
