"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { SearchIcon } from "lucide-react"

import { SignalMeter, toneForHealth } from "@/components/signal/signal-meter"
import { clientStatusLabel, StatusChip } from "@/components/signal/status-chip"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { money, relativeDays, shortDate } from "@/lib/format"
import type { Client, ClientStatus } from "@/lib/types"

const statusFilterLabel: Record<string, string> = {
  todos: "Todos los estados",
  live: "Activo",
  onboarding: "Onboarding",
  at_risk: "En riesgo",
  churned: "Baja",
}

const sortFilterLabel: Record<string, string> = {
  mrr: "Mayor MRR",
  health: "Mejor salud",
  name: "Nombre A–Z",
  renewsAt: "Próxima renovación",
}

const planLabel: Record<Client["plan"], string> = {
  launch: "Launch",
  scale: "Scale",
  enterprise: "Enterprise",
}

type SortKey = "mrr" | "health" | "name" | "renewsAt"

export function ClientsTable({ clients }: { clients: Client[] }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<ClientStatus | "todos">("todos")
  const [sort, setSort] = useState<SortKey>("mrr")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter(
        (c) =>
          (status === "todos" || c.status === status) &&
          (!q ||
            c.name.toLowerCase().includes(q) ||
            c.industry.toLowerCase().includes(q) ||
            c.owner.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "es")
        if (sort === "renewsAt") return a.renewsAt.localeCompare(b.renewsAt)
        return b[sort] - a[sort]
      })
  }, [clients, query, status, sort])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, sector o responsable"
            aria-label="Buscar clientes"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ClientStatus | "todos")}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Filtrar por estado">
            <SelectValue>
              {(value: string) => statusFilterLabel[value]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="live">Activo</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="at_risk">En riesgo</SelectItem>
            <SelectItem value="churned">Baja</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Ordenar clientes">
            <SelectValue>{(value: string) => sortFilterLabel[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mrr">Mayor MRR</SelectItem>
            <SelectItem value="health">Mejor salud</SelectItem>
            <SelectItem value="name">Nombre A–Z</SelectItem>
            <SelectItem value="renewsAt">Próxima renovación</SelectItem>
          </SelectContent>
        </Select>

        <span className="num ml-auto text-xs text-muted-foreground">
          {rows.length} de {clients.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Ningún cliente coincide con ese filtro.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Salud</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Renueva</TableHead>
                <TableHead>Subcuenta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((client) => {
                const state = clientStatusLabel[client.status]
                return (
                  <TableRow key={client.id} className="group">
                    <TableCell>
                      <Link
                        href={`/clientes/${client.slug}`}
                        className="block min-w-44"
                      >
                        <span className="font-medium group-hover:text-primary">
                          {client.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {client.industry} · {client.seats} usuarios
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {planLabel[client.plan]}
                    </TableCell>
                    <TableCell data-num className="text-right">
                      {money(client.mrr * 100, "usd")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SignalMeter
                          value={client.health}
                          tone={toneForHealth(client.health)}
                          segments={8}
                          label={`Salud de ${client.name}: ${client.health} de 100`}
                        />
                        <span className="num text-xs text-muted-foreground">
                          {client.health}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {client.owner}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {shortDate(client.renewsAt)}
                      <span className="block text-xs text-muted-foreground">
                        {relativeDays(client.renewsAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="num text-xs text-muted-foreground">
                        {client.ghlLocationId}
                      </code>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
