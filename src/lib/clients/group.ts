import { normalizeEmail, phoneKey } from "./match"

/** La oportunidad tal como la devuelve `GET /opportunities/search`, recortada. */
export type WonOpportunity = {
  id: string
  name: string
  monetaryValue: number | null
  pipelineStageId: string
  createdAt: string
  updatedAt: string
  lastStatusChangeAt: string | null
  contact: {
    id: string
    name: string | null
    companyName: string | null
    email: string | null
    phone: string | null
  } | null
}

export type ClientDraft = {
  id: string
  slug: string
  name: string
  contactName: string
  email: string | null
  phone: string | null
  ghlContactId: string
  stage: string
  wonAt: string
  opportunities: {
    id: string
    name: string
    monetaryValue: number
    stageId: string
    stageName: string
    wonAt: string
    updatedAt: string
  }[]
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const wonDate = (o: WonOpportunity) =>
  (o.lastStatusChangeAt ?? o.createdAt).slice(0, 10)

function clean(s: string | null | undefined) {
  const t = s?.trim()
  return t ? t : null
}

/**
 * Un cliente por contacto. Dos contactos distintos con el mismo correo o el
 * mismo teléfono son la misma persona registrada dos veces: se funden y el
 * cliente toma el id del contacto con la oportunidad más antigua, para que el
 * id no cambie cuando GHL cree un duplicado nuevo.
 */
export function groupWonOpportunities(
  opps: WonOpportunity[],
  stageNames: Map<string, string>,
): ClientDraft[] {
  const sorted = [...opps].sort((a, b) => wonDate(a).localeCompare(wonDate(b)))

  // Índices de fusión: contacto, correo y teléfono apuntan al grupo.
  const groups: WonOpportunity[][] = []
  const byContact = new Map<string, number>()
  const byEmail = new Map<string, number>()
  const byPhone = new Map<string, number>()

  for (const o of sorted) {
    const c = o.contact
    const email = c?.email ? normalizeEmail(c.email) : null
    const phone = phoneKey(c?.phone)
    const found =
      (c ? byContact.get(c.id) : undefined) ??
      (email ? byEmail.get(email) : undefined) ??
      (phone ? byPhone.get(phone) : undefined)

    const idx = found ?? groups.push([]) - 1
    groups[idx].push(o)
    if (c) byContact.set(c.id, idx)
    if (email) byEmail.set(email, idx)
    if (phone) byPhone.set(phone, idx)
  }

  const slugs = new Map<string, number>()
  return groups.map((members) => {
    const first = members[0]
    const latest = members.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b))
    const contact = members.map((m) => m.contact).find(Boolean) ?? null
    const company = members
      .map((m) => clean(m.contact?.companyName))
      .find(Boolean)
    const contactName = clean(contact?.name) ?? first.name
    const name = company ?? contactName

    let slug = slugify(name) || "cliente"
    const n = (slugs.get(slug) ?? 0) + 1
    slugs.set(slug, n)
    if (n > 1) slug = `${slug}-${n}`

    return {
      id: contact ? contact.id : `opp_${first.id}`,
      slug,
      name,
      contactName,
      email: clean(members.map((m) => m.contact?.email).find(Boolean)),
      phone: clean(members.map((m) => m.contact?.phone).find(Boolean)),
      ghlContactId: contact?.id ?? "",
      stage: stageNames.get(latest.pipelineStageId) ?? "Sin etapa",
      wonAt: wonDate(first),
      opportunities: members.map((m) => ({
        id: m.id,
        name: m.name,
        monetaryValue: Math.round(m.monetaryValue ?? 0),
        stageId: m.pipelineStageId,
        stageName: stageNames.get(m.pipelineStageId) ?? "Sin etapa",
        wonAt: wonDate(m),
        updatedAt: m.updatedAt,
      })),
    }
  })
}
