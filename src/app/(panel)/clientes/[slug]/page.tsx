import { notFound } from "next/navigation"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"

import { LinkButton } from "@/components/panel/link-button"
import {
  EmptyState,
  Instrument,
  PageHeader,
} from "@/components/panel/page-header"
import { SignalMeter, toneForHealth } from "@/components/signal/signal-meter"
import {
  clientStatusLabel,
  invoiceStatusLabel,
  stageLabel,
  StatusChip,
} from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fullDate, money, relativeDays, shortDate } from "@/lib/format"
import {
  getClient,
  listActivity,
  listImplementations,
  listInvoices,
} from "@/lib/repository"

const planLabel = { launch: "Launch", scale: "Scale", enterprise: "Enterprise" }

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const client = await getClient(slug)
  return { title: client?.name ?? "Cliente" }
}

export default async function ClientePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client) notFound()

  const [implementations, invoices, activity] = await Promise.all([
    listImplementations(),
    listInvoices(),
    listActivity(40),
  ])

  const work = implementations.filter((i) => i.clientId === client.id)
  const bills = invoices.filter((i) => i.clientId === client.id)
  const events = activity.filter((a) => a.clientId === client.id).slice(0, 6)
  const state = clientStatusLabel[client.status]
  const owed = bills
    .filter((i) => i.status === "due" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amount, 0)

  return (
    <div className="blueprint">
      <div className="px-4 pt-6 md:px-6">
        <LinkButton href="/clientes" variant="ghost" size="xs">
          <ArrowLeftIcon /> Clientes
        </LinkButton>
      </div>

      <PageHeader
        eyebrow={`${client.industry} · Plan ${planLabel[client.plan]}`}
        title={client.name}
        description={client.notes}
        className="pt-4"
        actions={
          <>
            <LinkButton href="/copiloto" variant="outline" size="sm">
              Preguntar al copiloto
            </LinkButton>
            <Button
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={`https://app.gohighlevel.com/location/${client.ghlLocationId}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Abrir en GoHighLevel <ExternalLinkIcon />
            </Button>
          </>
        }
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        <section className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
          <Fact label="Estado">
            <StatusChip tone={state.tone}>{state.label}</StatusChip>
          </Fact>
          <Fact label="MRR">
            <span className="num text-xl font-semibold">
              {money(client.mrr)}
            </span>
          </Fact>
          <Fact label="Salud">
            <span className="num text-xl font-semibold">{client.health}</span>
            <SignalMeter
              value={client.health}
              tone={toneForHealth(client.health)}
              className="mt-2"
              label={`Salud de ${client.name}: ${client.health} de 100`}
            />
          </Fact>
          <Fact label="Usuarios">
            <span className="num text-xl font-semibold">{client.seats}</span>
          </Fact>
          <Fact label="Cliente desde">
            <span className="text-sm">{fullDate(client.startedAt)}</span>
          </Fact>
          <Fact label="Renueva">
            <span className="text-sm">{fullDate(client.renewsAt)}</span>
            <span className="block text-xs text-muted-foreground">
              {relativeDays(client.renewsAt)}
            </span>
          </Fact>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Instrument
            label="Implementaciones"
            hint={`${work.filter((i) => i.stage !== "live").length} en curso · ${work.length} en total`}
          >
            {work.length === 0 ? (
              <EmptyState title="Sin implementaciones registradas">
                Cuando abras un proyecto para esta cuenta aparecerá aquí.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {work.map((item) => {
                  const stage = stageLabel[item.stage]
                  return (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.name}</span>
                        <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
                        {item.blocked && (
                          <StatusChip tone="warn">Bloqueado</StatusChip>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <SignalMeter
                          value={item.progress}
                          tone={item.blocked ? "warn" : "build"}
                          label={`Avance de ${item.name}: ${item.progress}%`}
                        />
                        <span className="num text-xs text-muted-foreground">
                          {item.progress}%
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {item.owner} · entrega {relativeDays(item.dueAt)}
                        </span>
                      </div>
                      {item.blocked && item.blockedReason && (
                        <p className="mt-2 text-xs text-status-warn">
                          {item.blockedReason}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Instrument>

          <Instrument
            label="Facturación"
            hint={owed > 0 ? `${money(owed)} pendiente` : "Sin saldo pendiente"}
          >
            {bills.length === 0 ? (
              <EmptyState title="Sin facturas" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Vence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((invoice) => {
                    const status = invoiceStatusLabel[invoice.status]
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <span className="num text-xs">{invoice.number}</span>
                          <span className="block text-xs text-muted-foreground">
                            {invoice.memo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusChip tone={status.tone}>
                            {status.label}
                          </StatusChip>
                        </TableCell>
                        <TableCell data-num className="text-right">
                          {money(invoice.amount)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {shortDate(invoice.dueAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Instrument>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Instrument label="Subcuenta de GoHighLevel" hint="Identificadores">
            <dl className="divide-y divide-border">
              <Row term="Location ID" detail={client.ghlLocationId} mono />
              <Row term="Responsable" detail={client.owner} />
              <Row term="Sector" detail={client.industry} />
              <Row term="Plan" detail={planLabel[client.plan]} />
            </dl>
          </Instrument>

          <Instrument label="Actividad de la cuenta" hint="Últimos movimientos">
            {events.length === 0 ? (
              <EmptyState title="Sin actividad reciente" />
            ) : (
              <ul className="divide-y divide-border">
                {events.map((event) => (
                  <li key={event.id} className="px-4 py-3">
                    <p className="text-sm">{event.summary}</p>
                    <p className="eyebrow mt-1">
                      {event.actor} · {shortDate(event.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Instrument>
        </div>
      </div>
    </div>
  )
}

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-border px-4 py-4 first:border-t-0 sm:border-t-0">
      <p className="eyebrow mb-2.5">{label}</p>
      {children}
    </div>
  )
}

function Row({
  term,
  detail,
  mono,
}: {
  term: string
  detail: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className={mono ? "num text-xs" : "text-sm"}>{detail}</dd>
    </div>
  )
}
