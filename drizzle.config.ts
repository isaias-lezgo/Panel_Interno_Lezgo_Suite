import { defineConfig } from "drizzle-kit"
import { config } from "dotenv"

// drizzle-kit no carga .env.local por su cuenta; Next.js sí. Se apunta a mano
// para que `db:push` use la misma cadena de conexión que la app.
config({ path: ".env.local" })

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
