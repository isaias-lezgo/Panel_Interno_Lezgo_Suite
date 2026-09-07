# Stripe en Facturación — diseño

**Fecha:** 2026-09-07
**Estado:** aprobado, pendiente de plan de implementación

## Problema

`/facturacion` muestra datos de ejemplo. El dinero real de la agencia vive en
Stripe (`acct_1LKAgaLSMWyOIdkA`, "Lezgo Suite", México, livemode), donde la
última factura emitida es `GLE-0232`. El panel no puede seguir reportando
cifras inventadas en la vista que existe justamente para responder "cuánto
cobramos y cuánto nos deben".

## Lo que hay en la cuenta

Verificado por lectura directa de la API el 2026-09-07:

- **Facturas** con importes en **centavos**: `539700` es $5,397.00.
- **Dos monedas conviviendo**: la mayoría en `mxn`, algunas en `usd`
  (`GLE-0232` en MXN, `GLE-0231` en USD).
- **Estados observados**: `paid`, `open`, `void`. La API también puede
  devolver `draft` y `uncollectible`.
- **`due_date` es `null`** en las facturas de `collection_method:
  "charge_automatically"`, que son la mayoría. No hay fecha de vencimiento
  que leer.
- **IVA 16%**, a veces `inclusive` (`txr_1LVgIzLSMWyOIdkA4HFdwcU8`) y a veces
  `exclusive` (`txr_1TXRbtLSMWyOIdkA2lklUX8k`). `total` ya lo incluye;
  `subtotal` no siempre.
- **Los precios los creó GoHighLevel**: `price.metadata.created_by =
  "LeadConnector"`, con `paquete: start | growth | pro` y `plan: mensual`.
- **Suscripciones** en estado `active`, `canceled` (por `payment_failed`) e
  `incomplete_expired`.

### El puente que NO existe

`price.metadata.location_id` es `uRFrk77agXq9is0a0gkp` en **todos** los
planes, y el mismo id aparece como `metadata.altId` a nivel de factura. Es la
location de la agencia que emite, no la subcuenta de cada cliente. **No hay
hoy ningún campo en Stripe que ligue un `cus_…` con el `ghlLocationId` de un
cliente.** Ese enlace hay que construirlo; no se puede derivar.

## Choques con el modelo actual

| Realidad en Stripe | `src/lib/types.ts` hoy |
|---|---|
| Centavos | `invoices.amount` entero en dólares |
| MXN y USD mezclados | todo asumido USD; `money()` formatea USD |
| `paid / open / void / uncollectible / draft` | `paid / due / overdue / draft` |
| `due_date: null` en cobro automático | `dueAt` obligatorio |
| Planes Start / Growth / Pro | `Plan = launch \| scale \| enterprise` |

## Decisiones tomadas

1. **Enlace explícito por `stripe_customer_id`.** Neon sigue siendo dueño del
   modelo del panel (owner, health, implementaciones, `ghlLocationId`);
   Stripe aporta las facturas. No se derivan clientes de Stripe.
2. **MXN como moneda base.** Las facturas en USD se convierten con un tipo de
   cambio configurable en env. Un solo número por KPI, con el supuesto de FX
   declarado en pantalla.
3. **Lectura en vivo con caché de 5 minutos**, ventana de 12 meses. Sin
   sincronización a Neon, sin cron: el repo no está enlazado a Vercel a
   propósito.

## Arquitectura

### Mecanismo de caché

`unstable_cache` de `next/cache` con `revalidate: 300` y `tags: ["stripe"]`.

**No se usa `use cache` / `cacheLife`.** En Next 16.3 esas directivas exigen
`cacheComponents: true` en `next.config.ts`, lo que cambia el modelo de
prerender de toda la app y contradice el `export const dynamic =
"force-dynamic"` de `src/app/(panel)/layout.tsx`. `unstable_cache` da el mismo
comportamiento —caché con vida de 5 min más invalidación por tag— sin tocar el
render del resto del panel.

### Módulos

```
src/lib/stripe/client.ts     Cliente tipado, única superficie hacia Stripe
src/lib/stripe/map.ts        Stripe.Invoice → Invoice del dominio (lógica pura)
src/lib/repository.ts        Decide la fuente; envuelve la lectura en caché
src/lib/format.ts            money(cents, currency)
scripts/stripe-map.ts        pnpm stripe:map — propone pares cus_… ↔ cliente
```

`src/lib/stripe/client.ts` cumple para Stripe el mismo papel que
`src/lib/ghl/client.ts` para GoHighLevel: auth, forma de error y límites en un
solo lugar. Se apoya en el paquete oficial `stripe` (paginación automática y
tipos ya resueltos) en vez de escribirse a mano sobre `fetch`.

`src/lib/stripe/map.ts` se separa a propósito: es lógica pura, sin red, y es
donde se esconden los errores de dinero. Es lo único que se prueba.

### Tipos del dominio

```ts
export type Currency = "mxn" | "usd"

export type InvoiceStatus =
  | "paid"
  | "due"
  | "overdue"
  | "draft"
  | "void"
  | "uncollectible"

export type Invoice = {
  /** Id de Stripe (`in_…`) cuando la factura viene de Stripe. */
  id: string
  number: string
  clientId: string | null   // null mientras no exista mapeo
  customerName: string      // respaldo de despliegue
  amount: number            // centavos de `currency`
  currency: Currency
  /**
   * Centavos normalizados a MXN — lo que suman los KPI.
   * `null` cuando la factura es USD y no hay `STRIPE_FX_USD_MXN`: en ese caso
   * la factura se muestra pero no entra en ningún total.
   */
  amountMxn: number | null
  status: InvoiceStatus
  issuedAt: string
  /** `null` en cobro automático, donde Stripe no fija vencimiento. */
  dueAt: string | null
  paidAt?: string
  memo: string
  hostedUrl?: string        // abre la factura real en Stripe
}
```

`Client` gana `stripeCustomerId?: string`; la tabla `clients` gana
`stripe_customer_id text` nulable.

**La tabla `invoices` de Neon no se migra.** Sigue como está y sirve al camino
sin Stripe; el repositorio adapta sus filas al tipo de arriba en memoria
(`amount × 100`, `currency: "usd"`, `amountMxn` convertido, `clientId` ya
presente, `customerName` resuelto desde `clients`).

**Una sola forma de factura en toda la app.** El repositorio adapta las filas
de demo y de Neon a esta forma (×100, `currency: "usd"`), así que ninguna
vista necesita saber de dónde vino el dato.

### Derivación de estado

`void` y `uncollectible` **no son cosmética**. `GLE-0230` está anulada por
$1,343.75 MXN: con el enum actual caería en "por cobrar" e inflaría el KPI con
dinero que nadie debe.

| Stripe | Dominio |
|---|---|
| `paid` | `paid` |
| `draft` | `draft` |
| `void` | `void` |
| `uncollectible` | `uncollectible` |
| `open` y `attempt_count > 0` y `next_payment_attempt === null` | `overdue` |
| `open` y `due_date` en el pasado | `overdue` |
| `open` en cualquier otro caso | `due` |

Solo `due` y `overdue` cuentan como "por cobrar".

### Flujo de datos

```
/facturacion (Server Component, force-dynamic)
  └─ getPortfolioSummary()
       └─ listInvoices()
            ├─ sin STRIPE_SECRET_KEY → Neon, o demo si no hay DATABASE_URL
            └─ con STRIPE_SECRET_KEY → unstable_cache(
                   stripe.listInvoices({ created: >= hace 12 meses }),
                   { revalidate: 300, tags: ["stripe"] })
                 └─ map.ts → Invoice[]
                      └─ clientId resuelto contra clients.stripe_customer_id
```

Botón "Actualizar" → Server Action → `revalidateTag("stripe")`.

### Degradación

El diseño funciona en cada escalón, sin pasos previos obligatorios:

- **Sin `STRIPE_SECRET_KEY`**: el panel se comporta exactamente como hoy.
- **Con la clave y cero mapeos**: `/facturacion` muestra las facturas reales
  usando `customerName` de Stripe. Útil desde el minuto uno.
- **Con mapeos**: las facturas caen además en la ficha del cliente y el MRR
  puede calcularse de la suscripción real.

## Moneda

`money(cents, currency)` en `format.ts`, MXN por defecto. La conversión vive
en el repositorio, no en el formateador, y lee `STRIPE_FX_USD_MXN`.

Los KPI de `/facturacion` llevan al pie el tipo de cambio aplicado. Una cifra
convertida no debe presentarse como si fuera medida.

Si `STRIPE_FX_USD_MXN` no está definida, las facturas en USD se muestran en su
moneda y quedan fuera de los totales, con una nota que lo dice. Nunca se
inventa un tipo de cambio por defecto.

## Mapeo de clientes

`pnpm stripe:map` lista los `cus_…` con suscripción activa junto a los
clientes de Neon, propone pares por coincidencia de correo e imprime el SQL de
`update` para confirmar. Es una tarea de una sola sentada, no un proceso.

La red hacia Neon sale bloqueada desde el entorno del agente, así que
`pnpm db:push` y `pnpm stripe:map` los corre una persona.

## Errores

`src/lib/stripe/client.ts` lanza `StripeError` con estado, endpoint y cuerpo,
igual que `GhlError`. `listInvoices()` **no** deja escapar el fallo hacia la
página: si Stripe falla, devuelve lo que haya en Neon y la vista muestra un
aviso de que las cifras no están frescas. Un panel de operaciones que se cae
entero porque un proveedor tuvo un mal minuto no sirve.

## Pruebas

El repo no tiene runner. Se agrega `vitest` y se prueba **solo**
`src/lib/stripe/map.ts`:

- cada rama de la derivación de estado, con `GLE-0230` (void) y `GLE-0231`
  (open sin `due_date`) como casos reales;
- conversión USD→MXN, incluido el caso sin `STRIPE_FX_USD_MXN`;
- centavos: que `539700` se muestre como $5,397.00 y nunca como $539,700.

## Fuera de alcance

- Herramientas de Stripe para el copiloto.
- Cualquier escritura contra Stripe. Todo el trabajo es de solo lectura.
- Reconciliar `Plan` (`launch/scale/enterprise`) con los paquetes reales
  (`start/growth/pro`). Es una limpieza aparte del modelo de clientes.
- Impuestos como concepto propio del dominio. Se usa `total`, que ya trae el
  IVA resuelto.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `STRIPE_SECRET_KEY` | Clave de Stripe. Sin ella, facturación sigue en Neon/demo |
| `STRIPE_FX_USD_MXN` | Tipo de cambio USD→MXN para normalizar los KPI |
