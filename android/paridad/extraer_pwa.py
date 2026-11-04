"""Paridad Home ↔ PWA: carga un respaldo en la PWA Tracker (Chromium sin perfil, no toca datos reales) y guarda lo que
calcula: totales, saldo de cada categoría, apartado para tarjetas y pendiente por tarjeta. `ParidadTest` (JUnit) importa el
mismo respaldo en Home y compara al centavo.

Uso (desde la raíz del repo):  .venv/bin/python android/paridad/extraer_pwa.py [carpeta]
La carpeta (por defecto android/paridad/local, ignorada por git) debe tener respaldo.json; escribe esperado.json ahí mismo.
"""
import json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests'))
from _servidor import espera  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PUERTO = 8766
carpeta = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'android' / 'paridad' / 'local'
respaldo = (carpeta / 'respaldo.json').read_text(encoding='utf-8')

CALCULO = """async (texto) => {
  const data = await import(new URL('js/data.js', location.href).href);
  const st = await import(new URL('js/state.js', location.href).href);
  await data.restore(data.validateImport(JSON.parse(texto)));
  const S = st.S, balances = {}, pending = {};
  for (const a of S.accounts) for (const c of a.cats) balances[`${a.id}|${c.id}`] = c.balance;
  for (const a of S.accounts.filter(st.isCredit)) pending[a.id] = Object.fromEntries(st.cardPending(a.id));
  return { totals: st.totals(), balances, reserved: Object.fromEntries(st.reservedMap()), pending };
}"""

srv = subprocess.Popen(['python3', '-m', 'http.server', str(PUERTO), '-d', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    espera(PUERTO)
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_context(viewport={'width': 390, 'height': 800}).new_page()
        errores = []
        page.on('pageerror', lambda e: errores.append(str(e)))
        page.goto(f'http://localhost:{PUERTO}/')
        page.wait_for_selector('#view .home')
        esperado = page.evaluate(CALCULO, respaldo)
        b.close()
    if errores:
        sys.exit('La PWA dio errores: ' + '; '.join(errores))
    (carpeta / 'esperado.json').write_text(json.dumps(esperado, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"esperado.json: {len(esperado['balances'])} categorías, {len(esperado['pending'])} tarjetas, neto {esperado['totals']['net']}")
finally:
    srv.terminate()
