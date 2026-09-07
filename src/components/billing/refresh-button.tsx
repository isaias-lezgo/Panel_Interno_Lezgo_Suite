"use client"

import { useTransition } from "react"
import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export function RefreshButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(() => action())}
      aria-label="Volver a consultar Stripe ahora"
    >
      <RotateCw className={pending ? "animate-spin" : undefined} aria-hidden />
      {pending ? "Consultando…" : "Actualizar"}
    </Button>
  )
}
