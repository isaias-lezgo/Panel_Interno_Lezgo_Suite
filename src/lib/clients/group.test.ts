import { describe, expect, it } from "vitest"

import { groupWonOpportunities, slugify, type WonOpportunity } from "./group"

const stages = new Map([
  ["st_impl", "Proceso de Implementación"],
  ["st_activo", "Cliente Activo"],
])

const opp = (o: Partial<WonOpportunity> & { id: string }): WonOpportunity => ({
  name: o.id,
  monetaryValue: 1000,
  pipelineStageId: "st_activo",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  lastStatusChangeAt: "2026-01-01T12:00:00.000Z",
  contact: {
    id: "c_" + o.id,
    name: "Contacto " + o.id,
    companyName: null,
    email: null,
    phone: null,
  },
  ...o,
})

describe("slugify", () => {
  it("quita acentos y deja guiones", () => {
    expect(slugify("Janet de la Cruz y asociados ")).toBe(
      "janet-de-la-cruz-y-asociados",
    )
    expect(slugify("P&L Patrimonial")).toBe("p-l-patrimonial")
  })
})

describe("groupWonOpportunities", () => {
  it("agrupa dos oportunidades del mismo contacto en un cliente", () => {
    const ricardo = {
      id: "c_ricardo",
      name: "Ricardo Perez",
      companyName: "La Colada",
      email: "corporacionlacoladamexico@gmail.com",
      phone: "+525539172659",
    }
    const out = groupWonOpportunities(
      [
        opp({
          id: "o1",
          name: "Ricardo Perez - La Colada",
          contact: ricardo,
          lastStatusChangeAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-05T00:00:00.000Z",
          pipelineStageId: "st_impl",
        }),
        opp({
          id: "o2",
          name: "Ricardo - ACECOB",
          contact: ricardo,
          lastStatusChangeAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          pipelineStageId: "st_activo",
        }),
      ],
      stages,
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("c_ricardo")
    expect(out[0].name).toBe("La Colada")
    expect(out[0].contactName).toBe("Ricardo Perez")
    expect(out[0].opportunities.map((o) => o.id)).toEqual(["o1", "o2"])
    expect(out[0].wonAt).toBe("2026-03-01")
    expect(out[0].stage).toBe("Cliente Activo")
  })

  it("agrupa contactos distintos que comparten correo o teléfono; el id es el del más antiguo", () => {
    const out = groupWonOpportunities(
      [
        opp({
          id: "o1",
          lastStatusChangeAt: "2026-02-01T00:00:00.000Z",
          contact: { id: "c_new", name: "Zuriel", companyName: null, email: "zurielrc9104@gmail.com", phone: null },
        }),
        opp({
          id: "o2",
          lastStatusChangeAt: "2026-01-01T00:00:00.000Z",
          contact: { id: "c_old", name: "Zuriel Rodríguez", companyName: null, email: null, phone: "+525588046973" },
        }),
        opp({
          id: "o3",
          lastStatusChangeAt: "2026-01-15T00:00:00.000Z",
          contact: { id: "c_mid", name: "Z R", companyName: null, email: "ZURIELRC9104@gmail.com", phone: "+52 1 55 8804 6973" },
        }),
      ],
      stages,
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("c_old")
    expect(out[0].opportunities).toHaveLength(3)
  })

  it("usa el nombre del contacto cuando no hay empresa y el nombre de la oportunidad cuando no hay contacto", () => {
    const out = groupWonOpportunities(
      [
        opp({
          id: "o1",
          contact: { id: "c1", name: "Imelda De Alba", companyName: null, email: null, phone: null },
        }),
        opp({ id: "o2", name: "Cellarium", contact: null }),
      ],
      stages,
    )
    expect(out.map((c) => c.name)).toEqual(["Imelda De Alba", "Cellarium"])
    expect(out[1].id).toBe("opp_o2")
  })

  it("desambigua slugs repetidos", () => {
    const out = groupWonOpportunities(
      [
        opp({
          id: "o1",
          contact: { id: "c1", name: "Sergio Lujano", companyName: null, email: "a@x.com", phone: null },
        }),
        opp({
          id: "o2",
          contact: { id: "c2", name: "Sergio Lujano", companyName: null, email: "b@x.com", phone: null },
        }),
      ],
      stages,
    )
    expect(out.map((c) => c.slug)).toEqual(["sergio-lujano", "sergio-lujano-2"])
  })

  it("cae a createdAt cuando no hay fecha de cambio de estado y a 'Sin etapa' si la etapa no existe", () => {
    const out = groupWonOpportunities(
      [
        opp({
          id: "o1",
          lastStatusChangeAt: null,
          createdAt: "2026-04-04T10:00:00.000Z",
          pipelineStageId: "st_x",
        }),
      ],
      stages,
    )
    expect(out[0].wonAt).toBe("2026-04-04")
    expect(out[0].stage).toBe("Sin etapa")
  })
})
