import { describe, expect, it } from "vitest"

import type { ClientRow } from "@/lib/types"

import {
  applyFilters,
  NONE,
  noFilters,
  optionsFor,
  valuesOf,
  without,
  type ClientColumn,
  type ColumnFilters,
} from "./filters"

// Mediodía en México: los días no dependen de la zona del que corre la prueba.
const now = new Date("2026-09-23T18:00:00Z")

const fila = (extra: Partial<ClientRow> = {}): ClientRow => ({
  id: "c1",
  slug: "c1",
  name: "Cliente",
  contactName: "Contacto",
  email: null,
  phone: null,
  ghlContactId: "c1",
  stage: "Cliente Activo",
  wonAt: "2026-09-01T00:00:00Z",
  syncedAt: "2026-09-23T00:00:00Z",
  orphaned: false,
  notes: null,
  supportActive: null,
  licenseDueAt: null,
  billingPeriod: null,
  membership: null,
  locationNames: [],
  stripeCount: 0,
  mrr: null,
  unconvertedSubs: 0,
  account: {
    support: { value: null, source: null },
    licenseDueAt: { value: null, source: null },
    period: { value: null, source: null },
    membership: { value: null, source: null },
  },
  ...extra,
})

const todas = new Set<ClientColumn>([
  "etapa",
  "membresia",
  "soporte",
  "periodicidad",
  "vencimiento",
  "subcuenta",
  "stripe",
  "mrr",
  "cerrado",
])

const growth = fila({
  id: "g",
  mrr: 400_000,
  stripeCount: 1,
  locationNames: ["Imagine", "Imagine 2"],
  account: {
    ...fila().account,
    membership: { value: "growth", source: "stripe" },
    licenseDueAt: { value: "2026-09-28", source: "stripe" },
  },
})
const elite = fila({
  id: "e",
  stage: "Activo con Servicio Técnico",
  mrr: 2_000_000,
  wonAt: "2025-01-10T00:00:00Z",
  locationNames: ["VAEO"],
  account: {
    ...fila().account,
    membership: { value: "elite", source: "manual" },
    support: { value: true, source: "ghl" },
  },
})
const vacio = fila({ id: "v" })

describe("valuesOf", () => {
  it("reparte el vencimiento en tramos contados en México", () => {
    const due = (iso: string | null) =>
      valuesOf(
        "vencimiento",
        fila({
          account: { ...fila().account, licenseDueAt: { value: iso, source: "stripe" } },
        }),
        now,
      )
    expect(due("2026-09-22")).toEqual(["vencida"])
    expect(due("2026-09-23")).toEqual(["7"])
    expect(due("2026-09-30")).toEqual(["7"])
    expect(due("2026-10-01")).toEqual(["30"])
    expect(due("2026-11-30")).toEqual(["mas"])
    expect(due(null)).toEqual([NONE])
  })

  it("da una subcuenta por enlace y NONE sin ninguna", () => {
    expect(valuesOf("subcuenta", growth, now)).toEqual(["Imagine", "Imagine 2"])
    expect(valuesOf("subcuenta", vacio, now)).toEqual([NONE])
  })

  it("cuenta el cierre hacia atrás", () => {
    expect(valuesOf("cerrado", growth, now)).toEqual(["30"])
    expect(valuesOf("cerrado", elite, now)).toEqual(["mas"])
  })
})

describe("applyFilters", () => {
  const rows = [growth, elite, vacio]
  const con = (f: Partial<ColumnFilters>): ColumnFilters => ({ ...noFilters, ...f })

  it("sin filtros deja todo", () => {
    expect(applyFilters(rows, noFilters, todas, now)).toHaveLength(3)
  })

  it("dentro de una columna suma; entre columnas exige las dos", () => {
    const f = con({ sets: { membresia: ["growth", "elite"] } })
    expect(applyFilters(rows, f, todas, now).map((c) => c.id)).toEqual(["g", "e"])

    const g = con({ sets: { membresia: ["growth", "elite"], soporte: ["si"] } })
    expect(applyFilters(rows, g, todas, now).map((c) => c.id)).toEqual(["e"])
  })

  it("filtra lo que no está con NONE", () => {
    const f = con({ sets: { membresia: [NONE] } })
    expect(applyFilters(rows, f, todas, now).map((c) => c.id)).toEqual(["v"])
  })

  it("el rango de MRR va en unidades y deja fuera a quien no tiene", () => {
    const f = con({ mrr: { min: 5_000, max: null } })
    expect(applyFilters(rows, f, todas, now).map((c) => c.id)).toEqual(["e"])

    const g = con({ mrr: { min: null, max: 4_000 } })
    expect(applyFilters(rows, g, todas, now).map((c) => c.id)).toEqual(["g"])
  })

  it("una columna escondida no filtra", () => {
    const f = con({ sets: { membresia: ["elite"] }, mrr: { min: 1, max: null } })
    const sin = new Set(todas)
    sin.delete("membresia")
    sin.delete("mrr")
    expect(applyFilters(rows, f, sin, now)).toHaveLength(3)
  })
})

describe("optionsFor", () => {
  it("las listas fijas salen completas y en su orden, con ceros", () => {
    const opts = optionsFor("membresia", [growth, elite, vacio], now)
    expect(opts.map((o) => [o.value, o.count])).toEqual([
      ["start", 0],
      ["growth", 1],
      ["pro", 0],
      ["elite", 1],
      [NONE, 1],
    ])
  })

  it("las subcuentas salen de la cartera, 'Sin enlazar' al final", () => {
    const opts = optionsFor("subcuenta", [growth, elite, vacio], now)
    expect(opts.map((o) => o.label)).toEqual([
      "Imagine",
      "Imagine 2",
      "VAEO",
      "Sin enlazar",
    ])
  })

  it("without suelta solo la columna pedida", () => {
    const f: ColumnFilters = {
      sets: { membresia: ["elite"], soporte: ["si"] },
      mrr: { min: 1, max: 2 },
    }
    expect(without(f, "membresia")).toEqual({
      sets: { soporte: ["si"] },
      mrr: { min: 1, max: 2 },
    })
    expect(without(f, "mrr").mrr).toEqual({ min: null, max: null })
  })
})
