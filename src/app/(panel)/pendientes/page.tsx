import { cookies } from "next/headers"

import { PageHeader } from "@/components/panel/page-header"
import { PendingList } from "@/components/pendings/pending-list"
import {
  DEFAULT_OWNER,
  isPendingOwner,
  OWNER_COOKIE,
} from "@/lib/pendings/owners"
import {
  listLocationOptions,
  listPendingGroupOrder,
  listPendings,
} from "@/lib/repository"

export const metadata = { title: "Pendientes" }

export default async function PendientesPage() {
  const [pendings, groupOrder, locations, store] = await Promise.all([
    listPendings(),
    listPendingGroupOrder(),
    listLocationOptions(),
    cookies(),
  ])
  const saved = store.get(OWNER_COOKIE)?.value
  const owner = isPendingOwner(saved) ? saved : DEFAULT_OWNER

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Pendientes"
        description="Lo que falta por hacer, por persona y agrupado por la subcuenta a la que pertenece. Una frase por pendiente; lo que necesita etapa y checklist es una implementación."
      />

      <div className="px-4 pb-12 md:px-6">
        <PendingList
          pendings={pendings}
          groupOrder={groupOrder}
          initialOwner={owner}
          locations={locations.options}
          locationsError={locations.error}
        />
      </div>
    </div>
  )
}
