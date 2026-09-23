"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { invoiceStatusLabel, StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
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
import { money, moneySigned, relativeDays, shortDate } from "@/lib/format"
import type { Client, Currency, Invoice, InvoiceStatus } from "@/lib/types"

const PAGE_SIZE = 25

const statusFilterLabel: Record<string, string> = {
  todas: "Todas las facturas",
  overdue: "Vencidas",
  due: "Por vencer",
  paid: "Pagadas",
  draft: "Borradores",
  void: "Anuladas",
  uncollectible: "Incobrables",
}

export function InvoicesTable({
  invoices,
  clients,
  baseCurrency,
}: {
  invoices: Invoice[]
  clients: Client[]
  baseCurrency: Currency
}) {
  const [status, setStatus] = useState<InvoiceStatus | "todas">("todas")
  const [page, setPage] = useState(0)

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  )

  const rows = invoices
    .filter((i) => status === "todas" || i.status === status)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))

  const total = rows.reduce((sum, i) => sum + (i.amountBase ?? 0), 0)

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const first = current * PAGE_SIZE
  const visible = rows.slice(first, first + PAGE_SIZE)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus((value ?? "todas") as InvoiceStatus | "todas")
            setPage(0)
          }}
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
            <SelectItem value="void">Anuladas</SelectItem>
            <SelectItem value="uncollectible">Incobrables</SelectItem>
          </SelectContent>
        </Select>

        <span className="num ml-auto text-xs text-muted-foreground">
          {rows.length} facturas · {money(total, baseCurrency)}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay facturas con ese estado.
        </p>
      ) : (
        <>
          {/* Layout fijo: las columnas tienen ancho propio y el texto largo se
              recorta, así la tabla cabe en la vista sin scroll lateral. */}
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-36 pl-4 md:table-cell">
                  Folio
                </TableHead>
                <TableHead className="pl-4 md:pl-2">Cliente</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-28 text-right sm:w-32">Importe</TableHead>
                <TableHead className="hidden w-28 pr-4 sm:table-cell">
                  Fecha
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((invoice) => {
                const client = invoice.clientId
                  ? clientById.get(invoice.clientId)
                  : undefined
                const state = invoiceStatusLabel[invoice.status]
                const folio = invoice.hostedUrl ? (
                  <a
                    href={invoice.hostedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary"
                  >
                    {invoice.number}
                  </a>
                ) : (
                  invoice.number
                )
                return (
                  <TableRow key={invoice.id}>
                    <TableCell
                      data-num
                      className="hidden truncate pl-4 text-xs md:table-cell"
                    >
                      {folio}
                    </TableCell>
                    <TableCell className="pl-4 whitespace-normal md:pl-2">
                      {client ? (
                        <Link
                          href={`/clientes/${client.slug}`}
                          className="block truncate text-sm hover:text-primary"
                        >
                          {client.name}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm text-muted-foreground">
                          {invoice.customerName}
                        </span>
                      )}
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="num md:hidden">{folio} · </span>
                        {invoice.memo}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={state.tone}>{state.label}</StatusChip>
                    </TableCell>
                    <TableCell data-num className="truncate text-right">
                      {moneySigned(invoice.amount, invoice.currency, baseCurrency)}
                    </TableCell>
                    <TableCell className="hidden pr-4 text-xs sm:table-cell">
                      <span className="block">
                        {shortDate(invoice.issuedAt)}
                      </span>
                      {invoice.dueAt && (
                        <span
                          className={
                            invoice.status === "overdue"
                              ? "block text-status-risk"
                              : "block text-muted-foreground"
                          }
                        >
                          {invoice.status === "overdue"
                            ? relativeDays(invoice.dueAt)
                            : `vence ${shortDate(invoice.dueAt)}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {pages > 1 && (
            <nav
              aria-label="Paginación de facturas"
              className="flex items-center justify-between gap-3 border-t border-border px-4 py-3"
            >
              <span className="num text-xs text-muted-foreground">
                {first + 1}–{first + visible.length} de {rows.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current - 1)}
                  disabled={current === 0}
                >
                  <ChevronLeft data-icon="inline-start" />
                  Anterior
                </Button>
                <span className="num text-xs text-muted-foreground">
                  {current + 1} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current + 1)}
                  disabled={current === pages - 1}
                >
                  Siguiente
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
