import { describe, expect, it } from "vitest"

import {
  membershipOf,
  periodOf,
  resolveAccount,
  supportOf,
  type PlanLine,
} from "./account"

const linea = (extra: Partial<PlanLine> = {}): PlanLine => ({
  label: "Lezgo Growth MXN",
  amount: 352700,
  interval: "month",
  intervalCount: 1,
  renewsAt: "2026-10-01",
  ...extra,
})

const cliente = (extra: Partial<Parameters<typeof resolveAccount>[0]> = {}) => ({
  stage: "Cliente Activo",
  supportActive: null,
  licenseDueAt: null,
  billingPeriod: null,
  membership: null,
  ...extra,
})

describe("membershipOf", () => {
  it("lee el nivel del nombre del producto", () => {
    expect(membershipOf("Lezgo Start")).toBe("start")
    expect(membershipOf("Lezgo Growth Sin Límite")).toBe("growth")
    expect(membershipOf("Lezgo Pro MXN")).toBe("pro")
    expect(membershipOf("Lezgo Elite Sin Límite x2 AMIR Pesos")).toBe("elite")
  })

  it("no confunde una palabra que empieza igual", () => {
    expect(membershipOf("prueba producto nuevo")).toBeNull()
  })

  it("ignora los extras, que nombran dos niveles", () => {
    expect(membershipOf("Usuario Adicional Lezgo Growth y Pro")).toBeNull()
  })
})

describe("supportOf", () => {
  it("reconoce el producto y la etapa", () => {
    expect(supportOf("Servicio Técnico Dedicado")).toBe(true)
    expect(supportOf("Lezgo Elite + Servicio de Soporte Técnico DRT")).toBe(true)
    expect(supportOf("Activo con Servicio Técnico Dedicado")).toBe(true)
    expect(supportOf("Lezgo Growth MXN")).toBe(false)
  })
})

describe("periodOf", () => {
  it("traduce lo que vendemos y deja fuera lo demás", () => {
    expect(periodOf("month", 1)).toBe("1m")
    expect(periodOf("month", 3)).toBe("3m")
    expect(periodOf("month", 6)).toBe("6m")
    expect(periodOf("month", 12)).toBe("1y")
    expect(periodOf("year", 1)).toBe("1y")
    expect(periodOf("week", 2)).toBeNull()
  })
})

describe("resolveAccount", () => {
  it("deduce todo de Stripe cuando no hay nada escrito", () => {
    const a = resolveAccount(cliente(), [linea()])
    expect(a.membership).toEqual({ value: "growth", source: "stripe" })
    expect(a.period).toEqual({ value: "1m", source: "stripe" })
    expect(a.licenseDueAt).toEqual({ value: "2026-10-01", source: "stripe" })
    expect(a.support).toEqual({ value: false, source: "stripe" })
  })

  it("toma el plan de la línea mayor, no de la primera", () => {
    const a = resolveAccount(cliente(), [
      linea({ label: "Usuario Adicional Lezgo Growth y Pro", amount: 45000 }),
      linea({ label: "Lezgo Pro MXN", amount: 539700 }),
    ])
    expect(a.membership.value).toBe("pro")
  })

  it("marca el servicio técnico cuando lo paga como producto aparte", () => {
    const a = resolveAccount(cliente(), [
      linea(),
      linea({ label: "Servicio Técnico Dedicado", amount: 100000 }),
    ])
    expect(a.support).toEqual({ value: true, source: "stripe" })
  })

  it("la etapa manda el servicio técnico aunque Stripe no lo cobre aparte", () => {
    const a = resolveAccount(
      cliente({ stage: "Activo con Servicio Técnico Dedicado" }),
      [linea()],
    )
    expect(a.support).toEqual({ value: true, source: "ghl" })
  })

  it("cae a la etapa del pipeline cuando no hay suscripciones", () => {
    const a = resolveAccount(
      cliente({ stage: "Activo con Servicio Técnico Dedicado" }),
      [],
    )
    expect(a.support).toEqual({ value: true, source: "ghl" })
    expect(a.membership.value).toBeNull()
  })

  it("no inventa un no para quien ya no es cliente", () => {
    expect(resolveAccount(cliente({ stage: "Servicio Terminado" }), []).support)
      .toEqual({ value: null, source: null })
  })

  it("lo escrito a mano manda sobre lo deducido", () => {
    const a = resolveAccount(
      cliente({
        supportActive: true,
        membership: "elite",
        billingPeriod: "1y",
        licenseDueAt: "2027-01-31",
      }),
      [linea()],
    )
    expect(a.support).toEqual({ value: true, source: "manual" })
    expect(a.membership).toEqual({ value: "elite", source: "manual" })
    expect(a.period).toEqual({ value: "1y", source: "manual" })
    expect(a.licenseDueAt).toEqual({ value: "2027-01-31", source: "manual" })
  })

  it("el vencimiento es la renovación más próxima", () => {
    const a = resolveAccount(cliente(), [
      linea({ renewsAt: "2026-12-01" }),
      linea({ renewsAt: "2026-10-15" }),
    ])
    expect(a.licenseDueAt.value).toBe("2026-10-15")
  })
})
