/**
 * Quién es cliente de verdad en Stripe. La cuenta de la agencia tiene más de
 * 82 000 customers porque GoHighLevel crea uno por cada contacto que pasa por
 * un checkout —los de todas las subcuentas, no solo las nuestras—, pero
 * apenas noventa han tenido alguna factura, suscripción o cargo.
 *
 * Listar customers traía los 2 000 más recientes, casi todos leads, y dejaba
 * fuera a quien sí paga desde hace años. Se deriva al revés: de los cobros
 * hacia el cliente.
 */

export type PayingSource = {
  customer: string | null
  name: string | null
  email: string | null
  phone: string | null
}

export type PayingCustomer = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

const limpio = (s: string | null | undefined) => {
  const t = s?.trim()
  return t ? t : null
}

export function collectPayingCustomers(sources: PayingSource[]) {
  const porId = new Map<string, PayingCustomer>()

  for (const s of sources) {
    if (!s.customer) continue
    const actual = porId.get(s.customer) ?? {
      id: s.customer,
      name: null,
      email: null,
      phone: null,
    }
    actual.name ??= limpio(s.name)
    actual.email ??= limpio(s.email)
    actual.phone ??= limpio(s.phone)
    porId.set(s.customer, actual)
  }

  const customers = [...porId.values()]
  // Sin nombre ni correo no hay con qué enlazar ni qué mostrar: esos se
  // piden a Stripe uno por uno, que son pocos.
  const incomplete = customers
    .filter((c) => !c.name && !c.email)
    .map((c) => c.id)

  return { customers, incomplete }
}
