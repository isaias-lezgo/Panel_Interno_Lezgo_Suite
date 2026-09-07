import { db, schema } from "@/db"
import { listActiveSubscriptions, listCustomers } from "@/lib/stripe/client"

/**
 * Se corre con `pnpm stripe:map`, que pasa `--env-file=.env.local`: `@/db`
 * lee DATABASE_URL al importarse, y un `dotenv.config()` dentro del archivo
 * llegaría tarde porque los imports se elevan por encima de él.
 *
 * Propone pares cus_… ↔ cliente del panel e imprime el SQL para confirmarlos.
 * No escribe nada: el mapeo es una decisión de negocio y se revisa a ojo.
 *
 * El panel no guarda el correo de sus clientes, así que la única señal
 * disponible es el nombre. Se compara normalizado y aun así se marca como
 * propuesta, no como certeza.
 */
function normaliza(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(sa de cv|s\.a\.|sapi|srl|llc|inc|co|mx)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

async function main() {
  if (!db) throw new Error("Falta DATABASE_URL")

  const [subs, customers, clients] = await Promise.all([
    listActiveSubscriptions(),
    listCustomers(),
    db.select().from(schema.clients),
  ])

  const activos = new Set(
    subs.map((s) =>
      typeof s.customer === "string" ? s.customer : s.customer.id,
    ),
  )
  const porNombre = new Map(clients.map((c) => [normaliza(c.name), c]))

  const sinCandidato: string[] = []

  for (const cus of customers) {
    if (!activos.has(cus.id)) continue
    if (clients.some((c) => c.stripeCustomerId === cus.id)) continue

    const match = cus.name ? porNombre.get(normaliza(cus.name)) : undefined
    if (match) {
      console.log(
        `-- PROPUESTA: "${cus.name}" ≈ "${match.name}"\n` +
          `UPDATE clients SET stripe_customer_id = '${cus.id}' WHERE id = '${match.id}';`,
      )
    } else {
      sinCandidato.push(
        `${cus.id}  ${cus.name ?? "sin nombre"}  <${cus.email ?? "sin correo"}>`,
      )
    }
  }

  const sinEnlazar = clients.filter((c) => !c.stripeCustomerId)
  if (sinEnlazar.length) {
    console.log(`\n-- Clientes del panel sin enlazar (${sinEnlazar.length}):`)
    for (const c of sinEnlazar) console.log(`--   ${c.id}  ${c.name}`)
  }

  if (sinCandidato.length) {
    console.log(`\n-- Clientes de Stripe sin candidato (${sinCandidato.length}):`)
    for (const linea of sinCandidato) console.log(`--   ${linea}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
