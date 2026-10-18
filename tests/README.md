# Pruebas

Pruebas end-to-end con [Playwright](https://playwright.dev/python/) (Chromium, teléfono simulado de 390×800). Cada script levanta
un servidor estático con `python3 -m http.server` sobre la raíz del proyecto y maneja la app como lo haría una persona. Con `run_all.py` hay **un solo servidor compartido** (puerto 8765) y las pruebas corren **en paralelo**, cada una con su propio navegador y datos aislados; el servidor que intenta levantar cada una falla sin consecuencias y espera con `_servidor.espera()` (que vuelve al instante si ya está arriba).

## Preparar el entorno (una vez)

```fish
python3 -m venv .venv
.venv/bin/pip install playwright
.venv/bin/playwright install chromium
```

## Ejecutar

```fish
time .venv/bin/python tests/run_all.py            # todas, en paralelo (~50 s con 8 núcleos; en serie eran ~6,5 min)
.venv/bin/python tests/run_all.py selector markdown   # solo algunas
.venv/bin/python tests/run_all.py -j 1            # una por una, para depurar
.venv/bin/python tests/tarjetas.py                # una sola
```

Cada prueba imprime `PASS`/`FAIL` por comprobación y termina con `errors: []` (errores de consola) y `FALLAS: []`.
Las capturas de pantalla se guardan en `<carpeta temporal>/tracker-shots/`.

| Script | Qué cubre |
|---|---|
| `smoke.py` | La app carga sin errores de consola |
| `flujo_completo.py` | Cuentas, gasto repartido, tarjeta, ingreso, pagos, compras con adjuntos, reportes, exportar/importar |
| `migracion_y_limites.py` | Migración desde la base v2, editar/borrar, límite de tarjeta, deshacer pagos, respaldo sin adjuntos |
| `tarjetas.py` | Compra con tarjeta ligada a una categoría, dinero apartado, pago propuesto, edición y borrado |
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
| `sw.py` | Service worker: abre en menos de 1.5 s con la copia aunque la red tarde 6 s por archivo, versión nueva en segundo plano con aviso «Actualizar» (nada se mezcla), sin red, primera visita |
| `listas.py` | Listas y plantillas: crear desde plantilla, marcar (lo hecho baja al final, con fecha), fechas límite y vencidas, editar elementos, finalizar y archivo (restaurar), migración, aviso «Ya toca», guardar lista como plantilla, exportar/importar y saneo de fechas |
| `sincronizacion.py` | Sincronización con Google Drive (inicio de sesión y Drive simulados, teléfono y PC como dos contextos): configurar, enviar, traer, ajustes propios del dispositivo, conflictos en ambos sentidos con copia de seguridad, archivo dañado y desconectar |
| `no_toca_anual_negativo.py` | Hábitos «no toca» (ciclo de tres estados, racha, avance, Inicio, formulario, respaldo e importación), pagos anuales (formulario, vencidos/próximos, sección Anuales, pagar, editar, importar) y gasto con saldo negativo (casilla, categorías ofrecidas, confirmación, editar, regularizar) |
| `selector.py` | Selector propio en los diálogos: select nativo invisible, hoja que primero pide la cuenta y luego sus categorías (con montos y volver), valor y `change`, «Nuevo tipo», validación, buscador con más de 12 opciones, tema oscuro y claro |
| `sin_guia.py` | Finanzas sin la Guía de transferencias: subpestañas, respaldo antiguo que la trae (se importa e ignora), ingreso repartido por ella editable como un ingreso normal y respaldo nuevo sin `plan` |
| `markdown.py` | Markdown: renderizador (formatos, enlaces seguros, entradas hostiles), campo con barra de formato y vista previa, lista, detalle, búsqueda, respaldo, contenido ancho en tema claro y JetBrains Mono |
| `orden_menu.py` | Configuración › Orden: reordenar el menú lateral y las secciones y tarjetas de Inicio (↑ ↓, cancelar, restablecer, persistencia, valores dañados, respaldo, ajuste del dispositivo) |
| `benchmark_carga.py` | Tiempos de carga, pantallas, reportes y guardado con 1k–60k movimientos (no es parte de `run_all`) |
| `benchmark_listas.py` | Tiempos de las listas largas con 1k–60k movimientos (no es parte de `run_all`) |

> Las pruebas dependen del texto y de los atributos `data-act` de la interfaz: si cambias textos visibles, actualiza las aserciones.
