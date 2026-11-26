import "server-only"

import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { runAllActive } from "./run-all"
import type { Pass } from "./schedule"

/** Deja un minuto de margen para que la última subcuenta termine. */
const BUDGET_MS = 230_000

/**
 * Una llamada programada al motor de Lezgo IA. Entra con
 * `Authorization: Bearer $CRON_SECRET` —Vercel lo manda solo en sus
 * programaciones—; sin esa variable no corre nada. Las dos rutas del cron
 * (`/api/lezgo-ia/cron` y `/api/lezgo-ia/cron/rapida`) pasan por aquí.
 */
export async function handleCron(request: Request, pass: Pass) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "Falta CRON_SECRET." }, { status: 503 })
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 })
  }

  const result = await runAllActive({ budgetMs: BUDGET_MS, pass })
  console.info("Cron de Lezgo IA", JSON.stringify(result))
  return NextResponse.json(result)
}
