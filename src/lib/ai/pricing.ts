/**
 * Precio de lista de la API de Anthropic, en USD por millón de tokens, para
 * estimar lo que gasta el asistente de Lezgo IA. Tomados de la tabla de
 * modelos de Anthropic el 3 de noviembre de 2026.
 *
 * **Un modelo que no está aquí no se estima**: `usageCost` devuelve `null`
 * y el panel lo declara como "sin precio" en vez de inventar una cifra. Si
 * cambia `COPILOT_MODEL`, agrega su renglón.
 *
 * Es una estimación con precio de lista, no la factura: la cifra oficial
 * está en la consola de Anthropic.
 */
const USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-fable-5-2": { input: 8, output: 40 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
}

/** Lo leído de caché cuesta ~0.1× la entrada; lo escrito, ~1.25×. */
const CACHE_READ = 0.1
const CACHE_WRITE = 1.25

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/**
 * Costo en micro-dólares (millonésimas de USD) de una llamada. `model`
 * acepta "anthropic/claude-sonnet-5" o "claude-sonnet-5". `null` si el
 * modelo no tiene precio en la tabla.
 */
export function usageCost(model: string, usage: TokenUsage): number | null {
  const price = USD_PER_MTOK[model.replace(/^anthropic\//, "")]
  if (!price) return null
  const read = usage.cacheReadTokens ?? 0
  const write = usage.cacheWriteTokens ?? 0
  const plain = Math.max(0, usage.inputTokens - read - write)
  // USD por millón de tokens × tokens = micro-USD.
  return Math.round(
    plain * price.input +
      read * price.input * CACHE_READ +
      write * price.input * CACHE_WRITE +
      usage.outputTokens * price.output,
  )
}

export type SpendRow = { body: string }

/** Suma de los renglones `usage` de la bitácora. */
export function sumSpend(rows: SpendRow[]) {
  let microUsd = 0
  let calls = 0
  let unpriced = 0
  for (const row of rows) {
    try {
      const data = JSON.parse(row.body) as { microUsd?: number | null }
      calls++
      if (typeof data.microUsd === "number") microUsd += data.microUsd
      else unpriced++
    } catch {
      // Un renglón ilegible no suma ni cuenta.
    }
  }
  return { microUsd, calls, unpriced }
}
