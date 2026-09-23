import { describe, expect, it } from "vitest"

import { groupPendings } from "./group"
import type { Pending } from "@/lib/types"

const pending = (p: Partial<Pending> & { id: string }): Pending => ({
  body: p.id,
  ghlLocationId: null,
  ghlLocationName: null,
  done: false,
  doneAt: null,
  createdAt: "2026-09-22T10:00:00.000Z",
  ...p,
})

const names = new Map([
  ["loc_a", "Acme Dental"],
  ["loc_b", "Café Norte"],
])

describe("groupPendings", () => {
  it("agrupa por subcuenta y ordena los grupos por nombre", () => {
    const groups = groupPendings(
      [
        pending({ id: "1", ghlLocationId: "loc_b" }),
        pending({ id: "2", ghlLocationId: "loc_a" }),
      ],
      names,
    )
    expect(groups.map((g) => g.name)).toEqual(["Acme Dental", "Café Norte"])
  })

  it("manda 'Sin subcuenta' al final, aunque alfabéticamente fuera antes", () => {
    const groups = groupPendings(
      [
        pending({ id: "1" }),
        pending({ id: "2", ghlLocationId: "loc_b" }),
      ],
      names,
    )
    expect(groups.map((g) => g.name)).toEqual(["Café Norte", "Sin subcuenta"])
    expect(groups[1].locationId).toBeNull()
  })

  it("los abiertos van del más viejo al más nuevo", () => {
    const [group] = groupPendings(
      [
        pending({ id: "nuevo", createdAt: "2026-09-22T12:00:00.000Z" }),
        pending({ id: "viejo", createdAt: "2026-09-20T09:00:00.000Z" }),
      ],
      names,
    )
    expect(group.open.map((p) => p.id)).toEqual(["viejo", "nuevo"])
  })

  it("los hechos van aparte, el último primero", () => {
    const [group] = groupPendings(
      [
        pending({ id: "abierto" }),
        pending({ id: "antes", done: true, doneAt: "2026-09-21T10:00:00.000Z" }),
        pending({ id: "después", done: true, doneAt: "2026-09-22T10:00:00.000Z" }),
      ],
      names,
    )
    expect(group.open.map((p) => p.id)).toEqual(["abierto"])
    expect(group.done.map((p) => p.id)).toEqual(["después", "antes"])
  })

  it("un hecho sin fecha de hecho se ordena por cuándo se escribió", () => {
    const [group] = groupPendings(
      [
        pending({ id: "sinFecha", done: true, createdAt: "2026-09-19T10:00:00.000Z" }),
        pending({ id: "conFecha", done: true, doneAt: "2026-09-21T10:00:00.000Z" }),
      ],
      names,
    )
    expect(group.done.map((p) => p.id)).toEqual(["conFecha", "sinFecha"])
  })

  it("usa el nombre en vivo de GHL y cae al guardado cuando GHL no lo trae", () => {
    const groups = groupPendings(
      [
        pending({ id: "1", ghlLocationId: "loc_a", ghlLocationName: "Nombre viejo" }),
        pending({ id: "2", ghlLocationId: "loc_z", ghlLocationName: "Zeta S.A." }),
      ],
      names,
    )
    expect(groups.map((g) => g.name)).toEqual(["Acme Dental", "Zeta S.A."])
  })

  it("sin nombre por ningún lado se queda con el id de la subcuenta", () => {
    const [group] = groupPendings([pending({ id: "1", ghlLocationId: "loc_z" })], names)
    expect(group.name).toBe("loc_z")
  })

  it("no devuelve grupos vacíos", () => {
    expect(groupPendings([], names)).toEqual([])
  })
})
