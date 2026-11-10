import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { runAllActive } from "@/lib/lezgo-ia/run-all"
import { parsePass } from "@/lib/lezgo-ia/schedule"

/**
 * Corre el motor de Lezgo IA sobre las subcuentas activas a las que les
 * toca. La llama quien programe —el cron de Vercel o un escenario de Make—
 * con `Authorization: Bearer $CRON_SECRET`; sin esa variable la ruta no
 * corre nada. Está fuera del candado (`src/proxy.ts`) porque quien programa
 * no tiene sesión.
 *
 * `?pasada=rapida` revisa solo los leads del último día (para correr cada
 * 5 o 10 minutos); `?pasada=completa`, o nada, revisa todo (una o dos veces
 * al día). Si no alcanzan todas las subcuentas, la respuesta trae las que
 * quedaron en `pending` y la siguiente llamada sigue con ellas.
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

  const result = await runAllActive({
    budgetMs: BUDGET_MS,
    pass: parsePass(request.nextUrl.searchParams.get("pasada")),
  })
  console.info("Cron de Lezgo IA", JSON.stringify(result))
  return NextResponse.json(result)
}
