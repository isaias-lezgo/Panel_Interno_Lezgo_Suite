import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * La carga de Lezgo IA contra un GHL falso. Lo que se prueba es qué pasa cuando
 * una subcuenta falla: qué se declara y qué se queda guardado en la caché.
 */

const ghlState = vi.hoisted(() => ({
  ids: [] as string[],
  cache: new Map<string, unknown>(),
  /** Las entradas guardadas ya caducaron: se sirven y se revalidan en segundo plano. */
  stale: false,
  background: [] as Promise<unknown>[],
  unlisted: new Set<string>(),
  usersFailure: new Map<string, Error>(),
  pipelinesFailure: new Map<string, Error>(),
  usersReads: new Map<string, number>(),
  reading: 0,
  peakReading: 0,
}))

vi.mock("server-only", () => ({}))

vi.mock("next/cache", () => ({
  updateTag: () => {},
  // Como el real: guarda lo que la función devuelve, nunca lo que lanza.
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args])
      if (ghlState.cache.has(key)) {
        if (ghlState.stale) {
          ghlState.background.push(
            fn(...args).then((value) => ghlState.cache.set(key, value), () => {}),
          )
        }
        return ghlState.cache.get(key)
      }
      const value = await fn(...args)
      ghlState.cache.set(key, value)
      return value
    },
}))

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema")
  const rowsOf = (table: unknown) => {
    if (table === schema.clients) return [{ id: "cliente", name: "Cliente" }]
    if (table === schema.clientGhlLocations) {
      return ghlState.ids.map((id) => ({ ghlLocationId: id, clientId: "cliente" }))
    }
    return []
  }
  const query = (rows: unknown[]) =>
    Object.assign(Promise.resolve(rows), { where: () => Promise.resolve(rows) })
  return { schema, db: { select: () => ({ from: (t: unknown) => query(rowsOf(t)) }) } }
})

vi.mock("@/lib/ghl/oauth", () => ({
  oauthConfigured: () => true,
  locationToken: async (locationId: string) => locationId,
}))

vi.mock("@/lib/ghl/client", async (actual) => {
  const real = await actual<typeof import("@/lib/ghl/client")>()
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

  class FakeClient {
    async listPipelines(locationId: string) {
      await tick()
      ghlState.reading--
      const failure = ghlState.pipelinesFailure.get(locationId)
      if (failure) throw failure
      return {
        pipelines: [
          { id: "p1", name: "Ventas", stages: [{ id: "s1", name: "Nuevo", position: 0 }] },
        ],
      }
    }
    async request() {
      return { meta: { total: 3 } }
    }
  }

  return {
    ...real,
    GhlClient: FakeClient,
    ghl: {
      isConfigured: true,
      listAllLocations: async () =>
        ghlState.ids.filter((id) => !ghlState.unlisted.has(id)).map((id) => ({
          id,
          companyId: "agencia",
          name: `Subcuenta ${id}`,
          secret: "no debe viajar",
        })),
      searchUsers: async ({ locationId }: { locationId: string }) => {
        ghlState.usersReads.set(locationId, (ghlState.usersReads.get(locationId) ?? 0) + 1)
        const failure = ghlState.usersFailure.get(locationId)
        if (failure) throw failure
        ghlState.reading++
        ghlState.peakReading = Math.max(ghlState.peakReading, ghlState.reading)
        await tick()
        return { users: [{ id: `u-${locationId}`, name: "Asesora", email: "a@cliente.mx" }] }
      },
    },
  }
})

const { getLezgoIaData } = await import("@/lib/repository")
const { GhlError } = await import("@/lib/ghl/client")

const networkFailure = () => new TypeError("fetch failed")
const reads = (id: string) => ghlState.usersReads.get(id) ?? 0

beforeEach(() => {
  ghlState.ids = ["a", "b"]
  ghlState.cache.clear()
  ghlState.stale = false
  ghlState.background = []
  ghlState.unlisted.clear()
  ghlState.usersFailure.clear()
  ghlState.pipelinesFailure.clear()
  ghlState.usersReads.clear()
  ghlState.reading = 0
  ghlState.peakReading = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("getLezgoIaData cuando una subcuenta falla", () => {
  it("un fallo de red al leer pipelines cuenta como fallida, no como sin pipelines", async () => {
    ghlState.pipelinesFailure.set("b", networkFailure())

    const data = await getLezgoIaData()

    expect(data.failed).toBe(1)
    expect(data.subaccounts.map((s) => s.id)).toEqual(["a"])
  })

  it("la subcuenta que falló se reintenta en la siguiente carga, sin releer las demás", async () => {
    ghlState.pipelinesFailure.set("b", networkFailure())
    await getLezgoIaData()

    ghlState.pipelinesFailure.clear()
    const data = await getLezgoIaData()

    expect(data.failed).toBe(0)
    expect(data.subaccounts.map((s) => [s.id, s.pipelines.length])).toEqual([
      ["a", 1],
      ["b", 1],
    ])
    expect(reads("a")).toBe(1)
    expect(reads("b")).toBe(2)
  })

  it.each([
    ["429", 429],
    ["500", 500],
    ["503", 503],
  ])("un %s de GHL también es pasajero", async (_label, status) => {
    ghlState.pipelinesFailure.set("b", new GhlError("GHL", status, "/opportunities/pipelines"))

    const data = await getLezgoIaData()

    expect(data.failed).toBe(1)
    expect(data.subaccounts.map((s) => s.id)).toEqual(["a"])
  })

  it("un fallo al leer usuarios tampoco se guarda", async () => {
    ghlState.usersFailure.set("b", networkFailure())
    expect((await getLezgoIaData()).failed).toBe(1)

    ghlState.usersFailure.clear()
    const data = await getLezgoIaData()

    expect(data.failed).toBe(0)
    expect(data.subaccounts).toHaveLength(2)
  })

  it("un 403 de la app no se arregla reintentando: sale sin pipelines y se guarda", async () => {
    ghlState.pipelinesFailure.set("b", new GhlError("Forbidden", 403, "/opportunities/pipelines"))

    const first = await getLezgoIaData()
    const second = await getLezgoIaData()

    expect(first.failed).toBe(0)
    expect(first.subaccounts.find((s) => s.id === "b")?.pipelines).toEqual([])
    expect(second.subaccounts.find((s) => s.id === "b")?.pipelines).toEqual([])
    expect(reads("b")).toBe(1)
  })

  it("una subcuenta desactivada se declara por nombre, no cuenta como fallida y se guarda", async () => {
    ghlState.usersFailure.set("b", new GhlError("The location is not active", 400, "/users/search"))

    const first = await getLezgoIaData()
    await getLezgoIaData()

    expect(first.failed).toBe(0)
    expect(first.inactive).toEqual(["Subcuenta b"])
    expect(first.subaccounts.map((s) => s.id)).toEqual(["a"])
    expect(reads("b")).toBe(1)
  })

  it("una subcuenta que GHL ya no lista cuenta como fallida", async () => {
    ghlState.unlisted.add("b")

    const data = await getLezgoIaData()

    expect(data.failed).toBe(1)
    expect(data.subaccounts.map((s) => s.id)).toEqual(["a"])
  })
})

describe("getLezgoIaData y sus topes", () => {
  it("lee a lo sumo 6 subcuentas a la vez", async () => {
    ghlState.ids = Array.from({ length: 20 }, (_, i) => `s${i}`)

    const data = await getLezgoIaData()

    expect(data.subaccounts).toHaveLength(20)
    expect(ghlState.peakReading).toBe(6)
  })

  it("el tope también cubre las revalidaciones en segundo plano", async () => {
    ghlState.ids = Array.from({ length: 20 }, (_, i) => `s${i}`)
    await getLezgoIaData()
    ghlState.peakReading = 0

    ghlState.stale = true
    const data = await getLezgoIaData()
    await Promise.all(ghlState.background)

    expect(data.subaccounts).toHaveLength(20)
    // Las 20 subcuentas y la lista de subcuentas, que también caducó.
    expect(ghlState.background).toHaveLength(21)
    expect(ghlState.peakReading).toBe(6)
  })

  it("una revalidación que falla conserva la entrada vieja", async () => {
    await getLezgoIaData()

    ghlState.stale = true
    ghlState.pipelinesFailure.set("b", networkFailure())
    const data = await getLezgoIaData()
    await Promise.all(ghlState.background)

    expect(data.failed).toBe(0)
    expect(data.subaccounts.find((s) => s.id === "b")?.pipelines).toHaveLength(1)
  })

  it("la llave de la caché solo lleva lo que usa la subcuenta", async () => {
    await getLezgoIaData()

    expect([...ghlState.cache.keys()].join()).not.toContain("no debe viajar")
  })
})
