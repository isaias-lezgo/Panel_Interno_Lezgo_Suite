import type { LinkedBy, SubscriptionStatus } from "@/lib/types"

/**
 * El cliente del panel se representa en Stripe por sus suscripciones. Este
 * módulo decide, sin red, a quién pertenece cada cobro y qué suscripción
 * nueva sigue sola a su dueño. Puro para poder probarlo.
 */

type Link = {
  stripeSubscriptionId: string
  stripeCustomerId: string
  clientId: string
  linkedBy: LinkedBy
}

export const statusLabel: Record<SubscriptionStatus, string> = {
  active: "Activa",
  trialing: "En prueba",
  past_due: "Cobro fallido",
  unpaid: "Sin pagar",
  paused: "En pausa",
  canceled: "Cancelada",
  incomplete: "Incompleta",
  incomplete_expired: "Expirada",
}

export const statusTone: Record<
  SubscriptionStatus,
  "live" | "build" | "warn" | "risk" | "idle"
> = {
  active: "live",
  trialing: "build",
  past_due: "risk",
  unpaid: "risk",
  paused: "warn",
  canceled: "idle",
  incomplete: "warn",
  incomplete_expired: "idle",
}

/** Las que siguen siendo cartera: se cobran o se van a cobrar. */
export function isLive(status: SubscriptionStatus) {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "unpaid" ||
    status === "paused"
  )
}

/**
 * A quién pertenece un cobro, en este orden:
 *
 * 1. Su suscripción, si trae.
 * 2. Su `cus_`, si alguien lo enlazó a mano como cuenta de cobro sin
 *    suscripción: recargas de wallet y SPEI suelen salir de un `cus_`
 *    distinto al que paga la suscripción.
 * 3. Su `cus_`, cuando todas las suscripciones enlazadas de ese `cus_` son
 *    del mismo cliente. Un `cus_` que paga las de dos clientes no se adivina.
 */
export function attribution(
  links: Link[],
  customerLinks: { stripeCustomerId: string; clientId: string; linkedBy: LinkedBy }[] = [],
) {
  const bySubscription = new Map<string, string>()
  const owners = new Map<string, Set<string>>()
  for (const l of links) {
    if (l.linkedBy === "excluded") continue
    bySubscription.set(l.stripeSubscriptionId, l.clientId)
    const set = owners.get(l.stripeCustomerId) ?? new Set()
    set.add(l.clientId)
    owners.set(l.stripeCustomerId, set)
  }
  const byCustomer = new Map<string, string>()
  for (const [cus, set] of owners) {
    if (set.size === 1) byCustomer.set(cus, [...set][0])
  }
  const explicit = new Map<string, string>()
  for (const l of customerLinks) {
    if (l.linkedBy !== "excluded") explicit.set(l.stripeCustomerId, l.clientId)
  }

  return {
    bySubscription,
    byCustomer,
    clientFor(subscriptionId: string | null, customerId: string | null) {
      if (subscriptionId) {
        const owner = bySubscription.get(subscriptionId)
        if (owner) return owner
      }
      if (!customerId) return null
      return explicit.get(customerId) ?? byCustomer.get(customerId) ?? null
    },
  }
}

/**
 * Suscripciones sin fila cuyo `cus_` ya es de un solo cliente: una
 * renovación con plan nuevo o un extra contratado después siguen a su dueño
 * sin esperar a que coincida el nombre. Devuelve `subscriptionId → clientId`.
 */
export function followCustomer(
  links: Link[],
  subscriptions: { id: string; customerId: string }[],
) {
  const conFila = new Set(links.map((l) => l.stripeSubscriptionId))
  const { byCustomer } = attribution(links)
  const out = new Map<string, string>()
  for (const s of subscriptions) {
    if (conFila.has(s.id)) continue
    const owner = byCustomer.get(s.customerId)
    if (owner) out.set(s.id, owner)
  }
  return out
}
