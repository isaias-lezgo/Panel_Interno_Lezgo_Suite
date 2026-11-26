import type { NextRequest } from "next/server"

import { handleCron } from "@/lib/lezgo-ia/cron-request"
import { parsePass } from "@/lib/lezgo-ia/schedule"

/**
 * Corre el motor de Lezgo IA sobre las subcuentas activas a las que les
 * toca: la pasada completa, o la que diga `?pasada=`. La llama cada hora la
 * programación `lezgo-ia-completa` de `vercel.json`, con
 * `Authorization: Bearer $CRON_SECRET`. Está fuera del candado
 * (`src/proxy.ts`) porque quien programa no tiene sesión.
 *
 * Si no alcanzan todas las subcuentas, la respuesta trae las que quedaron en
 * `pending` y la siguiente llamada sigue con ellas. La pasada rápida tiene
 * su propia ruta, `/api/lezgo-ia/cron/rapida`.
 */
export const maxDuration = 300

export function GET(request: NextRequest) {
  return handleCron(request, parsePass(request.nextUrl.searchParams.get("pasada")))
}
