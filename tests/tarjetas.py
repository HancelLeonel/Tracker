import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
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
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card')
        dlg = page.locator('#dlg')
        def go(tab):
            page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(50)
        def firstopt(i):
            dlg.locator('.part select').nth(i).evaluate("s=>{const o=[...s.options].find(o=>!o.disabled); s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}))}")
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()
        # Efectivo: Comida 500, Transporte 150
        page.click('[data-act=new-acc] >> nth=0'); dlg.locator('[name=name]').fill('Efectivo'); save()
        page.click('[data-act=new-cat]'); dlg.locator('[name=name]').fill('Comida'); dlg.locator('[name=balance]').fill('500'); save()
        page.click('[data-act=new-cat]'); dlg.locator('[name=name]').fill('Transporte'); dlg.locator('[name=balance]').fill('150'); save()
        page.click('[data-act=new-acc] >> nth=0'); dlg.locator('[name=name]').fill('TC Visa'); dlg.locator('[name=type]').select_option('credit'); save()

        # gasto de Q200 con la TC en Comida
        page.click('.cat-main >> nth=0')   # preselecciona Efectivo/Comida
        dlg.locator('[name=title]').fill('Súper'); dlg.locator('[name=amount]').fill('200')
        dlg.locator('[name=card]').select_option(index=1)
        check('categoría preseleccionada Comida', 'Comida' in dlg.locator('.part select').first.evaluate('s=>s.selectedOptions[0].textContent'))
        save()
        t = txt()
        check('Comida sigue en Q500', 'Comida' in t and 'Q500.00' in t)
        check('Q200 apartados, libre Q300', 'Q200.00 por pagar a tarjeta · libre Q300.00' in t, t[:700])
        check('TC lista por categoría', 'Efectivo / Comida' in t and 'Debes Q200.00' in t, t[:900])
        check('neto 450 (650-200)', 'Q450.00' in t, t[:200])

        # gasto en efectivo de 400 en Comida: solo Q300 libres -> 300 + 100 de otra categoría
        page.click('.cat-main >> nth=0')
        dlg.locator('[name=title]').fill('Cena'); dlg.locator('[name=amount]').fill('400')
        check('solo Q300 libres: falta Q100', 'Falta asignar Q100.00' in dlg.locator('#remain').inner_text(), dlg.locator('#remain').inner_text())
        dlg.locator('#addpart').click(); firstopt(1)
        rows = dlg.locator('.part'); vals=[rows.nth(i).locator('input').input_value() for i in range(rows.count())]
        check('lo apartado no se puede gastar: 300/100', vals==['300','100'], vals)
        save()
        t = txt(); check('Comida Q200 (500-300), Transporte Q50', 'libre Q0.00' in t and 'Q50.00' in t, t[:700])

        # pagar la tarjeta: propone Q200 desde Efectivo/Comida
        page.click('[data-act=pay-card]')
        check('propone 200 de Comida', dlg.locator('.part input').first.input_value()=='200' and 'Comida' in dlg.locator('.part select').first.evaluate('s=>s.selectedOptions[0].textContent'))
        save()
        t = txt()
        check('nada apartado tras pagar', 'por pagar a tarjeta' not in t and 'A favor Q0.00' in t, t[:700])
        check('Comida baja a 0', 'Comida\nQ0.00' in t, t[:700])
        check('neto 250 (450-400+200...)', 'Q50.00' in t)

        # editar la compra con tarjeta (150): al editar el pago ya hecho cubre más de lo gastado
        page.click('[data-act=edit-move]:has-text("Súper")')
        dlg.locator('[name=amount]').fill('150'); save()
        t = txt(); check('editar compra tarjeta cuadra deuda', 'A favor Q50.00' in t or 'Debes' not in t, t[:700])
        # borrar el pago: vuelve a quedar pendiente
        page.click('[data-act=edit-move]:has-text("Pago TC Visa")'); check('abre formulario de pago de tarjeta', dlg.locator('h2').inner_text().startswith('Editar pago'))
        dlg.locator('#del').click(); page.wait_for_timeout(200)
        t = txt(); check('borrar pago restaura lo apartado', 'por pagar a tarjeta' in t and 'Debes Q150.00' in t, t[:700])

        # pago de tarjeta vía "Pagos": descuenta desde la categoría usada
        page.click('[data-act=sub][data-sub=bills]'); page.click('[data-act=new-bill] >> nth=0')
        dlg.locator('[name=title]').fill('Pago TC'); dlg.locator('[name=amount]').fill('150')
        dlg.locator('[name=freq]').select_option('once'); dlg.locator('[name=dueDate]').fill('2026-10-12')
        dlg.locator('[name=card]').select_option(index=1); save()
        page.click('[data-act=pay-bill]')
        page.wait_for_timeout(100)
        check('vista previa de reparto', 'Se descontará de: Efectivo / Comida' in dlg.locator('#alloc').inner_text(), dlg.locator('#alloc').inner_text())
        save()
        page.click('[data-act=sub][data-sub=accounts]'); t = txt()
        check('pago de tarjeta por Pagos liquida deuda', 'Debes' not in t and 'por pagar a tarjeta' not in t, t[:500])
        # reportes: gasto contado una sola vez
        page.click('[data-act=sub][data-sub=reports]'); page.click('[data-act=rep-kind][data-kind=all]')
        t = txt(); check('gastado = 150 + 400 (sin duplicar)', 'Q550.00' in t, t[:300])
        check('tarjeta en cuentas con movimiento', 'TC Visa' in t)
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
