"use client"

import { useMemo, useState } from "react"
import { ChevronRightIcon, SearchIcon } from "lucide-react"

import { EmptyState, Instrument } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { iaStatusLabel, type IaStatus, type Subaccount } from "@/data/lezgo-ia"
import { cn } from "@/lib/utils"

type StatusFilter = IaStatus | "todas"

const filters: { value: StatusFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "active", label: "IA activa" },
  { value: "paused", label: "En pausa" },
  { value: "unset", label: "Sin configurar" },
]

/**
 * Todas las subcuentas en una tabla densa: se busca por nombre o cliente
 * y se filtra por estado. Escala a cientos de filas sin que la
 * configuración quede encajonada en una columna lateral. Elegir una fila
 * abre su configuración a todo el ancho.
 */
export function SubaccountDirectory({
  subaccounts,
  onOpen,
}: {
  subaccounts: Subaccount[]
  onOpen: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("todas")

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      todas: subaccounts.length,
      active: 0,
      paused: 0,
      unset: 0,
    }
    for (const s of subaccounts) c[s.status]++
    return c
  }, [subaccounts])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return subaccounts
      .filter((s) => status === "todas" || s.status === status)
      .filter(
        (s) =>
          !q ||
          [s.name, s.clientName ?? "", s.id].some((v) =>
            v.toLowerCase().includes(q),
          ),
      )
  }, [subaccounts, query, status])

  return (
    <Instrument
      label="Subcuentas"
      hint="Elige una para ver sus asesores y ajustar la IA"
      action={
        <span className="num text-xs text-muted-foreground">
          {rows.length} de {subaccounts.length}
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar subcuenta o cliente…"
            aria-label="Buscar subcuenta"
            className="pl-8"
          />
        </div>
        <div
          role="group"
          aria-label="Filtrar por estado"
          className="flex flex-wrap items-center gap-1"
        >
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              aria-pressed={status === f.value}
              disabled={f.value !== "todas" && counts[f.value] === 0}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-40",
                status === f.value
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
              )}
            >
              {f.label}
              <span className="num text-[10px] text-muted-foreground">
                {counts[f.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Ninguna subcuenta coincide">
          Quita el filtro o cambia la búsqueda.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Subcuenta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Asesores</TableHead>
                <TableHead className="text-right">Con avisos</TableHead>
                <TableHead className="text-right">Pipelines</TableHead>
                <TableHead className="pr-4">
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const chip = iaStatusLabel[s.status]
                const admins = s.advisors.filter((a) => a.role === "admin").length
                const withAlerts = s.advisors.filter((a) => a.alerts).length
                return (
                  <TableRow
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className="group cursor-pointer"
                  >
                    <TableCell className="pl-4">
                      {/* El botón lleva el foco y el lector de pantalla; la fila entera es el área de clic. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(s.id)
                        }}
                        className="block max-w-72 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <span className="block truncate font-medium group-hover:underline">
                          {s.name}
                        </span>
                        {s.clientName && s.clientName !== s.name && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            Cliente {s.clientName}
                          </span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                    </TableCell>
                    <TableCell className="num text-right">
                      {s.advisors.length}
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {admins} admin
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num text-right",
                        withAlerts === 0 && "text-muted-foreground",
                      )}
                    >
                      {withAlerts}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "num text-right",
                        s.pipelines.length === 0 && "text-muted-foreground",
                      )}
                    >
                      {s.pipelines.length || "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <ChevronRightIcon
                        aria-hidden
                        className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Instrument>
  )
}
