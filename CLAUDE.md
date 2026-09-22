@AGENTS.md

# Lezgo Suite — Panel interno

## Qué es esto

Panel de operaciones de **Lezgo Suite**, una agencia que **revende GoHighLevel
en marca blanca**: CRM y automatización bajo nuestra propia marca. Este panel es
la herramienta interna del equipo, no un producto para el cliente final.

Resuelve cuatro cosas:

1. **Clientes** — quién nos paga, en qué plan, con qué salud de cuenta y a qué
   subcuenta de GoHighLevel corresponde.
2. **Implementaciones** — cada snapshot, automatización, integración, migración
   y capacitación que estamos construyendo, con su etapa y sus bloqueos.
3. **Facturación** — lo cobrado, lo pendiente y lo vencido, en USD.
4. **Copiloto de IA** — un agente que consulta la cartera y **crea, lee,
   actualiza y elimina** registros en GoHighLevel a través de su API.

Un cliente = una **subcuenta (location)** de GoHighLevel. Ese es el eje del
modelo de datos: `Client.ghlLocationId` es la llave hacia el mundo de GHL.

## Idioma

**Todo el texto visible va en español.** Títulos, etiquetas, mensajes de error,
estados vacíos, respuestas del copiloto. Los identificadores del código
(variables, tipos, rutas de archivo, nombres de herramientas del agente) siguen
en inglés; las rutas de la app sí están en español (`/clientes`,
`/implementaciones`, `/facturacion`, `/copiloto`, `/ajustes`).

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
| IA | AI SDK v7 (`ai`), `ToolLoopAgent`, modelo por AI Gateway |
| Formularios | react-hook-form + zod |

## Cómo está organizado

```
src/
  app/
    (panel)/            Shell del panel: rail, barra superior, vistas
      page.tsx          Tablero de operaciones
      clientes/         Lista y ficha de cliente
      implementaciones/ Tablero por etapa
      facturacion/      Cobros y facturas
      copiloto/         Chat con el agente
      ajustes/          Conexiones y permisos
    api/copilot/        Route handler del agente
  components/
    ui/                 shadcn — no editar salvo para extender variantes
    shell/              Rail, barra superior, paleta ⌘K, tema
    panel/              PageHeader, Instrument, EmptyState, LinkButton
    signal/             SignalMeter (firma visual) y StatusChip
    charts/             Gráficas de Recharts
    clients/ implementations/ billing/ ai/
  lib/
    repository.ts       ÚNICA superficie de lectura de datos
    clients/            Agrupación por contacto, auto-enlace y sync
    ghl/client.ts       Cliente tipado de la API v2 de GoHighLevel
    ghl/lezgo-suite.ts  Cliente con el token de la subcuenta Lezgo Suite
    ai/agent.ts         Definición del agente + aprobaciones
    ai/tools.ts         Herramientas del copiloto
    format.ts nav.ts types.ts utils.ts
  db/                   Esquema Drizzle, conexión y seed
  data/demo.ts          Datos de ejemplo
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

**Series del tablero.** Las dos gráficas se derivan de Stripe en
`src/lib/stripe/series.ts`: "Cobrado por mes" de las facturas pagadas, y
"Altas y cancelaciones" de las fechas `created` y `canceled_at` de cada
suscripción. **No hay serie de expansión**: Stripe no guarda el historial de
cambios de importe, y una barra estimada junto a dos exactas se leería igual
de cierta. Lo que no se puede convertir a la moneda base se cuenta en
`omitted` y se declara al pie del instrumento. Sin Stripe las gráficas
muestran un estado vacío: la tabla `revenue` de ejemplo se retiró porque
dibujaba una curva inventada junto a cifras reales.

**Clientes.** Salen de las oportunidades **ganadas** del pipeline "Ventas" de
la subcuenta Lezgo Suite, agrupadas por contacto (`src/lib/clients/`). La sync
corre al apretar "Sincronizar con GHL" o sola si la última tiene más de una
hora. Un cliente que deja de aparecer se marca `orphaned`, no se borra. Los
enlaces —cliente de Stripe y subcuenta— son la única escritura del panel y van
solo a Neon. Un `cus_` o una subcuenta que ya tiene dueño no se ofrece a otro.

**Modelo.** `src/lib/ai/agent.ts` resuelve el modelo por dos caminos: con
`ANTHROPIC_API_KEY` habla directo con Anthropic; sin ella usa el AI Gateway con
el identificador `proveedor/modelo`. Los créditos **gratis** del Gateway no
sirven — devuelven "Free tier users do not have access to this model" incluso
con tarjeta registrada; hay que comprar créditos.

**Copiloto.** Las herramientas viven en `src/lib/ai/tools.ts` y nunca lanzan:
envuelven el error de GHL en `{ ok: false, error }` para que el modelo pueda
razonar sobre el fallo. Lo destructivo o lo que sale hacia un cliente
(`deleteContact`, `deleteOpportunity`, `sendMessage`) está detrás de
`toolApproval: "user-approval"` en `src/lib/ai/agent.ts`. **Si agregas una
herramienta que borra, cobra o manda mensajes, agrégala también a esa lista.**

**Diseño.** El sistema visual está en `globals.css` y se llama *Pit Wall*: una
consola de telemetría. Reglas que no se rompen:

- Toda cifra usa la clase `.num` (JetBrains Mono, tabular). Las columnas de
  números no deben bailar entre renders.
- Toda cifra de dinero lleva moneda explícita: `money(cents, currency)`. Una
  cifra convertida se declara como tal al pie del instrumento.
- Las etiquetas de instrumento usan `.eyebrow` (versalitas mono).
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
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm db:push      # aplica el esquema a Neon
pnpm db:seed      # carga src/data/demo.ts en Neon
pnpm db:studio    # explorador de Drizzle
pnpm test         # vitest: mapeador de Stripe, agrupación y auto-enlace
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
| `ANTHROPIC_API_KEY` | Modelo del copiloto, directo a la API de Anthropic |
| `AI_GATEWAY_API_KEY` | Alternativa: modelo vía Vercel AI Gateway (requiere créditos comprados) |
| `COPILOT_MODEL` | Sobrescribe el modelo por defecto |
| `STRIPE_SECRET_KEY` | Clave de Stripe. Sin ella, facturación sigue en Neon/demo |
| `STRIPE_FX_USD_MXN` | Tipo de cambio USD→MXN para normalizar los KPI |

## Cuidados

- **No tocar otros proyectos de Vercel o Neon.** Este repo no está enlazado a
  Vercel a propósito. Al conectar Neon, usa una rama nueva y exclusiva.
- **No ejecutar escrituras contra GoHighLevel** desde herramientas de
  desarrollo o MCP sin pedirlo explícitamente. Leer está bien; crear, editar,
  borrar y enviar mensajes no.
