/**
 * Neon suspende el compute tras unos minutos sin uso y despertarlo tarda
 * alrededor de 18 segundos. El `fetch` de Node se rinde a los 10 (el
 * `connectTimeout` de undici) y el driver HTTP de Neon no reintenta, así que
 * la primera visita tras un rato de silencio tumbaba la vista entera con
 * "Error connecting to database: fetch failed".
 *
 * El intento fallido igual despierta al compute, así que el siguiente suele
 * responder en menos de un segundo. Mismo trato que ya le damos a Stripe con
 * `maxNetworkRetries`.
 */

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/**
 * Un fallo al conectar ocurre antes de que la consulta salga, así que
 * repetirla no puede duplicar nada. Un error de otra clase —o una respuesta
 * HTTP con estado de error— significa que el servidor ya recibió algo: eso
 * se propaga tal cual.
 */
function isConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false
  const texto = `${error.message} ${(error.cause as Error | undefined)?.message ?? ""}`
  return /fetch failed|connect|timeout|socket|ECONNRESET|EAI_AGAIN/i.test(texto)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function withConnectRetry(
  fetchImpl: FetchLike,
  { attempts = 3, waitMs = 400 }: { attempts?: number; waitMs?: number } = {},
): FetchLike {
  return async (input, init) => {
    let last: unknown
    for (let intento = 1; intento <= attempts; intento++) {
      try {
        return await fetchImpl(input, init)
      } catch (error) {
        if (!isConnectionError(error)) throw error
        last = error
        if (intento < attempts) await sleep(waitMs * intento)
      }
    }
    throw last
  }
}
