import { Skeleton } from "@/components/ui/skeleton"

/**
 * Lo que se ve mientras la vista consulta Neon, GHL y Stripe. La forma imita
 * la de una vista del panel —encabezado y dos filas de instrumentos— para que
 * el contenido entre en su lugar sin saltos.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando la vista">
      <div className="nav-progress" aria-hidden />
      <div className="px-4 pt-8 pb-6 md:px-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-4 px-4 pb-8 md:px-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  )
}
