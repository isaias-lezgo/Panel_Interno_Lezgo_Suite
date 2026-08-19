import { ClientsTable } from "@/components/clients/clients-table"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { money } from "@/lib/format"
import { getPortfolioSummary } from "@/lib/repository"

export const metadata = { title: "Clientes" }

export default async function ClientesPage() {
  const summary = await getPortfolioSummary()
  const churned = summary.clients.filter((c) => c.status === "churned").length

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Clientes"
        description="Cada cuenta que revende nuestra instancia de GoHighLevel, con su subcuenta, su plan y su salud."
      />

      <div className="px-4 pb-12 md:px-6">
        <Instrument
          label="Cartera completa"
          hint={`${summary.activeCount} activos · ${money(summary.mrr)} MRR · ${churned} bajas`}
        >
          <ClientsTable clients={summary.clients} />
        </Instrument>
      </div>
    </div>
  )
}
