import "server-only"

import { anthropic } from "@ai-sdk/anthropic"
import { InferAgentUIMessage, ToolLoopAgent, stepCountIs } from "ai"

import { copilotTools } from "@/lib/ai/tools"

/**
 * Se puede cambiar sin tocar código con COPILOT_MODEL en .env.local.
 */
export const COPILOT_MODEL =
  process.env.COPILOT_MODEL ?? "anthropic/claude-sonnet-5"

/**
 * Dos caminos hacia el modelo:
 *
 * 1. Con ANTHROPIC_API_KEY se habla directo con la API de Anthropic. No pasa
 *    por el AI Gateway, así que no depende de los créditos de Vercel.
 * 2. Sin ella, se usa el AI Gateway con el identificador completo
 *    ("proveedor/modelo"). Requiere créditos comprados: los créditos gratis
 *    responden "Free tier users do not have access to this model".
 */
export const usingDirectAnthropic = Boolean(process.env.ANTHROPIC_API_KEY)

const model = usingDirectAnthropic
  ? anthropic(COPILOT_MODEL.replace(/^anthropic\//, ""))
  : COPILOT_MODEL

const instructions = `Eres el copiloto de Lezgo Suite y trabajas dentro del panel interno de la agencia.

Lezgo Suite revende GoHighLevel en marca blanca: CRM y automatización. Cada cliente corresponde a una subcuenta de GoHighLevel (una "location"). El equipo al que asistes gestiona cuentas de clientes, proyectos de implementación y facturación.

Cómo trabajas:
- Responde siempre en español, en el mismo registro directo que usa el panel.
- Lee antes de escribir. Confirma la subcuenta y el registro antes de modificar nada.
- Si la petición no deja claro a qué cliente o subcuenta apunta, pregunta en vez de suponer.
- Reporta lo que realmente hiciste, incluyendo los ids, para que la persona pueda verificarlo en GoHighLevel.
- Si una llamada a GoHighLevel falla, di qué falló y por qué. Nunca afirmes que un cambio se aplicó cuando la herramienta devolvió un error.
- Los importes están en USD. Las fechas van en la zona horaria de quien opera.
- Sé breve. Tablas para listas, frases planas para todo lo demás. Sin preámbulo.`

export const copilot = new ToolLoopAgent({
  model,
  instructions,
  tools: copilotTools,
  stopWhen: stepCountIs(12),
  /**
   * Anything destructive or outward-facing stops for a human. Reads and
   * ordinary record edits run straight through.
   */
  toolApproval: {
    deleteContact: "user-approval",
    deleteOpportunity: "user-approval",
    sendMessage: "user-approval",
  },
})

export type CopilotUIMessage = InferAgentUIMessage<typeof copilot>
