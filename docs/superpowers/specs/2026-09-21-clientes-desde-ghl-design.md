# Clientes desde GoHighLevel, enlazados a Stripe

Fecha: 2026-09-21

## Objetivo

Que el objeto **cliente** del panel salga de la realidad: las oportunidades
**ganadas** del pipeline "Ventas" en la subcuenta **Lezgo Suite** de
GoHighLevel. Cada cliente se enlaza a uno o varios clientes de Stripe
(`cus_…`) y a su subcuenta de GHL. El enlace es automático cuando coincide el
correo, el teléfono o el nombre exacto; en cualquier otro caso se elige a mano
en un desplegable.

Se reemplaza el seed del demo en `clients`. Los campos del demo (plan, MRR
guardado, salud, asientos, owner, industria, renovación) desaparecen.

## Hallazgos que condicionan el diseño

- El token de agencia (`GHL_API_KEY`) lista subcuentas pero devuelve **401**
  en contactos y oportunidades de cualquier location. Es un límite de nivel,
  no de scope.
- Por eso existe un PIT creado dentro de la subcuenta Lezgo Suite:
  `GHL_LEZGO_SUITE_TOKEN`, con `GHL_LEZGO_SUITE_LOCATION_ID =
  uRFrk77agXq9is0a0gkp`. Verificado: 200 en `/opportunities/search`,
  `/contacts` y `/opportunities/pipelines`.
- Pipeline "Ventas": `6O1DrEbm0UGM1n0urShw`. Hoy tiene 35 ganadas. Los otros
  pipelines (Rentas, Productos al consumo, PostVenta, Corretaje) no son
  clientes de la suite y se ignoran.
- Stripe tiene más de 100 clientes; hay que paginar. Varios contactos tienen
  más de un `cus_` (Sebastián Muradás, Ricardo Pérez, Zuriel Rodríguez).
- Hay contactos con dos oportunidades ganadas (Ricardo Pérez: "La Colada" y
  "ACECOB"). Se agrupan en un solo cliente.

## Modelo de datos

### `clients` (redefinida)

| Campo | Tipo | Origen |
|---|---|---|
| `id` | text PK | id del contacto de GHL. Estable; agrupa oportunidades |
| `slug` | text unique | derivado de `name`, para `/clientes/[slug]` |
| `name` | text | `companyName` del contacto; si falta, nombre del contacto |
| `contactName` | text | contacto de GHL |
| `email` | text nullable | contacto de GHL |
| `phone` | text nullable | contacto de GHL, tal cual |
| `ghlContactId` | text | id del contacto en la subcuenta Lezgo Suite |
| `ghlLocationId` | text nullable | subcuenta del cliente; se enlaza |
| `ghlLocationLinkedBy` | `"auto" \| "manual"` nullable | quién hizo el enlace |
| `stage` | text | nombre de la etapa de su oportunidad más reciente |
| `wonAt` | date | cierre más antiguo entre sus oportunidades |
| `syncedAt` | timestamptz | última sync en la que apareció |
| `orphaned` | boolean default false | no apareció en la última sync |
| `notes` | text nullable | se conserva |

### `client_opportunities` (nueva)

`id` (id de GHL, PK), `clientId` FK → clients (cascade), `name`,
`monetaryValue` integer (MXN, en pesos enteros como lo entrega GHL),
`stageId`, `stageName`, `wonAt` date, `updatedAt` timestamptz.

### `client_stripe_customers` (nueva)

`stripeCustomerId` text PK, `clientId` FK → clients (cascade),
`linkedBy` `"auto" | "manual"`, `linkedAt` timestamptz. La PK garantiza
que un `cus_` pertenece a un solo cliente.

### Tablas que se mantienen

`implementations`, `activity`, `invoices`, `revenue` no cambian de forma.
Su FK a `clients.id` se conserva. El seed del demo de esas tablas se ajusta
para que no rompa el arranque sin `DATABASE_URL`; con Neon quedan vacías
hasta tener datos reales.

`Client.mrr` deja de existir como columna: se calcula en el repositorio
sumando las suscripciones activas de Stripe de sus `cus_`, en la moneda de
cada una (`money(cents, currency)`; USD se convierte solo si existe
`STRIPE_FX_USD_MXN`).

### Tipos

`src/lib/types.ts` cambia `Client` para reflejar lo anterior y agrega
`ClientOpportunity`, `StripeLink` y `LinkedBy`.

## Sincronización con GHL

`src/lib/ghl/lezgo-suite.ts` exporta una instancia de `GhlClient` construida
con `GHL_LEZGO_SUITE_TOKEN` y la location fija, y `lezgoSuiteEnabled()`.

`src/lib/clients/sync.ts` → `syncClientsFromGhl(): Promise<SyncResult>`:

1. Si falta el token, devuelve `{ ok: false, error }`. Nunca lanza.
2. Pagina `GET /opportunities/search?location_id&pipeline_id&status=won&limit=100`
   siguiendo `meta.startAfter` / `meta.startAfterId` hasta agotar.
3. Agrupa por `contact.id`. Dos contactos distintos con el mismo correo o el
   mismo teléfono normalizado se agrupan también; el `id` del cliente es el
   del contacto con la oportunidad más antigua.
4. Upsert en `clients` y `client_opportunities`. `stage` = etapa de la
   oportunidad con `updatedAt` más reciente. `wonAt` = mínimo.
5. Clientes en Neon que no aparecieron → `orphaned = true`. No se borran.
6. Auto-enlace (abajo) solo para clientes **sin** ningún enlace del tipo
   correspondiente. Nunca toca un enlace existente, sea auto o manual.
7. `updateTag("clients")`.

Disparo:
- Botón "Sincronizar con GHL" en `/clientes` (server action).
- Sync automática al cargar `/clientes` si la última `syncedAt` tiene más de
  una hora o no hay clientes.
- Lecturas con `unstable_cache` y tag `clients`, como ya se hace con `stripe`.

## Regla de auto-enlace

`src/lib/clients/match.ts`, funciones puras y probadas.

Normalización: minúsculas, sin acentos (NFD), sin puntuación, sin espacios,
sin sufijos societarios (`sa de cv`, `s.a.`, `sapi`, `srl`, `llc`, `inc`).
Teléfono: solo dígitos, se comparan los **últimos 10**.

Un candidato (cliente de Stripe o location de GHL) se enlaza al cliente si
cumple **una** de:

1. correo normalizado idéntico al del contacto;
2. últimos 10 dígitos del teléfono idénticos;
3. nombre normalizado idéntico a `name`, a `contactName` o al nombre de
   alguna de sus oportunidades ganadas.

Reglas:
- Se enlazan **todos** los `cus_` que cumplan.
- Si un candidato cumple para dos clientes distintos, **no** se enlaza a
  ninguno; queda para el desplegable.
- Un `cus_` ya enlazado no se reasigna de forma automática.
- Para la subcuenta de GHL se comparan `name` y `email` de las locations de
  la agencia (`GET /locations/search`, token de agencia). Solo se enlaza si
  hay exactamente una location que cumpla. "You Can Drive" vs "Escuela You
  Can Drive" no empata.
- Cada enlace guarda `linkedBy`.

## Interfaz

### `/clientes`

- Tabla: Cliente (empresa y contacto), Etapa (`StatusChip`), Subcuenta GHL
  (nombre o "Sin enlazar"), Stripe ("n enlazados" o "Sin enlazar"), MRR
  (`money`, `.num`), Cerrado el.
- Botón "Sincronizar con GHL" con la hora de la última sync. Si falta el
  token: aviso en un `EmptyState`/banner y la tabla muestra lo que haya.
- Filtro "Sin enlazar" para trabajar la cola.
- Clientes `orphaned` se muestran con chip "Sin oportunidad".

### `/clientes/[slug]`

- Cabecera: nombre, contacto, correo, teléfono, etapa.
- Instrumento **Subcuenta de GoHighLevel**: la enlazada (nombre, id en
  `.mono`, chip Automático/Manual, botón quitar) o un `Combobox` con búsqueda
  sobre las locations de la agencia.
- Instrumento **Clientes de Stripe**: lista de enlazados (nombre, correo,
  suscripción activa y monto, chip Automático/Manual, quitar) y un `Combobox`
  con búsqueda para agregar. Solo ofrece `cus_` no enlazados a nadie; cada
  opción muestra nombre, correo y si tiene suscripción activa.
- Instrumento **Oportunidades ganadas**: nombre, valor, etapa, fecha.
- Instrumento **Facturación**: facturas de Stripe de todos sus `cus_`.
  `getBillingFeed` pasa a resolver `clientId` por `client_stripe_customers`.

### Server actions (`src/app/(panel)/clientes/actions.ts`)

`syncClients`, `linkStripeCustomer(clientId, cus)`,
`unlinkStripeCustomer(cus)`, `linkGhlLocation(clientId, locationId)`,
`unlinkGhlLocation(clientId)`. Todas escriben solo en Neon y revalidan el
tag `clients`. Ninguna escribe en GHL ni en Stripe.

## Repositorio

`src/lib/repository.ts` sigue siendo la única superficie de lectura:
`listClients`, `getClient(slug)` (con opportunities, stripe links y
location), `listStripeCustomersForPicker()` (paginado completo, excluye
enlazados), `listGhlLocationsForPicker()`, y `getBillingFeed` ajustado.
Sin `DATABASE_URL`, el demo sirve un par de clientes con la forma nueva.

## Errores

- Falta token / GHL caído: la sync devuelve `{ ok: false }`, la UI lo dice y
  sirve Neon.
- Stripe caído: los pickers muestran "Stripe no respondió"; el resto de la
  ficha carga.
- Enlazar un `cus_` que ya está enlazado: la action devuelve error con el
  nombre del cliente que lo tiene.

## Pruebas (vitest)

- `match.test.ts`: normalización; empate por correo, teléfono (`+52 1 55…`
  vs `+52 55…`), nombre exacto; no-empate "You Can Drive" vs "Escuela You
  Can Drive"; candidato ambiguo entre dos clientes no se enlaza; múltiples
  `cus_` para un cliente.
- `sync.test.ts`: agrupación por contacto (Ricardo Pérez ×2 → 1 cliente con
  2 oportunidades); `stage` toma la más reciente; `wonAt` la más antigua;
  huérfanos marcados, no borrados; no sobrescribe enlaces manuales.

## Fuera de alcance

- Escribir en GHL o Stripe.
- Otros pipelines de la subcuenta.
- Migrar implementaciones/actividad del demo a datos reales.
