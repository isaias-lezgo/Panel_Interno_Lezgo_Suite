import "server-only"

import { ToolLoopAgent, stepCountIs } from "ai"
import { eq } from "drizzle-orm"

import { model } from "@/lib/ai/model"
import { db, schema } from "@/db"
import { ghlFor } from "@/lib/ghl/for-location"
import { lezgoSuite, lezgoSuiteEnabled, sendWhatsApp } from "@/lib/ghl/lezgo-suite"
import { getLastNotificationTo, getLezgoIaConfig, getLezgoIaData } from "@/lib/repository"

import { assistantInstructions, leadScope, pendingQuestion, transcript } from "./assistant"
import { assistantTools } from "./assistant-tools"
import { resolveAdvisor } from "./config"
import { splitMessage } from "./engine"

/**
 * El asistente de Lezgo IA contesta lo que un asesor escribe por WhatsApp.
 * Llega aquí desde el webhook de mensajes entrantes de la subcuenta Lezgo
 * Suite (`/api/lezgo-ia/entrada`).
 *
 * **Solo contesta al contacto de pruebas** (`LEZGO_IA_TEST_CONTACT_ID`). Ese
 * número hace de la última persona a la que el motor le escribió: su
 * subcuenta, su rol y su alcance salen del último aviso en la bitácora. Al
 * 442 931 5445 también le escriben clientes y el equipo; a nadie más se le
 * contesta.
 *
 * Del webhook solo se usa el id del contacto: la pregunta se lee de la
 * conversación en GHL, no del cuerpo de la petición.
 *
 * Lee GHL y escribe dos cosas: la respuesta por WhatsApp y dos renglones en
 * `lezgo_ia_notifications` (`question` y `reply`). El renglón de la
 * pregunta lleva el id del mensaje como llave primaria: si GHL repite el
 * webhook, el segundo intento no contesta.
 */

/** Una pregunta más vieja que esto no se contesta: es un webhook repetido o tardío. */
const MAX_AGE_MS = 15 * 60_000
/** Pasos del modelo: buscar, abrir uno o dos leads y contestar. */
const MAX_STEPS = 8

export type ReplyResult =
  | {
      ok: true
      status: "sent" | "failed" | "simulated"
      location: string
      to: string
      question: string
      answer: string
      error?: string
    }
  | { ok: false; ignored: string }

const ignored = (reason: string): ReplyResult => ({ ok: false, ignored: reason })

export async function answerInbound(
  contactId: string,
  options: { simulate?: boolean } = {},
): Promise<ReplyResult> {
  const simulate = options.simulate === true
  const testContactId = process.env.LEZGO_IA_TEST_CONTACT_ID || null
  if (!db) return ignored("Sin base de datos.")
  if (!lezgoSuiteEnabled()) return ignored("Falta GHL_LEZGO_SUITE_TOKEN.")
  if (!testContactId || contactId !== testContactId) {
    return ignored("No es el contacto de pruebas: por ahora no se le contesta a nadie más.")
  }

  // A quién representa el número de pruebas: el último aviso que recibió.
  const last = await getLastNotificationTo(contactId)
  if (!last) return ignored("El motor nunca le ha escrito a este contacto.")
  const locationId = last.ghlLocationId

  const { conversations } = await lezgoSuite.searchConversations({ contactId, limit: 1 })
  if (!conversations[0]) return ignored("El contacto no tiene conversación.")
  const { messages } = await lezgoSuite.listMessages(conversations[0].id, 30)
  const question = pendingQuestion(messages.messages)
  if (!question) return ignored("Lo último del hilo es nuestro: no hay nada que contestar.")
  if (!simulate && Date.now() - Date.parse(question.at) > MAX_AGE_MS) {
    return ignored("El mensaje tiene más de 15 minutos.")
  }

  const data = await getLezgoIaData()
  const account = data.subaccounts.find((s) => s.ghlLocationId === locationId)
  if (data.source !== "ghl" || !account) return ignored("La subcuenta no se pudo leer de GHL.")
  const config = await getLezgoIaConfig(locationId, account.timezone)
  if (config.status !== "active") return ignored("La IA de la subcuenta no está activa.")
  const settings = resolveAdvisor(config, last.recipient).settings
  if (!settings.crmQuestions?.enabled) {
    return ignored('"Responder preguntas del asesor" está apagado.')
  }

  // Aparta la pregunta antes de gastar en el modelo: un webhook repetido se detiene aquí.
  const claimId = `ln_in_${question.id}`
  const runId = `reply_${question.id}`
  const common = {
    ghlLocationId: locationId,
    runId,
    recipient: last.recipient,
    recipientName: last.recipientName,
    testContactId,
  }
  if (!simulate) {
    const claimed = await db
      .insert(schema.lezgoIaNotifications)
      .values({
        ...common,
        id: claimId,
        key: `in:${question.id}`,
        kind: "question",
        status: "received",
        body: question.text,
      })
      .onConflictDoNothing()
      .returning({ id: schema.lezgoIaNotifications.id })
    if (claimed.length === 0) return ignored("Esa pregunta ya se contestó.")
  }

  const advisor = account.advisors.find((a) => a.id === last.recipient) ?? null
  const scope = leadScope({
    recipient: last.recipient,
    role: advisor?.role ?? null,
    crmScope: settings.crmScope?.option,
  })
  const now = new Date()

  let answer: string
  try {
    const agent = new ToolLoopAgent({
      model,
      instructions: assistantInstructions({
        voice: config.voice ?? account.voice,
        subaccount: account.name,
        name: last.recipientName,
        isManager: last.recipient === "manager",
        ownOnly: scope.assignedTo !== null,
        now: now.toLocaleString("es-MX", {
          timeZone: config.timezone,
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
        transcript: transcript(messages.messages, question.count),
      }),
      tools: assistantTools({
        client: await ghlFor(locationId),
        locationId,
        assignedTo: scope.assignedTo,
        stageName: new Map(
          account.pipelines.flatMap((p) =>
            p.stages.filter((s) => s.id).map((s) => [`${p.id}:${s.id}`, s.stage] as const),
          ),
        ),
        pipelineName: new Map(account.pipelines.map((p) => [p.id, p.name])),
        advisorName: new Map(account.advisors.map((a) => [a.id, a.name])),
        now,
      }),
      stopWhen: stepCountIs(MAX_STEPS),
    })
    answer = (await agent.generate({ prompt: question.prompt })).text.trim()
    if (!answer) throw new Error("El modelo no devolvió texto.")
  } catch (error) {
    // Sin respuesta no se mandó nada: se suelta la pregunta para poder reintentar.
    console.error("El asistente de Lezgo IA no contestó", error)
    if (!simulate) {
      await db.delete(schema.lezgoIaNotifications).where(eq(schema.lezgoIaNotifications.id, claimId))
    }
    return ignored(`El modelo falló: ${error instanceof Error ? error.message : String(error)}`)
  }

  let status: "sent" | "failed" | "simulated" = "simulated"
  let ghlMessageId: string | null = null
  let failure: string | null = null
  if (!simulate) {
    try {
      for (const part of splitMessage(answer)) {
        const { messageId } = await sendWhatsApp(contactId, part)
        ghlMessageId ??= messageId
      }
      status = "sent"
    } catch (error) {
      status = "failed"
      failure = error instanceof Error ? error.message : String(error)
      console.error("Lezgo IA no mandó su respuesta", error)
    }
    await db.insert(schema.lezgoIaNotifications).values({
      ...common,
      id: `ln_out_${question.id}`,
      key: `out:${question.id}`,
      kind: "reply",
      status,
      body: answer,
      ghlMessageId,
      error: failure,
    })
  }

  return {
    ok: true,
    status,
    location: account.name,
    to: last.recipientName,
    question: question.text,
    answer,
    ...(failure ? { error: failure } : {}),
  }
}
