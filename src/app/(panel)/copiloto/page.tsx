import { CopilotChat } from "@/components/ai/copilot-chat"
import { PageHeader } from "@/components/panel/page-header"
import { COPILOT_MODEL } from "@/lib/ai/agent"
import { ghl } from "@/lib/ghl/client"

export const metadata = { title: "Copiloto" }

export default function CopilotoPage() {
  const modelReady = Boolean(process.env.AI_GATEWAY_API_KEY)

  return (
    <div className="blueprint flex flex-col md:h-[calc(100dvh-3.5rem)]">
      <PageHeader
        className="shrink-0"
        eyebrow="Automatización"
        title="Copiloto"
        description="Consulta la cartera y opera GoHighLevel en lenguaje natural. Lee siempre antes de escribir y pide confirmación para borrar o enviar mensajes."
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 md:px-6">
        {(!modelReady || !ghl.isConfigured) && (
          <ul className="mb-4 space-y-1.5 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            {!modelReady && (
              <li>
                Falta <code className="num">AI_GATEWAY_API_KEY</code>: el
                copiloto no puede responder hasta configurarla.
              </li>
            )}
            {!ghl.isConfigured && (
              <li>
                Falta <code className="num">GHL_API_KEY</code>: las herramientas
                de GoHighLevel devolverán error, las de la cartera sí funcionan.
              </li>
            )}
            <li className="text-muted-foreground/70">
              Modelo: <code className="num">{COPILOT_MODEL}</code>
            </li>
          </ul>
        )}

        <CopilotChat />
      </div>
    </div>
  )
}
