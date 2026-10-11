# Tracker — Documentación

**Tracker** es una PWA pensada para Android que reúne cuatro herramientas personales en una sola app:

- **Finanzas**: cuentas con dinero real repartido en categorías, tarjetas de crédito, guía de transferencias de cada quincena, pagos pendientes y reportes.
- **Hábitos**: seguimiento diario con rachas, iconos, momentos del día y orden propio.
- **Compras**: registro buscable de lo que vale la pena recordar (con garantía y facturas).
- **Datos**: respaldo (exportar/importar) y ajustes.

Todo funciona sin conexión y los datos se guardan **solo en el teléfono** (IndexedDB). Tema Catppuccin Macchiato, moneda en quetzales (`Q`).

### Navegación e iconos

- Se navega con un **menú lateral**: el botón de tres líneas, a la izquierda del título de cada pantalla (por ejemplo «Finanzas»), lo despliega. Se cierra al elegir una herramienta, al tocar fuera o con Escape.
- Los iconos son SVG minimalistas de trazo **blanco**, en línea (estilo Whicons), definidos en [icons.js](js/icons.js). Solo sobre botones de fondo pastel (los primarios, el botón flotante y los círculos de hábitos marcados) el trazo es oscuro para que se vea.

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

La app se actualiza sola al abrirla con conexión. Lo que **no** se actualiza solo es el **nombre y el icono de la pantalla de inicio ni la pantalla de carga del sistema** (el *splash* de Android): se toman del manifiesto en el momento de instalar. Si cambias el nombre o el icono, hay que **desinstalar la app del teléfono y volver a instalarla** (Brave, en particular, no actualiza los accesos directos instalados). Mientras la app arranca también se muestra una pantalla de carga propia con el logo y el nombre actuales.


El service worker usa *network-first*: con conexión siempre descarga la versión nueva y sin conexión usa la copia guardada. Si añades un archivo `.js` nuevo, agrégalo a la lista `SHELL` de [sw.js](sw.js) para que también funcione offline.

---

## 2. Estructura del proyecto

```
index.html              Estructura: barra superior, contenido, menú lateral, diálogos
manifest.webmanifest    Nombre, colores e iconos de la PWA
sw.js                   Service worker (funcionamiento offline)
css/style.css           Estilos y paleta Catppuccin Macchiato
icons/                  Iconos (SVG y PNG, incluido maskable para Android)
js/
  app.js                Arranque, pestañas, repintado y despacho de acciones
  util.js               Fechas, periodos, formato de moneda, helpers
  icons.js              Iconos SVG (trazo blanco)
  db.js                 Capa sobre IndexedDB
  state.js              Estado en memoria y lógica de dinero (saldos, tarjetas, archivos)
  ui.js                 Diálogos, selectores, adjuntos y visor de archivos
  money.js              Cuentas, gastos, ingresos, transferencias, pago de tarjeta
  plan.js               Guía de transferencias de cada quincena
  bills.js              Pagos que debo realizar
  reports.js            Reportes
  purchases.js          Registro de compras
  habits.js             Hábitos (iconos, momentos del día, orden)
  data.js               Exportar, importar, tipos de gasto, borrado total
tests/                  Pruebas end-to-end con Playwright y benchmarks
CLAUDE.md               Contexto y reglas del proyecto para asistentes de código
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

- La tarjeta suma **deuda**. El dinero se queda en su categoría, pero queda **apartado**: en la categoría se ve «Q200.00 por pagar a tarjeta · libre Q300.00».
- El dinero apartado **no se puede gastar** en otras cosas.
- El **dinero total** se muestra descontando la deuda de las tarjetas.
- **Pagar tarjeta** propone pagar cada categoría con lo que se gastó de ella con la tarjeta. Al pagar se libera lo apartado y baja la deuda.
- El gasto se cuenta **una sola vez** en los reportes (al comprar). Pagar la tarjeta es una transferencia, no un gasto.
- Si la tarjeta tiene **límite**, se avisa al superarlo. Se puede definir una deuda inicial; esa parte aparece «Sin categoría (saldo inicial)».

### Orden alfabético

En **Finanzas** las listas de nombres van siempre en orden alfabético (sin distinguir mayúsculas ni tildes, y con números naturales: «Cat 2» antes que «Cat 10»): cuentas, categorías, selectores de categoría, tipos de gasto, líneas de la guía y el desglose por categoría de las tarjetas. Se reordenan solas al crear o renombrar. Mantienen su propio orden las listas donde el orden significa algo: movimientos y pagos por fecha, y los rankings de reportes por monto.

### Movimientos

| Tipo | Efecto |
|---|---|
| **Gasto** | Resta de una o varias categorías (o suma deuda si es con tarjeta) |
| **Ingreso** | Suma a una categoría |
| **Mover** | Pasa dinero de una categoría a otra |
| **Pago de tarjeta** | Mueve dinero de tus categorías a la tarjeta |

Editar o borrar un movimiento **revierte su efecto** sobre los saldos y aplica el nuevo, así que los saldos siempre cuadran con el historial.

### Guía de transferencias

Cuando te pagan, el dinero **entra a una cuenta** (por ejemplo Banco) con **Registrar pago recibido**. La app **no lo reparte sola**: tú lo distribuyes a tus otras cuentas y a tu efectivo poco a poco, conforme puedas. La **guía** (en **Finanzas → Guía**) existe para que no olvides nada.

Cada línea de la guía dice qué debes transferir y a dónde: un concepto, un monto, una categoría destino y cuándo aplica:

- **Cada quincena**
- **Solo 1ª quincena** (días 1–15)
- **Solo 2ª quincena** (días 16–fin de mes)

Por ejemplo: «Internet · Q200 → Efectivo / Internet», o «Seguro · Q450 → Banco / Seguro, solo 1ª quincena».

La pantalla muestra una quincena (con las flechas para revisar también las anteriores):

- **Pago recibido** en la quincena y **cuánto falta por transferir** en total, con barra de avance.
- Una tarjeta por **cuenta destino** con la suma de sus líneas («Transferir Q1,200 a Efectivo · llevas Q800 · faltan Q400»).
- Dentro de cada cuenta, el desglose por línea con ⬜ pendiente, 🟡 parcial o ✅ cumplida.

**Cómo se mide el avance.** No hay que marcar nada a mano: se calcula con las transferencias que registres en esa quincena.

- Una **línea** avanza con las transferencias hacia su categoría (de donde vengan).
- Una **cuenta** se considera cumplida cuando le has transferido el total desde otras cuentas, o cuando sus líneas están cumplidas.

**Atajos.** Tocar una línea abre una transferencia ya llenada con lo que falta (destino, monto y descripción). El botón «⇄ Transferir» de la cuenta hace lo mismo con el total pendiente de la cuenta. Si el destino es una tarjeta de crédito, abre el pago de tarjeta.

**Flujo con «categoría de paso».** Si prefieres mover primero todo el dinero a Efectivo y repartirlo después, crea en Efectivo una categoría como «Por distribuir»:

1. Transfiere Q1,200 de Banco a Efectivo / Por distribuir → la cuenta Efectivo queda **completa**.
2. Reparte desde «Por distribuir» a cada categoría (Internet, Comida…) → cada línea se marca como cumplida.

Al abrir una transferencia, la app recuerda de qué categoría moviste dinero la última vez y a dónde suele entrar tu pago.

### Pagos pendientes

En **Finanzas → Pagos** registras lo que debes pagar (luz, internet, seguro, tarjeta…):

- Frecuencia: **una sola vez**, **cada mes** (día X) o **cada quincena** (días X y X+15).
- Se agrupan en **Vencidos**, **Próximos** (30 días) y **Realizados**.
- La pestaña muestra un aviso con los vencidos o que vencen en 3 días.
- Al pagar se guarda la fecha, el monto y un comprobante. Opcionalmente se descuenta de tus cuentas.
- Si el pago es de una tarjeta, se abona a ella y muestra de qué categorías saldrá.
- Se puede **omitir** un vencimiento o **deshacer** un pago (revierte el dinero).

### Reportes

En **Finanzas → Reportes**, por **quincena, mes, año o todo el tiempo** (con flechas para cambiar de periodo):

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

1. **Finanzas →** botón **+** de la barra superior y crea tus cuentas (Banco, Efectivo…).
2. Dentro de cada cuenta pulsa **+ Categoría** e indica el dinero real que hay en cada una.
3. Si tienes tarjetas, créalas con tipo «Tarjeta de crédito» (deuda actual y límite opcionales).
4. En **Guía**, crea las líneas de lo que debes transferir cada quincena.
5. En **Pagos**, agrega los pagos recurrentes.

### Cada quincena (cuando te pagan)

1. **Guía → Registrar pago recibido**. Indica el monto, la fecha y la categoría en la que cae el dinero (la app recuerda la última).
2. Abre la **Guía** de la quincena: ahí ves todo lo que debes transferir, por cuenta.
3. Transfiere cuando puedas, tocando una línea o el botón «⇄ Transferir» de la cuenta. Puedes hacerlo en varias partes.
4. El avance se actualiza solo. Cuando todo está en ✅ no queda nada por transferir.

### Registrar un gasto

1. Toca el botón flotante **+**, **− Gasto** o directamente la categoría de la que sale.
2. Escribe **título** y **monto** y elige el **tipo de gasto**.
3. Si es con tarjeta, elige «Pagado con».
4. Elige **de qué categoría sale el dinero**. La app **no lo asume**: al abrir el formulario hay un solo selector vacío, y solo ofrece categorías que tengan dinero libre (no las que están en cero).
5. Si esa categoría no alcanza para el monto, la app te avisa cuánto falta y aparece **«Agregar otra categoría»**. El nuevo selector solo ofrece categorías con dinero disponible que aún no uses y toma el resto del monto.
6. Opcional: nota, fecha y adjuntos (por ejemplo, la factura).

### Ver los movimientos de una cuenta

En **Finanzas → Cuentas**, toca el **nombre de la cuenta**. Se abre la lista de sus movimientos con cuánto cambió el saldo de esa cuenta (ingresos en verde, gastos en rojo). Las compras con tarjeta aparecen en la cuenta de la que saldrá el dinero («con tarjeta», sin cambiar su saldo todavía) y en la tarjeta. Tocar un movimiento lo abre para editarlo.

### Plegar y desplegar categorías

Cada cuenta tiene un botón con una flecha para **ocultar o mostrar sus categorías** (en las tarjetas, el detalle por categoría). La app recuerda qué cuentas dejaste plegadas.

### Pagar una tarjeta

1. En la tarjeta pulsa **Pagar tarjeta** (o paga el vencimiento desde **Pagos**).
2. Revisa el reparto propuesto por categoría y ajústalo si hace falta.
3. Confirma: baja la deuda y se libera lo apartado.

### Pagar algo pendiente

1. **Pagos → Pagar** sobre el vencimiento.
2. Indica fecha y monto, adjunta el comprobante y elige si se descuenta de tus cuentas.
3. Queda en **Realizados**. Tócalo para verlo o **Deshacer**.

### Guardar una compra importante

1. **Compras →** botón **+** de la barra superior.
2. Llena nombre, fecha, precio, tienda y meses de garantía; adjunta la factura.
3. Búscala después por cualquier dato.

### Hábitos

**Hábitos →** botón **+** para crear un hábito. Cada hábito tiene:

- **Nombre**, **color** y un **icono** a elegir entre 22 (agua, libro, pesas, correr, corazón, café, pastilla, cama…). El icono se muestra en un recuadro con el borde del color del hábito.
- **Momento del día**: **Mañana**, **Durante el día**, **Noche** o **Sin horario**. La pantalla agrupa los hábitos en secciones con ese encabezado y un contador de hoy por sección («1/2»). Si ningún hábito tiene horario, se muestra una sola lista sin encabezados.

Marca los últimos 7 días tocando los círculos; se muestra la racha y el progreso general de hoy. Tocar el nombre de un hábito lo edita (o elimina); para pasarlo a otro momento del día, cambia su «Momento del día».

**Reordenar.** El botón **Ordenar** (junto al progreso de hoy) muestra los hábitos de forma compacta con flechas ↑ ↓ para subirlos o bajarlos **dentro de su momento del día**; **Listo** vuelve a la vista normal. El orden se guarda. Los hábitos creados antes de existir esta función se ordenaron alfabéticamente una sola vez.

### Respaldo

En **Datos**:

- **Exportar a archivo** descarga un JSON con todo. **Compartir respaldo** lo envía a otra app (Drive, WhatsApp…). Los navegadores móviles solo permiten compartir ciertos tipos de archivo, así que se comparte como texto plano con nombre `tracker-fecha.json.txt` (la app lo importa igual). Si compartir falla o el navegador no lo permite, el respaldo se **descarga** automáticamente y se avisa el motivo; cerrar el menú de compartir no cuenta como error.
- La casilla **Incluir archivos adjuntos** decide si el respaldo lleva también fotos y PDF. Sin ella es ligero; con ella es completo pero más pesado.
- **Importar desde archivo** (acepta `.json` y `.txt`) valida el respaldo y **reemplaza todos los datos actuales** (pide confirmación). Si el respaldo no trae adjuntos, se conservan los que ya hay en el teléfono.
- Se muestra la fecha del último respaldo.

> **Recomendación:** exporta un respaldo de vez en cuando. Si borras los datos del navegador, se pierden.

---

## 5. Modelo de datos

Base de datos IndexedDB versión 3. Su nombre interno sigue siendo `mi-quincena` (el de antes de llamarse Tracker) para no perder los datos ya guardados.

| Store | Contenido |
|---|---|
| `accounts` | `{ id, name, type: 'normal'｜'credit', limit?, cats: [{ id, name, balance }] }`. En una tarjeta, `cats[0].balance` es la deuda (negativa) |
| `moves` | `{ id, t, date, type: 'expense'｜'income'｜'transfer', title?, note, kind?, total, parts: [{ acc, cat, amount, line? }], to?, card?, plan?, bill?, files? }` |
| `plan` | Líneas de la guía: `{ id, name, amount, key: 'cuenta｜categoría', when: 'both'｜'q1'｜'q2' }` |
| `bills` | `{ id, title, amount, freq: 'once'｜'monthly'｜'biweekly', day?, dueDate?, start, card?, active, paid: { [vencimiento]: { on, amount, moveId, skipped, files } } }` |
| `purchases` | `{ id, name, date, price, store, tag, warrantyMonths, notes, files }` |
| `habits` | `{ id, name, color, icon, slot: 'morning'｜'day'｜'night'｜'', order, dates: { 'YYYY-MM-DD': 1 } }` |
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
  "app": "tracker",
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

Las pruebas son de extremo a extremo con Playwright (Chromium, 390×800) contra `python3 -m http.server`. Cubren:

- Cuentas, categorías, gastos repartidos y validaciones.
- Tarjetas: compra, apartado, pago, edición, borrado y límite de crédito.
- Guía de transferencias: avance por línea y por cuenta, parcial, por quincena y con categoría de paso.
- Pagos: vencidos, mensuales, pagar, omitir y deshacer.
- Compras con adjuntos, búsqueda y garantía.
- Reportes, exportar/importar (con y sin archivos) y migración desde la base de datos v2.

Los scripts están en [tests/](tests/) (ver [tests/README.md](tests/README.md) para preparar el entorno y ejecutarlos con `tests/run_all.py`). Aún falta validar la app en un teléfono Android real.

---

### Rendimiento

Medido en Chromium de escritorio con datos sintéticos (8 cuentas, 2 tarjetas, hasta 60,000 movimientos). En un teléfono de gama media puede ser de 3 a 5 veces más lento.

| Movimientos | Carga inicial | Pantalla Cuentas | Reportes (todo) | Guardar un gasto |
|---|---|---|---|---|
| 5,000 | 0.26 s | 20 ms | 33 ms | 0.1 s |
| 20,000 | 0.5 s | 17 ms | 80 ms | 0.2 s |
| 60,000 | 1.2 s | 19 ms | 170 ms | 0.4 s |

Con uso intenso (5–10 gastos al día) se llega a unos 20,000 movimientos en 5 años. Para mantener ese margen:

- **Listas paginadas**: los movimientos, la lista de movimientos de una cuenta y las compras se pintan de 30 en 30 (40 en compras) con «Ver más». Antes, «Ver todos» con 20,000 movimientos tardaba 2 s y con 60,000 casi 6 s; ahora cuesta lo mismo con cualquier cantidad.
- **Caché de lo derivado** ([state.js](js/state.js)): los movimientos ordenados y lo apartado para tarjetas se calculan una vez y se reutilizan hasta que cambian los datos. Cualquier cambio en movimientos o cuentas debe llamar a `bump()` para invalidarla; los guardados de `state.js` ya lo hacen. Con 60,000 movimientos la pantalla de Cuentas bajó de 333 ms a 19 ms.
- Lo que sigue creciendo de forma lineal es la **carga inicial** (la app lee todos los datos al abrir) y los **reportes** (recorren el periodo). Con 60,000 movimientos siguen por debajo de 1.5 s y 200 ms.

## 7. Limitaciones conocidas

- Los datos viven solo en el dispositivo; no hay sincronización entre dispositivos. El respaldo manual es la única copia.
- Importar siempre **reemplaza** los datos; no hay combinación de respaldos.
- Los ingresos antiguos que se repartieron automáticamente (versión anterior de la guía) solo se pueden ver o eliminar, no editar.
- La guía mide el avance por las transferencias hacia la categoría destino: mover dinero **desde** una categoría de la guía hacia otra suma a la segunda, pero no resta de la primera.
- Los respaldos con adjuntos usan base64 y pueden pesar bastante si hay muchas facturas.
- Si se elimina una cuenta o categoría, sus movimientos anteriores se conservan y aparecen como «(eliminada)».
- El respaldo de la versión 1 (quincenas) ya no se puede importar. Los respaldos hechos cuando la app se llamaba «Mi Quincena» (`"app": "mi-quincena"`) se siguen aceptando.
