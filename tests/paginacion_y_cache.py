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
SEED = """async (N) => {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('mi-quincena', 3);
    r.onupgradeneeded = () => { const db = r.result; for (const s of ['habits','accounts','moves','plan','bills','purchases','files']) db.createObjectStore(s,{keyPath:'id'}); db.createObjectStore('meta',{keyPath:'k'}); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await open();
  const accounts = [];
  for (let a = 0; a < 8; a++) accounts.push({ id: 'a'+a, name: 'Cuenta '+a, type: a >= 6 ? 'credit' : 'normal', limit: 0, order: a,
    cats: a >= 6 ? [{id:'c0', name:'Deuda', balance:-500}] : Array.from({length: 6}, (_, c) => ({ id: 'c'+c, name: 'Cat '+c, balance: 1000 })) });
  const kinds = ['k1','k2','k3','k4','k5'];
  const moves = []; const t0 = new Date(2022, 0, 1).getTime();
  for (let i = 0; i < N; i++) {
    const d = new Date(t0 + (i / N) * 4.8 * 365 * 86400000); const date = d.toISOString().slice(0,10);
    const card = i % 5 === 0 ? (i % 2 ? 'a6' : 'a7') : null;
    const a = i % 6, c = i % 6;
    if (i % 20 === 19) moves.push({ id:'m'+i, t:i, type:'transfer', date, note:'pago', total: 50, parts:[{acc:'a'+a, cat:'c'+c, amount:50}], to:{acc: i%2?'a6':'a7', cat:'c0'} });
    else moves.push({ id:'m'+i, t:i, type:'expense', date, title:'Gasto '+i, note:'', kind:kinds[i%5], total: 10+(i%90), parts:[{acc:'a'+a, cat:'c'+c, amount:10+(i%90)}], files:[], ...(card?{card}:{}) });
  }
  await new Promise((res, rej) => { const tx = db.transaction(['accounts','moves','meta'],'readwrite');
    accounts.forEach(x=>tx.objectStore('accounts').put(x)); moves.forEach(x=>tx.objectStore('moves').put(x));
    tx.objectStore('meta').put({k:'settings', v:{types:kinds.map(k=>({id:k,name:k})), collapsed:{}}});
    tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_context(viewport={'width':390,'height':800}).new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/icons/icon.svg'); page.evaluate(SEED, 200)
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .card')
        dlg = page.locator('#dlg')
        rows = lambda: page.locator('#view .moves .move').count()
        check('lista principal: 30 filas', rows()==30, rows())
        check('botón con restantes', 'Ver más (30 de 170 restantes)' in page.locator('[data-act=more-moves]').inner_text(), page.locator('[data-act=more-moves]').inner_text())
        page.click('[data-act=more-moves]'); check('ver más: 60 filas', rows()==60, rows())
        page.click('[data-act=more-moves]'); check('ver más: 90 filas', rows()==90, rows())
        page.click('[data-act=less-moves]'); check('ver menos: vuelve a 30', rows()==30 and page.locator('[data-act=less-moves]').count()==0, rows())
        # orden: el primero es el más reciente
        first = page.locator('#view .moves .move small').first.inner_text()
        # lista de una cuenta
        page.click('[data-act=acc-moves] >> nth=0')
        n = lambda: dlg.locator('.acc-moves .move').count()
        check('cuenta: 30 filas', n()==30, n())
        while not dlg.locator('#acc-more').is_hidden(): dlg.locator('#acc-more').click()
        expected = page.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('mi-quincena'); q.onsuccess = () => r(q.result); });
          const all = await new Promise(r => { const q = db.transaction('moves').objectStore('moves').getAll(); q.onsuccess = () => r(q.result); });
          return all.filter(m => m.parts.some(p => p.acc === 'a0') || (m.to && m.to.acc === 'a0')).length; }""")
        check('cuenta: al final están todos (%d)' % expected, n()==expected, (n(), expected))
        dlg.locator('#cancel').click()
        # caché: lo apartado para tarjetas cambia exactamente lo esperado al agregar, editar y borrar
        import re
        def reserved():
            page.click('[data-act=more-moves]') if False else None
            t = page.locator('#view').inner_text()
            return round(sum(float(x.replace(',','')) for x in re.findall(r'Q([\d,]+\.\d\d) por pagar a tarjeta', t)), 2)
        base = reserved()
        page.click('#fab'); dlg.locator('[name=title]').fill('Compra TC'); dlg.locator('[name=amount]').fill('77')
        dlg.locator('[name=card]').select_option(index=1)
        dlg.locator('.part select').first.evaluate("s=>{const o=[...s.options].find(o=>!o.disabled); s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}))}")
        dlg.locator('button.primary').click(); page.wait_for_timeout(200)
        check('caché: +77 al agregar', round(reserved()-base,2)==77, (base, reserved()))
        page.click('[data-act=edit-move]:has-text("Compra TC")'); dlg.locator('[name=amount]').fill('100'); dlg.locator('button.primary').click(); page.wait_for_timeout(200)
        check('caché: +100 al editar', round(reserved()-base,2)==100, (base, reserved()))
        page.click('[data-act=edit-move]:has-text("Compra TC")'); dlg.locator('#del').click(); page.wait_for_timeout(200)
        check('caché: vuelve a la base al borrar', round(reserved()-base,2)==0, (base, reserved()))
        # compras paginadas
        page.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('mi-quincena'); q.onsuccess = () => r(q.result); });
          await new Promise(r => { const tx = db.transaction('purchases','readwrite'); for (let i=0;i<95;i++) tx.objectStore('purchases').put({id:'p'+i,name:'Compra '+i,date:'2025-01-01',price:0,store:'',tag:'',warrantyMonths:0,notes:'',files:[]}); tx.oncomplete = r; }); }""")
        page.reload(); page.wait_for_selector('#view .card')
        page.click('[data-act=menu-open]'); page.click('#tabs [data-tab=purchases]'); page.wait_for_timeout(150)
        pc = lambda: page.locator('#plist .purchase').count()
        check('compras: 40 filas', pc()==40, pc())
        page.click('[data-act=more-purchases]'); check('compras: ver más → 80', pc()==80, pc())
        page.fill('#psearch','Compra 9'); page.wait_for_timeout(100)
        check('búsqueda sobre todo el listado (9,19..89 y 90..94)', pc()==14, pc())
        print('errors:', errs); b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
