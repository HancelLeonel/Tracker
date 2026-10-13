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
| `interfaz.py` | Menú lateral, cuentas plegables, movimientos por cuenta, selector de gasto, iconos blancos, nombre Tracker, contraste en tema oscuro y claro |
| `paginacion_y_cache.py` | Listas paginadas y que la caché se invalide al agregar/editar/borrar |
| `habitos.py` | Hábitos: iconos, carrusel de momentos del día, filas compactas, marcar días anteriores, reordenar, persistencia, exportar/importar y respaldos antiguos |
| `inicio.py` | Inicio: pantalla predeterminada, saludo y fecha, frase que cambia cada vez que se muestra sin repetirse hasta agotarlas |
| `pomodoro.py` | Menú con las pestañas nuevas, secciones vacías y Pomodoro: configuración, iniciar/pausar, ciclo con descanso largo, saltar/reiniciar, pantalla completa negra, inicio automático, persistencia y respaldo (reloj simulado) |
| `gimnasio.py` | Gimnasio: base v7, rutinas (formato de texto), entrenamiento en curso (series con peso y repeticiones, récords, «Última vez»), descanso entre series con reloj simulado (±15 s, saltar, sonido, recarga con la app cerrada), historial, progreso, respaldo y saneo de datos raros |
| `notas.py` | Notas: grupos con campos propios (ejemplos, tipos de campo, configurar/reordenar/quitar campos), notas, búsqueda, etiquetas, copiar, enlaces seguros, paginación, exportar/importar y saneo de respaldos raros |
| `arranque.py` | Que la app nunca se quede muda en el logo: base bloqueada por otra ventana, otra ventana que actualiza la base, módulo que no carga (aviso con botones) y dato dañado en Inicio |
| `bandeja.py` | Inicio: notas rápidas (anotar, editar, archivar como nota o en una lista, eliminar, «Ver más»), recibir lo compartido, y que Inicio ya no tiene tarjeta de Pomodoro |
| `catalogo.py` | Catálogo de ejercicios: siembra única, selección sin texto libre (rutinas, entrenamiento y opciones), búsqueda, alta/edición/baja, nombres repetidos, renombrar en cascada, baja bloqueada si está en una rutina, ejercicio fuera del catálogo, respaldo, migración de respaldos viejos y saneo |
| `gimnasio_mas.py` | Gimnasio: cardio (tiempo · distancia en rutinas, entrenamiento, historial y progreso), notas por serie, subir/bajar ejercicios, editar un entrenamiento terminado y saneo de respaldos |
| `inicio_resumen.py` | Inicio: cuatro tarjetas de media pantalla, botones Gasto/Ingreso/Mover (sin cuentas avisan; con cuentas abren su formulario y registran) y tarjeta de Ejercicio (círculos de los últimos 7 días, conteo, último, en curso, abrir el Gimnasio) |
| `bandeja_varias.py` | Bandeja: seleccionar varias notas rápidas y archivarlas juntas (grupo, lista o eliminar; todo o nada) y grupo sugerido si traen enlaces |
| `revision.py` | Datos dañados en todas las tiendas (la app arranca y todas las pantallas se muestran; red de seguridad por sección), pagos vencidos agrupados, `[hidden]` en formularios y limpieza de ajustes viejos |
| `listas_orden.py` | Listas: orden recientes/por fecha/manual, fijar, ordenar pendientes por fecha, agenda, fechas relativas en plantillas y saneo al importar |
| `configuracion.py` | Configuración: nombre del menú, fuente (sistema/JetBrains Mono, sin desbordes, respaldo) y tema oscuro/claro/automático (primer pintado, sigue al sistema, respaldo) |
| `sw.py` | Service worker: con red lenta abre con la copia en ~3 s; sin copia espera a la red |
| `listas.py` | Listas y plantillas: crear desde plantilla, marcar (lo hecho baja al final, con fecha), fechas límite y vencidas, editar elementos, finalizar y archivo (restaurar), migración, aviso «Ya toca», guardar lista como plantilla, exportar/importar y saneo de fechas |
| `sincronizacion.py` | Sincronización con Google Drive (inicio de sesión y Drive simulados, teléfono y PC como dos contextos): configurar, enviar, traer, ajustes propios del dispositivo, conflictos en ambos sentidos con copia de seguridad, archivo dañado y desconectar |
| `no_toca_anual_negativo.py` | Hábitos «no toca» (ciclo de tres estados, racha, avance, Inicio, formulario, respaldo e importación), pagos anuales (formulario, vencidos/próximos, sección Anuales, pagar, editar, importar) y gasto con saldo negativo (casilla, categorías ofrecidas, confirmación, editar, regularizar) |
| `benchmark_carga.py` | Tiempos de carga, pantallas, reportes y guardado con 1k–60k movimientos (no es parte de `run_all`) |
| `benchmark_listas.py` | Tiempos de las listas largas con 1k–60k movimientos (no es parte de `run_all`) |

> Las pruebas dependen del texto y de los atributos `data-act` de la interfaz: si cambias textos visibles, actualiza las aserciones.
