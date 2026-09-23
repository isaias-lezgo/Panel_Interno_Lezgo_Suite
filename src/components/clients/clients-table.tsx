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

import {
  DueCell,
  MembershipCell,
  PeriodCell,
  SupportCell,
} from "./account-cells"
import {
  ColumnPicker,
  columnLabel,
  columnOrder,
  useColumns,
  type ColumnKey,
} from "./columns"

type Filter = "todos" | "sin_enlazar" | "huerfanos" | "por_vencer"
type SortKey = "mrr" | "name" | "wonAt" | "licenseDueAt"

const filterLabel: Record<Filter, string> = {
  todos: "Todos",
  sin_enlazar: "Sin enlazar",
  huerfanos: "Sin oportunidad",
  por_vencer: "Vencen en 30 días",
}

const sortLabel: Record<SortKey, string> = {
  mrr: "Mayor MRR",
  name: "Nombre A–Z",
  wonAt: "Cierre más reciente",
  licenseDueAt: "Vencimiento más próximo",
}

/** Las columnas de número y de fecha se alinean a la derecha. */
const alignRight: Partial<Record<ColumnKey, boolean>> = { mrr: true }

const enTreintaDias = (iso: string | null) => {
  if (!iso) return false
  const dias = (Date.parse(iso) - Date.now()) / 86_400_000
  return dias <= 30
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
  const picker = useColumns()
  const visible = useMemo(
    () => new Set(picker.columns),
    [picker.columns],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => {
        if (filter === "sin_enlazar" && c.stripeCount > 0 && c.locationNames.length > 0) {
          return false
        }
        if (filter === "huerfanos" && !c.orphaned) return false
        if (filter === "por_vencer" && !enTreintaDias(c.account.licenseDueAt.value)) {
          return false
        }
        if (!q) return true
        return [c.name, c.contactName, c.email ?? "", ...c.locationNames].some(
          (s) => s.toLowerCase().includes(q),
        )
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "es")
        if (sort === "wonAt") return b.wonAt.localeCompare(a.wonAt)
        if (sort === "licenseDueAt") {
          // Sin fecha, hasta abajo: no es urgente lo que no se sabe.
          const x = a.account.licenseDueAt.value ?? "9999"
          const y = b.account.licenseDueAt.value ?? "9999"
          return x.localeCompare(y)
        }
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
          <SelectTrigger size="sm" className="w-44" aria-label="Filtrar clientes">
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
          <SelectTrigger size="sm" className="w-52" aria-label="Ordenar clientes">
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

        <ColumnPicker {...picker} />

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
                {columnOrder
                  .filter((k) => visible.has(k))
                  .map((k) => (
                    <TableHead
                      key={k}
                      className={alignRight[k] ? "text-right" : undefined}
                    >
                      {columnLabel[k]}
                    </TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <Link href={`/clientes/${c.slug}`} className="block min-w-40">
                      <span className="font-medium group-hover:text-primary">
                        {c.name}
                      </span>
                      <span className="block max-w-56 truncate text-xs text-muted-foreground">
                        {c.contactName}
                        {c.email ? ` · ${c.email}` : ""}
                      </span>
                    </Link>
                  </TableCell>

                  {visible.has("etapa") && (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusChip
                          tone={stageTone(c.stage)}
                          className="max-w-40"
                        >
                          <span className="truncate" title={c.stage}>
                            {c.stage}
                          </span>
                        </StatusChip>
                        {c.orphaned && (
                          <StatusChip tone="idle">Sin oportunidad</StatusChip>
                        )}
                      </div>
                    </TableCell>
                  )}

                  {visible.has("membresia") && (
                    <TableCell className="w-32">
                      <MembershipCell
                        clientId={c.id}
                        field={c.account.membership}
                      />
                    </TableCell>
                  )}

                  {visible.has("soporte") && (
                    <TableCell className="w-40">
                      <SupportCell clientId={c.id} field={c.account.support} />
                    </TableCell>
                  )}

                  {visible.has("periodicidad") && (
                    <TableCell className="w-32">
                      <PeriodCell clientId={c.id} field={c.account.period} />
                    </TableCell>
                  )}

                  {visible.has("vencimiento") && (
                    <TableCell className="w-44">
                      <DueCell clientId={c.id} field={c.account.licenseDueAt} />
                    </TableCell>
                  )}

                  {visible.has("subcuenta") && (
                    <TableCell className="text-sm whitespace-nowrap">
                      {c.locationNames.length === 0 ? (
                        <StatusChip tone="warn">Sin enlazar</StatusChip>
                      ) : (
                        <span
                          className="block max-w-44 truncate"
                          title={c.locationNames.join(", ")}
                        >
                          {c.locationNames[0]}
                          {c.locationNames.length > 1 && (
                            <span className="num text-muted-foreground">
                              {" "}
                              +{c.locationNames.length - 1}
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                  )}

                  {visible.has("stripe") && (
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
                  )}

                  {visible.has("mrr") && (
                    <TableCell data-num className="text-right">
                      {c.mrr === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        money(c.mrr, currency)
                      )}
                    </TableCell>
                  )}

                  {visible.has("cerrado") && (
                    <TableCell className="text-sm whitespace-nowrap">
                      {shortDate(c.wonAt)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
