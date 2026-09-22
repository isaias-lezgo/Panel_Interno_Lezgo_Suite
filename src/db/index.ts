import { neon, neonConfig } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

import { withConnectRetry } from "./retry"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL

/**
 * Until a Neon branch is wired up, the repository falls back to seed data so
 * the whole panel stays navigable. Set DATABASE_URL to switch it on.
 */
export const hasDatabase = Boolean(connectionString)

// `fetchFunction` es configuración global del driver, no por conexión.
// Despertar un compute suspendido tarda más que el `fetch` de Node; ver
// `retry.ts`.
neonConfig.fetchFunction = withConnectRetry((input, init) => fetch(input, init))

export const db = connectionString
  ? drizzle(neon(connectionString), { schema })
  : null

export { schema }
