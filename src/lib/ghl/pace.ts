/**
 * Lecturas a GHL con ritmo. GHL corta en 100 llamadas cada 10 s por app y
 * subcuenta, y responde 429 al pasarse. El motor de Lezgo IA lee una
 * conversación por oportunidad: con un tope de llamadas simultáneas y sin
 * ritmo, una subcuenta con cientos de oportunidades rebasa el límite en
 * segundos y la corrida entera muere.
 *
 * `read` espera su turno —una llamada cada `intervalMs`— y, si aun así
 * llega un 429, espera y reintenta. **Solo para lecturas**: reintentar un
 * envío puede duplicarlo.
 */
export function createPacedReader(options: {
  /** Separación entre llamadas. 125 ms son 80 cada 10 s. */
  intervalMs?: number
  /** Cuánto esperar antes de cada reintento tras un 429. */
  retryWaitsMs?: number[]
  sleep?: (ms: number) => Promise<void>
  now?: () => number
} = {}) {
  const intervalMs = options.intervalMs ?? 125
  const waits = options.retryWaitsMs ?? [3_000, 6_000, 10_000]
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = options.now ?? Date.now
  let nextSlot = 0

  async function turn() {
    const at = Math.max(now(), nextSlot)
    nextSlot = at + intervalMs
    const wait = at - now()
    if (wait > 0) await sleep(wait)
  }

  return async function read<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await turn()
      try {
        return await call()
      } catch (error) {
        // Por forma y no por clase: `client.ts` es solo de servidor.
        const limited = (error as { status?: unknown } | null)?.status === 429
        if (!limited || attempt >= waits.length) throw error
        await sleep(waits[attempt])
      }
    }
  }
}
