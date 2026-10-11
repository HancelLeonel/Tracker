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
# Vibración y pantalla encendida simuladas para poder comprobarlas.
STUBS = """
window.__vib = []; navigator.vibrate = p => (window.__vib.push(p), true);
window.__wl = 0;
Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl++; return { release: async () => {}, addEventListener() {} }; } } });
"""
T0 = 1_700_000_000_000
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.add_init_script(STUBS)
        page.clock.install(time=T0)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        page.clock.pause_at(T0 + 10_000)
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(120)
        txt = lambda: page.locator('#view').inner_text()
        clock = lambda: page.locator('.pomo-clock').inner_text().strip()
        phase = lambda: page.locator('.pomo-phase b').inner_text().strip().upper()
        sub = lambda: page.locator('.pomo-phase small').inner_text().strip()
        def go(tab): page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(80)
        def run_for(ms): page.clock.run_for(ms); page.wait_for_timeout(60)
        def toggle(): page.click('[data-act=pomo-toggle]'); page.wait_for_timeout(60)
        def cfg(work=None, short=None, long=None, rounds=None, auto=None):
            page.click('[data-act=pomo-cfg]')
            for k, v in (('work',work),('short',short),('long',long),('rounds',rounds)):
                if v is not None: dlg.locator(f'[name={k}]').fill(str(v))
            if auto is not None: dlg.locator('[name=auto]').set_checked(auto)
            save()

        # ---- menú y secciones vacías
        names = page.evaluate("(() => { document.querySelector('[data-act=menu-open]').click(); return [...document.querySelectorAll('#tabs button')].map(b => b.innerText.trim()); })()")
        check('menú en orden con las pestañas nuevas', names == ['Inicio','Finanzas','Hábitos','Listas','Compras','Pomodoro','Gimnasio','Notas','Datos'], names)
        page.click('[data-act=menu-close] >> nth=0'); page.wait_for_timeout(300)
        for tab, title in (('gym','Gimnasio'),):
            go(tab)
            check(f'{title}: título y sección vacía', page.locator('#topbar h1').inner_text()==title and 'vacía' in txt() and page.locator('#view .card').count()==1, txt())

        # ---- valores iniciales
        go('pomodoro')
        check('Pomodoro: 25:00, Trabajo, Pomodoro 1 de 4, 0 hoy', clock()=='25:00' and phase()=='TRABAJO' and sub()=='Pomodoro 1 de 4' and 'Hoy: 0 pomodoros' in txt(), (clock(), phase(), sub()))
        page.screenshot(path=OUT+'p_idle.png', full_page=True)

        # ---- configurar (los límites los impone el formulario; el recorte de valores raros se prueba abajo con un respaldo)
        page.click('[data-act=pomo-cfg]'); dlg.locator('[name=work]').fill('999'); dlg.locator('button.primary').click(); page.wait_for_timeout(120)
        check('el formulario no acepta más de 180 minutos', page.evaluate("document.querySelector('#dlg').open") and clock()=='25:00')
        dlg.locator('#cancel').click(); page.wait_for_timeout(80)
        cfg(work=2, short=1, long=3, rounds=2, auto=False)
        check('configurado: 02:00 y Pomodoro 1 de 2', clock()=='02:00' and sub()=='Pomodoro 1 de 2', (clock(), sub()))

        # ---- iniciar, pausar, reanudar
        toggle()
        check('al iniciar el botón pasa a Pausar y se pide mantener la pantalla encendida', page.locator('[data-act=pomo-toggle]').get_attribute('aria-label')=='Pausar' and page.evaluate('window.__wl')>=1)
        run_for(30_000)
        check('corre: 01:30 tras 30 s', clock()=='01:30', clock())
        toggle(); run_for(60_000)
        check('en pausa no avanza', clock()=='01:30' and page.locator('[data-act=pomo-toggle]').get_attribute('aria-label')=='Iniciar', clock())
        toggle(); run_for(89_000)
        check('queda 00:01 antes de terminar', clock()=='00:01', clock())
        run_for(1_500)
        check('termina: descanso corto detenido, +1 pomodoro y vibra', phase()=='DESCANSO CORTO' and clock()=='01:00' and 'Hoy: 1 pomodoro' in txt() and len(page.evaluate('window.__vib'))==1, (phase(), clock()))
        check('sin inicio automático queda en pausa', page.locator('[data-act=pomo-toggle]').get_attribute('aria-label')=='Iniciar')
        page.screenshot(path=OUT+'p_break.png', full_page=True)

        # ---- saltar y ciclo completo (2 pomodoros -> descanso largo)
        page.click('[data-act=pomo-skip]'); page.wait_for_timeout(60)
        check('saltar el descanso: Trabajo, Pomodoro 2 de 2', phase()=='TRABAJO' and sub()=='Pomodoro 2 de 2' and clock()=='02:00', (phase(), sub()))
        toggle(); run_for(121_000)
        check('tras el 2.º pomodoro llega el descanso largo (03:00) y suma 2', phase()=='DESCANSO LARGO' and clock()=='03:00' and 'Hoy: 2 pomodoros' in txt(), (phase(), clock()))
        toggle(); run_for(181_000)
        check('terminado el descanso largo el ciclo reinicia', phase()=='TRABAJO' and sub()=='Pomodoro 1 de 2' and 'Hoy: 2 pomodoros' in txt(), (phase(), sub()))

        # ---- reiniciar y saltar no cuentan
        toggle(); run_for(30_000); page.click('[data-act=pomo-reset]'); page.wait_for_timeout(60)
        check('reiniciar vuelve la fase a 02:00 en pausa', clock()=='02:00' and page.locator('[data-act=pomo-toggle]').get_attribute('aria-label')=='Iniciar')
        page.click('[data-act=pomo-skip]'); page.wait_for_timeout(60)
        check('saltar un pomodoro no lo cuenta', phase()=='DESCANSO CORTO' and 'Hoy: 2 pomodoros' in txt(), txt()[:200])
        page.click('[data-act=pomo-skip]'); page.wait_for_timeout(60)

        # ---- pantalla completa negra
        toggle()
        wl0 = page.evaluate('window.__wl')
        page.click('[data-act=pomo-full]'); page.wait_for_timeout(80)
        o = page.locator('#pomo-full')
        check('aparece la pantalla completa', o.is_visible())
        st = o.evaluate("e => { const s = getComputedStyle(e), c = getComputedStyle(e.firstElementChild), r = e.getBoundingClientRect(); return { bg: s.backgroundColor, color: c.color, w: r.width, h: r.height, z: s.zIndex, text: e.innerText.trim() }; }")
        check('fondo negro puro y contador blanco', st['bg']=='rgb(0, 0, 0)' and st['color']=='rgb(255, 255, 255)', st)
        check('cubre toda la pantalla', st['w']==390 and st['h']==800, st)
        check('solo muestra el contador', st['text']==clock() and len(st['text'])==5 and ':' in st['text'], st['text'])
        t1 = o.inner_text().strip(); run_for(10_000); t2 = o.inner_text().strip()
        check('el contador sigue corriendo en pantalla completa', t1 != t2, (t1, t2))
        check('mantiene la pantalla encendida', page.evaluate('window.__wl') >= wl0)
        page.screenshot(path=OUT+'p_full.png')
        o.click(); page.wait_for_timeout(80)
        check('tocar la pantalla vuelve a la vista normal', not o.is_visible() and page.locator('.pomo-clock').is_visible())
        page.click('[data-act=pomo-full]'); page.wait_for_timeout(60); page.keyboard.press('Escape'); page.wait_for_timeout(60)
        check('Escape también sale', not o.is_visible())
        # termina estando en pantalla completa: sigue negra y avanza
        page.click('[data-act=pomo-full]'); page.wait_for_timeout(60); run_for(130_000)
        check('al terminar en pantalla completa sigue negra y vibró de nuevo', o.is_visible() and len(page.evaluate('window.__vib')) >= 3, len(page.evaluate('window.__vib')))
        o.click(); page.wait_for_timeout(60)

        # ---- inicio automático
        page.click('[data-act=pomo-skip]') if phase() != 'TRABAJO' else None
        cfg(auto=True)
        toggle(); run_for(121_000)
        check('inicio automático: la fase siguiente arranca sola', phase()=='DESCANSO CORTO' and page.locator('[data-act=pomo-toggle]').get_attribute('aria-label')=='Pausar', (phase(),))
        toggle()

        # ---- terminar con la app en otra sección
        go('home'); 
        page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=pomodoro]'); page.wait_for_timeout(80)
        check('volver a Pomodoro conserva el estado', 'Hoy:' in txt() and clock() != '')
        check('sin errores de consola', errs == [], errs)

        # ---- persistencia con tiempo real (contexto sin reloj simulado)
        ctx2 = b.new_context(viewport={'width':390,'height':800}, accept_downloads=True)
        q = ctx2.new_page(); errs2=[]
        q.on('pageerror', lambda e: errs2.append(str(e))); q.on('console', lambda m: errs2.append(m.text) if m.type=='error' else None)
        q.on('dialog', lambda d: d.accept())
        q.goto('http://localhost:8765/'); q.wait_for_selector('#view .home')
        def go2(tab): q.click('[data-act=menu-open]'); q.click(f'#tabs [data-tab={tab}]'); q.wait_for_timeout(80)
        go2('pomodoro')
        q.click('[data-act=pomo-toggle]'); q.wait_for_timeout(1300)
        q.reload(); q.wait_for_selector('#view .home'); go2('pomodoro')
        c2 = q.locator('.pomo-clock').inner_text().strip()
        check('al recargar sigue corriendo', q.locator('[data-act=pomo-toggle]').get_attribute('aria-label')=='Pausar' and c2.startswith('24:5'), c2)
        # terminó mientras la app estaba cerrada
        q.evaluate("""async () => { const st = await import('/js/state.js'); st.S.settings.pomo.run.endsAt = Date.now() - 5000; await st.saveSettings(); }""")
        q.reload(); q.wait_for_selector('#view .home'); go2('pomodoro')
        check('si terminó con la app cerrada avanza a descanso y cuenta el pomodoro', q.locator('.pomo-phase b').inner_text().strip().upper()=='DESCANSO CORTO' and 'Hoy: 1 pomodoro' in q.locator('#view').inner_text(), q.locator('#view').inner_text()[:120])
        # un respaldo con valores absurdos no rompe nada
        q.evaluate("""async () => { const st = await import('/js/state.js'); st.S.settings.pomo.cfg = { work: -5, short: 'x', long: 1e9, rounds: 0, auto: 1 }; st.S.settings.pomo.run = { phase: 'nope' }; await st.saveSettings(); }""")
        q.reload(); q.wait_for_selector('#view .home'); go2('pomodoro')
        check('valores inválidos se corrigen (25:00, fase de trabajo)', q.locator('.pomo-clock').inner_text().strip()=='25:00' and q.locator('.pomo-phase b').inner_text().strip().upper()=='TRABAJO')
        # la configuración viaja en el respaldo
        q.click('[data-act=pomo-cfg]'); q.locator('#dlg [name=work]').fill('7'); q.locator('#dlg button.primary').click(); q.wait_for_timeout(120)
        go2('data')
        with q.expect_download() as dl: q.click('[data-act=export]')
        data = json.load(open(dl.value.path()))
        check('el respaldo incluye la configuración del Pomodoro', data['settings']['pomo']['cfg']['work']==7, data['settings'].get('pomo'))
        check('sin errores de consola (tiempo real)', errs2 == [], errs2)
        print('errors:', errs + errs2); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
