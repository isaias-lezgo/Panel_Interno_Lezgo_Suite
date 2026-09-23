"use client"

import { useCallback, useMemo, useState } from "react"
import { DownloadIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ThreadView } from "@/components/lezgo-ia/thread-view"
import { SubaccountSwitcher } from "@/components/lezgo-ia/subaccount-switcher"
import { EmptyState, Instrument } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  relativeTime,
  threadKindLabel,
  type LezgoIaData,
  type Thread,
  type ThreadKind,
} from "@/data/lezgo-ia"
import { cn } from "@/lib/utils"

type KindFilter = ThreadKind | "todos"

const kindFilterLabel: Record<string, string> = {
  todos: "Todos los tipos",
  alert: "Alertas",
  analysis: "Análisis",
  question: "Consultas al CRM",
}

type RangeFilter = "hoy" | "7d" | "30d" | "todo"

const rangeLabel: Record<RangeFilter, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  todo: "Todo el historial",
}

const rangeDays: Record<RangeFilter, number> = { hoy: 1, "7d": 7, "30d": 30, todo: Infinity }

/**
 * Auditoría de todo lo que la IA cruza con los asesores. Un hilo es una
 * conversación IA ↔ asesor sobre un lead, un análisis o una pregunta. La IA
 * no habla con el comprador, así que aquí está todo lo que dijo.
 */
export function MessagesTab({ data }: { data: LezgoIaData }) {
  const { subaccounts, now } = data
  const seed = data.threads
  const accountById = useMemo(
    () => new Map(subaccounts.map((s) => [s.id, s])),
    [subaccounts],
  )
  const advisorOf = useCallback(
    (thread: Thread) =>
      accountById
        .get(thread.subaccountId)
        ?.advisors.find((a) => a.id === thread.advisorId),
    [accountById],
  )
  const [threads, setThreads] = useState<Thread[]>(seed)
  const [account, setAccount] = useState("todas")
  const [kind, setKind] = useState<KindFilter>("todos")
  const [query, setQuery] = useState("")
  const [range, setRange] = useState<RangeFilter>("7d")
  const [openId, setOpenId] = useState(
    () => [...seed].sort((a, b) => lastAt(b).localeCompare(lastAt(a)))[0]?.id,
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return threads
      .filter((t) => account === "todas" || t.subaccountId === account)
      .filter((t) => kind === "todos" || t.kind === kind)
      .filter((t) => {
        if (range === "todo") return true
        const cutoff = new Date(now)
        cutoff.setHours(0, 0, 0, 0)
        cutoff.setDate(cutoff.getDate() - (rangeDays[range] - 1))
        return new Date(lastAt(t)) >= cutoff
      })
      .filter((t) => {
        if (!q) return true
        const advisor = advisorOf(t)?.name ?? ""
        return (
          t.subject.toLowerCase().includes(q) ||
          (t.about ?? "").toLowerCase().includes(q) ||
          advisor.toLowerCase().includes(q) ||
          t.messages.some((m) => m.text.toLowerCase().includes(q))
        )
      })
      .sort((a, b) => lastAt(b).localeCompare(lastAt(a)))
  }, [threads, account, kind, query, range, now, advisorOf])

  const open = rows.find((t) => t.id === openId) ?? rows[0]

  const patchThread = (id: string, update: (thread: Thread) => Thread) =>
    setThreads((list) => list.map((t) => (t.id === id ? update(t) : t)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SubaccountSwitcher
          subaccounts={subaccounts}
          value={account}
          onChange={setAccount}
          allLabel="Todas las subcuentas"
        />

        <Select value={kind} onValueChange={(v) => setKind((v ?? "todos") as KindFilter)}>
          <SelectTrigger size="sm" className="w-48" aria-label="Filtrar por tipo de mensaje">
            <SelectValue>{(value: string) => kindFilterLabel[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(kindFilterLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lead, asesor o texto…"
            aria-label="Buscar en los mensajes"
            className="pl-8"
          />
        </div>

        <Select value={range} onValueChange={(v) => setRange((v ?? "7d") as RangeFilter)}>
          <SelectTrigger size="sm" className="w-44" aria-label="Filtrar por fecha">
            <SelectValue>{(v: string) => rangeLabel[v as RangeFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(rangeLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="num ml-auto text-xs text-muted-foreground">
          {rows.length} de {threads.length} hilos
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast(`Exportar ${rows.length} hilos`, {
              description: "Vista previa: aquí se descargaría un CSV con los filtros actuales.",
            })
          }
        >
          <DownloadIcon aria-hidden /> Exportar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Instrument label="Hilos" hint="Más recientes primero" className="self-start">
          {rows.length === 0 ? (
            threads.length === 0 ? (
              <EmptyState title="Sin mensajes todavía">
                La IA no ha cruzado ningún mensaje con los asesores: aún no corre en ninguna subcuenta.
              </EmptyState>
            ) : (
              <EmptyState title="Ningún hilo coincide">
                Quita un filtro o cambia la búsqueda.
              </EmptyState>
            )
          ) : (
            <ul className="divide-y divide-border" role="list">
              {rows.map((thread) => {
                const active = open?.id === thread.id
                const advisor = advisorOf(thread)
                const chip = threadKindLabel[thread.kind]
                const last = thread.messages[thread.messages.length - 1]
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(thread.id)
                        patchThread(thread.id, (t) => ({ ...t, unread: false }))
                      }}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "relative flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors",
                        active ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-3 bottom-3 left-0 w-[2px] rounded-full bg-primary transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {thread.unread && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-status-warn"
                              role="img"
                              aria-label="Sin leer"
                            />
                          )}
                          <span
                            className={cn(
                              "truncate text-sm",
                              thread.unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {advisor?.name ?? "Asesor"}
                          </span>
                        </span>
                        <span className="num shrink-0 text-[11px] text-muted-foreground">
                          {relativeTime(last.at, now)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-foreground/80">
                        {thread.subject}
                      </span>
                      <span className="flex items-center justify-between gap-2 pt-1">
                        <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                        {account === "todas" && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {accountById.get(thread.subaccountId)?.name}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Instrument>

        {open ? (
          <ThreadView
            key={open.id}
            thread={open}
            account={accountById.get(open.subaccountId)!}
            advisor={advisorOf(open)!}
            now={now}
            onChange={(update) => patchThread(open.id, update)}
          />
        ) : (
          <Instrument label="Conversación">
            <EmptyState title="Elige un hilo" />
          </Instrument>
        )}
      </div>
    </div>
  )
}

function lastAt(thread: Thread) {
  return thread.messages[thread.messages.length - 1].at
}
