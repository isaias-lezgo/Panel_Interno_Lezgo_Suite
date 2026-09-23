"use client"

import { ChevronRightIcon } from "lucide-react"

import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  overriddenKeys,
  relativeTime,
  type Advisor,
  type SettingValues,
} from "@/data/lezgo-ia"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

export function AdvisorsTable({
  advisors,
  teamSettings,
  selectedId,
  now,
  onSelect,
  onAlertsChange,
}: {
  now: string
  advisors: Advisor[]
  teamSettings: SettingValues
  /** Asesor cuyos ajustes se están editando, si no es el equipo. */
  selectedId?: string
  onSelect: (advisorId: string) => void
  onAlertsChange: (advisorId: string, alerts: boolean) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Asesor</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Responde en</TableHead>
          <TableHead>Última actividad</TableHead>
          <TableHead className="text-right">Avisos de IA</TableHead>
          <TableHead className="pr-4 text-right">Ajustes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {advisors.map((advisor) => {
          const minutes = advisor.responseMinutes
          const slow = minutes !== null && minutes > 45
          const own = overriddenKeys(teamSettings, advisor).length
          const selected = advisor.id === selectedId
          return (
            <TableRow
              key={advisor.id}
              data-state={selected ? "selected" : undefined}
              className={cn(selected && "bg-accent/60")}
            >
              <TableCell className="pl-4">
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="num grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-medium"
                  >
                    {initials(advisor.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{advisor.name}</span>
                    {advisor.email && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {advisor.email}
                      </span>
                    )}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <StatusChip tone={advisor.role === "admin" ? "build" : "idle"}>
                  {advisor.role === "admin" ? "Admin" : "Usuario"}
                </StatusChip>
              </TableCell>
              <TableCell
                className={cn(
                  "num text-right",
                  advisor.activeLeads === null && "text-muted-foreground",
                )}
              >
                {advisor.activeLeads ?? "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "num text-right",
                  slow && "text-status-warn",
                  !minutes && "text-muted-foreground",
                )}
              >
                {!minutes
                  ? "—"
                  : minutes >= 60
                    ? `${Math.round(minutes / 60)} h`
                    : `${minutes} min`}
              </TableCell>
              <TableCell className="num text-muted-foreground">
                {relativeTime(advisor.lastActiveAt, now)}
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  size="sm"
                  checked={advisor.alerts}
                  onCheckedChange={(checked) =>
                    onAlertsChange(advisor.id, checked)
                  }
                  aria-label={`Avisos de IA para ${advisor.name}`}
                />
              </TableCell>
              <TableCell className="pr-4 text-right">
                <Button
                  variant={selected ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => onSelect(advisor.id)}
                  aria-pressed={selected}
                  className={cn(!selected && own === 0 && "text-muted-foreground")}
                >
                  {own > 0 ? (
                    <>
                      <span className="num">{own}</span>{" "}
                      {own === 1 ? "propio" : "propios"}
                    </>
                  ) : (
                    "Como el equipo"
                  )}
                  <ChevronRightIcon aria-hidden />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
