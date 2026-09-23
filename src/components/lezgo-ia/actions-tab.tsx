"use client"

import { useMemo, useState } from "react"
import { ExternalLinkIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import { SubaccountSwitcher } from "@/components/lezgo-ia/subaccount-switcher"
import { EmptyState, Instrument } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { clockTime, relativeTime, type LezgoIaData } from "@/data/lezgo-ia"
import {
  actionKindLabel,
  type ActionKind,
  type GhlAction,
} from "@/data/lezgo-ia-ops"
import { fullDate } from "@/lib/format"
import { cn } from "@/lib/utils"

const kindFilterLabel: Record<string, string> = {
  todas: "Todas las acciones",
  ...Object.fromEntries(
    Object.entries(actionKindLabel).map(([k, v]) => [k, v.label]),
  ),
}

/**
 * Lo que la IA hizo en GoHighLevel, no lo que dijo. Cada fila enlaza al
 * contacto y, si la acción la decidió la IA sola, se puede deshacer.
 */
export function ActionsTab({ data }: { data: LezgoIaData }) {
  const { subaccounts, now } = data
  const accountById = useMemo(
    () => new Map(subaccounts.map((s) => [s.id, s])),
    [subaccounts],
  )
  const [rows, setRows] = useState<GhlAction[]>(data.actions)
  const [account, setAccount] = useState("todas")
  const [kind, setKind] = useState<ActionKind | "todas">("todas")

  const filtered = useMemo(
    () =>
      rows
        .filter((a) => account === "todas" || a.subaccountId === account)
        .filter((a) => kind === "todas" || a.kind === kind)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [rows, account, kind],
  )

  const byDay = useMemo(() => {
    const groups = new Map<string, GhlAction[]>()
    for (const a of filtered) {
      const day = a.at.slice(0, 10)
      groups.set(day, [...(groups.get(day) ?? []), a])
    }
    return [...groups.entries()]
  }, [filtered])

  const undo = (action: GhlAction) => {
    setRows((list) =>
      list.map((a) => (a.id === action.id ? { ...a, undone: true } : a)),
    )
    toast.success(`Deshecho: ${actionKindLabel[action.kind].label.toLowerCase()} en ${action.contact}`, {
      description: "Vista previa: en producción se revierte en GoHighLevel y se avisa al asesor.",
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
        <Select value={kind} onValueChange={(v) => setKind((v ?? "todas") as ActionKind | "todas")}>
          <SelectTrigger size="sm" className="w-48" aria-label="Filtrar por tipo de acción">
            <SelectValue>{(v: string) => kindFilterLabel[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(kindFilterLabel).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="num ml-auto text-xs text-muted-foreground">
          {filtered.length} de {rows.length} acciones
        </span>
      </div>

      <Instrument
        label="Bitácora en GoHighLevel"
        hint="Etapas, citas, tareas, notas y etiquetas que hizo la IA"
      >
        {byDay.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState title="Sin acciones todavía">
              La IA no ha hecho nada en GoHighLevel: aún no corre en ninguna subcuenta.
            </EmptyState>
          ) : (
            <EmptyState title="Ninguna acción coincide">Cambia el filtro.</EmptyState>
          )
        ) : (
          byDay.map(([day, items]) => (
            <div key={day}>
              <p className="border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                {fullDate(day)}
              </p>
              <ul className="divide-y divide-border">
                {items.map((a) => {
                  const kindInfo = actionKindLabel[a.kind]
                  const advisor = accountById
                    .get(a.subaccountId)
                    ?.advisors.find((adv) => adv.id === a.advisorId)
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        "grid gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[4rem_10rem_minmax(0,1fr)_auto] sm:items-start",
                        a.undone && "opacity-60",
                      )}
                    >
                      <time dateTime={a.at} className="num text-xs text-muted-foreground">
                        {clockTime(a.at)}
                      </time>
                      <span>
                        <StatusChip tone={a.undone ? "idle" : kindInfo.tone}>
                          {a.undone ? "Deshecha" : kindInfo.label}
                        </StatusChip>
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-sm", a.undone && "line-through")}>
                          <span className="font-medium">{a.contact}</span>
                          {" · "}
                          {a.text}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Para {advisor?.name} · {accountById.get(a.subaccountId)?.name} ·{" "}
                          {relativeTime(a.at, now)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 sm:justify-end">
                        <Button
                          variant="ghost"
                          size="xs"
                          nativeButton={false}
                          render={<a href={a.ghlUrl} target="_blank" rel="noreferrer" />}
                          className="text-muted-foreground"
                        >
                          Ver en GHL <ExternalLinkIcon aria-hidden />
                        </Button>
                        {a.reversible && !a.undone && (
                          <Button variant="outline" size="xs" onClick={() => undo(a)}>
                            <Undo2Icon aria-hidden /> Deshacer
                          </Button>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </Instrument>
    </div>
  )
}
