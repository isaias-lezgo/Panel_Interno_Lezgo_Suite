import "server-only"

import { InferAgentUIMessage, ToolLoopAgent, stepCountIs } from "ai"

import { copilotTools } from "@/lib/ai/tools"

export const COPILOT_MODEL = "anthropic/claude-sonnet-5"

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
  model: COPILOT_MODEL,
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
