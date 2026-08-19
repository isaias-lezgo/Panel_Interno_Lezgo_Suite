"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import { invoiceStatusLabel, StatusChip } from "@/components/signal/status-chip"
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
import type { Client, Invoice, InvoiceStatus } from "@/lib/types"

const statusFilterLabel: Record<string, string> = {
  todas: "Todas las facturas",
  overdue: "Vencidas",
  due: "Por vencer",
  paid: "Pagadas",
  draft: "Borradores",
}

export function InvoicesTable({
  invoices,
  clients,
}: {
  invoices: Invoice[]
  clients: Client[]
}) {
  const [status, setStatus] = useState<InvoiceStatus | "todas">("todas")

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  )

  const rows = invoices
    .filter((i) => status === "todas" || i.status === status)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))

  const total = rows.reduce((sum, i) => sum + i.amount, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus((value ?? "todas") as InvoiceStatus | "todas")
          }
        >
          <SelectTrigger
            size="sm"
            className="w-44"
            aria-label="Filtrar facturas por estado"
          >
            <SelectValue>
              {(value: string) => statusFilterLabel[value]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las facturas</SelectItem>
            <SelectItem value="overdue">Vencidas</SelectItem>
            <SelectItem value="due">Por vencer</SelectItem>
            <SelectItem value="paid">Pagadas</SelectItem>
            <SelectItem value="draft">Borradores</SelectItem>
          </SelectContent>
        </Select>

        <span className="num ml-auto text-xs text-muted-foreground">
          {rows.length} facturas · {money(total)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay facturas con ese estado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>Emitida</TableHead>
                <TableHead>Vence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((invoice) => {
                const client = clientById.get(invoice.clientId)
                const state = invoiceStatusLabel[invoice.status]
                return (
                  <TableRow key={invoice.id}>
                    <TableCell data-num className="text-xs">
                      {invoice.number}
                    </TableCell>
                    <TableCell>
                      {client ? (
                        <Link
                          href={`/clientes/${client.slug}`}
                          className="text-sm hover:text-primary"
                        >
                          {client.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {invoice.memo}
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                    </TableCell>
                    <TableCell data-num className="text-right">
                      {money(invoice.amount)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {shortDate(invoice.issuedAt)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {shortDate(invoice.dueAt)}
                      {invoice.status === "overdue" && (
                        <span className="block text-status-risk">
                          {relativeDays(invoice.dueAt)}
                        </span>
                      )}
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
