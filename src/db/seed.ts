import { config } from "dotenv"

// Igual que drizzle.config.ts: tsx tampoco lee .env.local solo.
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

import * as demo from "../data/demo"
import * as schema from "./schema"

/**
 * Carga los datos de ejemplo en Neon. Ejecuta `pnpm db:push` antes para que
 * las tablas existan. Es idempotente: vacía cada tabla y la vuelve a llenar.
 */
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("Falta DATABASE_URL. Defínela en .env.local y vuelve a intentar.")
    process.exit(1)
  }

  const db = drizzle(neon(url), { schema })

  await db.delete(schema.activity)
  await db.delete(schema.invoices)
  await db.delete(schema.implementations)
  await db.delete(schema.clients)
  await db.delete(schema.revenue)

  await db.insert(schema.clients).values(demo.clients)
  await db.insert(schema.implementations).values(demo.implementations)
  await db.insert(schema.invoices).values(demo.invoices)
  await db.insert(schema.activity).values(demo.activity)
  await db.insert(schema.revenue).values(demo.revenue)

  console.log(
    `Listo: ${demo.clients.length} clientes, ${demo.implementations.length} implementaciones, ${demo.invoices.length} facturas.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
