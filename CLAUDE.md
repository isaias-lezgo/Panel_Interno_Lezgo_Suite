@AGENTS.md

# Lezgo Suite — Panel interno

## Qué es esto

Panel de operaciones de **Lezgo Suite**, una agencia que **revende GoHighLevel
en marca blanca**: CRM y automatización bajo nuestra propia marca. Este panel es
la herramienta interna del equipo, no un producto para el cliente final.

Resuelve cinco cosas:

1. **Clientes** — quién nos paga, en qué plan, con qué salud de cuenta y a qué
   subcuentas de GoHighLevel corresponde.
2. **Implementaciones** — cada snapshot, automatización, integración, migración
   y capacitación que estamos construyendo, con su etapa y sus bloqueos.
3. **Pendientes** — lo que falta por hacer en cada subcuenta, en una frase.
4. **Facturación** — lo cobrado, lo pendiente y lo vencido. La moneda base
   sigue a la fuente: con Stripe suma en MXN; sin él, en USD.
5. **Copiloto de IA** — un agente que consulta la cartera y **crea, lee,
   actualiza y elimina** registros en GoHighLevel a través de su API.

Hay además una sexta vista, **Lezgo IA**, que es una vista previa de un
producto que todavía no existe.

Un cliente tiene una o más **subcuentas (locations)** de GoHighLevel; cada
subcuenta tiene un solo dueño. Ese es el eje del modelo de datos: la tabla
`client_ghl_locations` es la llave hacia el mundo de GHL.

## Idioma

**Todo el texto visible va en español.** Títulos, etiquetas, mensajes de error,
estados vacíos, respuestas del copiloto. Los identificadores del código
(variables, tipos, rutas de archivo, nombres de herramientas del agente) siguen
en inglés; las rutas de la app sí están en español (`/clientes`,
`/implementaciones`, `/pendientes`, `/facturacion`, `/copiloto`, `/lezgo-ia`,
`/ajustes`).

Registro: directo, sin relleno, en el mismo tono que usaría un colega del
equipo. Verbos activos. Un control dice exactamente qué pasa al usarlo.

## Stack

| Pieza | Elección |
|---|---|
| Framework | Next.js 16, App Router, React 19, Turbopack |
| Estilos | Tailwind v4 con tokens en `src/app/globals.css` |
| Componentes | shadcn/ui sobre Base UI (`@base-ui/react`), iconos Lucide |
| Gráficas | Recharts vía el envoltorio `src/components/ui/chart.tsx` |
| Datos | Drizzle ORM + Neon Postgres (`@neondatabase/serverless`) |
| IA | AI SDK v7 (`ai`), `ToolLoopAgent`; el modelo va directo a Anthropic o por AI Gateway |
| Formularios | react-hook-form + zod |
| Arrastrar | `@dnd-kit` en el tablero y en el checklist de implementaciones |

## Cómo está organizado

```
src/
  app/
    (panel)/            Shell del panel: rail, barra superior, vistas
      page.tsx          Tablero de operaciones
      clientes/         Lista y ficha de cliente
      implementaciones/ Tablero por etapa
      pendientes/       Lista rápida agrupada por subcuenta
      facturacion/      Cobros y facturas
      copiloto/         Chat con el agente
      lezgo-ia/         Vista previa del producto de IA
      ajustes/          Conexiones y permisos
    api/copilot/        Route handler del agente
  components/
    ui/                 shadcn — no editar salvo para extender variantes
    shell/              Rail, barra superior, paleta ⌘K, tema
    panel/              PageHeader, Instrument, EmptyState, LinkButton, DatePicker
    signal/             SignalMeter (firma visual) y StatusChip
    charts/             Gráficas de Recharts
    providers/          Proveedor de tema
    clients/ implementations/ pendings/ billing/ lezgo-ia/ ai/
  lib/
    repository.ts       ÚNICA superficie de lectura de datos
    clients/            Agrupación por contacto, auto-enlace, sync y cuenta
    implementations/    Plantilla de checklist y semáforo de entrega
    pendings/group.ts   Agrupa los pendientes por subcuenta
    ghl/client.ts       Cliente tipado de la API v2 de GoHighLevel
    ghl/lezgo-suite.ts  Cliente con el token de la subcuenta Lezgo Suite
    stripe/             Cliente, mapeo de facturas, totales y series
    lezgo-ia/           Arma la vista previa con lo que GHL sí entrega
    ai/agent.ts         Definición del agente + aprobaciones
    ai/tools.ts         Herramientas de GHL del copiloto
    ai/panel-tools.ts   Lecturas del panel para el copiloto
    format.ts nav.ts types.ts utils.ts
  db/                   Esquema Drizzle, conexión, reintento y seed
  data/                 Datos de ejemplo (demo.ts, lezgo-ia.ts)
```

## Reglas del proyecto

**Datos.** Toda lectura pasa por `src/lib/repository.ts`. Ese archivo decide
entre los datos de ejemplo y Neon según exista `DATABASE_URL`. No consultes la
base ni el demo directamente desde una página; agrega la función al repositorio.

**Base de datos.** Neon suspende el compute tras unos minutos sin uso y
despertarlo tarda ~18 s, más que los 10 s que el `fetch` de Node espera para
conectar. El driver HTTP de Neon no reintenta, así que la primera visita tras
un rato de silencio devolvía "Error connecting to database: fetch failed" y
tumbaba la vista. `src/db/retry.ts` reintenta **solo los fallos de conexión**
—los que ocurren antes de que la consulta salga, así que no pueden duplicar
nada— y se engancha por `neonConfig.fetchFunction`.

`pnpm db:push` es **interactivo**: pregunta si una tabla nueva es en realidad
un renombre de otra que desaparece, y vuelve a preguntar antes de cualquier
pérdida de datos. Necesita TTY — desde una herramienta sin terminal muere con
"Interactive prompts require a TTY terminal" y **no aplica nada**. Córrelo
desde una terminal de verdad y lee las tres líneas antes de aceptar.

**GoHighLevel.** Toda llamada pasa por `src/lib/ghl/client.ts`. Si necesitas un
endpoint que no está envuelto, usa `ghl.request()` y luego súbelo a método con
tipos. Detalles ya verificados contra la API real:

- Base `https://services.leadconnectorhq.com`, header `Version: 2021-07-28`.
- Los contactos se buscan con `POST /contacts/search` y el campo es
  **`pageLimit`**, no `limit`. Los nombres de campo van en camelCase.
- `GET /opportunities/search` usa `pipeline_id` en snake_case y pagina por
  cursor con `startAfter`/`startAfterId` del `meta`.
- El token de agencia **no** lee contactos ni oportunidades de una subcuenta
  (401). Para la subcuenta Lezgo Suite hay un token propio,
  `GHL_LEZGO_SUITE_TOKEN`, envuelto en `src/lib/ghl/lezgo-suite.ts`.
- Al eliminar, la API responde `succeded` (así, con la errata).
- Los usuarios de una subcuenta se leen con `GET /users/search?companyId=&locationId=`;
  `GET /users/?locationId=` con token de agencia da "Token's user type
  mismatch!". Los del equipo Lezgo salen ahí como `roles.type = "account"`
  igual que los del cliente: se reconocen porque tienen acceso a la subcuenta
  Lezgo Suite.
- **App OAuth "Lezgo AI"** (`src/lib/ghl/oauth.ts`), instalada en la agencia.
  Con su token de agencia, `POST /oauth/locationToken` da un token por
  subcuenta que sí lee pipelines, oportunidades y conversaciones. El token
  de agencia y su refresh token viven cifrados en `ghl_oauth_tokens`; el
  refresh token es de un solo uso y `version` evita dos renovaciones a la
  vez. El callback es `/api/oauth/callback` (sin "ghl" en la ruta) y solo
  acepta una instalación a nivel Company de nuestra agencia.
- En `/oauth/token`, GHL valida primero el `code` o el `refresh_token` y
  después las credenciales: un código falso responde "Authorization code
  not found" aunque el secret esté mal. Solo un código real prueba el
  secret.
- `GET /opportunities/search` filtra por asesor con `assigned_to` y
  `status=open`; con `limit=1`, `meta.total` es el conteo.

**Stripe.** Toda llamada pasa por `src/lib/stripe/client.ts`, y es **solo
lectura**: el panel no cobra ni emite. Detalles verificados contra la cuenta
real (`acct_1LKAgaLSMWyOIdkA`):

- Los importes vienen en **centavos**: `539700` es $5,397.00.
- Conviven **MXN y USD**. La moneda base sigue a la fuente: con Stripe el
  panel suma en MXN; sin él, en USD. Las facturas en USD se convierten con
  `STRIPE_FX_USD_MXN`; sin esa variable se muestran pero quedan fuera de los
  totales. **Nunca inventes un tipo de cambio.**
- En `es-MX` el símbolo estrecho de MXN y el de USD son ambos `$`. Usa
  `moneySigned` donde puedan convivir monedas, o dos importes distintos se
  verán idénticos.
- `due_date` es `null` en cobro automático. "Vencida" se deduce de
  `attempt_count > 0 && next_payment_attempt === null`.
- Los estados `void` y `uncollectible` existen y **no** cuentan como por
  cobrar.
- El concepto sale de la línea de **mayor importe**, no de `lines.data[0]`:
  Stripe a veces devuelve primero la línea del IVA.
- Los precios los creó GoHighLevel (`price.metadata.created_by =
  "LeadConnector"`), pero el `location_id` de ahí es el de la agencia, no el
  de cada cliente: **no sirve para mapear**. El enlace vive en
  `client_stripe_customers` (un cliente, varios `cus_`): se llena solo al
  sincronizar cuando coincide correo, teléfono o nombre exacto, y lo demás se
  elige a mano en la ficha del cliente.

**Implementaciones.** Se crean con "Agregar implementación": una subcuenta de
GHL y uno o más contactos de la subcuenta Lezgo Suite (tabla
`implementation_contacts`). Del navegador solo llegan ids; el nombre de la
subcuenta y los datos de cada contacto se leen de GHL en la acción. Entran en
Alcance con tipo, responsable y entrega en `null`. Escribe solo a Neon, nunca
a GHL. Buscar contactos usa `query` en `POST /contacts/search`.
Al hacer clic en la tarjeta se abre su ficha (diálogo centrado): nombre editable y un checklist
propio que nace de la plantilla en `src/lib/implementations/checklist.ts`.
El `progress` de la tarjeta es el porcentaje de puntos marcados y se
recalcula en cada cambio. A la derecha van las notas rápidas
(`implementation_notes`): texto con fecha, sin edición. Las tarjetas se
arrastran entre etapas. Los puntos del checklist se reordenan desde su asa:
un punto principal se lleva sus sub-puntos y un sub-punto solo se mueve
entre sus hermanos. La fecha máxima (`due_at`) es opcional; su semáforo
(`src/lib/implementations/due.ts`) va en la tarjeta y en la ficha: ≤ 2 días
o vencida en rojo, ≤ 7 en amarillo, más en verde, sin fecha en azul.

**Pendientes.** Lo ligero al lado de las implementaciones: una frase y, si
viene al caso, la subcuenta de la que es (`pendings`). Sin fecha, sin
responsable, sin prioridad, sin checklist — lo que necesita eso es una
implementación. Se escriben desde la caja de arriba, que recuerda la
subcuenta entre un pendiente y el siguiente, o desde la caja al pie de cada
grupo, donde la subcuenta ya viene puesta. Marcar hecho no borra: el renglón
se tacha y baja al pie de su grupo, y el interruptor "Ver hechos" los
esconde. No se editan: se borran y se vuelven a escribir. La agrupación vive
en `src/lib/pendings/group.ts` y corre en el navegador, no en el servidor,
para que marcar uno lo reordene al instante; el nombre del grupo se resuelve
en vivo contra GHL y cae al que se guardó al escribirlo. Escribe solo a
Neon: un pendiente no existe en GoHighLevel.

**Series del tablero.** Las dos gráficas se derivan de Stripe en
`src/lib/stripe/series.ts`: "Cobrado por mes" de las facturas pagadas, y
"Altas y cancelaciones" de las fechas `created` y `canceled_at` de cada
suscripción. **No hay serie de expansión**: Stripe no guarda el historial de
cambios de importe, y una barra estimada junto a dos exactas se leería igual
de cierta. Lo que no se puede convertir a la moneda base se cuenta en
`omitted` y se declara al pie del instrumento. Sin Stripe las gráficas
muestran un estado vacío: la tabla `revenue` de ejemplo se retiró porque
dibujaba una curva inventada junto a cifras reales, y ya no existe ni en el
esquema ni en Neon.

**Clientes.** Salen de las oportunidades **ganadas** del pipeline "Ventas" de
la subcuenta Lezgo Suite, agrupadas por contacto (`src/lib/clients/`). La sync
corre al apretar "Sincronizar con GHL" o sola si la última tiene más de una
hora. Un cliente que deja de aparecer se marca `orphaned`, no se borra. Las
subcuentas viven en `client_ghl_locations` (un cliente, varias subcuentas),
igual que Stripe: la sync solo propone una a quien no tiene ninguna, el resto
se agrega a mano en la ficha, y quitar un enlace lo archiva (`excluded`). Un
`cus_` o una subcuenta que ya tiene dueño no se ofrece a otro.

El panel escribe poco y **siempre a Neon, nunca a GHL**. Son cuatro cosas: los
enlaces (cliente de Stripe y subcuenta), las cuatro columnas de cuenta que se
editan en la tabla, las implementaciones con su checklist y sus notas, y los
pendientes.

**Cuenta del cliente.** La tabla lleva cuatro columnas que se editan en la
propia celda —membresía, servicio técnico, periodicidad y vencimiento de
licencia— y que **no existen como dato en ningún lado**: se deducen en cada
lectura (`src/lib/clients/account.ts`) de las suscripciones activas de sus
`cus_` enlazados, con la etapa de GHL como respaldo. El nivel sale del
nombre del producto de Stripe (`Lezgo Growth MXN` → Growth) ignorando los
extras, que nombran dos niveles; la periodicidad, del `recurring` del
precio; el vencimiento, del `current_period_end` **del item**, no de la
suscripción, que ya no lo trae. El servicio técnico se afirma si lo nombra
un producto o la etapa; el "no" solo se dice cuando hay de dónde mirar.
Lo que alguien escribe en la celda se guarda en `clients` (`membership`,
`billing_period`, `license_due_at`, `support_active`), manda sobre lo
deducido y la sync no lo toca; vacío vuelve a "automático". En gris lo
deducido, en negro lo escrito. Las columnas visibles se eligen desde
"Columnas" y se guardan en el navegador (`src/components/clients/columns.tsx`):
son diez y no caben juntas en un portátil.

**Lezgo IA.** El producto aún no existe; la vista es una vista previa sobre
datos reales. Con GHL y Neon, `getLezgoIaData()` toma las subcuentas de
`client_ghl_locations` y sus usuarios de GHL como asesores. Todo lo que
produciría la IA —métricas por asesor, hilos, bitácora— llega vacío (`null`
o `[]`) y cada subcuenta queda "Sin configurar"; **no se rellena con
números de ejemplo**. Con la app OAuth sí llegan los pipelines (cada etapa
en "No vigilar" hasta que el equipo la configure) y los leads abiertos de
cada asesor. La configuración (estado de la IA, ajustes del equipo y de
cada asesor, reglas por etapa, fuera de oficina) se guarda en
`lezgo_ia_accounts` y `lezgo_ia_advisors` con `saveLezgoIaAccount`. El
motor de la IA la lee con `getLezgoIaConfig()` y decide con
`shouldNotify()` de `src/lib/lezgo-ia/config.ts`: código determinista, sin
gastar tokens en releer reglas. Sin GHL o Neon, la vista usa `src/data/lezgo-ia.ts`.

**Modelo.** `src/lib/ai/agent.ts` resuelve el modelo por dos caminos: con
`ANTHROPIC_API_KEY` habla directo con Anthropic; sin ella usa el AI Gateway con
el identificador `proveedor/modelo`. Los créditos **gratis** del Gateway no
sirven — devuelven "Free tier users do not have access to this model" incluso
con tarjeta registrada; hay que comprar créditos.

**Copiloto.** Lee todo el panel con las herramientas de `src/lib/ai/panel-tools.ts`
—clientes con su cuenta, enlaces a Stripe y a subcuentas, ficha completa
(`getClient`), implementaciones, pendientes, facturas, series y la
configuración de Lezgo IA—, siempre a través del repositorio y **solo
lectura**: lo que el panel escribe a Neon lo escribe el equipo desde la
interfaz. Las de GHL eligen token por subcuenta (`ghlFor`): el de Lezgo Suite,
el de la app OAuth, o el de agencia como último recurso. Las instrucciones
llevan el modelo de datos y, en cada llamada, la fecha de México y qué fuentes
están conectadas. Las herramientas de GHL viven en `src/lib/ai/tools.ts` y nunca lanzan:
envuelven el error de GHL en `{ ok: false, error }` para que el modelo pueda
razonar sobre el fallo. Lo destructivo o lo que sale hacia un cliente
(`deleteContact`, `deleteOpportunity`, `sendMessage`) está detrás de
`toolApproval: "user-approval"` en `src/lib/ai/agent.ts`. **Si agregas una
herramienta que borra, cobra o manda mensajes, agrégala también a esa lista.**

**Diseño.** El sistema visual está en `globals.css` y se llama *Pit Wall*: una
consola de telemetría, pero tranquila. Una sola familia (Plus Jakarta Sans)
para todo el texto; JetBrains Mono solo en `code`, `kbd` y `.mono` (IDs,
variables de entorno). Sin texturas de fondo. Reglas que no se rompen:

- Toda cifra usa la clase `.num` (tabular, misma familia que el texto). Las
  columnas de números no deben bailar entre renders.
- Toda cifra de dinero lleva moneda explícita: `money(cents, currency)`. Una
  cifra convertida se declara como tal al pie del instrumento.
- Las etiquetas de instrumento usan `.eyebrow` (12 px, peso medio, sentence
  case; nunca mayúsculas ni tracking).
- El estado nunca se comunica solo con color: `StatusChip` siempre lleva punto
  **y** palabra.
- `SignalMeter` es el instrumento recurrente. Un medidor lleno significa lo
  mismo en la tabla, en la tarjeta y en la ficha.
- Las tarjetas no se anidan. Un `Instrument` sostiene una lectura o una lista.
- Paletas de gráficas: series fijas en orden, nunca cicladas; el juego oscuro se
  eligió y validó por separado, no es un volteo del claro.

**Accesibilidad.** Foco visible, `aria-label` en controles de solo icono,
`prefers-reduced-motion` respetado en `globals.css`, contenido ancho con scroll
propio en lugar de desbordar la página.

## Comandos

```bash
pnpm dev          # servidor de desarrollo
pnpm build        # build de producción
pnpm start        # sirve el build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest, 11 archivos: Stripe, clientes, entregas, pendientes y reintento
pnpm db:push      # aplica el esquema a Neon — interactivo, necesita TTY
pnpm db:generate  # escribe el SQL de la migración en drizzle/
pnpm db:seed      # carga src/data/demo.ts en Neon — VACÍA las tablas primero
pnpm db:studio    # explorador de Drizzle
```

## Variables de entorno

Ver `.env.example`. Ninguna es obligatoria para arrancar: sin `DATABASE_URL` el
panel sirve datos de ejemplo, y sin `GHL_API_KEY` las herramientas de GHL
devuelven un error explicado en la interfaz.

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Rama de Neon de **este** proyecto |
| `GHL_API_KEY` | Token de agencia de GoHighLevel |
| `GHL_LOCATION_ID` | Subcuenta por defecto |
| `GHL_LEZGO_SUITE_TOKEN` | Token privado de la subcuenta Lezgo Suite: de ahí salen los clientes |
| `GHL_LEZGO_SUITE_LOCATION_ID` | Subcuenta Lezgo Suite (`uRFrk77agXq9is0a0gkp`) |
| `GHL_OAUTH_CLIENT_ID` / `GHL_OAUTH_CLIENT_SECRET` | App OAuth: tokens por subcuenta (pipelines, oportunidades) |
| `ANTHROPIC_API_KEY` | Modelo del copiloto, directo a la API de Anthropic |
| `AI_GATEWAY_API_KEY` | Alternativa: modelo vía Vercel AI Gateway (requiere créditos comprados) |
| `COPILOT_MODEL` | Sobrescribe el modelo por defecto |
| `STRIPE_SECRET_KEY` | Clave de Stripe. Sin ella, facturación sigue en Neon/demo |
| `STRIPE_FX_USD_MXN` | Tipo de cambio USD→MXN para normalizar los KPI |
| `PANEL_USER` / `PANEL_PASSWORD` | Candado del panel (`src/proxy.ts`). Sin contraseña en local no pide login |

## Cuidados

- **No tocar otros proyectos de Vercel o Neon.** Este repo está enlazado al
  proyecto de Vercel `panel-interno-lezgo-suite` (equipo
  `isaias-rios-projects`, plan Hobby) y **cada push a `main` publica a
  producción** en `panel-interno-lezgo-suite.vercel.app`. Producción usa la
  misma base de Neon que local. Al conectar Neon, usa una rama nueva y
  exclusiva.
- **El panel está detrás de un candado** (`src/proxy.ts`): HTTP Basic con
  `PANEL_USER` y `PANEL_PASSWORD`. En producción, sin `PANEL_PASSWORD` no
  entra nadie. La protección de Vercel del proyecto es la estándar, que **no**
  cubre el dominio de producción: el candado es lo único que lo cierra. No lo
  quites ni lo relajes sin reemplazo.
- Las variables de producción viven en Vercel como sensibles. Si cambias una
  en `.env.local` (p. ej. al regenerar `GHL_OAUTH_CLIENT_SECRET`), cámbiala
  también en Vercel y vuelve a publicar.
- **No ejecutar escrituras contra GoHighLevel** desde herramientas de
  desarrollo o MCP sin pedirlo explícitamente. Leer está bien; crear, editar,
  borrar y enviar mensajes no.
- **No correr `pnpm db:seed` contra una rama con datos reales.** Vacía cada
  tabla antes de llenarla, y la rama de este proyecto ya tiene los clientes
  sincronizados de GHL y sus enlaces de Stripe. Es solo para una rama vacía.
