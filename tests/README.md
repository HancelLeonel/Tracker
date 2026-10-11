# Pruebas

Pruebas end-to-end con [Playwright](https://playwright.dev/python/) (Chromium, teléfono simulado de 390×800). Cada script levanta
un servidor estático con `python3 -m http.server` sobre la raíz del proyecto y maneja la app como lo haría una persona.

## Preparar el entorno (una vez)

```fish
python3 -m venv .venv
.venv/bin/pip install playwright
.venv/bin/playwright install chromium
```

## Ejecutar

```fish
.venv/bin/python tests/run_all.py                 # todas
.venv/bin/python tests/tarjetas.py                # una sola
```

Cada prueba imprime `PASS`/`FAIL` por comprobación y termina con `errors: []` (errores de consola) y `FALLAS: []`.
Las capturas de pantalla se guardan en `<carpeta temporal>/tracker-shots/`.

| Script | Qué cubre |
|---|---|
| `smoke.py` | La app carga sin errores de consola |
| `flujo_completo.py` | Cuentas, gasto repartido, tarjeta, guía, pagos, compras con adjuntos, reportes, exportar/importar |
| `migracion_y_limites.py` | Migración desde la base v2, editar/borrar, límite de tarjeta, deshacer pagos, respaldo sin adjuntos |
| `tarjetas.py` | Compra con tarjeta ligada a una categoría, dinero apartado, pago propuesto, edición y borrado |
| `guia.py` | Guía de transferencias: pago a una cuenta, avance por línea y por cuenta, categoría de paso, quincenas |
| `interfaz.py` | Menú lateral, cuentas plegables, movimientos por cuenta, selector de gasto, iconos blancos, nombre Tracker |
| `paginacion_y_cache.py` | Listas paginadas y que la caché se invalide al agregar/editar/borrar |
| `habitos.py` | Hábitos: iconos, carrusel de momentos del día, filas compactas, marcar días anteriores, reordenar, persistencia, exportar/importar y respaldos antiguos |
| `inicio.py` | Inicio: pantalla predeterminada, saludo y fecha, frase que cambia cada vez que se muestra sin repetirse hasta agotarlas |
| `pomodoro.py` | Menú con las pestañas nuevas, secciones vacías y Pomodoro: configuración, iniciar/pausar, ciclo con descanso largo, saltar/reiniciar, pantalla completa negra, inicio automático, persistencia y respaldo (reloj simulado) |
| `notas.py` | Notas: grupos con campos propios (ejemplos, tipos de campo, configurar/reordenar/quitar campos), notas, búsqueda, etiquetas, copiar, enlaces seguros, paginación, exportar/importar y saneo de respaldos raros |
| `arranque.py` | Que la app nunca se quede muda en el logo: base bloqueada por otra ventana, otra ventana que actualiza la base, módulo que no carga (aviso con botones) y dato dañado en Inicio |
| `listas.py` | Listas y plantillas: crear desde plantilla, marcar (lo hecho baja al final, con fecha), fechas límite y vencidas, editar elementos, finalizar y archivo (restaurar), migración, aviso «Ya toca», guardar lista como plantilla, exportar/importar y saneo de fechas |
| `benchmark_carga.py` | Tiempos de carga, pantallas, reportes y guardado con 1k–60k movimientos (no es parte de `run_all`) |
| `benchmark_listas.py` | Tiempos de las listas largas con 1k–60k movimientos (no es parte de `run_all`) |

> Las pruebas dependen del texto y de los atributos `data-act` de la interfaz: si cambias textos visibles, actualiza las aserciones.
