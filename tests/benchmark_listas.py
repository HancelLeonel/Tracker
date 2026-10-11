import os, sys, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)  # raíz del proyecto (lo que sirve el servidor de prueba)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep  # capturas de pantalla
os.makedirs(OUT, exist_ok=True)
import subprocess, time, json, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
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
TIME = """async (fn) => { const t = performance.now(); await fn(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; }"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for N in [1000, 5000, 20000, 60000]:
            pass
        for N in [1000, 5000, 20000, 60000]:
            ctx = b.new_context(viewport={'width':390,'height':800})
            page = ctx.new_page(); page.on('dialog', lambda d: d.accept())
            page.goto('http://localhost:8765/icons/icon.svg')
            page.evaluate(SEED, N)
            t0 = time.time(); page.goto('http://localhost:8765/'); page.wait_for_selector('#view .card'); load = (time.time()-t0)*1000
            # tiempo de repintado de cuentas
            def click_t(sel):
                return page.evaluate("""async (sel) => { const t = performance.now(); document.querySelector(sel).click();
                   await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r))); return performance.now() - t; }""", sel)
            acc = click_t('[data-act=sub][data-sub=accounts]')
            guia = click_t('[data-act=sub][data-sub=plan]')
            page.evaluate("document.querySelector('[data-act=sub][data-sub=reports]').click()")
            rep = click_t('[data-act=rep-kind][data-kind=all]')
            page.evaluate("document.querySelector('[data-act=sub][data-sub=accounts]').click()")
            # listas largas: movimientos de una cuenta y "Ver todos"
            t = page.evaluate("""async () => { const t = performance.now(); document.querySelector('[data-act=acc-moves]').click();
               await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
               return [performance.now() - t, document.querySelectorAll('#dlg .move').length]; }""")
            page.click('#cancel')
            vt = page.evaluate("""async () => { const b = document.querySelector('[data-act=more-moves]'); if (!b) return [0,0]; const t = performance.now(); b.click();
               await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(()=>requestAnimationFrame(r)));
               return [performance.now() - t, document.querySelectorAll('#view .move').length]; }""")
            page.evaluate("document.querySelector('[data-act=more-moves]')?.click()")
            print(f"{N:>7} cuentas={acc:>5.0f}ms  lista de una cuenta: {t[0]:>6.0f}ms ({t[1]} filas)   'ver todos': {vt[0]:>6.0f}ms ({vt[1]} filas)")
            ctx.close()
        b.close()
finally:
    srv.terminate()
