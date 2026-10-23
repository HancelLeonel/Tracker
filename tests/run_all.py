"""Ejecuta las pruebas end-to-end en paralelo y resume el resultado.

Uso:  python tests/run_all.py                    (todas, en paralelo)
      python tests/run_all.py selector markdown  (solo esas)
      python tests/run_all.py -j 1               (una por una, como antes)
Requiere playwright y chromium; ver tests/README.md.

Cada prueba abre su propio navegador (datos aislados), así que pueden correr a la vez. Todas sirven la app en el puerto 8765: aquí se
levanta un solo servidor compartido y el que intenta levantar cada prueba falla sin consecuencias (el puerto ya está ocupado).
Las pruebas con tiempos medidos (`SERIE`) corren solas al final para que la carga de las demás no las altere.
"""
import http.server, os, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
# De más a menos lenta (segundos aproximados): empezar por las largas reparte mejor la carga entre los trabajadores.
TESTS = ['sincronizacion', 'sw', 'listas', 'pomodoro', 'notas', 'gimnasio', 'habitos', 'flujo_completo', 'catalogo', 'configuracion',
         'no_toca_anual_negativo', 'revision', 'inicio', 'interfaz', 'migracion_y_limites', 'gimnasio_mas', 'orden_compartir_carga',
         'selector', 'orden_menu', 'navegacion', 'estilo', 'inicio_accionable', 'finanzas_dias', 'listas_orden', 'arranque', 'bandeja', 'tarjetas', 'markdown', 'inicio_resumen', 'bandeja_varias',
         'paginacion_y_cache', 'sin_guia', 'smoke']
SERIE = []  # pruebas con tiempos medidos que no toleran la carga de las demás (ninguna por ahora)

args = sys.argv[1:]
jobs = min(8, os.cpu_count() or 2)
if '-j' in args:
    i = args.index('-j')
    jobs = max(1, int(args[i + 1]))
    del args[i:i + 2]
unknown = [a for a in args if a not in TESTS + SERIE]
if unknown:
    sys.exit(f'Prueba desconocida: {", ".join(unknown)}')
parallel = [t for t in TESTS if not args or t in args]
serial = [t for t in SERIE if not args or t in args]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass


def run(name):
    t0 = time.time()
    try:
        out = subprocess.run([sys.executable, str(HERE / f'{name}.py')], capture_output=True, text=True, timeout=600)
        text, code = out.stdout + out.stderr, out.returncode
    except subprocess.TimeoutExpired:
        text, code = 'FAIL tiempo agotado (600 s)', 1
    ok = code == 0 and 'FAIL ' not in text and 'errors: []' in text and 'Traceback' not in text
    return name, ok, text, time.time() - t0


results = []
def report(r):
    name, ok, text, dt = r
    print(('OK   ' if ok else 'FALLA'), f'{name:26s} {dt:5.1f} s', flush=True)
    if not ok:
        keep = ('FAIL', 'Traceback', 'errors:', 'tests/', 'waiting for', 'Error')
        print('\n'.join('     ' + l.strip() for l in text.splitlines() if l.strip().startswith(keep) or 'tests/' in l or 'Error' in l))
    results.append(r)


t_all = time.time()
try:
    shared = http.server.ThreadingHTTPServer(('localhost', 8765), Quiet)
except OSError:
    sys.exit('El puerto 8765 está ocupado (¿otro servidor o una prueba en marcha?). Ciérralo y vuelve a intentar.')
threading.Thread(target=shared.serve_forever, daemon=True).start()
try:
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for r in pool.map(run, parallel):
            report(r)
    for name in serial:
        report(run(name))
finally:
    shared.shutdown()

bad = [r[0] for r in results if not r[1]]
print(f'\n{len(results)} pruebas en {time.time() - t_all:.0f} s ({jobs} en paralelo; suma de tiempos {sum(r[3] for r in results):.0f} s).')
print('Todo en orden.' if not bad else f'Fallaron: {", ".join(bad)}')
sys.exit(1 if bad else 0)
