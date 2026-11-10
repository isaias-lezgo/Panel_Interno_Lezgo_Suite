import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { runAllActive } from "@/lib/lezgo-ia/run-all"

/**
 * El cron de Vercel (`vercel.json`) corre aquí el motor de Lezgo IA sobre
 * todas las subcuentas activas. Vercel manda `Authorization: Bearer
 * $CRON_SECRET`; sin esa variable la ruta no corre nada. Está fuera del
 * candado (`src/proxy.ts`) porque el cron no tiene sesión.
 *
 * En el plan Hobby el cron dispara una vez al día, en algún momento de la
 * hora programada. Los avisos de minutos ("lead nuevo a los 30 min")
 * necesitan correr más seguido: plan Pro o un disparador externo que llame
 * esta misma ruta con el secreto.
 */
export const maxDuration = 300

/** Deja un minuto de margen para que la última subcuenta termine. */
const BUDGET_MS = 230_000

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "Falta CRON_SECRET." }, { status: 503 })
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 })
  }

  const result = await runAllActive({ budgetMs: BUDGET_MS })
  console.info("Cron de Lezgo IA", JSON.stringify(result))
  return NextResponse.json(result)
}
