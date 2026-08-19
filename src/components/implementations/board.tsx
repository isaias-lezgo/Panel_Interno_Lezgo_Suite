"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangleIcon } from "lucide-react"

import { SignalMeter } from "@/components/signal/signal-meter"
import { stageLabel, StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { relativeDays } from "@/lib/format"
import type { Client, Implementation, ImplementationStage } from "@/lib/types"
import { cn } from "@/lib/utils"

const stages: ImplementationStage[] = [
  "scoping",
  "building",
  "review",
  "launch",
  "live",
]

const kindLabel: Record<Implementation["kind"], string> = {
  snapshot: "Snapshot",
  workflow: "Automatización",
  integration: "Integración",
  migration: "Migración",
  training: "Capacitación",
}

export function ImplementationBoard({
  implementations,
  clients,
}: {
  implementations: Implementation[]
  clients: Client[]
}) {
  const [owner, setOwner] = useState("todos")
  const [onlyBlocked, setOnlyBlocked] = useState(false)

  const owners = useMemo(
    () => [...new Set(implementations.map((i) => i.owner))].sort(),
    [implementations],
  )

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  )

  const rows = implementations.filter(
    (i) =>
      (owner === "todos" || i.owner === owner) && (!onlyBlocked || i.blocked),
  )

  const blockedCount = implementations.filter((i) => i.blocked).length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Select
          value={owner}
          onValueChange={(value) => setOwner(value ?? "todos")}
        >
          <SelectTrigger
            size="sm"
            className="w-48"
            aria-label="Filtrar por responsable"
          >
            <SelectValue>
              {(value: string) =>
                value === "todos" ? "Todo el equipo" : value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo el equipo</SelectItem>
            {owners.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={onlyBlocked ? "default" : "outline"}
          onClick={() => setOnlyBlocked((value) => !value)}
          aria-pressed={onlyBlocked}
        >
          <AlertTriangleIcon />
          Solo bloqueados ({blockedCount})
        </Button>

        <span className="num ml-auto text-xs text-muted-foreground">
          {rows.length} proyectos
        </span>
      </div>

      <div className="overflow-x-auto p-3">
        <div className="grid min-w-[62rem] grid-cols-5 gap-3">
          {stages.map((stage) => {
            const column = rows.filter((i) => i.stage === stage)
            const label = stageLabel[stage]
            return (
              <section key={stage} className="min-w-0">
                <header className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h3 className="eyebrow">{label.label}</h3>
                  <span className="num text-xs text-muted-foreground">
                    {column.length}
                  </span>
                </header>

                <div className="space-y-2">
                  {column.length === 0 && (
                    <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      Vacío
                    </p>
                  )}
                  {column.map((item) => {
                    const client = clientById.get(item.clientId)
                    return (
                      <article
                        key={item.id}
                        className={cn(
                          "rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/50",
                          item.blocked && "border-status-warn/50",
                        )}
                      >
                        {client && (
                          <Link
                            href={`/clientes/${client.slug}`}
                            className="eyebrow block truncate hover:text-primary"
                          >
                            {client.name}
                          </Link>
                        )}
                        <p className="mt-1.5 text-sm leading-snug font-medium">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {kindLabel[item.kind]}
                        </p>

                        <div className="mt-3 flex items-center gap-2">
                          <SignalMeter
                            value={item.progress}
                            tone={item.blocked ? "warn" : "build"}
                            segments={8}
                            label={`Avance de ${item.name}: ${item.progress}%`}
                          />
                          <span className="num text-xs text-muted-foreground">
                            {item.progress}%
                          </span>
                        </div>

                        {item.blocked && (
                          <div className="mt-2.5">
                            <StatusChip tone="warn">Bloqueado</StatusChip>
                            {item.blockedReason && (
                              <p className="mt-1.5 text-xs text-muted-foreground">
                                {item.blockedReason}
                              </p>
                            )}
                          </div>
                        )}

                        <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                          <span className="truncate">{item.owner}</span>
                          <span className="whitespace-nowrap">
                            {relativeDays(item.dueAt)}
                          </span>
                        </footer>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
