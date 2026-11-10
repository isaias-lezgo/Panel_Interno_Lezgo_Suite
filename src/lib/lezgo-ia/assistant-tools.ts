import "server-only"

import { tool } from "ai"
import { z } from "zod"

import { GhlError, type GhlClient, type GhlOpportunity } from "@/lib/ghl/client"

import { cleanBody } from "./assistant"
import { elapsed } from "./engine"

/**
 * Las herramientas del asistente de Lezgo IA: lecturas del CRM de **una**
 * subcuenta, acotadas a lo que puede ver quien escribe. La subcuenta y el
 * alcance se fijan aquí, al armar las herramientas; el modelo no los elige.
 *
 * Nunca lanzan: el error de GHL vuelve como `{ ok: false, error }` para que
 * el modelo lo diga en vez de inventar.
 */
export function assistantTools(input: {
  client: GhlClient
  locationId: string
  /** Id del asesor al que se limita la lectura; `null` = todo el pipeline. */
  assignedTo: string | null
  /** "pipelineId:stageId" → nombre de la etapa. */
  stageName: Map<string, string>
  pipelineName: Map<string, string>
  advisorName: Map<string, string>
  now: Date
}) {
  const { client, locationId, assignedTo, now } = input

  const row = (o: GhlOpportunity) => {
    const since = Date.parse(o.lastStageChangeAt ?? o.createdAt ?? "")
    return {
      id: o.id,
      lead: o.contact?.name?.trim() || o.name,
      oportunidad: o.name,
      pipeline: input.pipelineName.get(o.pipelineId) ?? null,
      etapa: input.stageName.get(`${o.pipelineId}:${o.pipelineStageId}`) ?? null,
      enSuEtapaDesde: Number.isNaN(since) ? null : elapsed(now.getTime() - since),
      asesor: o.assignedTo ? (input.advisorName.get(o.assignedTo) ?? "otro usuario") : "sin asignar",
      valor: o.monetaryValue ?? null,
      creada: o.createdAt ?? null,
    }
  }

  return {
    listLeads: tool({
      description:
        "Oportunidades abiertas del CRM, las más recientes primero. Con `query` busca por nombre del lead o de la oportunidad. `total` dice cuántas hay en total aunque solo se devuelvan `limit`.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(80).optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      execute: ({ query, limit }) =>
        attempt(async () => {
          const page = await client.searchOpportunities({
            locationId,
            status: "open",
            assignedTo: assignedTo ?? undefined,
            query,
            limit: limit ?? 20,
          })
          return { total: page.meta.total, leads: page.opportunities.map(row) }
        }),
    }),

    getLead: tool({
      description:
        "Detalle de una oportunidad por su id (de listLeads): etapa, asesor, valor y los últimos mensajes de la conversación con el lead, del más reciente al más viejo.",
      inputSchema: z.object({ opportunityId: z.string().min(1).max(64) }),
      execute: ({ opportunityId }) =>
        attempt(async () => {
          const { opportunity } = await client.getOpportunity(opportunityId)
          // El id viene del modelo: se comprueba que sea de esta subcuenta y de su alcance.
          if (opportunity.locationId && opportunity.locationId !== locationId) {
            throw new Error("Esa oportunidad no es de esta subcuenta.")
          }
          if (assignedTo && opportunity.assignedTo !== assignedTo) {
            throw new Error("Esa oportunidad no está asignada a esta persona.")
          }
          const contactId = opportunity.contactId ?? opportunity.contact?.id
          let mensajes: { de: string; cuando: string; texto: string }[] = []
          if (contactId) {
            const { conversations } = await client.searchConversations({
              locationId,
              contactId,
              limit: 1,
            })
            if (conversations[0]) {
              const { messages } = await client.listMessages(conversations[0].id, 15)
              mensajes = messages.messages
                .filter((m) => !m.messageType?.startsWith("TYPE_ACTIVITY") && cleanBody(m.body))
                .map((m) => ({
                  de: m.direction === "inbound" ? "lead" : "equipo",
                  cuando: m.dateAdded,
                  texto: cleanBody(m.body).slice(0, 500),
                }))
            }
          }
          return { ...row(opportunity), estado: opportunity.status, mensajes }
        }),
    }),
  }
}

async function attempt<T>(run: () => Promise<T>) {
  try {
    return { ok: true as const, data: await run() }
  } catch (error) {
    if (error instanceof GhlError) {
      return { ok: false as const, error: `GHL respondió ${error.status}: ${error.message}` }
    }
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}
