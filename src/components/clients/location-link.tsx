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
import type { ClientDetail, LocationOption } from "@/lib/types"

import { LinkPicker } from "./link-picker"

type Result = { ok: true } | { ok: false; error: string }

export function LocationLinks({
  clientId,
  links,
  options,
  optionsError,
}: {
  clientId: string
  links: ClientDetail["locations"]
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {optionsError ?? `${options.length} sin dueño en la agencia`}
        </span>
        <LinkPicker
          options={options.map((l) => ({
            value: l.id,
            label: l.name,
            detail: l.email ?? l.id,
          }))}
          placeholder="Buscar subcuenta"
          empty={optionsError ?? "Ninguna subcuenta coincide."}
          buttonLabel="Agregar subcuenta"
          disabled={pending || Boolean(optionsError)}
          onPick={(id) => run(() => linkGhlLocation(clientId, id))}
        />
      </div>

      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}

      {links.length === 0 ? (
        <EmptyState title="Sin subcuenta enlazada">
          Elige una del desplegable. La que coincide por correo, teléfono o
          nombre exacto se enlaza sola al sincronizar.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li
              key={l.ghlLocationId}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.email ?? "Sin correo"} ·{" "}
                  <code className="num">{l.ghlLocationId}</code>
                </p>
              </div>
              <StatusChip tone={l.linkedBy === "auto" ? "live" : "build"}>
                {l.linkedBy === "auto" ? "Automático" : "Manual"}
              </StatusChip>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={`https://login.lezgosuite.com/location/${l.ghlLocationId}`}
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
                aria-label={`Quitar ${l.name}`}
                onClick={() => run(() => unlinkGhlLocation(l.ghlLocationId))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
