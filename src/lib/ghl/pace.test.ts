import { describe, expect, it } from "vitest"

import { createPacedReader } from "./pace"

/** Reloj falso: dormir adelanta el tiempo, sin esperar de verdad. */
function clock() {
  let t = 0
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      t += ms
    },
  }
}

const failure = (status: number) => Object.assign(new Error(String(status)), { status })
const tooMany = () => failure(429)

describe("createPacedReader", () => {
  it("separa las llamadas por el intervalo", async () => {
    const c = clock()
    const read = createPacedReader({ intervalMs: 100, ...c })
    // La primera sale ya; la segunda espera a t=100 y la tercera a t=200.
    await Promise.all([1, 2, 3].map(() => read(async () => null)))
    expect(c.sleeps).toEqual([100, 100])
    expect(c.now()).toBe(200)
  })

  it("reintenta un 429 después de esperar", async () => {
    const c = clock()
    const read = createPacedReader({ intervalMs: 0, retryWaitsMs: [3000, 6000], ...c })
    let calls = 0
    const result = await read(async () => {
      if (++calls < 3) throw tooMany()
      return "ok"
    })
    expect(result).toBe("ok")
    expect(c.sleeps).toEqual([3000, 6000])
  })

  it("se rinde cuando se acaban los reintentos", async () => {
    const c = clock()
    const read = createPacedReader({ intervalMs: 0, retryWaitsMs: [1], ...c })
    let calls = 0
    await expect(
      read(async () => {
        calls++
        throw tooMany()
      }),
    ).rejects.toMatchObject({ status: 429 })
    expect(calls).toBe(2)
  })

  it("no reintenta otros errores", async () => {
    const c = clock()
    const read = createPacedReader({ intervalMs: 0, ...c })
    let calls = 0
    await expect(
      read(async () => {
        calls++
        throw failure(401)
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(calls).toBe(1)
  })
})
