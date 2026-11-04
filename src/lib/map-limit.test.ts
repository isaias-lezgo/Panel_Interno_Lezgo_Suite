import { describe, expect, it } from "vitest"

import { createLimiter, mapLimit } from "./map-limit"

const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

describe("mapLimit", () => {
  it("nunca pasa del tope de llamadas simultáneas", async () => {
    let running = 0
    let peak = 0
    await mapLimit(Array.from({ length: 50 }, (_, i) => i), 6, async () => {
      running++
      peak = Math.max(peak, running)
      await tick()
      running--
    })
    expect(peak).toBe(6)
  })

  it("devuelve los resultados en el orden de entrada, no en el de llegada", async () => {
    const result = await mapLimit([30, 1, 15], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms * 2
    })
    expect(result).toEqual([60, 2, 30])
  })

  it("con una lista vacía no llama a nadie", async () => {
    let calls = 0
    const result = await mapLimit([], 6, async () => {
      calls++
    })
    expect(result).toEqual([])
    expect(calls).toBe(0)
  })

  it("propaga el error de una llamada", async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("falló el 2")
        return n
      }),
    ).rejects.toThrow("falló el 2")
  })
})

describe("mapLimit tras un error", () => {
  it("deja de lanzar llamadas nuevas", async () => {
    const started: number[] = []
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n)
      await tick()
      if (n === 1) throw new Error("falló el 1")
    }).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started).toEqual([1, 2])
  })
})

describe("createLimiter", () => {
  it("comparte el tope entre quienes lo llaman, y la espera sale en orden", async () => {
    const limit = createLimiter(2)
    let running = 0
    let peak = 0
    const finished: number[] = []
    await Promise.all(
      [0, 1, 2, 3, 4, 5].map((n) =>
        limit(async () => {
          running++
          peak = Math.max(peak, running)
          await tick()
          running--
          finished.push(n)
        }),
      ),
    )
    expect(peak).toBe(2)
    expect(finished).toHaveLength(6)
    expect(finished.indexOf(2)).toBeLessThan(finished.indexOf(5))
  })

  it("devuelve lo que devuelve la tarea", async () => {
    expect(await createLimiter(1)(async () => "listo")).toBe("listo")
  })

  it("un error libera el lugar y se propaga", async () => {
    const limit = createLimiter(1)
    await expect(
      limit(async () => {
        throw new Error("falló")
      }),
    ).rejects.toThrow("falló")
    expect(await limit(async () => "siguió")).toBe("siguió")
  })
})
