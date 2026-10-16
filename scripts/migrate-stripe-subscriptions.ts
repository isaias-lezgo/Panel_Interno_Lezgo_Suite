/**
 * Pasa los enlaces por `cus_` (`client_stripe_customers`) a enlaces por
 * suscripción (`client_stripe_subscriptions`): cada suscripción de un `cus_`
 * enlazado queda con el mismo cliente y el mismo `linked_by`, archivados
 * incluidos, para que la sync no vuelva a proponer lo que alguien quitó.
 *
 * Solo agrega filas y nunca pisa una que ya exista, así que correrlo dos
 * veces no cambia nada. Requiere que `pnpm db:push` ya haya creado la tabla.
 *
 *   pnpm tsx scripts/migrate-stripe-subscriptions.ts          # muestra el plan
 *   pnpm tsx scripts/migrate-stripe-subscriptions.ts --apply  # lo escribe
 */
import { config } from "dotenv"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import Stripe from "stripe"

import * as schema from "../src/db/schema"

config({ path: ".env.local" })

const apply = process.argv.includes("--apply")

async function main() {
  const url = process.env.DATABASE_URL
  const key = process.env.STRIPE_SECRET_KEY
  if (!url || !key) throw new Error("Faltan DATABASE_URL o STRIPE_SECRET_KEY")

  const db = drizzle(neon(url), { schema })
  const stripe = new Stripe(key, { maxNetworkRetries: 2 })

  const [old, existing, subs] = await Promise.all([
    db.select().from(schema.clientStripeCustomers),
    // Sin la tabla todavía, el plan se puede ver igual; escribir no.
    db
      .select()
      .from(schema.clientStripeSubscriptions)
      .catch((error) => {
        if (apply) throw error
        console.log("La tabla client_stripe_subscriptions no existe: corre `pnpm db:push` antes de --apply.")
        return []
      }),
    stripe.subscriptions.list({ status: "all", limit: 100 }).autoPagingToArray({ limit: 3000 }),
  ])
  const yaEstan = new Set(existing.map((e) => e.stripeSubscriptionId))
  const porCliente = new Map(old.map((o) => [o.stripeCustomerId, o]))

  const filas: (typeof schema.clientStripeSubscriptions.$inferInsert)[] = []
  const sinSuscripcion = new Set(old.map((o) => o.stripeCustomerId))
  for (const s of subs) {
    if (s.status === "incomplete_expired") continue
    const cus = typeof s.customer === "string" ? s.customer : s.customer.id
    const enlace = porCliente.get(cus)
    if (!enlace) continue
    sinSuscripcion.delete(cus)
    if (yaEstan.has(s.id)) continue
    filas.push({
      stripeSubscriptionId: s.id,
      stripeCustomerId: cus,
      clientId: enlace.clientId,
      linkedBy: enlace.linkedBy,
      linkedAt: enlace.linkedAt,
    })
  }

  const cuenta = (by: string) => filas.filter((f) => f.linkedBy === by).length
  console.log(
    `${old.length} enlaces por cus_ → ${filas.length} suscripciones nuevas ` +
      `(${cuenta("auto")} auto, ${cuenta("manual")} manual, ${cuenta("excluded")} archivadas); ` +
      `${yaEstan.size} ya estaban.`,
  )
  if (sinSuscripcion.size) {
    const vivos = old.filter(
      (o) => sinSuscripcion.has(o.stripeCustomerId) && o.linkedBy !== "excluded",
    )
    console.log(
      `${vivos.length} cus_ enlazados no tienen ninguna suscripción; ` +
        `sus cobros dejan de atribuirse:`,
    )
    for (const o of vivos) console.log(`  ${o.stripeCustomerId} → ${o.clientId}`)
  }

  if (!apply) {
    console.log("Nada escrito. Corre con --apply para guardarlo.")
    return
  }
  for (const f of filas) {
    await db.insert(schema.clientStripeSubscriptions).values(f).onConflictDoNothing()
  }
  console.log(`Listo: ${filas.length} filas en client_stripe_subscriptions.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
