# Mi Quincena — Documentación

PWA pensada para Android que reúne cuatro herramientas personales en una sola app:

- **Finanzas**: cuentas con dinero real repartido en categorías, tarjetas de crédito, plan de reparto de cada pago, pagos pendientes y reportes.
- **Hábitos**: seguimiento diario con rachas.
- **Compras**: registro buscable de lo que vale la pena recordar (con garantía y facturas).
- **Datos**: respaldo (exportar/importar) y ajustes.

Todo funciona sin conexión y los datos se guardan **solo en el teléfono** (IndexedDB). Tema Catppuccin Macchiato, moneda en quetzales (`Q`).

---

## 1. Instalación y publicación

No hay build ni dependencias: son archivos estáticos.

### Probar en local

```fish
cd /ruta/al/proyecto
python3 -m http.server 8000
```

Abre <http://localhost:8000>. El service worker funciona en `localhost`.

### Publicar en GitHub Pages

1. Sube el contenido del proyecto a un repositorio (la raíz debe contener `index.html`).
2. En GitHub: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.
3. Abre `https://<usuario>.github.io/<repo>/` en Chrome del teléfono → menú ⋮ → **Instalar aplicación**.

Todas las rutas son relativas, así que funciona bajo el subpath `/<repo>/`.

### Actualizar la app instalada

El service worker usa *network-first*: con conexión siempre descarga la versión nueva y sin conexión usa la copia guardada. Si añades un archivo `.js` nuevo, agrégalo a la lista `SHELL` de [sw.js](sw.js) para que también funcione offline.

---

## 2. Estructura del proyecto

```
index.html              Estructura: barra superior, contenido, navegación, diálogos
manifest.webmanifest    Nombre, colores e iconos de la PWA
sw.js                   Service worker (funcionamiento offline)
css/style.css           Estilos y paleta Catppuccin Macchiato
icons/                  Iconos (SVG y PNG, incluido maskable para Android)
js/
  app.js                Arranque, pestañas, repintado y despacho de acciones
  util.js               Fechas, periodos, formato de moneda, helpers
  db.js                 Capa sobre IndexedDB
  state.js              Estado en memoria y lógica de dinero (saldos, tarjetas, archivos)
  ui.js                 Diálogos, selectores, adjuntos y visor de archivos
  money.js              Cuentas, gastos, ingresos, transferencias, pago de tarjeta
  plan.js               Plan de reparto y registro de pagos recibidos
  bills.js              Pagos que debo realizar
  reports.js            Reportes
  purchases.js          Registro de compras
  habits.js             Hábitos
  data.js               Exportar, importar, tipos de gasto, borrado total
```

**Arquitectura.** Los datos se cargan completos en memoria (`S` en [state.js](js/state.js)) al abrir la app. Cada cambio se escribe en IndexedDB y se repinta la vista. Cada módulo exporta su vista, sus formularios y un objeto `actions`; [app.js](js/app.js) los une y despacha los clics por el atributo `data-act`.

---

## 3. Conceptos clave

### Cuentas y categorías: dinero real

Una **cuenta** (Banco, Efectivo…) contiene **categorías** (Comida, Transporte…). El saldo de cada categoría es el **dinero real** que tienes apartado para eso, no un presupuesto.

Si en Comida tienes Q200 y gastas Q250, esa categoría baja a Q0 y los Q50 restantes salen de otra categoría. La app hace ese reparto automáticamente al registrar el gasto.

### Gasto con doble categoría

Cada gasto lleva:

| Campo | Para qué sirve |
|---|---|
| **Título** (obligatorio) | Qué fue: «Netflix», «Almuerzo» |
| **Tipo de gasto** | En qué se usó: Suscripciones, Comida, Transporte… |
| **Categoría apartada** | De qué dinero salió (Efectivo / Comida) |
| Nota, fecha, adjuntos | Opcionales (la fecha por defecto es hoy) |

Por ejemplo: de Comida salen Q80, pero se usaron para una suscripción → categoría apartada *Comida*, tipo de gasto *Suscripciones*. Los tipos de gasto se administran en **Datos → Tipos de gasto** o se crean al vuelo con «＋ Nuevo tipo…».

### Tarjetas de crédito

Una tarjeta es un **método de pago**, no una categoría. Al registrar un gasto eliges «Pagado con» la tarjeta y, como siempre, la categoría de la que saldrá el dinero.

- La tarjeta suma **deuda**. El dinero se queda en su categoría, pero queda **apartado**: en la categoría se ve «💳 Q200.00 por pagar a tarjeta · libre Q300.00».
- El dinero apartado **no se puede gastar** en otras cosas.
- El **dinero total** se muestra descontando la deuda de las tarjetas.
- **Pagar tarjeta** propone pagar cada categoría con lo que se gastó de ella con la tarjeta. Al pagar se libera lo apartado y baja la deuda.
- El gasto se cuenta **una sola vez** en los reportes (al comprar). Pagar la tarjeta es una transferencia, no un gasto.
- Si la tarjeta tiene **límite**, se avisa al superarlo. Se puede definir una deuda inicial; esa parte aparece «Sin categoría (saldo inicial)».

### Movimientos

| Tipo | Efecto |
|---|---|
| **Gasto** | Resta de una o varias categorías (o suma deuda si es con tarjeta) |
| **Ingreso** | Suma a una categoría |
| **Mover** | Pasa dinero de una categoría a otra |
| **Pago de tarjeta** | Mueve dinero de tus categorías a la tarjeta |

Editar o borrar un movimiento **revierte su efecto** sobre los saldos y aplica el nuevo, así que los saldos siempre cuadran con el historial.

### Plan de reparto

Es tu presupuesto base de cada pago (en **Finanzas → Plan**). Cada línea tiene un concepto, un monto, un destino (categoría o tarjeta) y cuándo aplica:

- **Cada quincena**
- **Solo 1ª quincena** (días 1–15)
- **Solo 2ª quincena** (días 16–fin de mes)

Al **registrar un pago recibido** la app reparte el dinero según el plan. Esto se usa para pagos fijos como el seguro, que no se paga cada quincena. Si el destino es una tarjeta, el monto se usa para pagarla.

### Pagos pendientes

En **Finanzas → Pagos** registras lo que debes pagar (luz, internet, seguro, tarjeta…):

- Frecuencia: **una sola vez**, **cada mes** (día X) o **cada quincena** (días X y X+15).
- Se agrupan en **Vencidos**, **Próximos** (30 días) y **Realizados**.
- La pestaña muestra un aviso con los vencidos o que vencen en 3 días.
- Al pagar se guarda la fecha, el monto y un comprobante. Opcionalmente se descuenta de tus cuentas.
- Si el pago es de una tarjeta, se abona a ella y muestra de qué categorías saldrá.
- Se puede **omitir** un vencimiento o **deshacer** un pago (revierte el dinero).

### Reportes

En **Finanzas → Reportes**, por **quincena, mes, año o todo el tiempo** (con navegación ‹ ›):

- Gastado, ingresos, balance, promedio diario y comparación con el periodo anterior.
- Gasto por día (o por mes en periodos largos).
- En qué se gastó (por tipo) y de qué dinero salió (por categoría apartada).
- Cuentas con más movimiento y gastos más grandes.

Las transferencias y los pagos de tarjeta no cuentan como gasto.

### Compras

Registro de lo que vale la pena recordar: nombre, fecha, precio, tienda, etiqueta, notas y archivos. Si indicas los **meses de garantía**, se calcula la fecha de vencimiento y cuánto falta. Hay un buscador por nombre, tienda, etiqueta, notas, precio y fecha (ignora mayúsculas y tildes).

### Archivos adjuntos

Se pueden adjuntar fotos y PDF a gastos, ingresos, pagos y compras.

- Las fotos se reducen a 1600 px y se guardan en JPEG (≈200 KB cada una).
- Los PDF se guardan tal cual. Máximo 10 MB por archivo.
- Se guardan en IndexedDB como *Blobs*, en un store aparte. Los registros solo guardan la referencia.
- Los archivos que ya nada usa se eliminan automáticamente.

---

## 4. Flujos de uso

### Primer uso

1. **Finanzas → ＋** y crea tus cuentas (Banco, Efectivo…).
2. Dentro de cada cuenta pulsa **＋ Categoría** e indica el dinero real que hay en cada una.
3. Si tienes tarjetas, créalas con tipo «Tarjeta de crédito» (deuda actual y límite opcionales).
4. En **Plan**, crea las líneas de tu reparto base.
5. En **Pagos**, agrega los pagos recurrentes.

### Cada quincena (cuando te pagan)

1. **Plan → Registrar pago recibido**.
2. Indica monto y fecha. Aparecen las líneas del plan que aplican a esa quincena.
3. Desmarca o ajusta lo que quieras. El sobrante va a la categoría que elijas.
4. Confirma: el dinero queda repartido en tus categorías.

> Un ingreso repartido por el plan no se edita. Para corregirlo, elimínalo y regístralo de nuevo; los saldos se revierten solos.

### Registrar un gasto

1. Toca **＋** (botón flotante) o directamente la categoría de la que sale.
2. Escribe **título** y **monto**, elige el **tipo de gasto**.
3. Si es con tarjeta, elige «Pagado con».
4. Si el monto supera lo disponible en la categoría, la app propone repartirlo en otras. Puedes ajustarlo o usar «Dividir en otra categoría».
5. Opcional: nota, fecha y adjuntos (por ejemplo, la factura).

### Pagar una tarjeta

1. En la tarjeta pulsa **Pagar tarjeta** (o paga el vencimiento desde **Pagos**).
2. Revisa el reparto propuesto por categoría y ajústalo si hace falta.
3. Confirma: baja la deuda y se libera lo apartado.

### Pagar algo pendiente

1. **Pagos → Pagar** sobre el vencimiento.
2. Indica fecha y monto, adjunta el comprobante y elige si se descuenta de tus cuentas.
3. Queda en **Realizados**. Tócalo para verlo o **Deshacer**.

### Guardar una compra importante

1. **Compras → ＋**.
2. Llena nombre, fecha, precio, tienda y meses de garantía; adjunta la factura.
3. Búscala después por cualquier dato.

### Hábitos

**Hábitos → ＋** para crear un hábito (con color). Marca los últimos 7 días tocando los círculos; se muestra la racha y el progreso de hoy.

### Respaldo

En **Datos**:

- **Exportar a archivo** descarga un JSON con todo. **Compartir respaldo** lo envía a otra app (Drive, WhatsApp…).
- La casilla **Incluir archivos adjuntos** decide si el respaldo lleva también fotos y PDF. Sin ella es ligero; con ella es completo pero más pesado.
- **Importar desde archivo** valida el respaldo y **reemplaza todos los datos actuales** (pide confirmación). Si el respaldo no trae adjuntos, se conservan los que ya hay en el teléfono.
- Se muestra la fecha del último respaldo.

> **Recomendación:** exporta un respaldo de vez en cuando. Si borras los datos del navegador, se pierden.

---

## 5. Modelo de datos

Base de datos IndexedDB `mi-quincena`, versión 3.

| Store | Contenido |
|---|---|
| `accounts` | `{ id, name, type: 'normal'｜'credit', limit?, cats: [{ id, name, balance }] }`. En una tarjeta, `cats[0].balance` es la deuda (negativa) |
| `moves` | `{ id, t, date, type: 'expense'｜'income'｜'transfer', title?, note, kind?, total, parts: [{ acc, cat, amount, line? }], to?, card?, plan?, bill?, files? }` |
| `plan` | `{ id, name, amount, key: 'cuenta｜categoría', when: 'both'｜'q1'｜'q2' }` |
| `bills` | `{ id, title, amount, freq: 'once'｜'monthly'｜'biweekly', day?, dueDate?, start, card?, active, paid: { [vencimiento]: { on, amount, moveId, skipped, files } } }` |
| `purchases` | `{ id, name, date, price, store, tag, warrantyMonths, notes, files }` |
| `habits` | `{ id, name, color, dates: { 'YYYY-MM-DD': 1 } }` |
| `files` | `{ id, blob, mime, name, size }` |
| `meta` | `{ k: 'settings', v: { lastExport, includeFiles, types, leftover, lastKind } }` |

**Detalles de diseño**

- Un gasto con tarjeta lleva `card`; sus `parts` indican la categoría apartada, pero **no modifican su saldo**: solo suma deuda a la tarjeta.
- Lo apartado por tarjeta **no se guarda**: se deriva del historial (`cardPending` en [state.js](js/state.js)). Las compras suman a su categoría y los pagos restan primero de la categoría desde la que se paga y luego de las mayores. Por eso editar o borrar siempre cuadra.
- Un gasto repartido guarda varias entradas en `parts`.
- Los respaldos se exportan con `version: 3`. También se aceptan los de la versión 2.

### Formato del respaldo

```json
{
  "app": "mi-quincena",
  "version": 3,
  "exportedAt": "2026-10-10T18:00:00.000Z",
  "includesFiles": false,
  "settings": {}, "habits": [], "accounts": [], "moves": [],
  "plan": [], "bills": [], "purchases": [],
  "files": [{ "id": "…", "mime": "image/jpeg", "name": "…", "data": "data:…;base64,…" }]
}
```

`files` solo aparece si se incluyeron los adjuntos.

---

## 6. Pruebas

Las pruebas se hicieron de extremo a extremo con Playwright (Chromium, 390×800) contra `python3 -m http.server`. Cubrieron:

- Cuentas, categorías, gastos repartidos y validaciones.
- Tarjetas: compra, apartado, pago, edición, borrado y límite de crédito.
- Plan y registro de pagos por quincena.
- Pagos: vencidos, mensuales, pagar, omitir y deshacer.
- Compras con adjuntos, búsqueda y garantía.
- Reportes, exportar/importar (con y sin archivos) y migración desde la base de datos v2.

Los scripts de prueba **no forman parte del repositorio**. Aún falta validar la app en un teléfono Android real.

---

## 7. Limitaciones conocidas

- Los datos viven solo en el dispositivo; no hay sincronización entre dispositivos. El respaldo manual es la única copia.
- Importar siempre **reemplaza** los datos; no hay combinación de respaldos.
- Los ingresos repartidos por el plan no se editan (se eliminan y se registran de nuevo).
- Los respaldos con adjuntos usan base64 y pueden pesar bastante si hay muchas facturas.
- Si se elimina una cuenta o categoría, sus movimientos anteriores se conservan y aparecen como «(eliminada)».
- El respaldo de la versión 1 (quincenas) ya no se puede importar.
