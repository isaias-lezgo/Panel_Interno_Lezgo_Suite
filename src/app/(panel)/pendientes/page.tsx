import { PageHeader } from "@/components/panel/page-header"
import { PendingList } from "@/components/pendings/pending-list"
import { listLocationOptions, listPendings } from "@/lib/repository"

export const metadata = { title: "Pendientes" }

export default async function PendientesPage() {
  const [pendings, locations] = await Promise.all([
    listPendings(),
    listLocationOptions(),
  ])

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Pendientes"
        description="Lo que falta por hacer, agrupado por la subcuenta a la que pertenece. Una frase por pendiente; lo que necesita etapa y checklist es una implementación."
      />

      <div className="px-4 pb-12 md:px-6">
        <PendingList
          pendings={pendings}
          locations={locations.options}
          locationsError={locations.error}
        />
      </div>
    </div>
  )
}
