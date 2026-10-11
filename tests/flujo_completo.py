import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
os.makedirs(OUT, exist_ok=True)
import subprocess, time, json, re
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
        page = ctx.new_page()
        errs=[]; alerts=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        def on_dialog(d):
            alerts.append(d.message)
            if d.type=='prompt': d.accept('Mascotas')
            else: d.accept()
        page.on('dialog', on_dialog)
        page.goto('http://localhost:8765/')
        page.wait_for_selector('#view .home'); page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=money]'); page.wait_for_selector('#view .card')
        dlg = page.locator('#dlg')
        def go(tab):
            page.click('[data-act=menu-open]'); page.click(f'#tabs [data-tab={tab}]'); page.wait_for_timeout(50)
        def firstopt(i):
            dlg.locator('.part select').nth(i).evaluate("s=>{const o=[...s.options].find(o=>!o.disabled); s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}))}")
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        def txt(): return page.locator('#view').inner_text()

        # --- cuentas
        page.click('[data-act=new-acc] >> nth=0')
        dlg.locator('[name=name]').fill('Banco'); save()
        page.click('[data-act=new-cat]')
        dlg.locator('[name=name]').fill('Comida'); dlg.locator('[name=balance]').fill('200'); save()
        page.click('[data-act=new-cat]')
        dlg.locator('[name=name]').fill('Transporte'); dlg.locator('[name=balance]').fill('100'); save()
        check('total 300', 'Q300.00' in txt(), txt()[:200])

        # --- gasto 250 desde Comida -> split 200 + 50
        page.click('.cat-main >> nth=0')
        dlg.locator('[name=title]').fill('Almuerzo grande')
        dlg.locator('[name=amount]').fill('250')
        rows = dlg.locator('.part')
        check('un solo selector al inicio', rows.count()==1, rows.count())
        check('avisa que falta y ofrece agregar otra', dlg.locator('#addpart').is_visible() and 'Falta asignar Q50.00' in dlg.locator('#remain').inner_text(), dlg.locator('#remain').inner_text())
        dlg.locator('#addpart').click(); firstopt(1)
        rows = dlg.locator('.part')
        vals = [rows.nth(i).locator('input').input_value() for i in range(rows.count())]
        check('split 200/50', vals==['200','50'], vals)
        save()
        t = txt()
        check('saldo Comida 0 / Transporte 50', 'Q0.00' in t and 'Q50.00' in t, t[:300])
        check('movimiento aparece', 'Almuerzo grande' in t and '−Q250.00' in t)

        # --- validación: título requerido y suma
        page.click('[data-act=new-exp] >> nth=0')
        dlg.locator('[name=amount]').fill('10'); dlg.locator('button.primary').click(); page.wait_for_timeout(100)
        check('dialogo sigue abierto sin título', dlg.evaluate('d=>d.open'))
        dlg.locator('#cancel').click()

        # --- tarjeta de crédito
        page.click('[data-act=new-acc] >> nth=0')
        dlg.locator('[name=name]').fill('Visa')
        dlg.locator('[name=type]').select_option('credit')
        check('campos de crédito visibles', dlg.locator('#credit-fields').is_visible())
        dlg.locator('[name=limit]').fill('1000'); save()
        check('tarjeta creada', 'Visa' in txt() and 'Crédito disponible Q1,000.00' in txt(), txt()[:400])

        # compra con tarjeta (kind Suscripciones); el dinero apartado sale de Transporte (Comida está en 0)
        page.click('[data-act=new-exp][data-card]')
        dlg.locator('[name=title]').fill('Netflix')
        check('sin categoría preseleccionada', dlg.locator('.part select').first.input_value()=='')
        firstopt(0)
        dlg.locator('[name=amount]').fill('40')
        check('pagado con tarjeta preseleccionado', dlg.locator('[name=card]').evaluate('s=>s.value!==""'))
        kinds = dlg.locator('[name=kind] option').all_inner_texts()
        check('tipos de gasto disponibles', 'Suscripciones' in kinds and '+ Nuevo tipo…' in kinds, kinds)
        dlg.locator('[name=kind]').select_option(label='Suscripciones')
        vals = [dlg.locator('.part').nth(i).locator('input').input_value() for i in range(dlg.locator('.part').count())]
        check('tarjeta: sin categorías de tarjeta en el selector', dlg.locator('optgroup[label*="Visa"]').count()==0)
        save()
        t = txt()
        check('debes Q40', 'Debes Q40.00' in t, t[:600])
        check('categoría apartada para tarjeta', 'por pagar a tarjeta' in t, t[:600])
        check('neto 10 (50 - 40)', 'Dinero total (descontando tarjetas)' in t and 'Q10.00' in t, t[:300])

        # nuevo tipo al vuelo
        page.click('[data-act=new-exp] >> nth=0')
        dlg.locator('[name=kind]').select_option(label='+ Nuevo tipo…'); page.wait_for_timeout(300)
        check('nuevo tipo creado', dlg.locator('[name=kind]').evaluate('s=>s.selectedOptions[0].textContent')=='Mascotas')
        dlg.locator('#cancel').click()

        # pagar tarjeta: propone pagar desde la categoría que se usó
        page.click('[data-act=pay-card]')
        check('pago propuesto 40', dlg.locator('.part input').first.input_value()=='40', dlg.locator('.part input').first.input_value())
        save()
        t = txt()
        check('tarjeta pagada', 'Debes' not in t and 'A favor Q0.00' in t and 'por pagar a tarjeta' not in t, t[:500])
        check('neto sigue 10 tras pagar', 'Q10.00' in t, t[:200])

        # --- guía de transferencias + pago recibido
        page.click('[data-act=sub][data-sub=plan]')
        page.click('[data-act=new-line] >> nth=0')
        dlg.locator('[name=name]').fill('Transporte'); dlg.locator('[name=amount]').fill('300'); save()
        page.click('[data-act=new-line] >> nth=0')
        dlg.locator('[name=name]').fill('Seguro 1a'); dlg.locator('[name=amount]').fill('450')
        dlg.locator('[name=when]').select_option('q1'); save()
        check('guía tiene líneas', 'Seguro 1a' in txt() and 'Total 1ª quincena' in txt())
        page.click('[data-act=new-pay]')
        check('pago preseleccionado con nota', dlg.locator('[name=note]').input_value()=='Pago quincenal')
        dlg.locator('[name=amount]').fill('2000'); save()
        page.click('[data-act=sub][data-sub=accounts]')
        t = txt()
        check('neto tras pago = 2010', 'Q2,010.00' in t, t[:200])

        # --- pagos
        page.click('[data-act=sub][data-sub=bills]')
        page.click('[data-act=new-bill] >> nth=0')
        dlg.locator('[name=title]').fill('Internet'); dlg.locator('[name=amount]').fill('250')
        dlg.locator('[name=freq]').select_option('once'); dlg.locator('[name=dueDate]').fill('2026-01-01'); save()
        t = txt()
        check('pago vencido aparece', 'Vencidos' in t and 'Internet' in t, t[:300])
        page.click('[data-act=pay-bill]')
        dlg.locator('[name=on]').fill('2026-10-10')
        # adjuntar comprobante
        with page.expect_file_chooser() as fc:
            dlg.locator('[data-add]').click()
        fc.value.set_files(ROOT + '/icons/icon-192.png')
        dlg.locator('.chip').first.wait_for(timeout=5000)
        check('chip adjunto', dlg.locator('.chip').count()==1)
        save()
        t = txt()
        check('pago realizado', 'Realizados' in t and 'Vencidos' not in t and 'Q250.00' in t, t[:300])
        page.click('[data-act=sub][data-sub=accounts]')
        check('gasto de pago registrado', 'Internet' in txt() and page.locator('.move:has-text("Internet") svg').count()==1)

        # --- compras
        go('purchases')
        page.click('[data-act=new-purchase] >> nth=0')
        dlg.locator('[name=name]').fill('Laptop Lenovo'); dlg.locator('[name=date]').fill('2026-03-12')
        dlg.locator('[name=price]').fill('8500'); dlg.locator('[name=store]').fill('Intelaf')
        dlg.locator('[name=months]').fill('12'); dlg.locator('[name=tag]').fill('Tecnología')
        with page.expect_file_chooser() as fc:
            dlg.locator('[data-add]').click()
        fc.value.set_files(ROOT + '/icons/icon-512.png')
        page.wait_for_timeout(500); save()
        t = txt()
        check('compra con garantia', 'Laptop Lenovo' in t and 'Garantía' in t and page.locator('.p-files svg').count()==1, t)
        page.fill('#psearch','intelaf'); page.wait_for_timeout(100)
        check('busqueda por tienda', 'Laptop' in page.locator('#plist').inner_text())
        page.fill('#psearch','zzz'); page.wait_for_timeout(100)
        check('busqueda sin resultados', 'No hay compras' in page.locator('#plist').inner_text())
        page.fill('#psearch','')

        # --- reportes (octubre 2026 mes; el "hoy" real es otro, navego por año)
        go('money'); page.click('[data-act=sub][data-sub=reports]')
        page.click('[data-act=rep-kind][data-kind=all]'); page.wait_for_timeout(100)
        t = txt()
        print(t)
        check('reporte gastado = 250+40+250', 'Q540.00' in t, t[:200])
        check('reporte por tipo', 'Suscripciones' in t, '')
        page.screenshot(path=OUT + 's_reports.png', full_page=True)

        # --- exportar con archivos, borrar, importar
        go('money'); page.click('[data-act=sub][data-sub=accounts]')
        before = txt()
        go('data')
        page.check('[data-change=include-files]'); page.wait_for_timeout(100)
        with page.expect_download() as dl:
            page.click('[data-act=export]')
        path = dl.value.path()
        data = json.load(open(path))
        check('export v3 con archivos', data['version']==3 and len(data.get('files',[]))==2, list(data.keys()))
        check('export con tipos', any(t['name']=='Mascotas' for t in data['settings']['types']))
        page.click('[data-act=wipe]'); page.wait_for_timeout(300)
        check('wipe', '0 cuentas' in txt(), txt()[:300])
        with page.expect_file_chooser() as fc:
            page.click('[data-act=import]')
        fc.value.set_files(path); page.wait_for_timeout(800)
        t = txt()
        check('import restaura', '2 cuentas · 5 movimientos' in t and '2 archivos' in t, t[:400])
        go('money'); page.click('[data-act=sub][data-sub=accounts]')
        check('saldos idénticos tras import', txt()==before, txt()[:200]+' ||| '+before[:200])
        go('purchases'); page.click('.purchase'); dlg.locator('.chip-open').first.click()
        page.wait_for_selector('#viewer[open] img'); check('visor de imagen tras import', page.locator('#viewer img').evaluate('i=>i.naturalWidth')>0)
        page.click('#viewer [data-close]')

        print('alerts:', alerts)
        print('errors:', errs)
        page.screenshot(path=OUT + 's_accounts.png', full_page=True)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
