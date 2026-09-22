import { describe, expect, it } from "vitest"

import { collectPayingCustomers, type PayingSource } from "./paying"

const fuente = (o: Partial<PayingSource> & { customer: string | null }): PayingSource => ({
  name: null,
  email: null,
  phone: null,
  ...o,
})

describe("collectPayingCustomers", () => {
  it("junta los clientes de facturas, suscripciones y cargos sin repetirlos", () => {
    const { customers } = collectPayingCustomers([
      fuente({ customer: "cus_a", name: "Ana" }),
      fuente({ customer: "cus_a", name: "Ana" }),
      fuente({ customer: "cus_b", name: "Beto" }),
    ])
    expect(customers.map((c) => c.id)).toEqual(["cus_a", "cus_b"])
  })

  it("se queda con el primer dato no vacío de cada campo", () => {
    const { customers } = collectPayingCustomers([
      fuente({ customer: "cus_a", name: null, email: "a@x.com" }),
      fuente({ customer: "cus_a", name: "Ana", phone: "+525512345678" }),
    ])
    expect(customers[0]).toEqual({
      id: "cus_a",
      name: "Ana",
      email: "a@x.com",
      phone: "+525512345678",
    })
  })

  it("ignora los registros sin cliente", () => {
    const { customers } = collectPayingCustomers([
      fuente({ customer: null, name: "Fantasma" }),
      fuente({ customer: "cus_a", name: "Ana" }),
    ])
    expect(customers.map((c) => c.id)).toEqual(["cus_a"])
  })

  it("señala los que quedaron sin nombre ni correo para buscarlos aparte", () => {
    const { customers, incomplete } = collectPayingCustomers([
      fuente({ customer: "cus_a", name: "Ana" }),
      fuente({ customer: "cus_sinDatos" }),
    ])
    expect(incomplete).toEqual(["cus_sinDatos"])
    expect(customers).toHaveLength(2)
  })

  it("no confunde una cadena vacía con un dato", () => {
    const { customers, incomplete } = collectPayingCustomers([
      fuente({ customer: "cus_a", name: "  ", email: "" }),
    ])
    expect(customers[0].name).toBeNull()
    expect(incomplete).toEqual(["cus_a"])
  })
})
