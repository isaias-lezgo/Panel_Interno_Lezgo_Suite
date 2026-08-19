"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="blueprint grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="eyebrow">Fallo al cargar</p>
        <h1 className="display mt-3 text-2xl">Esta vista no pudo abrirse</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message ||
            "La consulta de datos falló. Reintenta; si vuelve a pasar, revisa la conexión con Neon o con GoHighLevel en Ajustes."}
        </p>
        {error.digest && (
          <code className="num mt-3 block text-xs text-muted-foreground">
            {error.digest}
          </code>
        )}
        <Button size="sm" className="mt-6" onClick={reset}>
          Reintentar
        </Button>
      </div>
    </div>
  )
}
