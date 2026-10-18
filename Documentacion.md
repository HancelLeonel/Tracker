# Tracker — Documentación

**Tracker** es una PWA pensada para Android que reúne varias herramientas personales en una sola app:

- **Inicio**: la pantalla con la que abre la app; saludo, frase célebre, gasto rápido y lo pendiente de hoy.
- **Finanzas**: cuentas con dinero real repartido en categorías, tarjetas de crédito, pagos pendientes y reportes.
- **Hábitos**: seguimiento diario con rachas, iconos, momentos del día y orden propio.
- **Pomodoro**: temporizador de trabajo y descansos con modo de pantalla completa en negro.
- **Notas**: grupos de notas con **campos propios** (enlaces guardados, comandos, libros…), cada uno adaptable a lo que necesites.
- **Gimnasio**: rutinas, entrenamiento en curso con descanso entre series, historial y progreso por ejercicio. (Las tareas se llevan con **Listas**.)
- **Listas**: listas de tareas o compras que se crean a partir de **plantillas** reutilizables (el súper quincenal, la limpieza semanal…).
- **Compras**: registro buscable de lo que vale la pena recordar (con garantía y facturas).
- **Configuración**: apariencia (fuente), respaldo (exportar/importar), tipos de gasto y borrado de datos.

Todo funciona sin conexión y los datos se guardan **solo en el teléfono** (IndexedDB). Tema oscuro **Grafito** (neutros casi negros y un solo acento suave), moneda en quetzales (`Q`).

### Navegación e iconos

- Se navega con un **menú lateral**: el botón de tres líneas, a la izquierda del título de cada pantalla (por ejemplo «Finanzas»), lo despliega. Se cierra al elegir una herramienta, al tocar fuera o con Escape.
- Los iconos son SVG minimalistas de trazo fino, en línea (estilo Whicons), definidos en [icons.js](js/icons.js). Usan el color de texto del tema; sobre el acento (botones primarios, botón flotante) el trazo es oscuro, y los iconos de hábitos y grupos toman el color elegido.
- **Diseño**: base casi negra neutra, tarjetas apenas más claras con borde fino, **un solo acento** (índigo suave) para lo principal, y color solo donde significa algo (rojo = vencido o negativo, verde = positivo, amarillo = aviso). Los formularios se abren como **hoja que sube desde abajo**.

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

La app se actualiza sola al abrirla con conexión. Lo que **no** se actualiza solo es el **nombre y el icono de la pantalla de inicio ni la pantalla de carga del sistema** (el *splash* de Android): se toman del manifiesto en el momento de instalar. Si cambias el nombre o el icono, hay que **desinstalar la app del teléfono y volver a instalarla** (el navegador no actualiza los accesos directos ya instalados). Mientras la app arranca también se muestra una pantalla de carga propia con el logo y el nombre actuales.


**Si la app se queda en el logo.** Lo más común tras una actualización que cambia la base de datos: otra ventana de Tracker (otra pestaña, o la app instalada en segundo plano) sigue abierta con la versión anterior y **impide actualizar la base**. La app lo detecta y muestra «Tracker está abierto en otra ventana con una versión anterior»; basta cerrar esa otra ventana (en recientes, quitar la app) y la nueva abre sola. Si el arranque falla por otra causa, a los 10 segundos aparece «Tracker no pudo iniciar» con el detalle del error y dos botones: **Reintentar** y **Actualizar la app** (borra la caché y el service worker; los datos no se tocan). Desde esta versión, además, una ventana nueva ya no queda bloqueada por una más reciente: la vieja cierra su conexión y se recarga sola.

Al abrir, la app sale **al instante de la copia guardada** y, en segundo plano, comprueba si hay una versión nueva. Si la hay, la descarga completa y aparece el aviso **«Hay una versión nueva · Actualizar»**; si lo tocas, la app se recarga con ella (si no, la tendrás la próxima vez que abras). Por eso **una actualización publicada se ve en la segunda apertura**, no en la primera. Cada versión se guarda entera y por separado, así que nunca se mezclan archivos viejos y nuevos. Si añades un archivo `.js` nuevo, agrégalo a la lista `SHELL` de [sw.js](sw.js) para que también funcione offline.

---

## 2. Estructura del proyecto

```
index.html              Estructura: barra superior, contenido, menú lateral, diálogos
manifest.webmanifest    Nombre, colores e iconos de la PWA
sw.js                   Service worker (funcionamiento offline)
css/style.css           Estilos y tema Grafito (variables CSS)
icons/                  Iconos (SVG y PNG, incluido maskable para Android)
js/
  app.js                Arranque, pestañas, repintado y despacho de acciones
  util.js               Fechas, periodos, formato de moneda, helpers
  icons.js              Iconos SVG
  db.js                 Capa sobre IndexedDB
  state.js              Estado en memoria y lógica de dinero (saldos, tarjetas, archivos)
  ui.js                 Diálogos, selectores, adjuntos y visor de archivos
  money.js              Cuentas, gastos, ingresos, transferencias, pago de tarjeta
  bills.js              Pagos que debo realizar
  reports.js            Reportes
  purchases.js          Registro de compras
  home.js               Inicio: saludo, frase, gasto rápido y lo pendiente de hoy
  habits.js             Hábitos (iconos, momentos del día, orden)
  aviso.js              Sonido, vibración y pantalla encendida (los usan Pomodoro y Gimnasio)
  pomodoro.js           Temporizador Pomodoro y pantalla completa negra
  gym.js                Gimnasio: rutinas, entrenamientos, descanso, historial, progreso y catálogo
  catalogo.js           Grupos musculares y ejercicios iniciales del catálogo
  notes.js              Notas: grupos con campos propios
  markdown.js           Markdown sencillo (visor seguro y editor con barra de formato)
  lists.js              Listas y plantillas
  data.js               Exportar, importar, tipos de gasto, borrado total
  sync.js               Sincronización con Google Drive (enviar / traer)
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

Por ejemplo: de Comida salen Q80, pero se usaron para una suscripción → categoría apartada *Comida*, tipo de gasto *Suscripciones*. Los tipos de gasto se administran en **Configuración → Tipos de gasto** o se crean al vuelo con «＋ Nuevo tipo…».

### Tarjetas de crédito

Una tarjeta es un **método de pago**, no una categoría. Al registrar un gasto eliges «Pagado con» la tarjeta y, como siempre, la categoría de la que saldrá el dinero.

- La tarjeta suma **deuda**. El dinero se queda en su categoría, pero queda **apartado**: en la categoría se ve «Q200.00 por pagar a tarjeta · libre Q300.00».
- El dinero apartado **no se puede gastar** en otras cosas.
- El **dinero total** se muestra descontando la deuda de las tarjetas.
- **Pagar tarjeta** propone pagar cada categoría con lo que se gastó de ella con la tarjeta. Al pagar se libera lo apartado y baja la deuda.
- El gasto se cuenta **una sola vez** en los reportes (al comprar). Pagar la tarjeta es una transferencia, no un gasto.
- Si la tarjeta tiene **límite**, se avisa al superarlo. Se puede definir una deuda inicial; esa parte aparece «Sin categoría (saldo inicial)».

### Orden alfabético

En **Finanzas** las listas de nombres van siempre en orden alfabético (sin distinguir mayúsculas ni tildes, y con números naturales: «Cat 2» antes que «Cat 10»): cuentas, categorías, selectores de categoría, tipos de gasto y el desglose por categoría de las tarjetas. Se reordenan solas al crear o renombrar. Mantienen su propio orden las listas donde el orden significa algo: movimientos y pagos por fecha, y los rankings de reportes por monto.

### Movimientos

| Tipo | Efecto |
|---|---|
| **Gasto** | Resta de una o varias categorías (o suma deuda si es con tarjeta) |
| **Ingreso** | Suma a una categoría |
| **Mover** | Pasa dinero de una categoría a otra |
| **Pago de tarjeta** | Mueve dinero de tus categorías a la tarjeta |

Editar o borrar un movimiento **revierte su efecto** sobre los saldos y aplica el nuevo, así que los saldos siempre cuadran con el historial.

### Pago recibido

Cuando te pagan, el dinero **entra a una cuenta** (por ejemplo Banco) con el botón **Ingreso**. La app **no lo reparte sola**: tú lo distribuyes a tus otras cuentas y a tu efectivo con **Mover**, poco a poco, conforme puedas.

### Pagos pendientes

En **Finanzas → Pagos** registras lo que debes pagar (luz, internet, seguro, tarjeta…):

- Frecuencia: **una sola vez**, **cada mes** (día X), **cada quincena** (días X y X+15) o **cada año** (para suscripciones anuales: se pide la **próxima fecha de vencimiento** completa y se repite ese día y mes cada año; un 29 de febrero cae el 28 en los años no bisiestos). Si la fecha ya pasó, aparece como vencido hasta que lo pagues.
- Como un pago anual casi nunca cae en los próximos 30 días, la sección **Anuales** los lista todos con su próxima fecha para poder verlos y editarlos.
- Se agrupan en **Vencidos**, **Próximos** (30 días) y **Realizados**.
- La pestaña muestra un aviso con los vencidos o que vencen en 3 días.
- Un pago periódico que dejaste de marcar no llena la lista: en **Vencidos** aparece una sola vez (el vencimiento más antiguo) con «y N vencimientos más»; al pagarlo aparece el siguiente. Los avisos (la pestaña y la tarjeta de Inicio) cuentan **pagos**, no meses atrasados.
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

### Inicio

Es la **pantalla predeterminada**: al abrir la app (y cada vez que eliges **Inicio** en el menú lateral) se ve, de arriba abajo:

- La **fecha** y un **saludo** según la hora («Buenos días» hasta las 12, «Buenas tardes» hasta las 19, «Buenas noches» después).
- Una **frase célebre** con su autor, compacta.
- Un campo de **nota rápida**: escribes algo al vuelo (por ejemplo en medio de una conversación) y Enter la guarda en la **Bandeja**; el campo queda listo para otra.
- Cuatro tarjetas de media pantalla, en dos filas: **Hábitos** (cuántos llevas hoy, p. ej. «2/5», con barra), **Pagos** (solo muestra información si hay pagos **vencidos** —cuántos, en rojo— o que **vencen en los próximos 3 días** —el más cercano: «Vence hoy», «Vence mañana», «Vence el 14 oct»—; si no, dice «No hay pagos cercanos»), **Ejercicio** y una tarjeta con tres botones, **Gasto**, **Ingreso** y **Mover**, que abren sus formularios sobre Inicio (sin cuentas con categorías avisan en vez de abrirse). Tocar Hábitos, Pagos o Ejercicio lleva a su pantalla.
- **Ejercicio** muestra en cuántos de los **últimos 7 días** entrenaste («4/7»), cuándo fue el último («Último: ayer») y siete **círculos pequeños**, uno por día (el último es hoy), con color los días entrenados. Cuenta días, no entrenamientos: dos el mismo día son uno. Un entrenamiento en curso no cuenta hasta terminarlo y la tarjeta dice «Entrenando ahora». Tocarla abre el Historial del Gimnasio (o el entrenamiento, si hay uno en curso o aún no hay ninguno).
- La **Bandeja**: tus notas rápidas pendientes, la más nueva primero (5 y «Ver N más»). Tocar una abre un diálogo para **editarla**, **archivarla como nota** de un grupo de Notas (el enlace se guarda en el campo de enlace del grupo y el resto del texto en su primer campo de texto; si el grupo no tiene dónde guardarlo, avisa), **agregarla a una lista** como elemento adicional, o **eliminarla**. Los enlaces o textos que **compartas desde otra app** («Compartir» → Tracker, tras reinstalar la app instalada) también caen aquí. Con dos o más aparece **Seleccionar**: marcas las que quieras (o «Todas») y con **Archivar (N)** las archivas **juntas** como notas de un grupo (cada una con su título), las agregas a una lista o las eliminas; si alguna no cabe en el grupo elegido no se archiva ninguna. Si lo que archivas trae un enlace, se sugiere el grupo que tenga campo de enlace.
- **Tareas de hoy**: los elementos de tus listas activas con **fecha límite de hoy o ya vencida**, el más atrasado primero, con el nombre de su lista. La casilla de la izquierda la **marca como hecha** sin salir de Inicio; tocar el texto abre la lista. Se muestran 6 y un enlace «Ver N más en Listas». Sin pendientes dice «Nada pendiente para hoy».

- **La frase cambia cada vez que se muestra la pantalla**: al abrir la app, al volver a Inicio desde otra herramienta y al regresar a la app desde segundo plano. También cambia **tocando la frase** (no hay botón visible, para mantener la pantalla limpia). Abrir o cerrar el menú no la cambia.
- Las frases se reparten **mezcladas, sin repetir ninguna hasta haberlas visto todas** (34 frases en [home.js](js/home.js), lista `QUOTES`). Para agregar una basta con añadir `['texto', 'Autor']`; conviene usar solo frases con autoría documentada (obras, discursos o refranes).

### Pomodoro

**Menú → Pomodoro.** (Ya no tiene tarjeta en Inicio.) Un temporizador sencillo con fases de **Trabajo**, **Descanso corto** y **Descanso largo**.

- **Controles**: el botón grande inicia o pausa; a los lados, **reiniciar** la fase actual y **saltar** a la siguiente (saltar un pomodoro de trabajo no lo cuenta). Debajo de la cuenta se ve el avance de la fase y «Hoy: N pomodoros».
- **Configurar**: minutos de trabajo (por defecto 25), descanso corto (5) y descanso largo (15), cuántos pomodoros hay antes del descanso largo (4) y, opcionalmente, **iniciar la siguiente fase automáticamente**. Si el temporizador está corriendo, los cambios se aplican desde la fase siguiente. La configuración se guarda en los ajustes y viaja en el respaldo.
- **Aviso**: al terminar una fase suena un tono de tres pitidos, vibra el teléfono y se muestra un aviso en pantalla; luego queda lista la fase siguiente (o arranca sola si lo activaste).
- **Pantalla completa**: el botón **Pantalla completa** cubre todo con **negro puro** y deja **solo el contador en blanco**. En pantallas AMOLED los píxeles negros están apagados, así que gasta muy poca batería. Se sale tocando la pantalla, con Escape o con el gesto de atrás del sistema. El contador sigue corriendo y, si una fase termina estando en pantalla completa, sigue en negro con el contador de la fase nueva.
- **Pantalla encendida**: mientras el temporizador corre, la app pide al sistema que **no apague la pantalla** (Screen Wake Lock). Es lo que permite que el aviso suene a tiempo, porque Android puede congelar la página con la pantalla bloqueada; por eso conviene usar la pantalla completa negra, que mantiene la pantalla encendida sin gastar casi nada en AMOLED.
- **Limitación**: si cambias a otra app o bloqueas el teléfono a mano, el navegador puede pausar la página y el aviso no sonar hasta que vuelvas; la cuenta nunca se pierde (se calcula con la hora de fin guardada, también si recargas o cierras la app). Si una fase terminó con la app cerrada, al abrirla se avanza **sin sonar**. Por eso se recomienda la pantalla completa negra, que mantiene la pantalla encendida con muy poco gasto en AMOLED.

### Notas

**Menú → Notas.** En vez de una sola libreta, las notas se organizan en **grupos** y **cada grupo decide qué datos lleva cada nota**: uno puede ser un guardador de enlaces, otro una lista de comandos, otro tus libros…

- **Grupo nuevo (+)**: nombre, icono y color. Puedes **empezar con un ejemplo** (Enlaces, Comandos, Libros o Notas libres), que rellena todo y se puede cambiar después, o con un grupo en blanco.
- **Campos**: toda nota tiene un **título** y los campos que definas. Tipos: **texto corto**, **texto largo**, **Markdown** (editor con barra de formato y vista previa; se ve con formato en la nota), **código o comando** (letra monoespaciada y botón **Copiar**), **enlace**, **número**, **fecha**, **opciones** (una lista que tú escribes separada por comas, p. ej. «Por leer, Leyendo, Leído»), **casilla** (sí/no) y **calificación** (1 a 5 estrellas; tocar la misma estrella otra vez la quita). Cada campo puede marcarse **«En la lista»** para verlo debajo del título sin abrir la nota.
- **Markdown**: el campo de tipo **Markdown** es para notas con formato. Al editar tienes una barra con **negrita, cursiva, título, lista, lista de tareas, cita, código y enlace** y dos pestañas, **Escribir** y **Vista previa**. Se entiende: `# Títulos`, `**negrita**`, `*cursiva*`, `~~tachado~~`, `` `código` `` y bloques con ``` ```, listas (`-` o `1.`, con sangría), tareas `- [ ]` / `- [x]` (solo se ven, no se marcan desde la nota), citas `>`, líneas `---` y enlaces `[texto](https://…)` o una dirección suelta. **No** hay imágenes, tablas ni HTML: lo que escribas entre `<` y `>` se muestra como texto. En la lista de notas aparece la primera línea sin las marcas. El grupo de ejemplo **Notas libres** ya usa este tipo.
- **Configurar el grupo** (botón de ajustes junto al buscador): cambia nombre, icono y color, y **agrega, renombra, reordena (↑ ↓), cambia de tipo o quita campos**. Quitar un campo borra ese dato de las notas del grupo; cambiar el tipo conserva los datos. Borrar el grupo borra también sus notas (se avisa cuántas).
- **Dentro de un grupo**: buscador (título, campos y etiquetas, sin importar mayúsculas ni tildes), **etiquetas** (se escriben separadas por coma en la nota y aparecen como filtros arriba; tocar una filtra y otra vez quita el filtro) y las notas, de 40 en 40 con «Ver más». El orden se elige en la configuración del grupo: **más recientes primero** (por defecto) o **alfabético por título**.
- **Acciones rápidas en la lista**: si la nota tiene un campo de enlace, un botón la **abre** en una pestaña nueva; si no, y tiene un campo de código, un botón **copia** el comando. Tocar la nota abre el detalle con todo y el botón **Editar**.
- **Seguridad**: solo se abren enlaces `http://` y `https://`; algo como `javascript:…` se guarda como texto y nunca se vuelve clicable. Un enlace escrito sin esquema («ejemplo.com/pagina») se guarda con `https://`.

### Gimnasio

**Menú → Gimnasio.** Cuatro secciones:

- **Entrenar**: sin entrenamiento en curso muestra el resumen (entrenamientos de la semana —empieza el lunes—, volumen y cuándo fue el último), «Entrenamiento libre» y tus rutinas con el botón **Empezar**. Con uno en curso muestra cada ejercicio con sus series: **peso × repeticiones** y una casilla para marcar la serie. Debajo de cada ejercicio dice «Última vez» con lo que hiciste. Al terminar, **solo se guardan las series marcadas**.
- **Rutinas**: son las plantillas, igual que en Listas: al empezar una se **copia** al entrenamiento y después son independientes (editar o borrar la rutina no toca lo ya entrenado). Se arman **por filas**: en cada una **eliges el ejercicio del catálogo** y pones series, repeticiones y, si quieres, peso y descanso (en segundos); las filas se pueden subir, bajar o quitar. Desde un entrenamiento del historial se puede «Guardar como rutina».
- **Catálogo de ejercicios** (en **Rutinas › Catálogo de ejercicios**): los ejercicios **se eligen de una lista, no se escriben** (así no hay errores ni duplicados que partan el historial). Arranca con unos 66 ejercicios comunes agrupados por músculo (Pecho, Espalda, Hombros, Bíceps, Tríceps, Piernas, Glúteos, Abdomen, Cardio y Otro). Puedes **buscar**, **agregar** (con el +), **editar** (nombre y grupo) y **eliminar**. No se admiten nombres repetidos (sin importar mayúsculas ni tildes). **Cambiar el nombre** lo actualiza también en tus rutinas y en el historial. Un ejercicio que está en alguna rutina **no se puede eliminar** hasta quitarlo de ella; al eliminar uno que solo está en el historial, el historial lo conserva. Al agregar un ejercicio a un entrenamiento hay un botón para crear uno nuevo en el catálogo sin salir de ahí. La primera vez que se abre la versión con catálogo, los nombres que ya usabas en rutinas e historial entran también al catálogo (en «Otro» si no estaban).
- **Historial**: entrenamientos terminados, del más reciente al más antiguo por fecha (de 30 en 30). Tocar uno muestra sus series (con sus notas) y permite **Editar** (nombre, fecha, el valor y la nota de cada serie, agregar o quitar series y quitar ejercicios), guardarlo **como rutina** o eliminarlo.
- **Progreso**: un ejercicio por tarjeta (alfabético; «Press de banca» y «press de banca» cuentan como el mismo). El detalle muestra la mejor serie, una gráfica del peso máximo por sesión (o de repeticiones, si nunca usaste peso) y las últimas sesiones.

**Peso inicial de cada serie**: el de la rutina si lo trae; si no, el de la misma serie la última vez que hiciste ese ejercicio. Si superas el peso máximo que habías levantado en un ejercicio, aparece el aviso «Nuevo récord».

**Descanso entre series**: al marcar una serie empieza una cuenta regresiva (la fijada bajo la barra superior) con **−15 s**, **+15 s** y **Saltar**. Al terminar suena y vibra; mientras corre, la pantalla se mantiene encendida (igual que el Pomodoro, y por la misma razón: como PWA no se puede avisar con la pantalla bloqueada). La hora de fin se guarda, así que sobrevive a recargar la página; si terminó con la app cerrada, desaparece sin sonar. El tiempo sale de **Configurar** (predeterminado 90 s; 0 = sin descanso) y cada ejercicio puede tener el suyo (la columna «Desc.» de la rutina, o el lápiz del ejercicio). Ese mismo botón elige la unidad: **kg** o **lb** (solo cambia la etiqueta, no convierte lo ya guardado).

**Cardio**: los ejercicios del grupo **Cardio** del catálogo (caminadora, elíptica, bicicleta…) se anotan con **tiempo (min) · distancia (km)** en lugar de peso × repeticiones: las mismas dos casillas por serie, con otro significado. No hace falta configurar nada: basta con que el ejercicio esté en el grupo Cardio (para que uno propio sea de cardio, ponlo en ese grupo). En las rutinas su fila pide minutos y kilómetros; no inicia el descanso salvo que le pongas uno; no suma al volumen (el historial muestra los km aparte) y en Progreso se grafica la **distancia total por sesión** (o el tiempo, si nunca anotaste distancia).

**Opciones de un ejercicio en curso** (el lápiz de su tarjeta): cambiarlo por otro del catálogo, cuántas series, su descanso, una **nota por serie** (por ejemplo «agarre cerrado»; se ve debajo de la serie y en el historial) y **Subir / Bajar** para cambiar su lugar en el entrenamiento.

Solo puede haber **un entrenamiento en curso**; se puede cerrar la app y seguirlo después. Si es necesario se puede «Descartar» entero.

### Listas y plantillas

Pensado para lo que repites cada cierto tiempo (el súper cada 15 días, tareas semanales o mensuales). En vez de reescribir la lista, la guardas una vez como **plantilla** y cada vez creas una **lista** nueva copiada de ella; la lista es independiente, así que marcas y agregas lo extra sin tocar la plantilla.

- **Plantilla**: nombre, color, elementos y, opcionalmente, cada cuánto se repite (**cada semana**, **cada 15 días** o **cada mes**). Los elementos se escriben **uno por línea**; una línea que empieza con `#` es un encabezado de sección (por ejemplo `# Lácteos`), que no cuenta como elemento.
- **Lista**: copia de los elementos de una plantilla (o vacía). Tocar un elemento lo marca o desmarca; el avance se ve como «3/12» con barra. Lo que agregues con el campo **Agregar algo adicional…** (un elemento a la vez, con Enter o con el botón) queda en la sección **Adicionales**. Sirve igual como lista de **tareas**.
- **Lo hecho baja al final**: al marcar un elemento pasa al final de su sección (los encabezados `#` y «Adicionales» son secciones), tachado y con «Hecho el 11 oct»; los pendientes conservan su orden. Si lo desmarcas vuelve a su lugar. El orden guardado no cambia.
- **Fechas**: cada elemento pendiente tiene un **icono de calendario** a la derecha: tocarlo abre el selector de fecha y fija una **fecha límite**. Debajo del texto se ve «Vence el 16 oct (en 5 días)», «Vence mañana», «Vence hoy» o «Venció el 8 oct (hace 3 días)» en rojo. Al marcar un elemento se **registra el día en que se hizo**. En la vista general, cada lista muestra cuántas tareas están **vencidas** o la **próxima** fecha.
- **Editar** (botón junto al avance): permite cambiar el **texto y la fecha** de un elemento con el lápiz (ahí también hay «Quitar fecha»), o quitarlo con la X; la plantilla no cambia. El lápiz de la barra superior cambia el nombre de la lista, la elimina o la **guarda como plantilla**: abre el formulario de plantilla con los elementos fijos de la lista (sin los adicionales) para que lo ajustes y guardes.
- **Orden de las listas**: arriba de las tarjetas hay tres modos: **Recientes**, **Por fecha** (por la próxima fecha límite pendiente: las vencidas primero, las que no tienen fecha al final) y **Manual** (flechas ↑ ↓ en cada tarjeta; la primera vez parte del orden que veías y una lista nueva queda arriba). El modo elegido se recuerda. Con el **pin** de cada tarjeta (o «Fijar arriba» en las opciones de la lista) fijas listas: siempre van primero y se ordenan entre ellas con el modo elegido. En las opciones de una lista, **«Ordenar los pendientes por fecha límite»** pone primero los elementos con fecha, de la más próxima a la más lejana.
- **Agenda**: la pestaña **Agenda** junta las tareas pendientes con fecha de todas tus listas, agrupadas en **Vencidas**, **Hoy**, **Mañana**, **Esta semana** y **Más adelante**; la casilla las marca como hechas y tocar el texto abre su lista.
- **Fechas relativas en plantillas**: termina una línea de la plantilla con `@3` y ese elemento vencerá **3 días después de crear la lista** (`@0` = el mismo día).
- **Finalizar y archivo**: cuando todos los elementos están marcados aparece el botón **Finalizar lista**. Al tocarlo la lista se **archiva** con la fecha de hoy y se vuelve a la vista general. Si antes de finalizar agregas un elemento nuevo, el botón desaparece hasta que lo marques. Las listas archivadas están en la pestaña **Archivo** (con su contador), de la más reciente a la más antigua, de 10 en 10; se pueden abrir (solo lectura, con sus fechas) y **Restaurar** para volver a editarlas. Las listas que ya estaban completas antes de existir esta función se archivaron solas una única vez.
- **Ya toca**: si la plantilla tiene periodo y ya pasó desde la última lista creada con ella, en **Listas** aparece un aviso con el botón **Crear lista**; en **Plantillas** se muestra «Toca en N días» o «Ya toca». Sin listas previas no hay aviso.

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
4. En **Pagos**, agrega los pagos recurrentes.

### Cada quincena (cuando te pagan)

1. **Ingreso**: indica el monto, la fecha y la categoría en la que cae el dinero (la app recuerda la última).
2. Reparte con **Mover** cuando puedas: de la categoría donde cayó el dinero a las demás cuentas y categorías. Puedes hacerlo en varias partes.

### Registrar un gasto

1. Toca el botón flotante **+**, **− Gasto** o directamente la categoría de la que sale.
2. Escribe **título** y **monto** y elige el **tipo de gasto**.
3. Si es con tarjeta, elige «Pagado con».
4. Elige **de qué categoría sale el dinero**. La app **no lo asume**: al abrir el formulario hay un solo selector vacío, y solo ofrece categorías que tengan dinero libre (no las que están en cero).
5. Si esa categoría no alcanza para el monto, la app te avisa cuánto falta y aparece **«Agregar otra categoría»**. El nuevo selector solo ofrece categorías con dinero disponible que aún no uses y toma el resto del monto.
6. Opcional: nota, fecha y adjuntos (por ejemplo, la factura).
7. **Permitir saldo negativo** (casilla bajo las categorías): para cuando prestas dinero de una categoría o pagas algo que luego te reintegran. Con ella, el gasto sale entero de la categoría elegida aunque no alcance (queda en negativo, en rojo, hasta que la regularices con un ingreso o al mover dinero de vuelta) y se ofrecen todas las categorías. Sin la casilla, si un monto supera lo libre la app pide confirmación; un gasto que ya dejó una categoría en negativo se abre con la casilla marcada.

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
- **Momento del día**: **Mañana**, **Durante el día**, **Noche** o **Sin horario**.

**Carrusel.** Cada momento del día es una **tarjeta independiente**; se pasa de una a otra **deslizando a izquierda o derecha**, o tocando los botones de arriba (icono + contador de hoy, por ejemplo «1/2»). Al abrir la app se muestra el momento actual (antes de las 12 la mañana, hasta las 19 el día y después la noche) si tiene hábitos; si no, el primero que tenga. Al marcar un hábito el carrusel se queda donde estaba. Si ningún hábito tiene horario, se muestra una sola tarjeta sin encabezado ni botones.

**Fila compacta.** Cada hábito ocupa una fila: icono, nombre, la racha, seis puntos pequeños con los **6 días anteriores** (relleno = hecho) y, a la derecha, el botón para **marcar hoy**. Arriba se ve el progreso general de hoy. Tocar el nombre abre la edición, donde también puedes **marcar o desmarcar cualquiera de los últimos 7 días** (la fila se actualiza al instante); desde ahí se elimina o se cambia su «Momento del día».

**No toca.** Cada día de un hábito tiene tres estados: sin marcar → **hecho** → **«no toca»** → sin marcar (un toque cambia al siguiente, tanto en el botón de hoy como en la tira de 7 días del formulario). «No toca» sirve para un día en que el hábito no aplica (por ejemplo, el día de descanso del gimnasio): se ve como un **aro vacío**, **no corta la racha** ni suma a ella, y **no cuenta en el avance** de hoy (ni en los contadores de cada momento del día ni en la tarjeta de Inicio: con 3 hábitos y uno «no toca», el avance es x/2).

**Reordenar.** El botón **Ordenar** (junto al progreso de hoy) muestra los hábitos sin botones de marcar y con flechas ↑ ↓ para subirlos o bajarlos **dentro de su momento del día**; **Listo** vuelve a la vista normal. El orden se guarda. Los hábitos creados antes de existir esta función se ordenaron alfabéticamente una sola vez.

### Listas

1. **Listas → Plantillas → +**: escribe el nombre, elige cada cuánto se repite y pon los elementos (uno por línea, `# Sección` para separar).
2. En la tarjeta de la plantilla, **Crear lista** (o **+** en **Listas** para elegir plantilla y nombre). Se abre la lista lista para marcar.
3. Durante la compra o la tarea, toca cada elemento al terminarlo y agrega lo no periódico en **Adicionales**.
4. ¿Ya tienes una lista armada? Lápiz → **Guardar como plantilla**.
5. La próxima vez, vuelve a crear la lista desde la misma plantilla. Para cambiar lo fijo, edita la plantilla (las listas ya creadas no cambian).

### Apariencia

**Menú → Configuración → Apariencia → Tema.** **Oscuro** (el de siempre), **Claro** (fondo blanco, para usar con mucha luz) o **Automático** (sigue el modo claro u oscuro del teléfono y cambia solo cuando el teléfono cambia). Se aplica desde la pantalla de carga, se recuerda y viaja en el respaldo. Ambos temas cumplen los mismos mínimos de contraste.

**Menú → Configuración → Apariencia → Fuente.** Dos opciones: **Predeterminada del sistema** (la que trae tu teléfono; en Android normalmente Roboto) y **JetBrains Mono** (monoespaciada, pensada para código y números). Cada opción se muestra con su propia letra. La elección se aplica a toda la app, se recuerda y viaja en el respaldo. La fuente JetBrains Mono viene **dentro de la app** (carpeta `fonts/`, licencia SIL OFL), así que funciona sin conexión. Con ella el texto es más ancho, por lo que el tamaño base se reduce un poco. Los bloques de código de Notas siempre usan JetBrains Mono.

### Respaldo

En **Configuración**:

- **Exportar a archivo** descarga un JSON con todo. **Compartir respaldo** lo envía a otra app (Drive, WhatsApp…). Los navegadores móviles solo permiten compartir ciertos tipos de archivo, así que se comparte como texto plano con nombre `tracker-fecha.json.txt` (la app lo importa igual). Si compartir falla o el navegador no lo permite, el respaldo se **descarga** automáticamente y se avisa el motivo; cerrar el menú de compartir no cuenta como error.
- La casilla **Incluir archivos adjuntos** decide si el respaldo lleva también fotos y PDF. Sin ella es ligero; con ella es completo pero más pesado.
- **Importar desde archivo** (acepta `.json` y `.txt`) valida el respaldo y **reemplaza todos los datos actuales** (pide confirmación). Si el respaldo no trae adjuntos, se conservan los que ya hay en el teléfono.
- Se muestra la fecha del último respaldo.

> **Recomendación:** exporta un respaldo de vez en cuando. Si borras los datos del navegador, se pierden.

### Sincronización con Google Drive

Para pasar los datos entre el teléfono y la PC. **Configuración → Sincronización con Google Drive**:

- **Enviar a la nube** sube una copia completa a un archivo (`tracker-sync.json`) en la carpeta **privada de la app** en tu Drive (`appDataFolder`: la app no puede ver tus demás archivos y tú tampoco la ves en Mi unidad).
- **Traer de la nube** reemplaza todo lo de este dispositivo por lo de la nube (como importar un respaldo).
- No se fusiona nada: se usa **por turnos** (traer → editar → enviar). Las cosas puntuales (finanzas complejas, notas grandes) en la PC; lo demás en el teléfono.
- **Protección contra pisar cambios:** cada dispositivo recuerda cómo estaban la nube y sus propios datos en la última sincronización. Si vas a enviar y la nube cambió desde entonces, o vas a traer y tienes cambios sin enviar, avisa y, si continúas, **descarga antes una copia** de lo que se va a reemplazar. «Este dispositivo» indica «Sin cambios pendientes» o «Cambios sin enviar».
- No viajan los ajustes propios de cada dispositivo (tema, fuente, estado del Pomodoro y del descanso, secciones plegadas, casilla de adjuntos). Los adjuntos solo se sincronizan si marcas **Incluir archivos adjuntos** (igual que el respaldo).
- Necesita conexión. El inicio de sesión dura una hora y se renueva solo; Google puede pedir elegir la cuenta.

**Preparar Google Drive (una sola vez, ~5 min):**

1. En [console.cloud.google.com](https://console.cloud.google.com) crea un proyecto (p. ej. «Tracker») y habilita la **Google Drive API**.
2. *Google Auth Platform* (pantalla de consentimiento): tipo **Externo**, nombre «Tracker», tu correo; en **Público** agrega tu cuenta como **usuario de prueba**. En **Acceso a los datos** agrega el alcance `.../auth/drive.appdata`.
3. *Clientes* → **Crear cliente** → tipo **Aplicación web**. En **Orígenes autorizados de JavaScript** añade `https://hancelleonel.github.io` y `http://localhost:8000`. No hace falta URI de redireccionamiento.
4. Copia el **ID de cliente** (`…apps.googleusercontent.com`) y fíjalo en `CLIENT_ID` de [sync.js](js/sync.js) (ya está puesto; es público, no un secreto). Si queda vacío, la app lo pide en cada dispositivo.

---

## 5. Modelo de datos

Base de datos IndexedDB versión 8 (la 4 agregó `templates` y `lists`, la 5 `noteGroups` y `notes`, la 6 `inbox`, la 7 `routines` y `workouts`, la 8 `exercises`; se migra sola). Su nombre interno sigue siendo `mi-quincena` (el de antes de llamarse Tracker) para no perder los datos ya guardados.

| Store | Contenido |
|---|---|
| `accounts` | `{ id, name, type: 'normal'｜'credit', limit?, cats: [{ id, name, balance }] }`. En una tarjeta, `cats[0].balance` es la deuda (negativa) |
| `moves` | `{ id, t, date, type: 'expense'｜'income'｜'transfer', title?, note, kind?, total, parts: [{ acc, cat, amount }], to?, card?, bill?, files? }` |
| `plan` | (heredado, sin uso: era la guía de transferencias) |
| `bills` | `{ id, title, amount, freq: 'once'｜'monthly'｜'biweekly'｜'yearly', day?, month? (solo anual), dueDate?, start, card?, active, paid: { [vencimiento]: { on, amount, moveId, skipped, files } } }` |
| `purchases` | `{ id, name, date, price, store, tag, warrantyMonths, notes, files }` |
| `habits` | `{ id, name, color, icon, slot: 'morning'｜'day'｜'night'｜'', order, dates: { 'YYYY-MM-DD': 1｜2 } }` (1 = hecho, 2 = «no toca») |
| `templates` | `{ id, name, color, freq: ''｜'weekly'｜'biweekly'｜'monthly', items: [{ text, head? }] }` |
| `lists` | `{ id, name, tplId?, color, created, t, archived?, items: [{ id, text, head?, done?, doneAt?, due?, extra? }] }` (`archived`, `doneAt` y `due` son fechas `YYYY-MM-DD`; `archived` = día en que se finalizó). Una lista se copia de la plantilla al crearla; no queda ligada a ella |
| `noteGroups` | `{ id, name, color, icon, fields: [{ id, name, type: 'text'｜'long'｜'code'｜'url'｜'number'｜'date'｜'choice'｜'check'｜'rating', list?, options? }] }` |
| `inbox` | `{ id, text, t }`: notas rápidas pendientes de archivar |
| `notes` | `{ id, group, title, values: { [idDelCampo]: texto｜número｜true }, tags: [], created, updated }` (marcas de tiempo en ms). Solo se guardan los campos con valor |
| `routines` | `{ id, name, color, exercises: [{ name, sets, reps, weight, rest? }] }` (`rest` en segundos; `weight` 0 = sin peso) |
| `workouts` | `{ id, name, routineId?, color, date, t, end?, exercises: [{ id, name, rest?, sets: [{ reps, weight, done, at? }] }] }`. Sin `end` = en curso (solo uno). `at` = hora (ms) en que se marcó la serie; la duración se deriva de la última |
| `exercises` | `{ id, name, group }`: el catálogo del Gimnasio (`group` es uno de Pecho, Espalda, Hombros, Bíceps, Tríceps, Piernas, Glúteos, Abdomen, Cardio, Otro). Las rutinas y los entrenamientos guardan el **nombre**, no el id |
| `files` | `{ id, blob, mime, name, size }` |
| `meta` | `{ k: 'settings', v: { lastExport, includeFiles, types, leftover, lastKind, pomo?, gym?, gymCatalogSeeded? } }` (`gym` = `{ cfg: { unit, rest }, rest: { endsAt, total } }`) |

**Detalles de diseño**

- Un gasto con tarjeta lleva `card`; sus `parts` indican la categoría apartada, pero **no modifican su saldo**: solo suma deuda a la tarjeta.
- Lo apartado por tarjeta **no se guarda**: se deriva del historial (`cardPending` en [state.js](js/state.js)). Las compras suman a su categoría y los pagos restan primero de la categoría desde la que se paga y luego de las mayores. Por eso editar o borrar siempre cuadra.
- Un gasto repartido guarda varias entradas en `parts`.
- Los respaldos se exportan con `version: 3`. También se aceptan los de la versión 2 y los que no traen `templates`, `lists`, `noteGroups`, `notes`, `routines`, `workouts` ni `exercises` (un respaldo sin catálogo se siembra al importar). Al importar, los grupos y notas se **sanean**: tipo de campo desconocido pasa a texto, icono o color inválido se corrige, los valores que no sean texto, número o sí/no se descartan y las notas cuyo grupo no existe se omiten.

### Formato del respaldo

```json
{
  "app": "tracker",
  "version": 3,
  "exportedAt": "2026-10-10T18:00:00.000Z",
  "includesFiles": false,
  "settings": {}, "habits": [], "accounts": [], "moves": [],
  "bills": [], "purchases": [], "templates": [], "lists": [], "noteGroups": [], "notes": [], "inbox": [], "routines": [], "workouts": [], "exercises": [],
  "files": [{ "id": "…", "mime": "image/jpeg", "name": "…", "data": "data:…;base64,…" }]
}
```

`files` solo aparece si se incluyeron los adjuntos.

---

## 6. Pruebas

Las pruebas son de extremo a extremo con Playwright (Chromium, 390×800) contra `python3 -m http.server`. Cubren:

- Cuentas, categorías, gastos repartidos y validaciones.
- Tarjetas: compra, apartado, pago, edición, borrado y límite de crédito.
- Pagos: vencidos, mensuales, pagar, omitir y deshacer.
- Compras con adjuntos, búsqueda y garantía.
- Notas: grupos con campos propios (ejemplos, tipos de campo, Markdown con editor y vista previa, configurar y reordenar campos, búsqueda, etiquetas, copiar, enlaces seguros), paginación, exportar/importar y saneo de respaldos raros.
- Listas y plantillas: crear desde plantilla, marcar, adicionales, aviso «Ya toca», completar y exportar/importar.
- Reportes, exportar/importar (con y sin archivos) y migración desde la base de datos v2.
- Gimnasio: rutinas, catálogo, entrenamiento con descanso, cardio, notas por serie, reordenar, editar un entrenamiento terminado, historial y progreso.
- Datos dañados en todas las tiendas (la app arranca y cada pantalla se muestra), tema claro/oscuro/automático y selección múltiple en la Bandeja.

Los scripts están en [tests/](tests/) (ver [tests/README.md](tests/README.md) para preparar el entorno y ejecutarlos con `tests/run_all.py`). Aún falta validar la app en un teléfono Android real.

---

### Rendimiento

Medido en Chromium de escritorio con datos sintéticos (8 cuentas, 2 tarjetas, hasta 60,000 movimientos). En un teléfono de gama media puede ser de 3 a 5 veces más lento.

| Movimientos | Carga inicial | Pantalla Cuentas | Reportes (todo) | Guardar un gasto |
|---|---|---|---|---|
| 5,000 | 0.11 s | 10 ms | 27 ms | 0.06 s |
| 20,000 | 0.23 s | 10 ms | 40 ms | 0.08 s |
| 60,000 | 0.48 s | 21 ms | 106 ms | 0.13 s |

Con uso intenso (5–10 gastos al día) se llega a unos 20,000 movimientos en 5 años; con un uso normal (unas decenas por quincena) son cientos por año. Para mantener ese margen:

- **Listas paginadas**: los movimientos, la lista de movimientos de una cuenta y las compras se pintan de 30 en 30 (40 en compras) con «Ver más». Antes, «Ver todos» con 20,000 movimientos tardaba 2 s y con 60,000 casi 6 s; ahora cuesta lo mismo con cualquier cantidad.
- **Caché de lo derivado** ([state.js](js/state.js)): los movimientos ordenados y lo apartado para tarjetas se calculan una vez y se reutilizan hasta que cambian los datos. Cualquier cambio en movimientos o cuentas debe llamar a `bump()` para invalidarla; los guardados de `state.js` ya lo hacen. Con 60,000 movimientos la pantalla de Cuentas bajó de 333 ms a 19 ms.
- Lo que sigue creciendo de forma lineal es la **carga inicial** (la app lee todos los datos al abrir: con 60,000 movimientos, ~350 ms son solo la lectura de IndexedDB) y los **reportes** (recorren el periodo). Con 60,000 movimientos siguen por debajo de 0.5 s y 110 ms.
- **Arranque por red**: los módulos JS se importan unos a otros, y sin ayuda el navegador los descubre por niveles (unos 5 saltos seguidos). `index.html` los declara con `<link rel="modulepreload">` para descargarlos todos en paralelo. Con latencia de móvil, el arranque en frío bajó de 866 a 590 ms (150 ms de latencia) y de 1,625 a 1,033 ms (300 ms). La lista debe incluir **todos** los `.js` de `js/` (lo verifica `tests/smoke.py`).

**Revisión de optimización (10 oct 2026).** Se perfilaron la carga, el ordenado de movimientos, lo apartado de tarjetas, el recuento de adjuntos, los reportes con 20,000 y 60,000 movimientos: salvo la lectura de IndexedDB, ninguno pasa de 100 ms, así que no se justifican más cambios en el código de datos (por ejemplo, `localeCompare` en los ordenados no pesa: ~14 ms con 60,000). Lo único con ganancia medible fue la precarga de módulos. Se quitó además código sin uso (una importación en `bills.js` y la función `closeModal` en `ui.js`).

**Revisión del 11 oct 2026.** Se agregó al arranque una reparación de la forma de los datos (ver «Datos dañados» abajo). Medido con `tests/benchmark_carga.py` en esta máquina antes y después del cambio, la carga con 60,000 movimientos quedó igual dentro del ruido de medición (834 ms antes; 838–916 ms después, según la corrida); con 1,000–5,000 movimientos no cambia (≈ 90–125 ms). La reparación recorre los movimientos sin crear copias salvo que haya algo que corregir. Además, marcar una serie del Gimnasio guarda la serie y el descanso en **una sola** escritura, para que el toque se vea antes.

**Datos dañados.** Si algún registro guardado tiene una forma inesperada (un respaldo editado a mano, un error de una versión vieja), la app lo corrige **en memoria al cargar** (listas que no son listas, textos que no son texto, saldos que no son números; lo que no es un registro se descarta) antes de ordenar o migrar nada, así que siempre arranca. Si aun así una pantalla falla al pintarse, **solo esa sección** muestra «No se pudo mostrar esta sección» con el detalle y un botón a Inicio; el menú y las demás siguen funcionando.

## 7. Limitaciones conocidas

- Los datos viven en el dispositivo. La sincronización con Google Drive es por turnos y reemplaza todo (no fusiona); sin ella, el respaldo manual es la única copia.
- Importar siempre **reemplaza** los datos; no hay combinación de respaldos.
- Los respaldos con adjuntos usan base64 y pueden pesar bastante si hay muchas facturas.
- Si se elimina una cuenta o categoría, sus movimientos anteriores se conservan y aparecen como «(eliminada)».
- El respaldo de la versión 1 (quincenas) ya no se puede importar. Los respaldos hechos cuando la app se llamaba «Mi Quincena» (`"app": "mi-quincena"`) se siguen aceptando.
