/** Domain model for the Lezgo Suite control panel. */

/**
 * `excluded` es un enlace que alguien quitó a mano: la fila se queda para
 * que la siguiente sincronización no vuelva a proponerlo sola.
 */
export type LinkedBy = "auto" | "manual" | "excluded"

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
  /** Centavos en la moneda base; `null` si no hay nada que sumar. */
  mrr: number | null
  /** Suscripciones activas que no se pudieron convertir a la moneda base. */
  unconvertedSubs: number
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

/** Contacto de la subcuenta Lezgo Suite, tal como se guardó al ligarlo. */
export type ImplementationContact = {
  id: string
  name: string
  email: string | null
  phone: string | null
}

/** La fila de `implementations` y de los datos de ejemplo. */
export type ImplementationRow = {
  id: string
  /** Cliente del panel, si alguno de los contactos lo es. */
  clientId: string | null
  ghlLocationId?: string | null
  /** Nombre de la subcuenta al crearla; GHL no se consulta para pintarla. */
  ghlLocationName?: string | null
  name: string
  /** `null` hasta que se define en un paso posterior. */
  kind: ImplementationKind | null
  stage: ImplementationStage
  /** 0–100. */
  progress: number
  owner: string | null
  dueAt: string | null
  updatedAt: string
  /** ISO con zona. En los datos de ejemplo no existe. */
  createdAt?: string
  blocked: boolean
  blockedReason?: string | null
}

export type ChecklistItem = {
  id: string
  /** `null` en un punto principal; el id del padre en un sub-punto. */
  parentId: string | null
  label: string
  done: boolean
  position: number
}

export type Implementation = ImplementationRow & {
  contacts: ImplementationContact[]
  /** Ordenado: cada punto principal seguido de sus sub-puntos. */
  checklist: ChecklistItem[]
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

