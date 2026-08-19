import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL

/**
 * Until a Neon branch is wired up, the repository falls back to seed data so
 * the whole panel stays navigable. Set DATABASE_URL to switch it on.
 */
export const hasDatabase = Boolean(connectionString)

export const db = connectionString
  ? drizzle(neon(connectionString), { schema })
  : null

export { schema }
