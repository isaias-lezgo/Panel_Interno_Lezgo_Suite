import { describe, expect, test } from "vitest"

import { attribution, followCustomer, isLive } from "./subscriptions"

const link = (
  sub: string,
  cus: string,
  clientId: string,
  linkedBy: "auto" | "manual" | "excluded" = "manual",
) => ({ stripeSubscriptionId: sub, stripeCustomerId: cus, clientId, linkedBy })

describe("attribution", () => {
  test("la suscripción manda sobre el cus_", () => {
    const { clientFor } = attribution([
      link("sub_a", "cus_agencia", "cl_uno"),
      link("sub_b", "cus_agencia", "cl_dos"),
    ])
    expect(clientFor("sub_a", "cus_agencia")).toBe("cl_uno")
    expect(clientFor("sub_b", "cus_agencia")).toBe("cl_dos")
  })

  test("un cobro sin suscripción va al único dueño de su cus_", () => {
    const { clientFor } = attribution([
      link("sub_a", "cus_x", "cl_uno"),
      link("sub_b", "cus_x", "cl_uno"),
    ])
    expect(clientFor(null, "cus_x")).toBe("cl_uno")
  })

  test("un cus_ que paga a dos clientes no se adivina", () => {
    const { clientFor } = attribution([
      link("sub_a", "cus_agencia", "cl_uno"),
      link("sub_b", "cus_agencia", "cl_dos"),
    ])
    expect(clientFor(null, "cus_agencia")).toBeNull()
    expect(clientFor("sub_otra", "cus_agencia")).toBeNull()
  })

  test("la cuenta de cobro enlazada a mano manda sobre lo deducido", () => {
    const { clientFor } = attribution(
      [link("sub_a", "cus_agencia", "cl_uno"), link("sub_b", "cus_agencia", "cl_dos")],
      [{ stripeCustomerId: "cus_agencia", clientId: "cl_dos", linkedBy: "manual" }],
    )
    expect(clientFor(null, "cus_agencia")).toBe("cl_dos")
    // La suscripción sigue mandando sobre la cuenta de cobro.
    expect(clientFor("sub_a", "cus_agencia")).toBe("cl_uno")
  })

  test("una cuenta de cobro sin suscripciones atribuye sus recargas", () => {
    const { clientFor } = attribution(
      [],
      [
        { stripeCustomerId: "cus_wallet", clientId: "cl_uno", linkedBy: "manual" },
        { stripeCustomerId: "cus_vieja", clientId: "cl_uno", linkedBy: "excluded" },
      ],
    )
    expect(clientFor(null, "cus_wallet")).toBe("cl_uno")
    expect(clientFor(null, "cus_vieja")).toBeNull()
  })

  test("un enlace archivado no atribuye", () => {
    const { clientFor } = attribution([link("sub_a", "cus_x", "cl_uno", "excluded")])
    expect(clientFor("sub_a", "cus_x")).toBeNull()
    expect(clientFor(null, "cus_x")).toBeNull()
  })
})

describe("followCustomer", () => {
  test("una suscripción nueva sigue al dueño de su cus_", () => {
    const found = followCustomer(
      [link("sub_vieja", "cus_x", "cl_uno")],
      [
        { id: "sub_vieja", customerId: "cus_x" },
        { id: "sub_nueva", customerId: "cus_x" },
        { id: "sub_ajena", customerId: "cus_y" },
      ],
    )
    expect([...found]).toEqual([["sub_nueva", "cl_uno"]])
  })

  test("no toca lo que alguien quitó a mano", () => {
    const found = followCustomer(
      [link("sub_vieja", "cus_x", "cl_uno"), link("sub_quitada", "cus_x", "cl_uno", "excluded")],
      [{ id: "sub_quitada", customerId: "cus_x" }],
    )
    expect(found.size).toBe(0)
  })

  test("con dos dueños para el mismo cus_ no propone nada", () => {
    const found = followCustomer(
      [link("sub_a", "cus_x", "cl_uno"), link("sub_b", "cus_x", "cl_dos")],
      [{ id: "sub_c", customerId: "cus_x" }],
    )
    expect(found.size).toBe(0)
  })
})

test("isLive: las canceladas y las incompletas no son cartera", () => {
  expect(isLive("active")).toBe(true)
  expect(isLive("past_due")).toBe(true)
  expect(isLive("paused")).toBe(true)
  expect(isLive("canceled")).toBe(false)
  expect(isLive("incomplete")).toBe(false)
})
