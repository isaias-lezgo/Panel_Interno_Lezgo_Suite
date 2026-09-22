"use client"

import { useState, useTransition } from "react"
import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SyncResult } from "@/lib/clients/sync"

export function SyncButton({
  action,
  disabled,
}: {
  action: () => Promise<SyncResult>
  disabled?: boolean
}) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      {note && (
        <span className="max-w-64 truncate text-xs text-muted-foreground">
          {note}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await action()
            setNote(
              r.ok
                ? `${r.clients} clientes · ${r.stripeLinked} enlaces a Stripe · ${r.locationsLinked} subcuentas`
                : r.error,
            )
          })
        }
        aria-label="Sincronizar clientes con GoHighLevel ahora"
      >
        <RotateCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? "Sincronizando…" : "Sincronizar con GHL"}
      </Button>
    </div>
  )
}
