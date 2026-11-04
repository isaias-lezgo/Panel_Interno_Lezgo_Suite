/**
 * `Promise.all(items.map(run))` con un tope de llamadas simultáneas. Los
 * resultados salen en el orden de `items`. El primer error rechaza todo y
 * detiene lo que faltaba por lanzar.
 *
 * El `fetch` de Node no limita las conexiones por host: cada llamada sin un
 * socket libre abre uno nuevo. Con cientos a la vez, conectar tarda más de los
 * 250 ms que Node le da a cada dirección, salta a la siguiente y puede acabar
 * en una IPv6 sin ruta, donde espera hasta morir a los 10 s
 * (`UND_ERR_CONNECT_TIMEOUT`). Con tope, los sockets se reutilizan.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      try {
        out[i] = await run(items[i])
      } catch (error) {
        next = items.length
        throw error
      }
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Un tope compartido por llamadas que no se conocen entre sí: a lo sumo `max`
 * tareas a la vez y las demás esperan su turno, en orden.
 */
export function createLimiter(max: number) {
  let running = 0
  const waiting: (() => void)[] = []
  return async function limit<R>(task: () => Promise<R>): Promise<R> {
    if (running < max) running++
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try {
      return await task()
    } finally {
      // El lugar pasa directo al siguiente; `running` solo baja si nadie espera.
      const next = waiting.shift()
      if (next) next()
      else running--
    }
  }
}
