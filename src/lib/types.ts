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

export type InvoiceStatus = "paid" | "due" | "overdue" | "draft"

export type Invoice = {
  id: string
  number: string
  clientId: string
  amount: number
  status: InvoiceStatus
  issuedAt: string
  dueAt: string
  paidAt?: string
  memo: string
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
