# Stripe en Facturación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/facturacion` deja de reportar datos de ejemplo y muestra las facturas reales de Stripe, en MXN, sin romper el panel cuando no hay clave.

**Architecture:** Un cliente tipado sobre el paquete oficial `stripe` es la única superficie hacia la API. Un mapeador puro convierte `Stripe.Invoice` al tipo `Invoice` del dominio; es lo único que se prueba. El repositorio decide la fuente (Stripe → Neon → demo), envuelve la lectura en `unstable_cache` con vida de 5 minutos y tag `"stripe"`, y cae de vuelta a Neon si Stripe falla.

**Tech Stack:** Next.js 16.3.1 (App Router, React 19.2.8), TypeScript, Drizzle + Neon, paquete `stripe`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-09-07-stripe-facturacion-design.md`

## Global Constraints

- **Todo el texto visible va en español.** Identificadores del código en inglés.
- **Toda lectura de datos pasa por `src/lib/repository.ts`.** Ninguna página consulta Stripe, Neon ni el demo directamente.
- **Toda llamada a Stripe pasa por `src/lib/stripe/client.ts`.**
- **Solo lectura.** Ninguna tarea escribe en Stripe.
- **Toda cifra en la UI usa la clase `.num`.** Las etiquetas de instrumento usan `.eyebrow`.
- **`StatusChip` siempre lleva punto y palabra.** El estado nunca se comunica solo con color.
- **No se habilita `cacheComponents`.** El shell `src/app/(panel)/layout.tsx:11` es `force-dynamic` a propósito; se usa `unstable_cache`.
- **La tabla `invoices` de Neon no se migra.** Solo `clients` gana columna.
- **Importes en centavos** en todo el dominio. MXN es la base; USD se convierte con `STRIPE_FX_USD_MXN`.
- **Nunca inventar un tipo de cambio por defecto.** Sin `STRIPE_FX_USD_MXN`, las facturas USD se muestran pero no entran en totales.
- El agente **no tiene red hacia Neon**: `pnpm db:push`, `pnpm db:seed` y `pnpm stripe:map` los corre una persona.

---

### Task 1: Runner de pruebas

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/stripe/smoke.test.ts` (se borra en Task 5)

**Interfaces:**
- Consumes: nada.
- Produces: comando `pnpm test` (ejecuta una vez, sin watch) y `pnpm test:watch`.

- [ ] **Step 1: Instalar vitest**

```bash
pnpm add -D vitest@^3 vite-tsconfig-paths@^5
```

- [ ] **Step 2: Crear `vitest.config.ts`**

`vite-tsconfig-paths` es lo que hace que `@/lib/...` resuelva dentro de las pruebas igual que en la app.

```ts
import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
```

- [ ] **Step 3: Agregar los scripts en `package.json`**

Dentro de `"scripts"`, junto a `"typecheck"`:

```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Step 4: Escribir una prueba de humo**

Crear `src/lib/stripe/smoke.test.ts`:

```ts
import { expect, test } from "vitest"

test("el runner corre y los alias de ruta resuelven", async () => {
  const { money } = await import("@/lib/format")
  expect(typeof money).toBe("function")
})
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `pnpm test`
Expected: PASS, 1 prueba.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/lib/stripe/smoke.test.ts
git commit -m "Agrega vitest para probar la lógica de dinero"
```

---

### Task 2: El dominio pasa a centavos y gana moneda

Esta tarea **no cambia ningún comportamiento visible**. Convierte el modelo a centavos con moneda explícita y arrastra todos los call sites. Al terminar, el panel se ve exactamente igual que antes.

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/format.ts`
- Modify: `src/data/demo.ts:377`
- Modify: `src/lib/repository.ts`
- Modify: `src/components/signal/status-chip.tsx:59-67`
- Modify: `src/components/billing/invoices-table.tsx`
- Modify: `src/app/(panel)/facturacion/page.tsx`
- Modify: `src/app/(panel)/page.tsx:63`
- Modify: `src/app/(panel)/clientes/[slug]/page.tsx:111,186,217`
- Modify: `src/app/(panel)/clientes/page.tsx:23`
- Modify: `src/components/clients/clients-table.tsx:170`
- Modify: `src/components/panel/telemetry-band.tsx:41,86`
- Modify: `src/components/charts/revenue-chart.tsx:42,49`
- Modify: `src/components/charts/movement-chart.tsx:45,53`
- Modify: `src/components/charts/client-revenue-chart.tsx:52,62`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Currency = "mxn" | "usd"`
  - `type InvoiceStatus = "paid" | "due" | "overdue" | "draft" | "void" | "uncollectible"`
  - `type InvoiceRow` — la fila tal como vive en Neon y demo (dólares enteros)
  - `type Invoice` — el tipo del dominio (centavos + moneda)
  - `money(cents: number, currency: Currency): string`
  - `moneyExact(cents: number, currency: Currency): string`
  - `compactMoney(cents: number): string` — siempre MXN
  - `rowToInvoice(row: InvoiceRow, customerName: string, usdToMxn: number | null): Invoice`

- [ ] **Step 1: Reescribir los tipos de factura en `src/lib/types.ts`**

Reemplazar el bloque `InvoiceStatus` / `Invoice` (líneas 56-70) por:

```ts
export type Currency = "mxn" | "usd"

export type InvoiceStatus =
  | "paid"
  | "due"
  | "overdue"
  | "draft"
  | "void"
  | "uncollectible"

/**
 * La factura tal como vive en la tabla `invoices` de Neon y en los datos de
 * ejemplo: dólares enteros, siempre ligada a un cliente. Esta tabla no se
 * migró; el repositorio la adapta a `Invoice` en memoria.
 */
export type InvoiceRow = {
  id: string
  number: string
  clientId: string
  amount: number
  status: "paid" | "due" | "overdue" | "draft"
  issuedAt: string
  dueAt: string
  paidAt?: string
  memo: string
}

export type Invoice = {
  /** Id de Stripe (`in_…`) cuando la factura viene de Stripe. */
  id: string
  number: string
  /** `null` mientras no exista mapeo con un cliente del panel. */
  clientId: string | null
  /** Nombre a mostrar cuando `clientId` es `null`. */
  customerName: string
  /** Importe total, en centavos de `currency`. Ya incluye IVA. */
  amount: number
  currency: Currency
  /**
   * Centavos normalizados a MXN — lo que suman los KPI. `null` cuando la
   * factura es USD y no hay `STRIPE_FX_USD_MXN`: se muestra, pero no entra
   * en ningún total.
   */
  amountMxn: number | null
  status: InvoiceStatus
  issuedAt: string
  /** `null` en cobro automático, donde Stripe no fija vencimiento. */
  dueAt: string | null
  paidAt?: string
  memo: string
  /** Abre la factura real en Stripe. */
  hostedUrl?: string
}
```

Y en el tipo `Client` (línea 8-25), agregar antes de `owner`:

```ts
  /** Cliente de Stripe que paga esta cuenta. Se llena con `pnpm stripe:map`. */
  stripeCustomerId?: string
```

- [ ] **Step 2: Reescribir los formateadores de dinero en `src/lib/format.ts`**

Reemplazar las líneas 3-19 (los dos `Intl.NumberFormat` y las tres exportaciones de dinero) por:

```ts
import type { Currency } from "@/lib/types"

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: Currency, decimals: boolean) {
  const key = `${currency}:${decimals}`
  const cached = formatters.get(key)
  if (cached) return cached
  const made = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: decimals ? 2 : 0,
  })
  formatters.set(key, made)
  return made
}

/**
 * `cents` va en la unidad mínima de `currency`. La moneda es obligatoria a
 * propósito: cuando el panel dejó de ser solo USD, un valor por defecto
 * habría convertido cada call site viejo en una cifra silenciosamente falsa.
 */
export const money = (cents: number, currency: Currency) =>
  formatter(currency, false).format(cents / 100)

export const moneyExact = (cents: number, currency: Currency) =>
  formatter(currency, true).format(cents / 100)

/** Para ejes de gráfica. Siempre MXN. */
export const compactMoney = (cents: number) => {
  const n = cents / 100
  return n >= 1000
    ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
    : `$${Math.round(n)}`
}
```

- [ ] **Step 3: Verificar que el compilador marca todos los call sites viejos**

Run: `pnpm typecheck`
Expected: FAIL. Errores `Expected 2 arguments, but got 1` en los 12 archivos listados arriba. Esa lista es el trabajo del paso siguiente.

- [ ] **Step 4: Adaptar el demo y agregar el adaptador en el repositorio**

En `src/data/demo.ts`, cambiar el import de `Invoice` a `InvoiceRow` (línea 5) y la anotación de la línea 377:

```ts
export const invoices: InvoiceRow[] = [
```

En `src/lib/repository.ts`, agregar arriba (después de los imports) el adaptador y la lectura del tipo de cambio:

```ts
/**
 * El tipo de cambio es un supuesto, no un dato medido. Sin él, las facturas
 * en USD se muestran en su moneda y quedan fuera de los totales.
 */
export function usdToMxnRate(): number | null {
  const raw = process.env.STRIPE_FX_USD_MXN
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Las filas de Neon y del demo son dólares enteros ligados a un cliente. */
export function rowToInvoice(
  row: InvoiceRow,
  customerName: string,
  usdToMxn: number | null,
): Invoice {
  const amount = row.amount * 100
  return {
    ...row,
    amount,
    currency: "usd",
    amountMxn: usdToMxn === null ? null : Math.round(amount * usdToMxn),
    customerName,
    dueAt: row.dueAt,
  }
}
```

Y reescribir `listInvoices()` (líneas 40-43):

```ts
export async function listInvoices(): Promise<Invoice[]> {
  const [rows, clients] = await Promise.all([
    db
      ? (db.select().from(schema.invoices) as Promise<InvoiceRow[]>)
      : Promise.resolve(demo.invoices),
    listClients(),
  ])
  const nameById = new Map(clients.map((c) => [c.id, c.name]))
  const fx = usdToMxnRate()
  return rows.map((row) =>
    rowToInvoice(row, nameById.get(row.clientId) ?? "Cliente desconocido", fx),
  )
}
```

Actualizar el import de `src/lib/types` para incluir `InvoiceRow`.

En `getPortfolioSummary()`, cambiar el cálculo de `outstanding` (líneas 73-75) para sumar MXN e ignorar lo no convertible:

```ts
  const outstanding = invoices
    .filter((i) => i.status === "overdue" || i.status === "due")
    .reduce((sum, i) => sum + (i.amountMxn ?? 0), 0)
```

- [ ] **Step 5: Agregar los dos estados nuevos al chip**

En `src/components/signal/status-chip.tsx`, dentro de `invoiceStatusLabel` (líneas 61-67), agregar:

```ts
  void: { label: "Anulada", tone: "idle" },
  uncollectible: { label: "Incobrable", tone: "risk" },
```

- [ ] **Step 6: Arrastrar los call sites restantes**

Cada uno pasa a centavos con moneda explícita. Los valores que hoy son dólares enteros (`client.mrr`, `summary.mrr`, los puntos de `revenue`) se multiplican por 100 en el call site y se declaran `"usd"`, porque siguen siendo datos del demo: reconciliar el MRR real está fuera de alcance.

- `src/app/(panel)/clientes/page.tsx:23` → `money(summary.mrr * 100, "usd")`
- `src/app/(panel)/page.tsx:63` → `money(i.amount, i.currency)`
- `src/app/(panel)/clientes/[slug]/page.tsx:111` → `money(client.mrr * 100, "usd")`
- `src/app/(panel)/clientes/[slug]/page.tsx:186` → `money(owed, "mxn")`; y donde se calcula `owed`, sumar `(i.amountMxn ?? 0)`
- `src/app/(panel)/clientes/[slug]/page.tsx:217` → `money(invoice.amount, invoice.currency)`
- `src/components/clients/clients-table.tsx:170` → `money(client.mrr * 100, "usd")`
- `src/components/panel/telemetry-band.tsx:41` → `money(mrr * 100, "usd")`
- `src/components/panel/telemetry-band.tsx:86` → `money(outstanding, "mxn")`
- `src/components/charts/revenue-chart.tsx:42,49` → `compactMoney(value * 100)` y `compactMoney(Number(value) * 100)`
- `src/components/charts/movement-chart.tsx:45,53` → `compactMoney(Math.abs(value) * 100)` y `compactMoney(Math.abs(Number(value)) * 100)`
- `src/components/charts/client-revenue-chart.tsx:52` → `money(Number(value) * 100, "usd")`
- `src/components/charts/client-revenue-chart.tsx:62` → `compactMoney(Number(value) * 100)`

En `src/components/billing/invoices-table.tsx`:

- línea 76: `const total = rows.reduce((sum, i) => sum + (i.amountMxn ?? 0), 0)` y mostrar `money(total, "mxn")`
- línea ~118: `const client = invoice.clientId ? clientById.get(invoice.clientId) : undefined`
- la celda de cliente muestra `invoice.customerName` cuando no hay `client`, en vez del guion largo
- la celda de importe: `money(invoice.amount, invoice.currency)`
- la celda "Vence": `invoice.dueAt ? shortDate(invoice.dueAt) : "—"`, y el bloque de `relativeDays` solo cuando `invoice.dueAt` existe
- agregar `void` y `uncollectible` a `statusFilterLabel` y al `<SelectContent>`, con las etiquetas "Anuladas" e "Incobrables"

En `src/app/(panel)/facturacion/page.tsx`, los cuatro KPI suman `amountMxn` y formatean en MXN:

```ts
  const paid = summary.invoices.filter((i) => i.status === "paid")
  const overdue = summary.invoices.filter((i) => i.status === "overdue")
  const collected = paid.reduce((sum, i) => sum + (i.amountMxn ?? 0), 0)
  const overdueTotal = overdue.reduce((sum, i) => sum + (i.amountMxn ?? 0), 0)
  const issued = summary.invoices.filter(
    (i) => i.status !== "draft" && i.status !== "void",
  )
```

y los cuatro `money(...)` de las líneas 34, 42, 50 y 61 pasan `"mxn"` como segundo argumento.

- [ ] **Step 7: Verificar que compila y que no cambió nada visible**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS los tres.

Run: `pnpm dev` y abrir `/facturacion`, `/clientes` y el tablero.
Expected: las mismas cifras que antes del cambio. El demo sigue en USD; solo cambió su representación interna.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Pasa los importes a centavos con moneda explícita"
```

---

### Task 3: Columna `stripe_customer_id`

**Files:**
- Modify: `src/db/schema.ts:16-32`

**Interfaces:**
- Consumes: `Client.stripeCustomerId?` de Task 2.
- Produces: columna `clients.stripe_customer_id text` nulable.

- [ ] **Step 1: Agregar la columna al esquema**

En `src/db/schema.ts`, dentro de `clients`, después de `ghlLocationId` (línea 24):

```ts
  stripeCustomerId: text("stripe_customer_id"),
```

- [ ] **Step 2: Verificar que compila**

Run: `pnpm typecheck`
Expected: PASS. La columna es nulable, así que `demo.clients` sigue siendo válido sin tocarlo.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "Agrega clients.stripe_customer_id"
```

- [ ] **Step 4: Pedir la migración a una persona**

El agente no tiene red hacia Neon. Decirle al usuario, con estas palabras:

> La columna está en el esquema pero no en tu base. Corre `pnpm db:push` cuando puedas; hasta entonces el panel sigue funcionando porque la columna es nulable y el camino de Stripe no la necesita para mostrar facturas.

---

### Task 4: Cliente de Stripe

**Files:**
- Create: `src/lib/stripe/client.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `class StripeError extends Error` con `status`, `endpoint`, `body`
  - `stripeEnabled(): boolean`
  - `listRecentInvoices(months: number): Promise<Stripe.Invoice[]>`
  - `listActiveSubscriptions(): Promise<Stripe.Subscription[]>`
  - `listCustomers(): Promise<Stripe.Customer[]>`

- [ ] **Step 1: Instalar el paquete oficial**

```bash
pnpm add stripe@^19
```

- [ ] **Step 2: Escribir el cliente**

Crear `src/lib/stripe/client.ts`:

```ts
import "server-only"

import Stripe from "stripe"

/**
 * Única superficie hacia Stripe, con el mismo papel que `ghl/client.ts` tiene
 * para GoHighLevel: auth, forma de error y paginación resueltos en un solo
 * lugar. Todo aquí es de solo lectura; el panel no cobra ni emite.
 */

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = "StripeError"
  }
}

let client: Stripe | null = null

function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new StripeError("Falta STRIPE_SECRET_KEY", 401, "config")
  }
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 15_000,
  })
  return client
}

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

function wrap(error: unknown, endpoint: string): never {
  if (error instanceof Stripe.errors.StripeError) {
    throw new StripeError(
      error.message,
      error.statusCode ?? 500,
      endpoint,
      error.raw,
    )
  }
  throw new StripeError(String(error), 500, endpoint)
}

/** Facturas emitidas en los últimos `months` meses, del más nuevo al más viejo. */
export async function listRecentInvoices(months = 12) {
  const since = Math.floor(Date.now() / 1000) - months * 30 * 24 * 60 * 60
  try {
    return await stripe()
      .invoices.list({ created: { gte: since }, limit: 100 })
      .autoPagingToArray({ limit: 2000 })
  } catch (error) {
    wrap(error, "/v1/invoices")
  }
}

export async function listActiveSubscriptions() {
  try {
    return await stripe()
      .subscriptions.list({ status: "active", limit: 100 })
      .autoPagingToArray({ limit: 1000 })
  } catch (error) {
    wrap(error, "/v1/subscriptions")
  }
}

export async function listCustomers() {
  try {
    return await stripe()
      .customers.list({ limit: 100 })
      .autoPagingToArray({ limit: 2000 })
  } catch (error) {
    wrap(error, "/v1/customers")
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/stripe/client.ts
git commit -m "Agrega el cliente de solo lectura de Stripe"
```

---

### Task 5: El mapeador y sus pruebas

El corazón del cambio. Lógica pura, sin red. Es lo único que se prueba porque es donde se esconden los errores de dinero.

**Files:**
- Create: `src/lib/stripe/map.test.ts`
- Create: `src/lib/stripe/map.ts`
- Delete: `src/lib/stripe/smoke.test.ts`

**Interfaces:**
- Consumes: `Currency`, `Invoice`, `InvoiceStatus` de Task 2.
- Produces:
  - `toCurrency(code: string): Currency | null`
  - `deriveStatus(invoice: Stripe.Invoice, now: Date): InvoiceStatus`
  - `toMxn(amount: number, currency: Currency, usdToMxn: number | null): number | null`
  - `mapInvoice(invoice: Stripe.Invoice, usdToMxn: number | null, clientIdFor: (customerId: string | null) => string | null): Invoice | null`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/stripe/map.test.ts`. Los casos vienen de facturas reales de la cuenta, leídas el 2026-09-07.

```ts
import type Stripe from "stripe"
import { describe, expect, test } from "vitest"

import { deriveStatus, mapInvoice, toCurrency, toMxn } from "@/lib/stripe/map"

const AHORA = new Date("2026-09-07T00:00:00Z")

/** Molde mínimo con los campos que el mapeador toca. */
function factura(over: Partial<Stripe.Invoice> = {}) {
  return {
    id: "in_test",
    number: "GLE-0001",
    status: "paid",
    total: 100_000,
    currency: "mxn",
    customer: "cus_test",
    customer_name: "Cliente Prueba",
    customer_email: "prueba@example.com",
    created: 1_788_718_925,
    due_date: null,
    attempt_count: 0,
    next_payment_attempt: null,
    hosted_invoice_url: "https://invoice.stripe.com/i/test",
    description: "¡Gracias por confiar en nosotros!",
    lines: { data: [{ description: "1 × Lezgo Pro MXN" }] },
    status_transitions: { finalized_at: 1_788_722_573, paid_at: 1_788_722_573 },
    ...over,
  } as unknown as Stripe.Invoice
}

describe("toCurrency", () => {
  test("acepta las dos monedas que factura la agencia", () => {
    expect(toCurrency("mxn")).toBe("mxn")
    expect(toCurrency("USD")).toBe("usd")
  })

  test("rechaza cualquier otra", () => {
    expect(toCurrency("eur")).toBeNull()
  })
})

describe("deriveStatus", () => {
  test("paid, draft, void y uncollectible pasan tal cual", () => {
    expect(deriveStatus(factura({ status: "paid" }), AHORA)).toBe("paid")
    expect(deriveStatus(factura({ status: "draft" }), AHORA)).toBe("draft")
    expect(deriveStatus(factura({ status: "void" }), AHORA)).toBe("void")
    expect(deriveStatus(factura({ status: "uncollectible" }), AHORA)).toBe(
      "uncollectible",
    )
  })

  test("GLE-0231: open recién emitida, sin due_date, es por vencer", () => {
    const i = factura({
      status: "open",
      due_date: null,
      attempt_count: 1,
      next_payment_attempt: 1_788_768_257,
    })
    expect(deriveStatus(i, AHORA)).toBe("due")
  })

  test("open con intentos agotados y sin próximo intento es vencida", () => {
    const i = factura({
      status: "open",
      due_date: null,
      attempt_count: 4,
      next_payment_attempt: null,
    })
    expect(deriveStatus(i, AHORA)).toBe("overdue")
  })

  test("open con due_date en el pasado es vencida", () => {
    const i = factura({
      status: "open",
      due_date: 1_780_000_000,
      attempt_count: 0,
      next_payment_attempt: null,
    })
    expect(deriveStatus(i, AHORA)).toBe("overdue")
  })
})

describe("toMxn", () => {
  test("MXN no se toca", () => {
    expect(toMxn(539_700, "mxn", 18.5)).toBe(539_700)
  })

  test("USD se convierte y se redondea a centavo", () => {
    expect(toMxn(24_012, "usd", 18.5)).toBe(444_222)
  })

  test("sin tipo de cambio, USD no se convierte: devuelve null", () => {
    expect(toMxn(24_012, "usd", null)).toBeNull()
  })

  test("sin tipo de cambio, MXN sigue sumando", () => {
    expect(toMxn(539_700, "mxn", null)).toBe(539_700)
  })
})

describe("mapInvoice", () => {
  test("GLE-0232: conserva los centavos, no los infla a pesos", () => {
    const i = mapInvoice(factura({ total: 887_052 }), 18.5, () => null)
    expect(i?.amount).toBe(887_052)
    expect(i?.currency).toBe("mxn")
    expect(i?.amountMxn).toBe(887_052)
  })

  test("usa el concepto de la primera línea, no el agradecimiento", () => {
    const i = mapInvoice(factura(), 18.5, () => null)
    expect(i?.memo).toBe("1 × Lezgo Pro MXN")
  })

  test("sin mapeo, clientId es null y queda el nombre de Stripe", () => {
    const i = mapInvoice(factura(), 18.5, () => null)
    expect(i?.clientId).toBeNull()
    expect(i?.customerName).toBe("Cliente Prueba")
  })

  test("con mapeo, resuelve el cliente del panel", () => {
    const i = mapInvoice(factura(), 18.5, (cus) =>
      cus === "cus_test" ? "cl_prueba" : null,
    )
    expect(i?.clientId).toBe("cl_prueba")
  })

  test("descarta monedas que el panel no sabe representar", () => {
    expect(mapInvoice(factura({ currency: "eur" }), 18.5, () => null)).toBeNull()
  })

  test("las fechas salen como YYYY-MM-DD", () => {
    const i = mapInvoice(factura(), 18.5, () => null)
    expect(i?.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(i?.dueAt).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '@/lib/stripe/map'`.

- [ ] **Step 3: Escribir el mapeador**

Crear `src/lib/stripe/map.ts`:

```ts
import type Stripe from "stripe"

import type { Currency, Invoice, InvoiceStatus } from "@/lib/types"

/** Stripe entrega segundos; el panel guarda fechas sin hora. */
function isoDate(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

export function toCurrency(code: string): Currency | null {
  const c = code.toLowerCase()
  return c === "mxn" || c === "usd" ? c : null
}

/**
 * Las facturas de cobro automático llegan con `due_date: null`, así que
 * "vencida" no se puede leer de una fecha: se deduce de que Stripe ya agotó
 * los intentos de cobro y no programó otro.
 */
export function deriveStatus(
  invoice: Stripe.Invoice,
  now: Date,
): InvoiceStatus {
  switch (invoice.status) {
    case "paid":
      return "paid"
    case "draft":
      return "draft"
    case "void":
      return "void"
    case "uncollectible":
      return "uncollectible"
    case "open": {
      const agotada =
        invoice.attempt_count > 0 && invoice.next_payment_attempt === null
      const pasada =
        invoice.due_date !== null &&
        invoice.due_date !== undefined &&
        invoice.due_date * 1000 < now.getTime()
      return agotada || pasada ? "overdue" : "due"
    }
    default:
      return "draft"
  }
}

export function toMxn(
  amount: number,
  currency: Currency,
  usdToMxn: number | null,
): number | null {
  if (currency === "mxn") return amount
  if (usdToMxn === null) return null
  return Math.round(amount * usdToMxn)
}

/**
 * Devuelve `null` cuando la factura usa una moneda que el panel no sabe
 * representar. Es preferible omitirla a mostrarla con el símbolo equivocado.
 */
export function mapInvoice(
  invoice: Stripe.Invoice,
  usdToMxn: number | null,
  clientIdFor: (customerId: string | null) => string | null,
  now = new Date(),
): Invoice | null {
  const currency = toCurrency(invoice.currency)
  if (!currency) return null

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null)

  const paidAt = invoice.status_transitions?.paid_at

  // En los tipos recientes de Stripe, `id` y `number` son opcionales: una
  // factura en borrador puede no tener folio todavía.
  const id = invoice.id ?? invoice.number
  if (!id) return null

  return {
    id,
    number: invoice.number ?? id,
    clientId: clientIdFor(customerId),
    customerName:
      invoice.customer_name ?? invoice.customer_email ?? "Sin nombre",
    amount: invoice.total,
    currency,
    amountMxn: toMxn(invoice.total, currency, usdToMxn),
    status: deriveStatus(invoice, now),
    issuedAt: isoDate(invoice.status_transitions?.finalized_at ?? invoice.created),
    dueAt: invoice.due_date ? isoDate(invoice.due_date) : null,
    ...(paidAt ? { paidAt: isoDate(paidAt) } : {}),
    memo:
      invoice.lines?.data[0]?.description ??
      invoice.description ??
      "Sin concepto",
    ...(invoice.hosted_invoice_url
      ? { hostedUrl: invoice.hosted_invoice_url }
      : {}),
  }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `pnpm test`
Expected: PASS, 16 pruebas.

- [ ] **Step 5: Borrar la prueba de humo**

```bash
rm src/lib/stripe/smoke.test.ts
```

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS los tres.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Mapea las facturas de Stripe al dominio del panel"
```

---

### Task 6: El repositorio elige la fuente

**Files:**
- Modify: `src/lib/repository.ts`

**Interfaces:**
- Consumes: `stripeEnabled`, `listRecentInvoices`, `StripeError` de Task 4; `mapInvoice` de Task 5.
- Produces:
  - `listInvoices(): Promise<Invoice[]>` — ahora prefiere Stripe
  - `getBillingFeed(): Promise<{ invoices: Invoice[]; source: "stripe" | "neon" | "demo"; stale: boolean; usdToMxn: number | null }>`
  - `refreshBilling(): Promise<void>` — Server Action, invalida el tag

- [ ] **Step 1: Agregar la lectura cacheada de Stripe**

En `src/lib/repository.ts`, agregar después de `rowToInvoice`:

```ts
/**
 * Cinco minutos es el trato: suficiente para que el equipo refresque la vista
 * sin gastar cuota, poco para que nadie tome una decisión de cobranza con
 * datos de ayer. El botón "Actualizar" invalida el tag cuando urge.
 */
const cachedStripeInvoices = unstable_cache(
  async (usdToMxn: number | null, pares: [string, string][]) => {
    const byCustomer = new Map(pares)
    const raw = await listRecentInvoices(12)
    return raw
      .map((invoice) =>
        mapInvoice(invoice, usdToMxn, (cus) =>
          cus ? (byCustomer.get(cus) ?? null) : null,
        ),
      )
      .filter((i): i is Invoice => i !== null)
  },
  ["stripe-invoices"],
  { revalidate: 300, tags: ["stripe"] },
)
```

Los pares llegan como argumento —y no se leen adentro— porque `unstable_cache` construye la llave con los argumentos: si cambia el mapeo de clientes, la entrada vieja deja de usarse sola.

Agregar los imports al inicio del archivo:

```ts
import { revalidateTag, unstable_cache } from "next/cache"

import { listRecentInvoices, stripeEnabled } from "@/lib/stripe/client"
import { mapInvoice } from "@/lib/stripe/map"
```

- [ ] **Step 2: Escribir `getBillingFeed` y reconectar `listInvoices`**

Reemplazar el `listInvoices()` de Task 2 por:

```ts
async function neonInvoices(): Promise<{
  invoices: Invoice[]
  source: "neon" | "demo"
}> {
  const [rows, clients] = await Promise.all([
    db
      ? (db.select().from(schema.invoices) as Promise<InvoiceRow[]>)
      : Promise.resolve(demo.invoices),
    listClients(),
  ])
  const nameById = new Map(clients.map((c) => [c.id, c.name]))
  const fx = usdToMxnRate()
  return {
    invoices: rows.map((row) =>
      rowToInvoice(row, nameById.get(row.clientId) ?? "Cliente desconocido", fx),
    ),
    source: db ? "neon" : "demo",
  }
}

/**
 * Un panel de operaciones que se cae entero porque un proveedor tuvo un mal
 * minuto no sirve. Si Stripe falla, se sirve lo que haya en Neon y la vista
 * avisa que las cifras no están frescas.
 */
export async function getBillingFeed() {
  const usdToMxn = usdToMxnRate()
  if (!stripeEnabled()) {
    const { invoices, source } = await neonInvoices()
    return { invoices, source, stale: false, usdToMxn }
  }

  const clients = await listClients()
  const pares = clients
    .filter((c) => c.stripeCustomerId)
    .map((c) => [c.stripeCustomerId as string, c.id] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))

  try {
    const invoices = await cachedStripeInvoices(usdToMxn, pares)
    return { invoices, source: "stripe" as const, stale: false, usdToMxn }
  } catch (error) {
    console.error("Stripe no respondió; se sirve Neon", error)
    const { invoices, source } = await neonInvoices()
    return { invoices, source, stale: true, usdToMxn }
  }
}

export async function listInvoices(): Promise<Invoice[]> {
  return (await getBillingFeed()).invoices
}

export async function refreshBilling() {
  "use server"
  revalidateTag("stripe")
}
```

- [ ] **Step 3: Verificar que compila y que sin clave nada cambió**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS los tres.

Comentar `STRIPE_SECRET_KEY` en `.env.local`, correr `pnpm dev` y abrir `/facturacion`.
Expected: las mismas cifras que antes. Descomentar al terminar.

- [ ] **Step 4: Commit**

```bash
git add src/lib/repository.ts
git commit -m "El repositorio prefiere Stripe y cae a Neon si falla"
```

---

### Task 7: La vista de Facturación

**Files:**
- Modify: `src/app/(panel)/facturacion/page.tsx`
- Modify: `src/components/billing/invoices-table.tsx`
- Create: `src/components/billing/refresh-button.tsx`

**Interfaces:**
- Consumes: `getBillingFeed`, `refreshBilling` de Task 6.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Botón de actualizar**

Crear `src/components/billing/refresh-button.tsx`:

```tsx
"use client"

import { useTransition } from "react"
import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export function RefreshButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(() => action())}
      aria-label="Volver a consultar Stripe ahora"
    >
      <RotateCw className={pending ? "animate-spin" : undefined} aria-hidden />
      {pending ? "Consultando…" : "Actualizar"}
    </Button>
  )
}
```

- [ ] **Step 2: Reescribir la página**

En `src/app/(panel)/facturacion/page.tsx`:

- cambiar `getPortfolioSummary()` por `getBillingFeed()` más `listClients()`, y usar `feed.invoices`
- la descripción del `PageHeader` pasa a: `"Lo cobrado, lo pendiente y lo vencido. Los importes están en MXN."`
- pasar `<RefreshButton action={refreshBilling} />` al header
- cuando `feed.stale`, mostrar antes de los KPI:

```tsx
{feed.stale && (
  <p className="rounded-lg border border-status-warn/40 bg-card px-4 py-3 text-sm">
    Stripe no respondió. Estas cifras salen de la base y pueden estar
    atrasadas.
  </p>
)}
```

- bajo los KPI, la nota del supuesto de FX:

```tsx
<p className="text-xs text-muted-foreground">
  {feed.usdToMxn
    ? `Las facturas en USD se convirtieron a ${feed.usdToMxn} MXN por dólar.`
    : "Hay facturas en USD fuera de los totales: falta configurar STRIPE_FX_USD_MXN."}
</p>
```

- [ ] **Step 3: Hacer honestos los dos instrumentos de concentración**

Hoy `ClientRevenueChart` y `Concentration` leen `client.mrr`, que son dólares del demo. Con Stripe conectado quedarían cifras falsas junto a cifras reales en la misma pantalla. Pasan a calcularse de las facturas que ya están en mano:

```tsx
// Facturado real por cliente en la ventana de 12 meses, en centavos MXN.
const facturado = new Map<string, number>()
for (const i of feed.invoices) {
  if (i.status === "void" || i.status === "draft") continue
  const nombre = i.clientId
    ? (clients.find((c) => c.id === i.clientId)?.name ?? i.customerName)
    : i.customerName
  facturado.set(nombre, (facturado.get(nombre) ?? 0) + (i.amountMxn ?? 0))
}
const ranked = [...facturado.entries()]
  .map(([name, total]) => ({ name, total }))
  .sort((a, b) => b.total - a.total)
const totalFacturado = ranked.reduce((s, r) => s + r.total, 0)
```

La firma de `Concentration` (hoy en `facturacion/page.tsx:112-118`) pasa a:

```tsx
function Concentration({
  ranked,
  total,
}: {
  ranked: { name: string; total: number }[]
  total: number
}) {
```

Adentro: `share` se calcula con `ranked.slice(0, 3)` sobre `total`; la lista usa `r.total / total` para el ancho de la barra; el `key` pasa de `client.slug` a `r.name`. El copy queda "del facturado de los últimos 12 meses viene de las tres cuentas más grandes."

`ClientRevenueChart` (`src/components/charts/client-revenue-chart.tsx`) recibe hoy `clients: Client[]` y lee `mrr`. Cambia a `data: { name: string; total: number }[]` leyendo `total`, y sus formateadores pasan a `money(Number(value), "mxn")` y `compactMoney(Number(value))` — sin `* 100`, porque ahora ya recibe centavos.

La etiqueta del `Instrument` pasa a `"Facturado por cliente"` con `hint="Últimos 12 meses"`.

- [ ] **Step 4: Enlazar la factura real desde la tabla**

En `src/components/billing/invoices-table.tsx`, la celda de folio pasa a enlazar a Stripe cuando hay `hostedUrl`:

```tsx
<TableCell data-num className="text-xs">
  {invoice.hostedUrl ? (
    <a
      href={invoice.hostedUrl}
      target="_blank"
      rel="noreferrer"
      className="hover:text-primary"
    >
      {invoice.number}
    </a>
  ) : (
    invoice.number
  )}
</TableCell>
```

- [ ] **Step 5: Verificar en el navegador**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS los tres.

Run: `pnpm dev`, abrir `/facturacion`.
Expected: folios reales tipo `GLE-0232`, importes en MXN, `GLE-0230` con chip "Anulada" y **fuera** de "Por cobrar", la nota del tipo de cambio al pie, y el botón "Actualizar" recargando la tabla.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Facturación muestra las facturas reales de Stripe"
```

---

### Task 8: Script de mapeo

**Files:**
- Create: `scripts/stripe-map.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `listActiveSubscriptions`, `listCustomers` de Task 4.
- Produces: comando `pnpm stripe:map`.

- [ ] **Step 1: Escribir el script**

Crear `scripts/stripe-map.ts`:

```ts
import "dotenv/config"

import { db, schema } from "@/db"
import { listActiveSubscriptions, listCustomers } from "@/lib/stripe/client"

/**
 * Propone pares cus_… ↔ cliente del panel e imprime el SQL para confirmarlos.
 * No escribe nada: el mapeo es una decisión de negocio y se revisa a ojo.
 *
 * El panel no guarda el correo de sus clientes, así que la única señal
 * disponible es el nombre. Se compara normalizado (sin acentos, sin mayúsculas,
 * sin sufijos societarios) y aun así se marca como propuesta, no como certeza.
 */
function normaliza(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sa de cv|s\.a\.|sapi|srl|llc|inc|co|mx)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

async function main() {
  if (!db) throw new Error("Falta DATABASE_URL")

  const [subs, customers, clients] = await Promise.all([
    listActiveSubscriptions(),
    listCustomers(),
    db.select().from(schema.clients),
  ])

  const activos = new Set(
    subs.map((s) => (typeof s.customer === "string" ? s.customer : s.customer.id)),
  )
  const porNombre = new Map(clients.map((c) => [normaliza(c.name), c]))

  const sinMapear: string[] = []

  for (const cus of customers) {
    if (!activos.has(cus.id)) continue
    if (clients.some((c) => c.stripeCustomerId === cus.id)) continue

    const match = cus.name ? porNombre.get(normaliza(cus.name)) : undefined
    if (match) {
      console.log(
        `-- PROPUESTA: "${cus.name}" ≈ "${match.name}"\n` +
          `UPDATE clients SET stripe_customer_id = '${cus.id}' WHERE id = '${match.id}';`,
      )
    } else {
      sinMapear.push(
        `${cus.id}  ${cus.name ?? "sin nombre"}  <${cus.email ?? "sin correo"}>`,
      )
    }
  }

  console.log(`\n-- Clientes del panel sin enlazar:`)
  for (const c of clients.filter((c) => !c.stripeCustomerId)) {
    console.log(`--   ${c.id}  ${c.name}`)
  }

  if (sinMapear.length) {
    console.log(`\n-- Clientes de Stripe sin candidato (${sinMapear.length}):`)
    for (const linea of sinMapear) console.log(`--   ${linea}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Agregar el script en `package.json`**

```json
"stripe:map": "tsx scripts/stripe-map.ts",
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/stripe-map.ts
git commit -m "Agrega pnpm stripe:map para enlazar clientes con Stripe"
```

- [ ] **Step 5: Pedir la corrida a una persona**

El agente no tiene red hacia Neon ni debe decidir el mapeo. Decirle al usuario:

> Corre `pnpm stripe:map`. Imprime el SQL de los pares que encontró por correo y lista los clientes de Stripe sin candidato. Revisa los `UPDATE` antes de aplicarlos.

---

### Task 9: Documentación

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Documentar la regla de Stripe**

En `CLAUDE.md`, en "Reglas del proyecto", después del bloque **GoHighLevel**:

```markdown
**Stripe.** Toda llamada pasa por `src/lib/stripe/client.ts`, y es **solo
lectura**: el panel no cobra ni emite. Detalles verificados contra la cuenta
real (`acct_1LKAgaLSMWyOIdkA`):

- Los importes vienen en **centavos**: `539700` es $5,397.00.
- Conviven **MXN y USD**. MXN es la base del panel; USD se convierte con
  `STRIPE_FX_USD_MXN`. Sin esa variable, las facturas en USD se muestran pero
  quedan fuera de los totales. **Nunca inventes un tipo de cambio.**
- `due_date` es `null` en cobro automático. "Vencida" se deduce de
  `attempt_count > 0 && next_payment_attempt === null`.
- Los estados `void` y `uncollectible` existen y **no** cuentan como por
  cobrar.
- Los precios los creó GoHighLevel (`price.metadata.created_by =
  "LeadConnector"`), pero `location_id` ahí es el de la agencia, no el de cada
  cliente: **no sirve para mapear**. El enlace vive en
  `clients.stripe_customer_id`.
```

En la tabla de variables de entorno, agregar:

```markdown
| `STRIPE_SECRET_KEY` | Clave de Stripe. Sin ella, facturación sigue en Neon/demo |
| `STRIPE_FX_USD_MXN` | Tipo de cambio USD→MXN para normalizar los KPI |
```

En "Comandos", agregar:

```markdown
pnpm test        # vitest, pruebas del mapeador de Stripe
pnpm stripe:map  # propone enlaces cus_… ↔ cliente
```

Y en la regla de **Diseño**, junto a la de `.num`:

```markdown
- Toda cifra de dinero lleva moneda explícita: `money(cents, currency)`. Una
  cifra convertida se declara como tal al pie del instrumento.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Documenta las reglas de Stripe en el panel"
```

---

## Verificación final

- [ ] `pnpm test` — 16 pruebas del mapeador en verde
- [ ] `pnpm typecheck` — sin errores
- [ ] `pnpm lint` — sin errores
- [ ] `pnpm build` — build de producción completa
- [ ] Sin `STRIPE_SECRET_KEY`: `/facturacion` se comporta como antes del cambio
- [ ] Con la clave: folios reales, importes en MXN, `GLE-0230` anulada y fuera de "Por cobrar"
- [ ] El botón "Actualizar" trae datos frescos
- [ ] Pendiente de una persona: `pnpm db:push` y `pnpm stripe:map`
