import type { Advisor, Pipeline, Voice } from "@/data/lezgo-ia"

import {
  idleMs,
  resolveAdvisor,
  shouldNotify,
  stageRuleFor,
  type AccountConfig,
  type NotifyDecision,
} from "./config"
import { windowLabel } from "./window"

/**
 * El motor de Lezgo IA, en dos pasos sin red ni base de datos:
 *
 * 1. `detectAlerts` mira las oportunidades abiertas y las citas por venir, y
 *    decide qué amerita un aviso y para quién (el asesor asignado o "manager").
 * 2. `planDeliveries` pasa cada aviso por `shouldNotify` —IA activa, avisos
 *    del asesor, el ajuste, fuera de oficina, días y horario— y junta lo
 *    que sí sale en un mensaje por persona.
 *
 * Quién lee GHL, quién manda y quién guarda está en `run.ts`. Aquí todo es
 * determinista: mismas entradas, mismos avisos.
 */

/* ------------------------------------------------------------------ tipos */

export type EngineOpportunity = {
  id: string
  name: string
  contactName: string
  /** Dos oportunidades del mismo contacto comparten conversación. */
  contactId: string | null
  pipelineId: string
  stageId: string
  assignedTo: string | null
  createdAt: string
  lastStageChangeAt: string | null
  /** `null` = el contacto no tiene conversación en GHL. */
  conversation: {
    lastMessageAt: string
    lastDirection: "inbound" | "outbound"
    /**
     * Lo que el lead escribió y nadie ha contestado. Solo se busca cuando lo
     * último del hilo es suyo y tiene menos de un día.
     */
    reply?: LeadReply | null
  } | null
  /**
   * Primer mensaje de salida después de que entró el lead. Solo se busca en
   * leads de menos de un día; `undefined` = no se buscó.
   */
  firstContactAt?: string | null
}

/** Lo último que escribió el lead, con lo que tardó en contestarnos. */
export type LeadReply = {
  text: string
  /** Del último mensaje nuestro a su respuesta. `null` = escribió sin que le escribieran. */
  replyMs: number | null
}

/** Una cita por venir en el calendario de la subcuenta. */
export type EngineAppointment = {
  id: string
  title: string
  /** Instante de inicio, con su zona. */
  startTime: string
  /** Id de GHL del asesor que la atiende. */
  assignedTo: string | null
  leadName: string | null
  address: string | null
}

export type AlertKind =
  | "newLeadUntouched"
  | "hotLead"
  | "visitReminder"
  | "abandonedLead"
  | "suggestLost"
  | "stageIdle"
  | "dailySummary"

export type Alert = {
  /** Identifica el aviso entre corridas: lo que ya salió no se repite. */
  key: string
  kind: AlertKind
  /** El ajuste del que cuelga; `null` en las reglas por etapa. */
  settingId: string | null
  /** Id de GHL del asesor, o "manager". */
  userId: string
  line: string
  /** La oportunidad de la que habla; el resumen del día no tiene. */
  opportunityId?: string
}

/** Oportunidades de las que se avisa por corrida. Las demás, en la siguiente. */
export const MAX_FLAGGED = 50
/** Oportunidades abiertas que se leen por corrida (páginas de 100). */
export const MAX_READ = 500

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const alertKindLabel: Record<AlertKind, string> = {
  newLeadUntouched: "Lead nuevo sin primer contacto",
  hotLead: "Leads calientes",
  visitReminder: "Visitas por venir",
  abandonedLead: "Leads que dejaron de contestar",
  suggestLost: "Propuestos para perdido",
  stageIdle: "Sin movimiento en su etapa",
  dailySummary: "Resumen del día",
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** 45 min, 3 h, 6 días. */
export function elapsed(ms: number) {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MIN))} min`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h`
  const days = Math.floor(ms / DAY)
  return days === 1 ? "1 día" : `${days} días`
}

/* -------------------------------------------------------- leads calientes */

/** Un lead que contesta en menos de esto está pendiente del teléfono. */
export const FAST_REPLY_MS = 10 * MIN

const CREDIT = /\b(creditos?|infonavit|fovissste|hipotecas?|hipotecario|financiamiento|enganche|mensualidad(es)?|precalificacion)\b/
const VISIT = /\b(visita(r|rla|rlo)?|verl[ao]s?|conocerl[ao]s?|conocer (el|la|los|las)|recorrido|agendar|cita|mostrar(me)?|cuando puedo (ir|pasar|verl[ao]))\b/

/**
 * De los mensajes de una conversación (del más reciente al más viejo), lo
 * que el lead escribió al final sin que nadie le conteste. `null` si lo
 * último es nuestro. La actividad que GHL anota como mensaje no cuenta.
 */
export function leadReply(
  messages: {
    direction: "inbound" | "outbound"
    dateAdded: string
    body?: string
    messageType?: string
  }[],
): LeadReply | null {
  const real = messages.filter((m) => !m.messageType?.startsWith("TYPE_ACTIVITY"))
  const run: typeof real = []
  for (const m of real) {
    if (m.direction !== "inbound") break
    run.push(m)
  }
  if (run.length === 0) return null
  const before = real[run.length]
  const first = run[run.length - 1]
  return {
    text: [...run]
      .reverse()
      .map((m) => m.body ?? "")
      .join("\n")
      .slice(0, 1_000),
    replyMs: before ? Math.max(0, Date.parse(first.dateAdded) - Date.parse(before.dateAdded)) : null,
  }
}

/**
 * Por qué este lead está caliente: contestó rápido, pregunta por crédito o
 * pide ver la propiedad. Vacío = no hay señal. Son palabras, no un modelo:
 * mismas entradas, mismas señales, sin gastar tokens.
 */
export function hotSignals(reply: LeadReply): string[] {
  const text = reply.text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return [
    ...(reply.replyMs !== null && reply.replyMs <= FAST_REPLY_MS
      ? [`contestó en ${elapsed(reply.replyMs)}`]
      : []),
    ...(CREDIT.test(text) ? ["pregunta por crédito"] : []),
    ...(VISIT.test(text) ? ["pide visita"] : []),
  ]
}

/* -------------------------------------------------------------- detección */

/**
 * Qué amerita aviso ahora. Las reglas:
 * - **Lead nuevo sin primer contacto**: entró hace más de lo configurado y
 *   menos de un día, y nadie le ha escrito.
 * - **Lead que dejó de contestar**: el último mensaje es nuestro y lleva más
 *   de lo configurado sin respuesta. Pasado el umbral de "Sugerir mover a
 *   perdido" (si está prendido), se propone perderlo en su lugar.
 * - **Lead caliente**: lo último del hilo es del lead, tiene menos de un
 *   día y trae una señal (`hotSignals`). Se avisa una vez por mensaje.
 * - **Etapa sin movimiento**: lleva en su etapa más de lo que tolera la
 *   regla de esa etapa; la acción de la regla dice a quién y qué proponer.
 * - **Visita por venir**: una cita del calendario que empieza dentro de lo
 *   que pide "Recordatorio de visita" (1 h, 3 h o un día antes).
 * - **Resumen del día** al gerente, pasada la hora configurada.
 * Un lead sin asignar se le avisa al gerente. Un contacto con dos
 * oportunidades tiene una sola conversación: lo que sale de ella —lead
 * nuevo, sin contestar, perdido— se dice una vez, no una por oportunidad.
 */
export function detectAlerts(input: {
  now: Date
  account: AccountConfig
  pipelines: Pipeline[]
  advisors: Advisor[]
  opportunities: EngineOpportunity[]
  /** Abiertas en GHL, si son más de las que se leyeron. */
  totalOpen?: number
  /** Días del periodo vigilado; `null` o nada = se leyó sin límite de edad. */
  watchDays?: number | null
  /** Las citas por venir. Sin esto no hay recordatorios ni se cuentan en el resumen. */
  appointments?: EngineAppointment[]
}): Alert[] {
  const { now, account, pipelines, opportunities } = input
  const told = new Set<string>()
  const advisorName = new Map(input.advisors.map((a) => [a.id, a.name]))
  const at = now.getTime()
  const stageName = new Map(
    pipelines.flatMap((p) =>
      p.stages.filter((s) => s.id).map((s) => [`${p.id}:${s.id}`, s.stage] as const),
    ),
  )
  const alerts: Alert[] = []

  for (const opp of opportunities) {
    const owner = opp.assignedTo ?? "manager"
    const who = opp.assignedTo ? opp.contactName : `${opp.contactName} (sin asignar)`
    const settings = resolveAdvisor(account, owner).settings
    const option = (id: string, fallback: number) =>
      Number(settings[id]?.option ?? fallback) || fallback
    /** Verdadero la primera vez que este contacto da este aviso a esta persona. */
    const once = (topic: string) => {
      const key = `${topic}:${opp.contactId ?? opp.id}:${owner}`
      if (told.has(key)) return false
      told.add(key)
      return true
    }

    // Lead nuevo sin primer contacto.
    const age = at - Date.parse(opp.createdAt)
    if (
      opp.firstContactAt === null &&
      age >= option("newLeadUntouched", 30) * MIN &&
      age < DAY &&
      once("new")
    ) {
      alerts.push({
        key: `new:${opp.id}`,
        kind: "newLeadUntouched",
        settingId: "newLeadUntouched",
        userId: owner,
        line: `${who}: entró hace ${elapsed(age)}`,
        opportunityId: opp.id,
      })
    }

    // Lead que dejó de contestar, o propuesta de perdido.
    const conv = opp.conversation
    if (conv?.lastDirection === "outbound") {
      const silence = at - Date.parse(conv.lastMessageAt)
      const lost =
        settings.suggestLost?.enabled === true && silence >= option("suggestLost", 7) * DAY
      const abandoned = !lost && silence >= option("abandonedLead", 48) * HOUR
      // El encabezado del bloque ya dice qué se propone: el renglón no lo repite.
      if ((lost || abandoned) && once("silence")) {
        alerts.push({
          key: `${lost ? "lost" : "abandoned"}:${opp.id}:${conv.lastMessageAt}`,
          kind: lost ? "suggestLost" : "abandonedLead",
          settingId: lost ? "suggestLost" : "abandonedLead",
          userId: owner,
          line: `${who}: ${elapsed(silence)} sin contestar`,
          opportunityId: opp.id,
        })
      }
    }

    // Lead caliente: escribió hace poco, nadie le contesta y hay señal.
    if (conv?.lastDirection === "inbound" && conv.reply) {
      const waiting = at - Date.parse(conv.lastMessageAt)
      const signals = hotSignals(conv.reply)
      if (waiting < DAY && signals.length > 0 && once("hot")) {
        alerts.push({
          key: `hot:${opp.id}:${conv.lastMessageAt}`,
          kind: "hotLead",
          settingId: "hotLeads",
          userId: owner,
          line: `${who}: ${signals.join(", ")}. Espera respuesta hace ${elapsed(waiting)}`,
          opportunityId: opp.id,
        })
      }
    }

    // Etapa sin movimiento.
    const rule = stageRuleFor(account, opp.pipelineId, opp.stageId)
    const tolerance = idleMs(rule.idle)
    const since = opp.lastStageChangeAt ?? opp.createdAt
    const still = at - Date.parse(since)
    if (tolerance !== null && still >= tolerance) {
      const stage = stageName.get(`${opp.pipelineId}:${opp.stageId}`) ?? "su etapa"
      const base = `${who}: ${elapsed(still)} en ${stage}`
      const line =
        rule.action === "manager"
          ? `${base}. Asesor: ${opp.assignedTo ? (advisorName.get(opp.assignedTo) ?? "otro usuario") : "nadie"}`
          : rule.action === "task"
          ? `${base}. Agenda una tarea de seguimiento.`
          : rule.action === "lost"
            ? `${base}. ¿Lo pasamos a perdido?`
            : base
      alerts.push({
        key: `stage:${opp.id}:${opp.stageId}:${since}`,
        kind: "stageIdle",
        settingId: null,
        userId: rule.action === "manager" ? "manager" : owner,
        line,
        opportunityId: opp.id,
      })
    }
  }

  // Visitas por venir.
  const today = localTime(now, account.timezone).date
  const tomorrow = localTime(new Date(at + DAY), account.timezone).date
  for (const visit of input.appointments ?? []) {
    const owner = visit.assignedTo ?? "manager"
    const ahead = idleMs(resolveAdvisor(account, owner).settings.appointmentReminder?.option ?? "3h")
    const until = Date.parse(visit.startTime) - at
    if (ahead === null || Number.isNaN(until) || until <= 0 || until > ahead) continue
    const local = localTime(new Date(visit.startTime), account.timezone)
    const day =
      local.date === today
        ? "Hoy"
        : local.date === tomorrow
          ? "Mañana"
          : `${local.date.slice(8)}/${local.date.slice(5, 7)}`
    const title = visit.title.trim() || "Cita"
    // El título de una cita de GHL suele traer ya el nombre del lead.
    const leadName =
      visit.leadName && !title.toLowerCase().includes(visit.leadName.toLowerCase())
        ? visit.leadName
        : null
    const where = visit.address?.trim().slice(0, 80) || null
    alerts.push({
      key: `visit:${visit.id}:${visit.startTime}`,
      kind: "visitReminder",
      settingId: "appointmentReminder",
      userId: owner,
      line: [`${day} ${local.time}`, title, leadName, where, visit.assignedTo ? null : "sin asignar"]
        .filter(Boolean)
        .join(" · "),
    })
  }

  const summary = dailySummary({
    now,
    account,
    opportunities,
    alerts,
    totalOpen: input.totalOpen,
    watchDays: input.watchDays,
    visitsToday: input.appointments?.filter(
      (v) => localTime(new Date(v.startTime), account.timezone).date === today,
    ).length,
  })
  if (summary) alerts.push(summary)
  return alerts
}

/** Hora y fecha locales de la subcuenta, como "09:30" y "2026-10-18". */
function localTime(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  }
}

function dailySummary(input: {
  now: Date
  account: AccountConfig
  opportunities: EngineOpportunity[]
  alerts: Alert[]
  totalOpen?: number
  watchDays?: number | null
  /** Citas que faltan hoy; `undefined` = no se leyó el calendario. */
  visitsToday?: number
}): Alert | null {
  const { now, account, opportunities, alerts } = input
  const setting = resolveAdvisor(account, "manager").settings.dailySummary
  const local = localTime(now, account.timezone)
  if (!setting?.enabled || local.time < (setting.option ?? "09:00")) return null

  const at = now.getTime()
  const fresh = opportunities.filter((o) => at - Date.parse(o.createdAt) < DAY).length
  const count = (kind: AlertKind) => alerts.filter((a) => a.kind === kind).length
  const read = opportunities.length
  const total = Math.max(input.totalOpen ?? read, read)
  // Si lo que quedó fuera es más viejo que el periodo vigilado, se dice así;
  // si ni el periodo cupo en la corrida, "revisé" a secas.
  const allOfWindow =
    input.watchDays != null &&
    opportunities.every((o) => at - Date.parse(o.createdAt) <= input.watchDays! * DAY) &&
    read < MAX_READ
  const open =
    total > read
      ? allOfWindow
        ? `${total} oportunidades abiertas; vigilo ${read === 1 ? "la" : `las ${read}`} de ${windowLabel(input.watchDays!)}`
        : `${total} oportunidades abiertas; revisé ${read}`
      : plural(read, "oportunidad abierta", "oportunidades abiertas")
  // Avisos que nadie recibe porque su asesor tiene los avisos apagados.
  const muted = alerts.filter(
    (a) => a.userId !== "manager" && !resolveAdvisor(account, a.userId).alerts,
  ).length
  const lines = [
    `${open}, ${plural(fresh, "nueva", "nuevas")} en las últimas 24 h`,
    plural(count("newLeadUntouched"), "lead nuevo", "leads nuevos") + " sin primer contacto",
    ...(count("hotLead") > 0
      ? [plural(count("hotLead"), "lead caliente", "leads calientes") + " esperando respuesta"]
      : []),
    plural(count("abandonedLead") + count("suggestLost"), "lead", "leads") + " sin contestar",
    plural(count("stageIdle"), "oportunidad", "oportunidades") + " sin movimiento en su etapa",
    ...(input.visitsToday === undefined
      ? []
      : [plural(input.visitsToday, "visita", "visitas") + " por venir hoy"]),
    ...(muted > 0
      ? [
          plural(muted, "aviso no sale: es", "avisos no salen: son") +
            " de asesores con los avisos apagados",
        ]
      : []),
  ]
  return {
    key: `summary:${local.date}`,
    kind: "dailySummary",
    settingId: "dailySummary",
    userId: "manager",
    line: lines.join("\n"),
  }
}

/* ---------------------------------------------------------------- entrega */

export type Recipient = {
  /** Id de GHL, o "manager". */
  id: string
  name: string
  role: "asesor" | "admin" | "gerente"
  /** Para "manager": los admins de la subcuenta. */
  members: string[]
}

export type Delivery = {
  recipient: Recipient
  alerts: Alert[]
  /** Oportunidades suyas que no entraron por el tope de la corrida. */
  more: number
}

export type DeliveryPlan = {
  deliveries: Delivery[]
  /** Fuera de horario o día no laborable: se vuelven a intentar en la siguiente corrida. */
  deferred: Alert[]
  /** Descartados, con su razón. */
  skipped: { alert: Alert; reason: Exclude<NotifyDecision, { send: true }>["reason"] }[]
  /** Ya salieron en una corrida anterior. */
  alreadySent: number
  /** Oportunidades que quedan para la siguiente corrida por el tope. */
  held: number
}

/**
 * Pasa cada aviso por `shouldNotify` y junta los que salen por destinatario.
 * "manager" son los admins de la subcuenta; sin admins, no hay a quién.
 *
 * Una corrida avisa de `maxOpportunities` oportunidades a lo sumo, lo más
 * urgente primero. Las demás no se mandan ni se anotan: como no quedan
 * `sent`, entran solas en la siguiente corrida.
 */
export function planDeliveries(input: {
  alerts: Alert[]
  account: AccountConfig
  advisors: Advisor[]
  at: Date
  sentKeys: Set<string>
  maxOpportunities?: number
}): DeliveryPlan {
  const max = input.maxOpportunities ?? MAX_FLAGGED
  const { account, advisors, at, sentKeys } = input
  const byId = new Map(advisors.map((a) => [a.id, a]))
  const admins = advisors.filter((a) => a.role === "admin")
  const plan: DeliveryPlan = { deliveries: [], deferred: [], skipped: [], alreadySent: 0, held: 0 }
  const grouped = new Map<string, Delivery>()
  const flagged = new Set<string>()
  const held = new Map<string, Set<string>>()
  // Por urgencia: si no cabe todo, lo que se queda fuera es lo que más aguanta.
  const byUrgency = [...input.alerts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))

  for (const alert of byUrgency) {
    if (sentKeys.has(alert.key)) {
      plan.alreadySent++
      continue
    }
    const decision = shouldNotify({
      account,
      userId: alert.userId,
      settingId: alert.settingId,
      at,
    })
    if (!decision.send) {
      if (decision.deferred) plan.deferred.push(alert)
      else plan.skipped.push({ alert, reason: decision.reason })
      continue
    }

    const recipient = recipientFor(decision.to, byId, admins)
    if (!recipient) {
      plan.skipped.push({ alert, reason: "sin-gerente" })
      continue
    }
    const oppId = alert.opportunityId
    if (oppId && !flagged.has(oppId)) {
      if (flagged.size >= max) {
        const mine = held.get(recipient.id) ?? new Set<string>()
        mine.add(oppId)
        held.set(recipient.id, mine)
        continue
      }
      flagged.add(oppId)
    }
    const delivery = grouped.get(recipient.id) ?? { recipient, alerts: [], more: 0 }
    delivery.alerts.push(alert)
    grouped.set(recipient.id, delivery)
  }

  plan.deliveries = [...grouped.values()].map((d) => ({
    ...d,
    more: held.get(d.recipient.id)?.size ?? 0,
  }))
  plan.held = new Set([...held.values()].flatMap((ids) => [...ids])).size
  return plan
}

function recipientFor(
  id: string,
  byId: Map<string, Advisor>,
  admins: Advisor[],
): Recipient | null {
  if (id === "manager") {
    if (admins.length === 0) return null
    return {
      id,
      name: "Gerente",
      role: "gerente",
      members: admins.map((a) => a.name),
    }
  }
  const advisor = byId.get(id)
  return {
    id,
    name: advisor?.name ?? id,
    role: advisor?.role === "admin" ? "admin" : "asesor",
    members: [],
  }
}

/* ----------------------------------------------------------------- mensaje */

const order: AlertKind[] = [
  "dailySummary",
  "visitReminder",
  "newLeadUntouched",
  "hotLead",
  "stageIdle",
  "abandonedLead",
  "suggestLost",
]

/**
 * El WhatsApp de un destinatario: un saludo y un bloque por tipo de aviso.
 * En modo prueba arranca con a quién iba de verdad, porque todos llegan al
 * mismo número. Lleva todos sus renglones —el tope de la corrida ya los
 * acota— porque cada aviso que viaja queda anotado como enviado. Si el tope
 * dejó oportunidades suyas fuera, lo dice al final.
 */
export function composeMessage(input: {
  delivery: Delivery
  voice: Voice | null
  test: boolean
}): string {
  const { delivery, voice, test } = input
  const { recipient } = delivery
  const parts: string[] = []

  if (test) {
    const who =
      recipient.role === "gerente"
        ? `Gerente (${recipient.members.join(", ")})`
        : `${recipient.name} · ${recipient.role}`
    parts.push(`[Prueba → ${who}]`)
  }

  const first = recipient.role === "gerente" ? "" : ` ${recipient.name.split(" ")[0]}`
  const agent = voice?.agentName ? `, soy ${voice.agentName}` : ""
  const lead = voice?.formality === "usted" ? "Le dejo lo pendiente:" : "Te dejo lo pendiente:"
  parts.push(`Hola${first}${agent}. ${lead}`)

  for (const kind of order) {
    const lines = delivery.alerts.filter((a) => a.kind === kind).map((a) => a.line)
    if (lines.length === 0) continue
    const shown = lines.map((l) => (kind === "dailySummary" ? l : `• ${l}`))
    const count = kind === "dailySummary" ? "" : ` (${lines.length})`
    parts.push(`*${alertKindLabel[kind]}*${count}\n${shown.join("\n")}`)
  }

  if (delivery.more > 0) {
    const mine = new Set(delivery.alerts.flatMap((a) => a.opportunityId ?? [])).size
    const these = mine === 1 ? "esta" : `estas ${mine}`
    const rest =
      delivery.more === 1
        ? "Hay 1 oportunidad más que necesita atención."
        : `Hay ${delivery.more} oportunidades más que necesitan atención.`
    const ask =
      voice?.formality === "usted"
        ? `Arregle ${these} primero y luego le ayudo con el resto.`
        : `Arregla ${these} primero y luego te ayudo con el resto.`
    parts.push(`${rest} ${ask}`)
  }

  return parts.join("\n\n")
}

/**
 * El mismo mensaje, para correo: el formato de WhatsApp (*negritas*, saltos
 * de línea) pasado a HTML, con todo lo demás escapado.
 */
export function emailHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${escaped
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")}</div>`
}

/**
 * Caracteres por WhatsApp. Un mensaje de 1,044 llegó completo a GHL y roto
 * al teléfono: GoGHL lo cortó cerca del 940 y pegó la cola de otro renglón.
 * El límite del proveedor no está documentado; 700 deja margen.
 */
export const MAX_MESSAGE_CHARS = 700

/**
 * Parte un mensaje largo en varios que caben en un WhatsApp. Corta entre
 * bloques (línea en blanco) y, si un bloque solo no cabe, entre renglones;
 * nunca a media frase, salvo un renglón que por sí solo se pase.
 */
export function splitMessage(text: string, max = MAX_MESSAGE_CHARS): string[] {
  if (text.length <= max) return [text]

  // Piezas con el separador que las une a la anterior.
  const pieces: { sep: string; text: string }[] = []
  for (const block of text.split("\n\n")) {
    if (block.length <= max) {
      pieces.push({ sep: "\n\n", text: block })
      continue
    }
    block.split("\n").forEach((line, i) => {
      for (let at = 0; at < line.length || at === 0; at += max) {
        pieces.push({ sep: i === 0 && at === 0 ? "\n\n" : "\n", text: line.slice(at, at + max) })
      }
    })
  }

  const parts: string[] = []
  let current = ""
  for (const piece of pieces) {
    if (current && current.length + piece.sep.length + piece.text.length > max) {
      parts.push(current)
      current = piece.text
    } else {
      current = current ? current + piece.sep + piece.text : piece.text
    }
  }
  if (current) parts.push(current)
  return parts
}
