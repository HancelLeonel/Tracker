# Tracker

PWA para Android: tracker de hábitos + gestor de gastos quincenales. Sin build, sin dependencias.
Datos en IndexedDB (locales al teléfono), con exportación/importación JSON desde la pestaña **Datos**.

## Probar en local

```fish
python3 -m http.server 8000
```

Abre http://localhost:8000 (el service worker funciona en `localhost`).

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio (la raíz debe contener `index.html`).
2. En GitHub: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.
3. Abre `https://<usuario>.github.io/<repo>/` en Chrome del teléfono → menú ⋮ → **Instalar aplicación**.

Todas las rutas son relativas, así que funciona bajo el subpath `/<repo>/`.

## Qué incluye

- **Finanzas → Cuentas**: cuentas con categorías que guardan tu dinero real. Un gasto se descuenta de una categoría
  y, si no alcanza, se reparte entre varias. Cada gasto lleva título y un *tipo de gasto* (en qué se usó).
  Las **tarjetas de crédito** acumulan deuda; «Pagar tarjeta» mueve dinero de tus cuentas a la tarjeta
  sin volver a contarlo como gasto.
- **Guía**: lista de transferencias que debes hacer cada quincena (por cuenta y categoría) con avance. El pago entra a una cuenta y tú lo repartes poco a poco.
- **Pagos**: pagos pendientes, vencidos y realizados, con comprobante y opción de descontarlos de tus cuentas.
- **Reportes**: por quincena, mes, año o todo el tiempo.
- **Compras**: registro buscable de lo que vale la pena recordar, con cálculo de garantía.
- **Hábitos** y **Datos** (exportar/importar JSON; los adjuntos se incluyen solo si lo marcas).

## Modelo de datos

- **Cuenta**: `{ name, type: 'normal'|'credit', limit?, cats }`. En una tarjeta, `cats[0].balance` es la deuda (negativa).
- **Categoría**: `{ name, balance }`, el dinero real que hay ahí (no un presupuesto).
- **Movimiento**: `expense` (`title`, `kind`, repartible con `parts`), `income` o `transfer`.
  Editar o borrar un movimiento revierte su efecto sobre los saldos y aplica el nuevo.
- **Plan**: líneas `{ name, amount, key, when: both|q1|q2 }`. **Pago**: `{ title, freq, paid: {...} }`.
  **Compra**: `{ name, date, warrantyMonths, files }`. **Archivo**: Blob en el store `files`.
- Moneda: quetzales, mostrada como `Q`.

## Pruebas

Pruebas end-to-end con Playwright en [tests/](tests/): `python tests/run_all.py` (ver [tests/README.md](tests/README.md)).
Contexto del proyecto para asistentes de código: [CLAUDE.md](CLAUDE.md). Documentación completa: [Documentacion.md](Documentacion.md).
