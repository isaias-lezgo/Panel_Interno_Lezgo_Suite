/** Domain model for the Lezgo Suite control panel. */

export type LinkedBy = "auto" | "manual"

/**
 * Un cliente es un contacto de la subcuenta Lezgo Suite con al menos una
 * oportunidad ganada. Los enlaces a Stripe viven en `StripeLink`; el de la
 * subcuenta de GHL, aquí mismo.
 */
export type Client = {
  /** Id del contacto en GHL. Agrupa sus oportunidades. */
  id: string
  slug: string
  /** Empresa del contacto; si no hay, el nombre del contacto. */
  name: string
  contactName: string
  email: string | null
  phone: string | null
  ghlContactId: string
  /** Subcuenta del cliente. `null` hasta que se enlaza. */
  ghlLocationId: string | null
  ghlLocationLinkedBy: LinkedBy | null
  /** Etapa de su oportunidad más reciente, tal cual la nombra el pipeline. */
  stage: string
  /** Cierre más antiguo entre sus oportunidades. */
  wonAt: string
  syncedAt: string
  /** No apareció en la última sincronización. No se borra. */
  orphaned: boolean
  notes: string | null
}

export type ClientOpportunity = {
  id: string
  clientId: string
  name: string
  /** Pesos enteros, como lo entrega GHL. */
  monetaryValue: number
  stageId: string
  stageName: string
  wonAt: string
  updatedAt: string
}

export type StripeLink = {
  stripeCustomerId: string
  clientId: string
  linkedBy: LinkedBy
  linkedAt: string
}

/**
 * Formas de vista que arma el repositorio. Viven aquí y no en
 * `repository.ts` porque ese módulo es `server-only` y los componentes
 * cliente necesitan importar los tipos.
 */
export type ClientRow = Client & {
  locationName: string | null
  stripeCount: number
  /** Centavos en la moneda base; `null` si nada se pudo convertir. */
  mrr: number | null
}

export type StripeCustomerOption = {
  id: string
  name: string
  email: string | null
  active: boolean
  mrr: number | null
}

export type LocationOption = {
  id: string
  name: string
  email: string | null
}

export type ClientDetail = {
  client: Client
  opportunities: ClientOpportunity[]
  stripe: (StripeLink & {
    name: string
    email: string | null
    active: boolean
    mrr: number | null
  })[]
  location: LocationOption | null
  mrr: number | null
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
