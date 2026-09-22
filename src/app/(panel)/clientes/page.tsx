import { ClientsTable } from "@/components/clients/clients-table"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { money } from "@/lib/format"
import { baseCurrency, listClientRows } from "@/lib/repository"

export const metadata = { title: "Clientes" }

export default async function ClientesPage() {
  const rows = await listClientRows()
  const currency = baseCurrency()
  const active = rows.filter((r) => !r.orphaned)
  const mrr = active.reduce((s, r) => s + (r.mrr ?? 0), 0)

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Clientes"
        description="Cada oportunidad ganada en Lezgo Suite, agrupada por contacto, con su subcuenta y sus clientes de Stripe."
      />

      <div className="px-4 pb-12 md:px-6">
        <Instrument
          label="Cartera completa"
          hint={`${active.length} activos · ${money(mrr, currency)} MRR`}
        >
          <ClientsTable clients={rows} currency={currency} />
        </Instrument>
      </div>
    </div>
  )
}
