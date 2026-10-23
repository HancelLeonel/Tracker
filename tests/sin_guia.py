"""La Guía de transferencias se eliminó: Finanzas ya no la ofrece, los respaldos antiguos que la traen se siguen importando y los ingresos
que se repartieron con ella se editan como cualquier ingreso."""
import os, sys, json, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
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
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800}, accept_downloads=True)
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        dlg = page.locator('#dlg')
        def go(tab): ir(page, tab); page.wait_for_timeout(150)
        go('money')
        subs = [t.split('\n')[0] for t in page.locator('.seg button').all_inner_texts()]
        check('Finanzas solo ofrece Cuentas, Pagos y Reportes (sin Guía)', [s.strip() for s in subs]==['Cuentas','Pagos','Reportes'], subs)
        check('no hay botón «Registrar pago recibido» ni «Nueva línea»', page.locator('[data-act=new-pay], [data-act=new-line]').count()==0)

        # respaldo antiguo: trae `plan`, un ingreso repartido por la guía (plan: true, line en las partes)
        backup = page.evaluate("""async () => { const d = await (await import('/js/data.js')).buildExport(false); return d; }""")
        backup.update({
          'plan': [{'id': 'l1', 'name': 'Internet', 'amount': 200, 'key': 'a1|c1', 'when': 'both'}],
          'accounts': [{'id': 'a1', 'name': 'Banco', 'type': 'normal', 'cats': [{'id': 'c1', 'name': 'Internet', 'balance': 150}, {'id': 'c2', 'name': 'Sobrante', 'balance': 50}]}],
          'moves': [{'id': 'm1', 't': 1, 'date': '2026-10-01', 'type': 'income', 'note': 'Pago quincenal', 'total': 200, 'plan': True,
                     'parts': [{'acc': 'a1', 'cat': 'c1', 'amount': 150, 'line': 'l1'}, {'acc': 'a1', 'cat': 'c2', 'amount': 50}], 'files': []}],
        })
        path = os.path.join(tempfile.mkdtemp(), 'respaldo-antiguo.json'); Path(path).write_text(json.dumps(backup))
        go('data')
        page.set_input_files('#file', path); page.wait_for_timeout(600)
        go('money'); page.wait_for_timeout(150)
        t = page.locator('#view').inner_text()
        check('el respaldo antiguo con guía se importa y muestra sus cuentas', 'Banco' in t and 'Q200.00' in t, t[:200])
        ev = lambda js: page.evaluate(f"import('/js/state.js').then(async st => {{ {js} }})")
        check('la guía no queda en memoria', ev("return 'plan' in st.S") is False)
        # el ingreso repartido se edita como un ingreso normal (antes solo se podía ver o eliminar)
        page.click('[data-act=sub][data-sub=accounts]')
        page.locator('[data-act=edit-move]').first.click(); page.wait_for_timeout(200)
        check('editar el ingreso antiguo abre el formulario normal de ingreso', dlg.locator('[name=amount]').count()==1 and dlg.locator('[name=amount]').input_value()=='200', dlg.inner_text()[:120])
        dlg.locator('[name=amount]').fill('250'); dlg.locator('button.primary').click(); page.wait_for_timeout(300)
        bal = ev("return st.S.accounts[0].cats.map(c => c.balance).reduce((a, b) => a + b, 0)")
        check('guardar la edición ajusta los saldos (+50)', abs(bal - 250) < 0.01, bal)
        exp = page.evaluate("import('/js/data.js').then(d => d.buildExport(false))")
        check('el respaldo nuevo ya no incluye `plan` ni marcas de la guía', 'plan' not in exp and not any(m.get('plan') or any('line' in pt for pt in m['parts']) for m in exp['moves']))
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
