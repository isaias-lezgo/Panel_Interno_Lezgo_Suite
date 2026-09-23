"use client"

import { useMemo, useState } from "react"
import { ArrowRightIcon, CheckIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"

import { SubaccountSwitcher } from "@/components/lezgo-ia/subaccount-switcher"
import { EmptyState, Instrument } from "@/components/panel/page-header"
import { SignalMeter } from "@/components/signal/signal-meter"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  threadKindLabel,
  type Advisor,
  type LezgoIaData,
  type Thread,
} from "@/data/lezgo-ia"
import { initials, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Minutos que lleva esperando la última propuesta sin decidir. */
function waitingMinutes(thread: Thread, now: string) {
  const last = thread.messages[thread.messages.length - 1]
  return Math.round(
    (new Date(now).getTime() - new Date(last.at).getTime()) / 60_000,
  )
}

function waitingLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`
  return `${Math.round(minutes / 60 / 24)} d`
}

/**
 * Lo que un gerente mira primero: cómo va cada asesor y qué propuestas de
 * la IA siguen sin respuesta en todo el equipo.
 */
export function OverviewTab({ data }: { data: LezgoIaData }) {
  const { subaccounts, now } = data
  const [account, setAccount] = useState("todas")
  const [threads, setThreads] = useState<Thread[]>(data.threads)
  const accountById = useMemo(
    () => new Map(subaccounts.map((s) => [s.id, s])),
    [subaccounts],
  )
  const advisorOf = (thread: Thread) =>
    accountById
      .get(thread.subaccountId)
      ?.advisors.find((a) => a.id === thread.advisorId)

  const accounts =
    account === "todas"
      ? subaccounts
      : subaccounts.filter((s) => s.id === account)

  const advisors = accounts.flatMap((s) =>
    s.advisors.map((a) => ({ ...a, account: s })),
  )
  // Primero los que ya tienen métricas, por velocidad; después los que la IA
  // todavía no mide, por leads abiertos.
  const measured = advisors
    .filter((a) => a.metrics && a.metrics.firstResponseMin > 0)
    .sort((a, b) => a.metrics!.firstResponseMin - b.metrics!.firstResponseMin)
  const unmeasured = advisors
    .filter((a) => !a.metrics || a.metrics.firstResponseMin === 0)
    .sort(
      (a, b) =>
        (b.activeLeads ?? -1) - (a.activeLeads ?? -1) ||
        a.name.localeCompare(b.name, "es"),
    )
  const rows = [...measured, ...unmeasured]

  const pending = threads
    .filter((t) => account === "todas" || t.subaccountId === account)
    .filter((t) =>
      t.messages.some((m) => m.actions && !m.actions.some((a) => a.chosen)),
    )
    .sort((a, b) => waitingMinutes(b, now) - waitingMinutes(a, now))

  const decide = (thread: Thread, label: string) => {
    setThreads((list) =>
      list.map((t) =>
        t.id === thread.id
          ? {
              ...t,
              unread: false,
              messages: t.messages.map((m) =>
                m.actions
                  ? {
                      ...m,
                      actions: m.actions.map((a) => ({
                        label: a.label,
                        chosen: a.label === label,
                      })),
                    }
                  : m,
              ),
            }
          : t,
      ),
    )
    toast.success(`«${label}» aplicado por ti en nombre de ${advisorOf(thread)?.name.split(" ")[0]}`, {
      description: "Vista previa: no se envía nada.",
    })
  }

  const reassign = (thread: Thread) => {
    toast(`Reasignar «${thread.subject}»`, {
      description: "Vista previa: aquí se elegiría otro asesor.",
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SubaccountSwitcher
          subaccounts={subaccounts}
          value={account}
          onChange={setAccount}
          allLabel="Todas las subcuentas"
        />
        <span className="text-xs text-muted-foreground">Últimos 30 días</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Instrument
          label="Por asesor"
          hint={
            measured.length === 0 && rows.length > 0
              ? `${rows.length} ${rows.length === 1 ? "asesor" : "asesores"} en GoHighLevel, por leads abiertos. El resto de las métricas aparece cuando la IA corra en su subcuenta.`
              : "Ordenado por primera respuesta. Un medidor lleno = responde en menos de 15 min."
          }
        >
          {rows.length === 0 ? (
            <EmptyState title="Sin asesores">
              {subaccounts.length === 0
                ? "Ningún cliente tiene una subcuenta de GoHighLevel enlazada."
                : "La subcuenta no tiene usuarios propios en GoHighLevel."}
            </EmptyState>
          ) : (
            // Con todas las subcuentas son cientos de asesores: la tabla
            // se desplaza sola y el encabezado se queda arriba.
            <div className="max-h-[36rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="pl-4">Asesor</TableHead>
                    <TableHead>Primera respuesta</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Sin contacto</TableHead>
                    <TableHead className="text-right">Visitas IA</TableHead>
                    <TableHead className="pr-4 text-right">Propuestas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => (
                      <AdvisorRow key={`${a.account.id}:${a.id}`} advisor={a} accountName={a.account.name} showAccount={account === "todas"} />
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Instrument>

        <Instrument
          label="Cola de aprobaciones"
          hint="Propuestas que un asesor no ha contestado. Decide tú o reasigna."
          className="self-start"
        >
          {pending.length === 0 ? (
            <EmptyState title="Nada pendiente">
              {data.source === "ghl"
                ? "La IA todavía no ha propuesto nada: no corre en ninguna subcuenta."
                : "Todas las propuestas de la IA ya tienen respuesta."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((thread) => {
                const advisor = advisorOf(thread)
                const kind = threadKindLabel[thread.kind]
                const proposal = [...thread.messages]
                  .reverse()
                  .find((m) => m.actions && !m.actions.some((a) => a.chosen))!
                const minutes = waitingMinutes(thread, now)
                return (
                  <li key={thread.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{thread.subject}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {advisor?.name} · {accountById.get(thread.subaccountId)?.name}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "num shrink-0 text-xs",
                          minutes > 120 ? "text-status-risk" : "text-status-warn",
                        )}
                      >
                        {waitingLabel(minutes)} esperando
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip tone={kind.tone}>{kind.label}</StatusChip>
                      {proposal.actions!.map((action) => (
                        <Button
                          key={action.label}
                          size="xs"
                          variant="outline"
                          onClick={() => decide(thread, action.label)}
                        >
                          <CheckIcon aria-hidden /> {action.label}
                        </Button>
                      ))}
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => reassign(thread)}
                      >
                        <UserRoundIcon aria-hidden /> Reasignar
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Instrument>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ArrowRightIcon className="size-3" aria-hidden />
        Cada asesor tiene su propio detalle en Configuración; los mensajes completos están en Mensajes.
      </p>
    </div>
  )
}

function AdvisorRow({
  advisor,
  accountName,
  showAccount,
}: {
  advisor: Advisor
  accountName: string
  showAccount: boolean
}) {
  const m = advisor.metrics
  if (!m || m.firstResponseMin === 0) {
    return (
      <TableRow>
        <TableCell className="pl-4">
          <AdvisorName advisor={advisor} accountName={accountName} showAccount={showAccount} />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">Sin medir</TableCell>
        <TableCell
          className={cn(
            "num text-right",
            advisor.activeLeads === null && "text-muted-foreground",
          )}
        >
          {advisor.activeLeads ?? "—"}
        </TableCell>
        <TableCell className="num text-right text-muted-foreground">—</TableCell>
        <TableCell className="num text-right text-muted-foreground">—</TableCell>
        <TableCell className="num pr-4 text-right text-muted-foreground">—</TableCell>
      </TableRow>
    )
  }
  const speed = Math.max(0, Math.min(100, 100 - (m.firstResponseMin / 60) * 100))
  const total = m.accepted + m.ignored
  const rate = total > 0 ? Math.round((m.accepted / total) * 100) : 0
  return (
    <TableRow>
      <TableCell className="pl-4">
        <AdvisorName advisor={advisor} accountName={accountName} showAccount={showAccount} />
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <SignalMeter
            value={speed}
            tone={m.firstResponseMin <= 15 ? "live" : m.firstResponseMin <= 45 ? "build" : "risk"}
            segments={8}
            label={`Primera respuesta: ${m.firstResponseMin} min`}
          />
          <span className={cn("num text-xs", m.firstResponseMin > 45 && "text-status-risk")}>
            {m.firstResponseMin >= 60 ? `${Math.round(m.firstResponseMin / 60)} h` : `${m.firstResponseMin} min`}
          </span>
        </span>
      </TableCell>
      <TableCell className="num text-right">{advisor.activeLeads ?? "—"}</TableCell>
      <TableCell className={cn("num text-right", m.noContact > 0 && "text-status-warn")}>
        {m.noContact}
      </TableCell>
      <TableCell className="num text-right">{m.visitsByIa}</TableCell>
      <TableCell className="num pr-4 text-right">
        {rate}%{" "}
        <span className="text-xs text-muted-foreground">
          ({m.accepted}/{total})
        </span>
      </TableCell>
    </TableRow>
  )
}

function AdvisorName({
  advisor,
  accountName,
  showAccount,
}: {
  advisor: Advisor
  accountName: string
  showAccount: boolean
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="num grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-medium"
      >
        {initials(advisor.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{advisor.name}</span>
        {showAccount && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {accountName}
          </span>
        )}
        {advisor.away && (
          <span className="block text-[11px] text-status-warn">
            Fuera del {shortDate(advisor.away.from)} al {shortDate(advisor.away.to)}
          </span>
        )}
      </span>
    </span>
  )
}
