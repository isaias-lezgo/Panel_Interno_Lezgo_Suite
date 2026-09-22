"use client"

import { useState, useTransition } from "react"
import { ExternalLinkIcon, XIcon } from "lucide-react"

import {
  linkGhlLocation,
  unlinkGhlLocation,
} from "@/app/(panel)/clientes/actions"
import { EmptyState } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import type { Client, LocationOption } from "@/lib/types"

import { LinkPicker } from "./link-picker"

type Result = { ok: true } | { ok: false; error: string }

export function LocationLink({
  client,
  location,
  options,
  optionsError,
}: {
  client: Client
  location: LocationOption | null
  options: LocationOption[]
  optionsError: string | null
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  return (
    <div>
      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}

      {location ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{location.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {location.email ?? "Sin correo"} ·{" "}
              <code className="num">{location.id}</code>
            </p>
          </div>
          <StatusChip
            tone={client.ghlLocationLinkedBy === "auto" ? "live" : "build"}
          >
            {client.ghlLocationLinkedBy === "auto" ? "Automático" : "Manual"}
          </StatusChip>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={`https://app.gohighlevel.com/location/${location.id}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Abrir <ExternalLinkIcon />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={pending}
            aria-label="Quitar subcuenta"
            onClick={() => run(() => unlinkGhlLocation(client.id))}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <div className="px-4 pt-3 pb-4">
          <EmptyState title="Sin subcuenta enlazada">
            Elige la subcuenta de este cliente entre las de la agencia.
          </EmptyState>
          <div className="mt-2 flex justify-center">
            <LinkPicker
              options={options.map((l) => ({
                value: l.id,
                label: l.name,
                detail: l.email ?? l.id,
              }))}
              placeholder="Buscar subcuenta"
              empty={optionsError ?? "Ninguna subcuenta coincide."}
              buttonLabel="Elegir subcuenta"
              disabled={pending || Boolean(optionsError)}
              onPick={(id) => run(() => linkGhlLocation(client.id, id))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
