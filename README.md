# Tracker

PWA personal para Android: finanzas por quincena, hábitos, listas y tareas, notas, pomodoro y compras en una sola app.
Sin build y sin dependencias (JavaScript vanilla + IndexedDB). Los datos viven en el teléfono; se respaldan desde **Datos**.

## Probar en local

```fish
python3 -m http.server 8000
```

Abre http://localhost:8000 (el service worker funciona en `localhost`).

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio (la raíz debe contener `index.html`).
2. En GitHub: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.
3. Abre `https://<usuario>.github.io/<repo>/` en el navegador del teléfono → menú ⋮ → **Instalar aplicación**.

Todas las rutas son relativas, así que funciona bajo el subpath `/<repo>/`. Si cambia el esquema de la base de datos, cierra
las demás ventanas de Tracker antes de abrir la versión nueva (la app avisa si hay una abierta).

## Qué incluye

- **Inicio**: saludo, frase célebre, botón de gasto rápido, hábitos de hoy, pagos pendientes y tareas de hoy.
- **Finanzas**: cuentas con categorías que guardan dinero real, gastos repartibles, tarjetas de crédito, **guía** de
  transferencias por quincena, **pagos** pendientes y **reportes**.
- **Hábitos**: carrusel por momento del día, rachas, iconos y orden propio.
- **Listas**: listas y tareas creadas desde plantillas, con fechas límite, lo hecho al final y archivo de listas finalizadas.
- **Pomodoro**: temporizador con descansos y pantalla completa en negro (ahorra batería en AMOLED).
- **Notas**: grupos con campos propios (enlaces, comandos, libros…), búsqueda y etiquetas.
- **Compras**: registro buscable con garantía y facturas.
- **Datos**: exportar/importar JSON (los adjuntos van solo si lo marcas) y ajustes.
- **Gimnasio**: reservado en el menú, todavía vacío.

Tema oscuro **Grafito** (neutros y un solo acento), pensado para móvil.

## Modelo de datos

IndexedDB `mi-quincena` v5 (nombre interno heredado). Stores: `habits`, `accounts`, `moves`, `plan`, `bills`, `purchases`,
`templates`, `lists`, `noteGroups`, `notes`, `files`, `meta`. Las categorías guardan **dinero real**, no presupuesto; editar o
borrar un movimiento revierte su efecto sobre los saldos. Moneda: quetzales (`Q`). Detalle en [Documentacion.md](Documentacion.md).

## Pruebas

Pruebas end-to-end con Playwright en [tests/](tests/): `.venv/bin/python tests/run_all.py` (ver [tests/README.md](tests/README.md)).
Contexto para asistentes de código: [CLAUDE.md](CLAUDE.md), que también lleva la lista de **pendientes**.
