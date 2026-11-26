import { handleCron } from "@/lib/lezgo-ia/cron-request"

/**
 * La pasada rápida del motor de Lezgo IA: solo los leads del último día. La
 * llama cada 10 minutos la programación `lezgo-ia-rapida` de `vercel.json`.
 * Tiene ruta propia para no depender de un `?pasada=` en la programación.
 */
export const maxDuration = 300

export function GET(request: Request) {
  return handleCron(request, "quick")
}
