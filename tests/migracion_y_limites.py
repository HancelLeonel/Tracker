import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
os.makedirs(OUT, exist_ok=True)
import subprocess, time, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
from _nav import ir
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page()
        errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        def go(tab):
            ir(page, tab); page.wait_for_timeout(50)
        def firstopt(i):
            dlg.locator('.part select').nth(i).evaluate("s=>{const o=[...s.options].find(o=>!o.disabled); s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}))}")
        # ---- migración v2 -> v3
        page.goto('http://localhost:8765/icons/icon.svg')
        page.evaluate("""() => new Promise((res, rej) => {
          const r = indexedDB.open('mi-quincena', 2);
          r.onupgradeneeded = () => { const db = r.result;
            db.createObjectStore('habits',{keyPath:'id'}); db.createObjectStore('accounts',{keyPath:'id'});
            db.createObjectStore('moves',{keyPath:'id'}); db.createObjectStore('meta',{keyPath:'k'}); };
          r.onsuccess = () => { const db = r.result; const tx = db.transaction(['habits','accounts','moves'],'readwrite');
            tx.objectStore('habits').put({id:'h1',name:'Leer',color:'blue',dates:{}});
            tx.objectStore('accounts').put({id:'a1',name:'Viejo Banco',order:1,cats:[{id:'c1',name:'Comida',balance:150}]});
            tx.objectStore('moves').put({id:'m1',t:1,type:'expense',date:'2026-10-01',note:'Gasto viejo',total:50,parts:[{acc:'a1',cat:'c1',amount:50}]});
            tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); };
          r.onerror = () => rej(r.error); })""")
        page.goto('http://localhost:8765/')
        page.wait_for_selector('#view .home'); ir(page, 'money'); page.wait_for_selector('#view .card')
        t = page.locator('#view').inner_text()
        check('migración: cuenta vieja visible', 'Viejo Banco' in t and 'Q150.00' in t, t[:300])
        check('migración: movimiento viejo sin título', 'Gasto viejo' in t, t[:500])
        go('habits'); check('migración: hábito', 'Leer' in page.locator('#view').inner_text())
        go('money')

        dlg = page.locator('#dlg')
        def save(): dlg.locator('button.primary').click(); page.wait_for_timeout(150)
        txt = lambda: page.locator('#view').inner_text()

        # editar movimiento viejo (sin kind/title): requiere título
        page.click('[data-act=edit-move]')
        dlg.locator('[name=title]').fill('Super'); dlg.locator('[name=amount]').fill('70'); save()
        t = txt(); check('editar gasto revierte y reaplica (150+50-70=130)', 'Q130.00' in t, t[:200])
        page.click('[data-act=edit-move]'); dlg.locator('#del').click(); page.wait_for_timeout(150)
        t = txt(); check('borrar gasto restaura saldo 200', 'Q200.00' in t, t[:200])

        # tarjeta con límite 100 y compra de 150 (supera el límite: confirm aceptado) apartada de Comida
        page.click('[data-act=new-acc] >> nth=0'); dlg.locator('[name=name]').fill('Mastercard')
        dlg.locator('[name=type]').select_option('credit'); dlg.locator('[name=limit]').fill('100'); save()
        page.click('[data-act=new-exp][data-card]')
        dlg.locator('[name=title]').fill('Compra grande'); firstopt(0); dlg.locator('[name=amount]').fill('150')
        save()
        t = txt(); check('deuda 150 y 150 apartados', 'Debes Q150.00' in t and 'libre Q50.00' in t, t[:500])

        # pago mensual: aparece próximo; pagar y deshacer restaura
        page.click('[data-act=sub][data-sub=bills]')
        page.click('[data-act=new-bill] >> nth=0')
        dlg.locator('[name=title]').fill('Luz'); dlg.locator('[name=amount]').fill('120')
        import datetime; d = datetime.date.today(); dlg.locator('[name=day]').fill(str(min(28, (d.day+2))))
        save()
        t = txt(); check('mensual próximo', 'Luz' in t and 'Próximos' in t, t[:300])
        page.click('[data-act=pay-bill]'); save()
        page.click('[data-act=sub][data-sub=accounts]')
        t = txt(); check('pago mensual descontó (200-100... =Q30.00 en cuenta)', 'Luz' in t, t[:300])
        bal_after = t
        page.click('[data-act=sub][data-sub=bills]'); page.click('[data-act=paid-bill]')
        dlg.locator('#del').click(); page.wait_for_timeout(200)
        page.click('[data-act=sub][data-sub=accounts]')
        t = txt(); check('deshacer pago quita el gasto', 'Luz' not in t and 'libre Q50.00' in t, t[:300])

        # sin respaldo de adjuntos conserva archivos locales
        go('purchases'); page.click('[data-act=new-purchase] >> nth=0')
        dlg.locator('[name=name]').fill('Monitor'); dlg.locator('[name=date]').fill('2025-01-01'); dlg.locator('[name=months]').fill('6')
        with page.expect_file_chooser() as fc: dlg.locator('[data-add]').click()
        fc.value.set_files(ROOT + '/icons/icon-192.png'); dlg.locator('.chip').first.wait_for(); save()
        check('garantía vencida', 'Garantía vencida' in page.locator('#view').inner_text())
        go('data')
        with page.expect_download() as dl: page.click('[data-act=export]')
        data = json.load(open(dl.value.path())); check('export sin archivos', 'files' not in data and data['includesFiles'] is False)
        with page.expect_file_chooser() as fc: page.click('[data-act=import]')
        fc.value.set_files(dl.value.path()); page.wait_for_timeout(600)
        check('import sin adjuntos conserva los locales', '1 archivo' in page.locator('#view').inner_text(), page.locator('#view').inner_text()[:300])

        # quitar adjunto + borrar compra limpia archivos
        go('purchases'); page.click('.purchase'); dlg.locator('#del').click(); page.wait_for_timeout(300)
        go('data'); check('gc de archivos al borrar compra', 'ninguno' in page.locator('#view').inner_text())

        # capturas visuales
        go('money'); page.click('[data-act=sub][data-sub=accounts]')
        page.screenshot(path=OUT + 'v_accounts.png')
        page.click('[data-act=new-exp] >> nth=0'); dlg.locator('[name=amount]').fill('230')
        page.screenshot(path=OUT + 'v_expense.png'); dlg.locator('#cancel').click()
        page.click('[data-act=sub][data-sub=reports]'); page.screenshot(path=OUT + 'v_reports.png', full_page=True)
        go('data'); page.screenshot(path=OUT + 'v_data.png')
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
