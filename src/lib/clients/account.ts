import type {
  BillingPeriod,
  Client,
  Currency,
  ClientAccount,
  Derived,
  Membership,
} from "@/lib/types"

/**
 * Las cuatro columnas de cuenta —membresía, periodicidad, vencimiento y
 * servicio técnico— no existen en ningún lado como dato: se deducen de lo
 * que el cliente paga en Stripe y, cuando Stripe no alcanza, de la etapa
 * del pipeline. Lo que alguien escriba a mano en la tabla manda sobre las
 * dos cosas. Puro para poder probarlo sin red.
 */

export const membershipLabel: Record<Membership, string> = {
  start: "Start",
  growth: "Growth",
  pro: "Pro",
  elite: "Elite",
}

export const periodLabel: Record<BillingPeriod, string> = {
  "1m": "1 mes",
  "3m": "3 meses",
  "6m": "6 meses",
  "1y": "1 año",
}

/** Una línea de suscripción activa de Stripe, ya aplanada. */
export type PlanLine = {
  /** Nombre del producto; el apodo del precio cuando no hay producto. */
  label: string
  /** Importe del precio en centavos, sin normalizar a mes. */
  amount: number
  currency: Currency
  /** `month`, `year`… tal cual lo nombra Stripe. */
  interval: string
  intervalCount: number
  /** Fin del periodo en curso, `YYYY-MM-DD`. */
  renewsAt: string | null
}

/**
 * Un usuario extra o un paquete de contactos no dice a qué plan pertenece
 * el cliente: "Usuario Adicional Lezgo Growth y Pro" nombra dos niveles.
 */
const ADICIONAL = /adicional/i

const NIVELES: { tier: Membership; re: RegExp }[] = [
  { tier: "start", re: /\bstart\b/i },
  { tier: "growth", re: /\bgrowth\b/i },
  { tier: "pro", re: /\bpro\b/i },
  { tier: "elite", re: /\belite\b/i },
]

/**
 * El nivel que nombra una línea, o `null` si no nombra ninguno o nombra
 * varios. `\bpro\b` y no `pro` a secas: "prueba producto nuevo" no es Pro.
 */
export function membershipOf(label: string): Membership | null {
  if (ADICIONAL.test(label)) return null
  const hits = NIVELES.filter((n) => n.re.test(label))
  return hits.length === 1 ? hits[0].tier : null
}

/** El servicio técnico se vende como producto aparte y se nombra en él. */
export function supportOf(label: string) {
  return /(servicio|soporte)\s+t[eé]cnic/i.test(label)
}

/** Solo las periodicidades que vendemos; lo demás se queda sin deducir. */
export function periodOf(interval: string, count: number): BillingPeriod | null {
  if (interval === "year" && count === 1) return "1y"
  if (interval !== "month") return null
  if (count === 1) return "1m"
  if (count === 3) return "3m"
  if (count === 6) return "6m"
  if (count === 12) return "1y"
  return null
}

/**
 * La línea que define el plan es la de mayor importe, no la primera: una
 * suscripción trae el plan y sus extras en cualquier orden.
 */
function principal(lines: PlanLine[]): PlanLine | null {
  let mejor: PlanLine | null = null
  for (const l of lines) {
    if (membershipOf(l.label) === null) continue
    if (!mejor || l.amount > mejor.amount) mejor = l
  }
  return mejor ?? [...lines].sort((a, b) => b.amount - a.amount)[0] ?? null
}

const nada = <T,>(): Derived<T> => ({ value: null, source: null })

/**
 * Resuelve las cuatro lecturas. `client` trae lo editado a mano; `lines`,
 * las suscripciones activas de todos sus `cus_` enlazados.
 */
export function resolveAccount(
  client: Pick<
    Client,
    "stage" | "supportActive" | "licenseDueAt" | "billingPeriod" | "membership"
  >,
  lines: PlanLine[],
): ClientAccount {
  const jefe = principal(lines)

  // Servicio técnico: basta con que una de las dos fuentes lo nombre. La
  // etapa "Activo con Servicio Técnico Dedicado" es una decisión de alguien
  // del equipo; que Stripe no lo cobre aparte no la desmiente. El "no" solo
  // se afirma cuando hay de dónde mirar: suscripciones activas o una etapa
  // de cliente vivo.
  let support: Derived<boolean> = nada()
  if (client.supportActive !== null) {
    support = { value: client.supportActive, source: "manual" }
  } else if (lines.some((l) => supportOf(l.label))) {
    support = { value: true, source: "stripe" }
  } else if (supportOf(client.stage)) {
    support = { value: true, source: "ghl" }
  } else if (lines.length) {
    support = { value: false, source: "stripe" }
  } else if (/activo/i.test(client.stage)) {
    support = { value: false, source: "ghl" }
  }

  const membership: Derived<Membership> = client.membership
    ? { value: client.membership, source: "manual" }
    : jefe && membershipOf(jefe.label)
      ? { value: membershipOf(jefe.label), source: "stripe" }
      : nada()

  const period: Derived<BillingPeriod> = client.billingPeriod
    ? { value: client.billingPeriod, source: "manual" }
    : jefe && periodOf(jefe.interval, jefe.intervalCount)
      ? { value: periodOf(jefe.interval, jefe.intervalCount), source: "stripe" }
      : nada()

  // La licencia vence cuando termina el primer periodo que se acaba: si el
  // cliente paga dos suscripciones, la más próxima es la que hay que cuidar.
  const renovaciones = lines
    .map((l) => l.renewsAt)
    .filter((d): d is string => Boolean(d))
    .sort()
  const licenseDueAt: Derived<string> = client.licenseDueAt
    ? { value: client.licenseDueAt, source: "manual" }
    : renovaciones.length
      ? { value: renovaciones[0], source: "stripe" }
      : nada()

  return { support, membership, period, licenseDueAt }
}
