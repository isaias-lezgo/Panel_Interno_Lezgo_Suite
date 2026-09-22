import { CheckIcon, MinusIcon } from "lucide-react"

import { Instrument, PageHeader } from "@/components/panel/page-header"
import { toolLabels } from "@/components/ai/tool-labels"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { COPILOT_MODEL, usingDirectAnthropic } from "@/lib/ai/agent"
import { hasDatabase } from "@/db"
import { ghl } from "@/lib/ghl/client"
import { cn } from "@/lib/utils"

export const metadata = { title: "Ajustes" }

const approvalTools = new Set([
  "deleteContact",
  "deleteOpportunity",
  "sendMessage",
])

export default async function AjustesPage() {
  const connections = [
    {
      name: "GoHighLevel",
      variable: "GHL_API_KEY",
      ready: ghl.isConfigured,
      detail: "Token de agencia para leer y escribir en las subcuentas.",
    },
    {
      name: "GoHighLevel · subcuenta Lezgo Suite",
      variable: "GHL_LEZGO_SUITE_TOKEN",
      ready: Boolean(process.env.GHL_LEZGO_SUITE_TOKEN),
      detail:
        "Token privado de la subcuenta. De ahí salen los clientes (oportunidades ganadas).",
    },
    {
      name: "Base de datos Neon",
      variable: "DATABASE_URL",
      ready: hasDatabase,
      detail: hasDatabase
        ? "El panel lee de Postgres."
        : "El panel usa datos de ejemplo hasta que definas la variable.",
    },
    {
      name: "Modelo del copiloto",
      variable: usingDirectAnthropic
        ? "ANTHROPIC_API_KEY"
        : "AI_GATEWAY_API_KEY",
      ready:
        usingDirectAnthropic || Boolean(process.env.AI_GATEWAY_API_KEY),
      detail: usingDirectAnthropic
        ? `${COPILOT_MODEL} directo desde la API de Anthropic, sin pasar por el AI Gateway.`
        : `${COPILOT_MODEL} vía AI Gateway. Los créditos gratis no alcanzan: hace falta comprar créditos, o poner ANTHROPIC_API_KEY para ir directo.`,
    },
    {
      name: "Subcuenta por defecto",
      variable: "GHL_LOCATION_ID",
      ready: Boolean(process.env.GHL_LOCATION_ID),
      detail: "Se usa cuando una herramienta no recibe una subcuenta.",
    },
  ]

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Automatización"
        title="Ajustes"
        description="Conexiones, origen de datos y permisos del copiloto. Las variables se definen en .env.local y se leen en el servidor."
      />

      <div className="grid gap-4 px-4 pb-12 md:px-6 lg:grid-cols-2">
        <Instrument label="Conexiones" hint="Estado de las variables de entorno">
          <ul className="divide-y divide-border">
            {connections.map((item) => (
              <li
                key={item.variable}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                    item.ready
                      ? "bg-status-live/15 text-status-live"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.ready ? (
                    <CheckIcon className="size-2.5" />
                  ) : (
                    <MinusIcon className="size-2.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {item.ready ? "configurada" : "sin configurar"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                  <code className="num mt-1 block text-[11px] text-muted-foreground">
                    {item.variable}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        </Instrument>

        <Instrument
          label="Origen de datos"
          hint={hasDatabase ? "Neon Postgres" : "Datos de ejemplo"}
        >
          <div className="space-y-3 px-4 py-4 text-sm">
            <p className="text-muted-foreground">
              Todas las vistas leen de{" "}
              <code className="num text-xs">src/lib/repository.ts</code>. Ese
              archivo entrega los datos de ejemplo mientras{" "}
              <code className="num text-xs">DATABASE_URL</code> esté vacía, y
              consulta Neon en cuanto la definas.
            </p>

            {hasDatabase ? (
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  El panel está leyendo de Postgres. Para volver a cargar los
                  datos de ejemplo: <code className="num text-xs">pnpm db:seed</code>.
                </li>
                <li>
                  Después de tocar{" "}
                  <code className="num text-xs">src/db/schema.ts</code>, aplica
                  el cambio con <code className="num text-xs">pnpm db:push</code>.
                </li>
                <li>
                  Para inspeccionar las tablas:{" "}
                  <code className="num text-xs">pnpm db:studio</code>.
                </li>
              </ul>
            ) : (
              <ol className="space-y-1.5 text-muted-foreground">
                <li>
                  1. Crea una rama en Neon y copia su cadena de conexión a{" "}
                  <code className="num text-xs">.env.local</code>.
                </li>
                <li>
                  2. Genera y aplica el esquema con{" "}
                  <code className="num text-xs">pnpm db:push</code>.
                </li>
                <li>
                  3. Carga los datos de ejemplo con{" "}
                  <code className="num text-xs">pnpm db:seed</code>.
                </li>
              </ol>
            )}
          </div>
        </Instrument>

        <Instrument
          label="Permisos del copiloto"
          hint={`${Object.keys(toolLabels).length} herramientas · ${approvalTools.size} requieren aprobación`}
        >
          <ul className="grid grid-cols-1 gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            {Object.entries(toolLabels).map(([name, label]) => (
              <li
                key={name}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="truncate text-sm">{label}</span>
                {approvalTools.has(name) ? (
                  <span className="text-xs whitespace-nowrap text-status-warn">
                    pide confirmación
                  </span>
                ) : (
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    directa
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Instrument>

        <div className="space-y-4">
          <Instrument label="Apariencia" hint="Se guarda en este navegador">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Alterna entre el tema oscuro y el claro.
              </p>
              <ThemeToggle />
            </div>
          </Instrument>
        </div>
      </div>
    </div>
  )
}
