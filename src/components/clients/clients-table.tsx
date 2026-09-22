"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { SearchIcon } from "lucide-react"

import { stageTone, StatusChip } from "@/components/signal/status-chip"
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
import { money, shortDate } from "@/lib/format"
import type { ClientRow, Currency } from "@/lib/types"

type Filter = "todos" | "sin_enlazar" | "huerfanos"
type SortKey = "mrr" | "name" | "wonAt"

const filterLabel: Record<Filter, string> = {
  todos: "Todos",
  sin_enlazar: "Sin enlazar",
  huerfanos: "Sin oportunidad",
}

const sortLabel: Record<SortKey, string> = {
  mrr: "Mayor MRR",
  name: "Nombre A–Z",
  wonAt: "Cierre más reciente",
}

export function ClientsTable({
  clients,
  currency,
}: {
  clients: ClientRow[]
  currency: Currency
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("todos")
  const [sort, setSort] = useState<SortKey>("mrr")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => {
        if (filter === "sin_enlazar" && c.stripeCount > 0 && c.ghlLocationId) {
          return false
        }
        if (filter === "huerfanos" && !c.orphaned) return false
        if (!q) return true
        return [c.name, c.contactName, c.email ?? "", c.locationName ?? ""].some(
          (s) => s.toLowerCase().includes(q),
        )
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "es")
        if (sort === "wonAt") return b.wonAt.localeCompare(a.wonAt)
        return (b.mrr ?? -1) - (a.mrr ?? -1)
      })
  }, [clients, query, filter, sort])

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
            placeholder="Buscar por empresa, contacto, correo o subcuenta"
            aria-label="Buscar clientes"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filtrar clientes">
            <SelectValue>{(v: string) => filterLabel[v as Filter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(filterLabel) as Filter[]).map((k) => (
              <SelectItem key={k} value={k}>
                {filterLabel[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger size="sm" className="w-44" aria-label="Ordenar clientes">
            <SelectValue>{(v: string) => sortLabel[v as SortKey]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(sortLabel) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {sortLabel[k]}
              </SelectItem>
            ))}
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
                <TableHead>Etapa</TableHead>
                <TableHead>Subcuenta GHL</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Cerrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <Link href={`/clientes/${c.slug}`} className="block min-w-44">
                      <span className="font-medium group-hover:text-primary">
                        {c.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.contactName}
                        {c.email ? ` · ${c.email}` : ""}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusChip tone={stageTone(c.stage)}>{c.stage}</StatusChip>
                      {c.orphaned && (
                        <StatusChip tone="idle">Sin oportunidad</StatusChip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {c.locationName ?? (
                      <StatusChip tone="warn">Sin enlazar</StatusChip>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {c.stripeCount > 0 ? (
                      <span className="num">
                        {c.stripeCount}{" "}
                        {c.stripeCount === 1 ? "enlazado" : "enlazados"}
                      </span>
                    ) : (
                      <StatusChip tone="warn">Sin enlazar</StatusChip>
                    )}
                  </TableCell>
                  <TableCell data-num className="text-right">
                    {c.mrr === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      money(c.mrr, currency)
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {shortDate(c.wonAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
