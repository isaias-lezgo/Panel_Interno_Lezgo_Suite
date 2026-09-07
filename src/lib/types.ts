/** Domain model for the Lezgo Suite control panel. */

export type Plan = "launch" | "scale" | "enterprise"

export type ClientStatus = "live" | "onboarding" | "at_risk" | "churned"

export type Client = {
  id: string
  name: string
  slug: string
  industry: string
  plan: Plan
  status: ClientStatus
  /** Monthly recurring revenue in USD. */
  mrr: number
  /** GoHighLevel sub-account this client maps to. */
  ghlLocationId: string
  /** Cliente de Stripe que paga esta cuenta. Se llena con `pnpm stripe:map`. */
  stripeCustomerId?: string
  /** Account manager on our side. */
  owner: string
  seats: number
  /** 0–100. Blends product usage, ticket volume and payment history. */
  health: number
  startedAt: string
  renewsAt: string
  notes?: string
}

export type ImplementationStage =
  | "scoping"
  | "building"
  | "review"
  | "launch"
  | "live"

export type ImplementationKind =
  | "snapshot"
  | "workflow"
  | "integration"
  | "migration"
  | "training"

export type Implementation = {
  id: string
  clientId: string
  name: string
  kind: ImplementationKind
  stage: ImplementationStage
  /** 0–100. */
  progress: number
  owner: string
  dueAt: string
  updatedAt: string
  blocked: boolean
  blockedReason?: string
}

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
 * ejemplo: dólares enteros, siempre ligada a un cliente. Esa tabla no se
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
  /** Id de Stripe (`in_...`) cuando la factura viene de Stripe. */
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
   * Centavos convertidos a la moneda base del panel: lo que suman los KPI.
   * `null` cuando la conversión no es posible porque falta
   * `STRIPE_FX_USD_MXN`: la factura se muestra, pero no entra en ningún
   * total. Nunca se inventa un tipo de cambio para rellenarlo.
   */
  amountBase: number | null
  status: InvoiceStatus
  issuedAt: string
  /** `null` en cobro automático, donde Stripe no fija vencimiento. */
  dueAt: string | null
  paidAt?: string
  memo: string
  /** Abre la factura real en Stripe. */
  hostedUrl?: string
}

export type ActivityKind =
  | "ghl"
  | "billing"
  | "implementation"
  | "client"
  | "ai"

export type ActivityEvent = {
  id: string
  at: string
  kind: ActivityKind
  actor: string
  summary: string
  clientId?: string
}

/** One month of revenue movement. Churn is stored positive and rendered down. */
export type RevenuePoint = {
  month: string
  recurring: number
  new: number
  expansion: number
  churn: number
}
