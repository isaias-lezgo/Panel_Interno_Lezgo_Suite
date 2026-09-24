import { LezgoIaView } from "@/components/lezgo-ia/lezgo-ia-view"
import { parseLezgoIaTab } from "@/components/lezgo-ia/tabs"
import { PageHeader } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { getLezgoIaData } from "@/lib/repository"

export const metadata = { title: "Lezgo IA" }

export default async function LezgoIaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cuenta?: string }>
}) {
  const [{ tab, cuenta }, data] = await Promise.all([searchParams, getLezgoIaData()])

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Automatización"
        title="Lezgo IA"
        description="El asistente del asesor y del gerente inmobiliario: vigila el pipeline, avisa por WhatsApp cuando algo se enfría y contesta lo que le pregunten del CRM. Nunca le escribe al cliente. Aquí se mide, se configura por subcuenta y asesor, y se audita todo lo que hace."
        actions={
          data.source === "ghl" ? (
            <StatusChip tone="build">
              Vista previa · cuentas y asesores de GHL
            </StatusChip>
          ) : (
            <StatusChip tone="idle">Vista previa · datos de ejemplo</StatusChip>
          )
        }
      />

      <div className="px-4 pb-12 md:px-6">
        {data.failed > 0 && (
          <p className="mb-3 text-xs text-status-warn">
            GoHighLevel no devolvió {data.failed}{" "}
            {data.failed === 1 ? "subcuenta enlazada" : "subcuentas enlazadas"}; no
            aparecen abajo.
          </p>
        )}
        {data.inactive.length > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            Desactivadas en GoHighLevel, no aparecen abajo:{" "}
            {data.inactive.join(", ")}.
          </p>
        )}
        <LezgoIaView
          initialTab={parseLezgoIaTab(tab)}
          initialAccount={cuenta}
          data={data}
        />
      </div>
    </div>
  )
}
