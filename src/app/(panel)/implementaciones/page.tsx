import { ImplementationBoard } from "@/components/implementations/board"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { getPortfolioSummary } from "@/lib/repository"

export const metadata = { title: "Implementaciones" }

export default async function ImplementacionesPage() {
  const summary = await getPortfolioSummary()
  const live = summary.implementations.length - summary.inFlightCount

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Implementaciones"
        description="Cada snapshot, automatización y migración que estamos construyendo, ordenado por la etapa en la que está."
      />

      <div className="px-4 pb-12 md:px-6">
        <Instrument
          label="Tablero de entregas"
          hint={`${summary.inFlightCount} en curso · ${summary.blockedCount} bloqueados · ${live} en producción`}
        >
          <ImplementationBoard
            implementations={summary.implementations}
            clients={summary.clients}
          />
        </Instrument>
      </div>
    </div>
  )
}
