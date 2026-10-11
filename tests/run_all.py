"""Ejecuta todas las pruebas end-to-end y resume el resultado.

Uso:  python tests/run_all.py      (requiere playwright y chromium; ver tests/README.md)
Cada prueba levanta su propio servidor en el puerto 8765, así que se ejecutan una por una.
"""
import subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
TESTS = ['smoke', 'flujo_completo', 'migracion_y_limites', 'tarjetas', 'guia', 'interfaz', 'paginacion_y_cache', 'orden_compartir_carga', 'habitos', 'listas', 'inicio']

bad = []
for name in TESTS:
    out = subprocess.run([sys.executable, str(HERE / f'{name}.py')], capture_output=True, text=True, timeout=600)
    text = out.stdout + out.stderr
    ok = out.returncode == 0 and 'FAIL ' not in text and "errors: []" in text and "Traceback" not in text
    print(('OK   ' if ok else 'FALLA'), name)
    if not ok:
        bad.append(name)
        print('\n'.join(l for l in text.splitlines() if l.startswith('FAIL') or 'Error' in l or 'errors:' in l))
print('\nTodo en orden.' if not bad else f'\nFallaron: {", ".join(bad)}')
sys.exit(1 if bad else 0)
