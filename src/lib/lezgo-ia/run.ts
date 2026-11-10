import "server-only"

import { db, schema } from "@/db"
import { GhlError, type GhlClient, type GhlOpportunity } from "@/lib/ghl/client"
import { ghlFor } from "@/lib/ghl/for-location"
import { createPacedReader } from "@/lib/ghl/pace"
import { lezgoSuiteEnabled, sendWhatsApp } from "@/lib/ghl/lezgo-suite"
import { mapLimit } from "@/lib/map-limit"
import { getLezgoIaConfig, getLezgoIaData, getSentNotificationKeys } from "@/lib/repository"

import type { NotifyDecision } from "./config"
import type { Pass } from "./schedule"
import {
  composeMessage,
  detectAlerts,
  planDeliveries,
  splitMessage,
  type EngineOpportunity,
} from "./engine"

/**
 * Una corrida del motor sobre una subcuenta: lee sus oportunidades abiertas
 * y sus conversaciones en GHL, decide con `engine.ts` y manda un WhatsApp
 * por destinatario desde la subcuenta Lezgo Suite.
 *
 * **Todavía no le escribe a nadie real.** Con `LEZGO_IA_TEST_CONTACT_ID`,
 * cada mensaje llega a ese contacto con el destinatario de verdad en el
 * encabezado; sin ella, la corrida es simulada: decide y anota en la
 * bitácora, pero no manda nada. Mandar al teléfono de cada asesor es el
 * siguiente paso y necesita su contacto en Lezgo Suite.
 *
 * Lee de GHL y escribe solo dos cosas: los mensajes de WhatsApp y su
 * renglón en `lezgo_ia_notifications`.
 */

/** Oportunidades abiertas que se leen por corrida (páginas de 100). */
const MAX_OPPORTUNITIES = 500
/** Mensajes por corrida: en pruebas todos caen en el mismo teléfono. */
const MAX_MESSAGES = 10
/**
 * Llamadas simultáneas a GHL al leer conversaciones. El ritmo lo pone
 * `createPacedReader` (80 cada 10 s, bajo el límite de 100 de GHL); esto
 * solo acota los sockets abiertos.
 */
const CONCURRENCY = 4

export type RunSummary = {
  ok: true
  location: string
  /** Rápida: solo leads del último día. Completa: todo lo que el motor lee. */
  pass: Pass
  mode: "prueba" | "simulado"
  /** La IA de la subcuenta no está activa: no se revisó nada. */
  inactive: boolean
  opportunities: number
  /** Hay más oportunidades abiertas de las que se leyeron. */
  truncated: boolean
  alerts: number
  messages: { recipient: string; alerts: number; status: "sent" | "failed" | "simulated"; error?: string }[]
  /** Destinatarios que quedan para la siguiente corrida por el tope de mensajes. */
  postponed: number
  deferred: number
  /** Oportunidades que quedan para la siguiente corrida por el tope de 50. */
  held: number
  alreadySent: number
  skipped: Partial<Record<SkipReason, number>>
}

type SkipReason = Exclude<NotifyDecision, { send: true }>["reason"]

export type RunResult = RunSummary | { ok: false; error: string }

export async function runLezgoIa(
  locationId: string,
  options: { repeat?: boolean; pass?: Pass } = {},
): Promise<RunResult> {
  const pass = options.pass ?? "full"
  if (!db) return { ok: false, error: "Sin base de datos: el motor no corre en modo demo." }
  if (!lezgoSuiteEnabled()) {
    return { ok: false, error: "Falta GHL_LEZGO_SUITE_TOKEN: los avisos salen de esa subcuenta." }
  }

  const data = await getLezgoIaData()
  const account = data.subaccounts.find((s) => s.ghlLocationId === locationId)
  if (data.source !== "ghl" || !account) {
    return { ok: false, error: "Esa subcuenta no se pudo leer de GHL." }
  }

  const testContactId = process.env.LEZGO_IA_TEST_CONTACT_ID || null
  const config = await getLezgoIaConfig(locationId, account.timezone)
  const summary: RunSummary = {
    ok: true,
    location: account.name,
    pass,
    mode: testContactId ? "prueba" : "simulado",
    inactive: config.status !== "active",
    opportunities: 0,
    truncated: false,
    alerts: 0,
    messages: [],
    postponed: 0,
    deferred: 0,
    held: 0,
    alreadySent: 0,
    skipped: {},
  }
  // Pausada o sin configurar: ni se lee GHL.
  if (summary.inactive) return summary

  let opportunities: EngineOpportunity[]
  let totalOpen = 0
  try {
    const client = await ghlFor(locationId)
    // Un solo ritmo para toda la corrida: páginas, conversaciones y mensajes.
    const paced = createPacedReader()
    const read = await readOpportunities(
      client,
      locationId,
      paced,
      pass === "quick" ? new Date(Date.now() - DAY_MS) : null,
    )
    summary.truncated = read.truncated
    totalOpen = read.total
    opportunities = await withConversations(client, locationId, read.opportunities, paced)
  } catch (error) {
    console.error(`El motor de Lezgo IA no leyó ${locationId}`, error)
    const detail = error instanceof GhlError ? ` (${error.status}: ${error.message})` : ""
    return { ok: false, error: `GHL no devolvió las oportunidades de la subcuenta${detail}.` }
  }
  summary.opportunities = opportunities.length

  const now = new Date()
  const detected = detectAlerts({
    now,
    account: config,
    pipelines: account.pipelines,
    advisors: account.advisors,
    opportunities,
    totalOpen,
  })
  // La pasada rápida solo vio leads de un día: lo único que puede decir con
  // certeza es quién sigue sin primer contacto. El resto es de la completa.
  const alerts =
    pass === "quick" ? detected.filter((a) => a.kind === "newLeadUntouched") : detected
  summary.alerts = alerts.length

  const sentKeys = options.repeat
    ? new Set<string>()
    : await getSentNotificationKeys(locationId, alerts.map((a) => a.key))
  const plan = planDeliveries({
    alerts,
    account: config,
    advisors: account.advisors,
    at: now,
    sentKeys,
  })
  summary.deferred = plan.deferred.length
  summary.held = plan.held
  summary.alreadySent = plan.alreadySent
  for (const { reason } of plan.skipped) {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1
  }

  const runId = `run_${crypto.randomUUID()}`
  const deliveries = plan.deliveries.slice(0, MAX_MESSAGES)
  summary.postponed = plan.deliveries.length - deliveries.length

  for (const delivery of deliveries) {
    const body = composeMessage({ delivery, voice: config.voice, test: Boolean(testContactId) })
    let status: "sent" | "failed" | "simulated" = "simulated"
    let ghlMessageId: string | null = null
    let error: string | null = null
    if (testContactId) {
      try {
        // Un mensaje largo sale en partes: GoGHL rompe los que pasan de ~940
        // caracteres. Si una parte falla, el aviso queda `failed` y se
        // reintenta entero en la siguiente corrida.
        for (const part of splitMessage(body)) {
          const { messageId } = await sendWhatsApp(testContactId, part)
          ghlMessageId ??= messageId
        }
        status = "sent"
      } catch (e) {
        status = "failed"
        error = e instanceof Error ? e.message : String(e)
        console.error("Lezgo IA no mandó un aviso", e)
      }
    }

    const { recipient } = delivery
    summary.messages.push({
      recipient: recipient.role === "gerente" ? "Gerente" : recipient.name,
      alerts: delivery.alerts.length,
      status,
      ...(error ? { error } : {}),
    })
    await db.insert(schema.lezgoIaNotifications).values(
      delivery.alerts.map((alert) => ({
        id: `ln_${crypto.randomUUID()}`,
        ghlLocationId: locationId,
        runId,
        key: alert.key,
        kind: alert.kind,
        recipient: recipient.id,
        recipientName: recipient.name,
        status,
        body,
        testContactId,
        ghlMessageId,
        error,
      })),
    )
  }

  // Marca de que esta subcuenta ya tuvo su pasada: el reparto del cron la usa
  // para saber a quién le toca. Si no se puede anotar, la corrida ya salió.
  try {
    await db.insert(schema.lezgoIaNotifications).values({
      id: `ln_run_${crypto.randomUUID()}`,
      ghlLocationId: locationId,
      runId,
      key: `run:${pass}`,
      kind: "run",
      recipient: "system",
      recipientName: "Motor",
      status: "done",
      body: JSON.stringify({
        opportunities: summary.opportunities,
        alerts: summary.alerts,
        messages: summary.messages.length,
        held: summary.held,
      }),
    })
  } catch (error) {
    console.error("No se anotó la corrida del motor de Lezgo IA", error)
  }

  return summary
}

/* ----------------------------------------------------------------- lectura */

type PacedReader = ReturnType<typeof createPacedReader>

const DAY_MS = 24 * 3_600_000

/** "11-08-2026": el formato que pide `date` en la búsqueda de GHL. */
function ghlDate(at: Date) {
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(at.getUTCDate()).padStart(2, "0")
  return `${mm}-${dd}-${at.getUTCFullYear()}`
}

/**
 * Las oportunidades abiertas, de la más nueva a la más vieja (el orden por
 * defecto de GHL). Con `since`, solo las creadas desde entonces: se le pide
 * a GHL desde un día antes —su filtro es por día, sin hora ni zona— y aquí
 * se recorta al instante exacto.
 */
async function readOpportunities(
  client: GhlClient,
  locationId: string,
  paced: PacedReader,
  since: Date | null = null,
) {
  const date = since ? ghlDate(new Date(since.getTime() - DAY_MS)) : undefined
  const all: GhlOpportunity[] = []
  let cursor: { startAfter?: number; startAfterId?: string } = {}
  let total = 0
  while (all.length < MAX_OPPORTUNITIES) {
    const page = await paced(() =>
      client.searchOpportunities({
        locationId,
        status: "open",
        limit: 100,
        date,
        ...cursor,
      }),
    )
    all.push(...page.opportunities)
    total = page.meta.total
    if (!page.meta.startAfterId || page.opportunities.length === 0 || all.length >= total) break
    cursor = { startAfter: page.meta.startAfter, startAfterId: page.meta.startAfterId }
  }
  if (since) {
    const fresh = all.filter((o) => o.createdAt && Date.parse(o.createdAt) >= since.getTime())
    // En la rápida el total de GHL es el de su filtro por día, no el de la subcuenta.
    return { opportunities: fresh, total: fresh.length, truncated: total > all.length }
  }
  return { opportunities: all, total, truncated: total > all.length }
}

/**
 * Le pega a cada oportunidad la conversación de su contacto y, a los leads
 * de menos de un día, si alguien ya les escribió. Un mensaje de salida
 * cuenta como contacto venga de quien venga —asesor, bot o workflow—: GHL
 * no distingue al bot de una persona en el mensaje.
 */
async function withConversations(
  client: GhlClient,
  locationId: string,
  opportunities: GhlOpportunity[],
  paced: PacedReader,
): Promise<EngineOpportunity[]> {
  const now = Date.now()
  return mapLimit(opportunities, CONCURRENCY, async (opp) => {
    const base: EngineOpportunity = {
      id: opp.id,
      name: opp.name,
      contactName: opp.contact?.name?.trim() || opp.name,
      contactId: opp.contactId ?? null,
      pipelineId: opp.pipelineId,
      stageId: opp.pipelineStageId,
      assignedTo: opp.assignedTo || null,
      createdAt: opp.createdAt ?? new Date(now).toISOString(),
      lastStageChangeAt: opp.lastStageChangeAt ?? null,
      conversation: null,
    }
    if (!opp.contactId) return base

    const contactId = opp.contactId
    const { conversations } = await paced(() =>
      client.searchConversations({ locationId, contactId, limit: 1 }),
    )
    const conv = conversations[0]
    if (conv?.lastMessageDate && conv.lastMessageDirection) {
      base.conversation = {
        lastMessageAt: new Date(conv.lastMessageDate).toISOString(),
        lastDirection: conv.lastMessageDirection,
      }
    }

    const created = Date.parse(base.createdAt)
    if (now - created >= 24 * 3_600_000) return base
    if (!conv) {
      base.firstContactAt = null
    } else if (
      base.conversation?.lastDirection === "outbound" &&
      Date.parse(base.conversation.lastMessageAt) >= created
    ) {
      base.firstContactAt = base.conversation.lastMessageAt
    } else {
      const { messages } = await paced(() => client.listMessages(conv.id, 50))
      const first = messages.messages
        .filter(
          (m) =>
            m.direction === "outbound" &&
            !m.messageType?.startsWith("TYPE_ACTIVITY") &&
            Date.parse(m.dateAdded) >= created,
        )
        .at(-1)
      base.firstContactAt = first?.dateAdded ?? null
    }
    return base
  })
}
