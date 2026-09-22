/**
 * Regla de auto-enlace entre un cliente del panel y un cliente de Stripe o
 * una subcuenta de GHL. Puro y sin dependencias para poder probarlo con
 * casos reales. Lo que no cumpla exactamente queda para el desplegable.
 */

export type LinkTarget = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

export type LinkSubject = {
  id: string
  /** Empresa, contacto y nombres de oportunidades: cualquiera vale. */
  names: string[]
  email: string | null
  phone: string | null
}

const SUFFIXES =
  /\b(sa de cv|s a de c v|sapi de cv|s\.?a\.?|sapi|srl|s de rl|llc|inc)\b/g

export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

export function normalizeEmail(s: string) {
  return s.trim().toLowerCase()
}

/** Últimos 10 dígitos: así `+52 1 55…` y `+52 55…` son el mismo número. */
export function phoneKey(s: string | null | undefined) {
  if (!s) return null
  const digits = s.replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : null
}

export function matches(subject: LinkSubject, target: LinkTarget) {
  if (subject.email && target.email) {
    if (normalizeEmail(subject.email) === normalizeEmail(target.email)) {
      return true
    }
  }
  const sp = phoneKey(subject.phone)
  const tp = phoneKey(target.phone)
  if (sp && tp && sp === tp) return true

  if (target.name) {
    const tn = normalizeName(target.name)
    if (tn && subject.names.some((n) => normalizeName(n) === tn)) return true
  }
  return false
}

/**
 * Devuelve `targetId → subjectId`. Un target que cumple para más de un
 * sujeto es ambiguo y no se enlaza. En modo `one` tampoco se enlaza un sujeto
 * que empata con más de un target: una subcuenta tiene un solo dueño y un
 * cliente una sola subcuenta.
 */
export function autoLink(
  subjects: LinkSubject[],
  targets: LinkTarget[],
  cardinality: "many" | "one",
) {
  const links = new Map<string, string>()
  const perSubject = new Map<string, string[]>()

  for (const target of targets) {
    const hits = subjects.filter((s) => matches(s, target))
    if (hits.length !== 1) continue
    links.set(target.id, hits[0].id)
    perSubject.set(hits[0].id, [
      ...(perSubject.get(hits[0].id) ?? []),
      target.id,
    ])
  }

  if (cardinality === "one") {
    for (const [, targetIds] of perSubject) {
      if (targetIds.length > 1) for (const t of targetIds) links.delete(t)
    }
  }
  return links
}
