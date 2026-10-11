import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
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
        page = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2).new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card')
        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        def pick(name, text):
            dlg.locator(f'[name={name}]').evaluate("(s,t)=>{const o=[...s.options].find(o=>o.textContent.includes(t)); s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}))}", text)
        def acc(n): page.click('[data-act=new-acc] >> nth=0'); dlg.locator('[name=name]').fill(n); save()
        def cat(n, v, i=-1):
            page.click(f'[data-act=new-cat] >> nth={i}'); dlg.locator('[name=name]').fill(n); dlg.locator('[name=balance]').fill(str(v)); save()
        acc('Banco'); cat('Principal', 0, 0); cat('Seguro', 0, 0)
        acc('Efectivo'); cat('Por distribuir', 0, 1); cat('Internet', 0, 1); cat('Comida', 0, 1); cat('Varios', 0, 1)

        page.click('[data-act=sub][data-sub=plan]')
        def line(name, amt, dest, when='both'):
            page.click('[data-act=new-line] >> nth=0')
            dlg.locator('[name=name]').fill(name); dlg.locator('[name=amount]').fill(str(amt)); pick('key', dest)
            dlg.locator('[name=when]').select_option(when); save()
        line('Internet', 200, 'Internet')
        line('Comida', 600, 'Comida')
        line('Varios', 400, 'Varios', 'q1')
        line('Seguro', 450, 'Seguro', 'q2')
        t = txt()
        check('Efectivo suma 1200 en 1ª quincena', 'Transferir Q1,200.00' in t, t[:700])
        check('Seguro no aplica en 1ª', 'Seguro' in t and 'Banco' not in t.split('Líneas de la guía')[0], t[:600])
        check('totales por quincena', 'Q1,200.00' in t and 'Q1,250.00' in t, t[-300:])

        # pago recibido entra a Banco/Principal
        page.click('[data-act=new-pay]'); dlg.locator('[name=amount]').fill('5000'); save()
        t = txt(); check('pago recibido visible', 'Pago recibido' in t and 'Q5,000.00' in t, t[:300])
        page.click('[data-act=sub][data-sub=accounts]'); t = txt()
        check('el pago NO se repartió solo', 'Principal\\nQ5,000.00' in t or ('Q5,000.00' in t and 'Q0.00' in t), t[:500])
        page.click('[data-act=sub][data-sub=plan]')

        # paso 1: Q1,200 a Efectivo / Por distribuir
        page.click('[data-act=guide-acc]')
        check('transferencia precargada 1200', dlg.locator('[name=amount]').input_value()=='1200')
        pick('to', 'Por distribuir'); save()
        t = txt()
        check('cuenta Efectivo completa', 'Completo' in t, t[:600])
        check('líneas aún pendientes', t.count('Q0.00 / Q')>=3, t[:900])
        # paso 2: repartir dentro de Efectivo, poco a poco
        page.click('[data-act=guide-do]:has-text("Internet")')   # Internet 200
        check('precarga monto 200', dlg.locator('[name=amount]').input_value()=='200')
        pick('from', 'Por distribuir'); save()
        t = txt(); check('Internet cumplida', 'Internet\nQ200.00 / Q200.00' in t, t[:700])
        page.click('[data-act=guide-do]:has-text("Comida")')   # Comida 600, solo 300 por ahora
        dlg.locator('[name=amount]').fill('300'); pick('from', 'Por distribuir'); save()
        t = txt(); check('Comida parcial 300/600', 'Q300.00 / Q600.00' in t, t[:800])
        page.click('[data-act=guide-do]:has-text("Comida")')   # restante
        check('precarga lo que falta 300', dlg.locator('[name=amount]').input_value()=='300', dlg.locator('[name=amount]').input_value())
        pick('from', 'Por distribuir'); save()
        page.click('[data-act=guide-do]:has-text("Varios")'); pick('from', 'Por distribuir'); save()
        t = txt(); check('todo cumplido', t.count('/ Q')>=3 and 'Q0.00\nde Q1,200.00' in t, t[:900])
        # saldos reales
        page.click('[data-act=sub][data-sub=accounts]'); t = txt()
        check('saldos: Banco 3800, Efectivo 1200', 'Total Q3,800.00' in t and 'Total Q1,200.00' in t, t[:900])
        # siguiente quincena: nada cumplido, Seguro aplica
        page.click('[data-act=sub][data-sub=plan]'); page.click('[data-act=guide-next]')
        t = txt(); check('2ª quincena: pendiente y con Seguro', 'Seguro' in t and 'Varios' not in t.split('Líneas de la guía')[0] and 'Q0.00 / Q200.00' in t, t[:900])
        page.click('[data-act=guide-prev]')
        page.screenshot(path=OUT + 'g_guide.png', full_page=True)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
