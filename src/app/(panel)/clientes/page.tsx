import { ClientsTable } from "@/components/clients/clients-table"
import { SyncButton } from "@/components/clients/sync-button"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { syncClientsIfStale } from "@/lib/clients/sync"
import { money } from "@/lib/format"
import { lezgoSuiteEnabled } from "@/lib/ghl/lezgo-suite"
import { baseCurrency, lastSyncAt, listClientRows } from "@/lib/repository"
import { formatInMexico } from "@/lib/time"

import { syncClients } from "./actions"

export const metadata = { title: "Clientes" }

export default async function ClientesPage() {
  // Sync silenciosa si la última tiene más de una hora. Si falla, la lista
  // sigue saliendo de Neon y el botón muestra el error al apretarlo.
  await syncClientsIfStale()

  const [rows, syncedAt] = await Promise.all([listClientRows(), lastSyncAt()])
  const currency = baseCurrency()
  const active = rows.filter((r) => !r.orphaned)
  const mrr = active.reduce((s, r) => s + (r.mrr ?? 0), 0)
  const unlinked = active.filter(
    (r) => r.stripeCount === 0 || r.locationNames.length === 0,
  ).length

  const hint = [
    `${active.length} activos`,
    `${money(mrr, currency)} MRR`,
    `${unlinked} sin enlazar`,
    syncedAt
      ? `sync ${formatInMexico(syncedAt, "es-MX", {
          dateStyle: "short",
          timeStyle: "short",
        })}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Clientes"
        description="Cada oportunidad ganada en Lezgo Suite, agrupada por contacto, con su subcuenta y sus clientes de Stripe."
        actions={
          <SyncButton action={syncClients} disabled={!lezgoSuiteEnabled()} />
        }
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        {!lezgoSuiteEnabled() && (
          <p className="rounded-lg border border-status-warn/40 bg-card px-4 py-3 text-sm">
            Falta <code>GHL_LEZGO_SUITE_TOKEN</code>. La lista muestra lo que hay
            en la base; no se puede sincronizar con GoHighLevel.
          </p>
        )}

        <Instrument label="Cartera completa" hint={hint}>
          <ClientsTable clients={rows} currency={currency} />
        </Instrument>
      </div>
    </div>
  )
}
