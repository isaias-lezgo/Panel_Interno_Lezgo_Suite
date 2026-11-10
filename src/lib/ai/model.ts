import "server-only"

import { anthropic } from "@ai-sdk/anthropic"

/**
 * El modelo del panel: lo usan el copiloto y el asistente de Lezgo IA. Se
 * puede cambiar sin tocar código con COPILOT_MODEL en .env.local.
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

export const model = usingDirectAnthropic
  ? anthropic(COPILOT_MODEL.replace(/^anthropic\//, ""))
  : COPILOT_MODEL
