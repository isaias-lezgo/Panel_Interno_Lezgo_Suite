"use client"

import { useRef, useState, useTransition } from "react"
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import { AdvisorsTable } from "@/components/lezgo-ia/advisors-table"
import { AutomationSettings } from "@/components/lezgo-ia/automation-settings"
import { StageRules } from "@/components/lezgo-ia/stage-rules"
import { SubaccountDirectory } from "@/components/lezgo-ia/subaccount-directory"
import { SubaccountSwitcher } from "@/components/lezgo-ia/subaccount-switcher"
import { VoiceSettings } from "@/components/lezgo-ia/voice-settings"
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
import { Switch } from "@/components/ui/switch"
import {
  effectiveSettings,
  iaStatusLabel,
  overriddenKeys,
  type Advisor,
  type LezgoIaData,
  type SettingValue,
  type StageRule,
  type Subaccount,
  type Voice,
} from "@/data/lezgo-ia"
import { saveLezgoIaAccount } from "@/app/(panel)/lezgo-ia/actions"
import { initials } from "@/lib/format"
import { stageKey, toSaveInput } from "@/lib/lezgo-ia/config"
import { cn } from "@/lib/utils"

/** "team" edita los ajustes de la subcuenta; un id de asesor, los suyos. */
type Scope = "team" | string

/**
 * Dos pantallas: el directorio de subcuentas (buscable, escala a cientos) y
 * la configuración de una, a todo el ancho, con un selector para saltar a
 * otra. La elegida se refleja en `?cuenta=` para poder enlazarla.
 *
 * Los ajustes se editan para el equipo o para un asesor; el asesor hereda
 * todo lo que no cambia. "Guardar cambios" escribe la subcuenta completa en
 * Neon (`saveLezgoIaAccount`); `saved` es la última versión guardada y es a
 * donde regresa "Descartar". En el demo no se guarda nada.
 */
export function ConfigTab({
  data,
  initialAccount,
}: {
  data: LezgoIaData
  initialAccount?: string
}) {
  const seed = data.subaccounts
  const [accounts, setAccounts] = useState<Subaccount[]>(seed)
  const [saved, setSaved] = useState<Subaccount[]>(seed)
  const [saving, startSaving] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(
    seed.some((s) => s.id === initialAccount) ? initialAccount! : null,
  )
  const [scope, setScope] = useState<Scope>("team")
  const [dirty, setDirty] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  const openAccount = (id: string | null) => {
    if (dirty) discardAll()
    setSelectedId(id)
    setScope("team")
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("cuenta", id)
    else url.searchParams.delete("cuenta")
    window.history.replaceState(null, "", url)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Descarta lo no guardado de la subcuenta que se deja.
  const discardAll = () => {
    setAccounts(saved)
    setDirty(false)
  }

  const selected = accounts.find((a) => a.id === selectedId)
  if (accounts.length === 0) {
    return (
      <Instrument label="Subcuentas">
        <EmptyState title="Sin subcuentas">
          Enlaza una subcuenta de GoHighLevel a un cliente desde su ficha y aparecerá aquí.
        </EmptyState>
      </Instrument>
    )
  }
  if (!selected) {
    return <SubaccountDirectory subaccounts={accounts} onOpen={openAccount} />
  }
  const position = accounts.findIndex((a) => a.id === selected.id)
  const original = saved.find((a) => a.id === selected.id)!
  const advisor: Advisor | undefined =
    scope === "team" ? undefined : selected.advisors.find((a) => a.id === scope)

  const patch = (update: (account: Subaccount) => Subaccount) => {
    setAccounts((list) =>
      list.map((a) => (a.id === selected.id ? update(a) : a)),
    )
    setDirty(true)
  }

  const patchAdvisor = (advisorId: string, update: (a: Advisor) => Advisor) =>
    patch((a) => ({
      ...a,
      advisors: a.advisors.map((adv) =>
        adv.id === advisorId ? update(adv) : adv,
      ),
    }))

  const setSetting = (id: string, value: SettingValue) => {
    if (!advisor) {
      patch((a) => ({ ...a, settings: { ...a.settings, [id]: value } }))
      return
    }
    patchAdvisor(advisor.id, (adv) => ({
      ...adv,
      settings: { ...(adv.settings ?? {}), [id]: value },
    }))
  }

  const inheritSetting = (id: string) => {
    if (!advisor) return
    patchAdvisor(advisor.id, (adv) => {
      const rest = { ...(adv.settings ?? {}) }
      delete rest[id]
      return { ...adv, settings: rest }
    })
  }

  const inheritAll = () => {
    if (!advisor) return
    patchAdvisor(advisor.id, (adv) => ({ ...adv, settings: {} }))
  }

  const setAdvisorAlerts = (advisorId: string, alerts: boolean) =>
    patchAdvisor(advisorId, (adv) => ({ ...adv, alerts }))

  const setAway = (away: Advisor["away"]) =>
    advisor && patchAdvisor(advisor.id, (adv) => ({ ...adv, away }))

  const setVoice = (voicePatch: Partial<Voice>) =>
    patch((a) => ({ ...a, voice: { ...a.voice, ...voicePatch } }))

  const setStageRule = (pipelineId: string, key: string, rulePatch: Partial<StageRule>) =>
    patch((a) => ({
      ...a,
      pipelines: a.pipelines.map((p) =>
        p.id === pipelineId
          ? {
              ...p,
              stages: p.stages.map((r) =>
                stageKey(r) === key ? { ...r, ...rulePatch } : r,
              ),
            }
          : p,
      ),
    }))

  const toggleStatus = () =>
    patch((a) => ({
      ...a,
      status: a.status === "active" ? "paused" : "active",
    }))

  const selectScope = (next: Scope) => {
    setScope(next)
    settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const save = () => {
    if (data.source === "demo") {
      toast.success(`Ajustes de ${selected.name} guardados`, {
        description: "Datos de ejemplo: los cambios no se guardan.",
      })
      setDirty(false)
      return
    }
    const snapshot = selected
    startSaving(async () => {
      const result = await saveLezgoIaAccount(toSaveInput(snapshot))
      if (!result.ok) {
        toast.error("No se guardó", { description: result.error })
        return
      }
      setSaved((list) => list.map((a) => (a.id === snapshot.id ? snapshot : a)))
      setDirty(false)
      toast.success(`Configuración de ${snapshot.name} guardada`, {
        description: "Equipo, asesores y reglas por etapa.",
      })
    })
  }

  const discard = () => {
    setAccounts((list) =>
      list.map((a) => (a.id === selected.id ? original : a)),
    )
    setDirty(false)
  }

  const status = iaStatusLabel[selected.status]
  const withAlerts = selected.advisors.filter((a) => a.alerts).length
  const values = effectiveSettings(selected.settings, advisor)
  const overrides = advisor
    ? new Set(overriddenKeys(selected.settings, advisor))
    : undefined

  return (
    <div className="space-y-4">
      <nav
        aria-label="Subcuenta"
        className="flex flex-wrap items-center gap-2"
      >
        <Button variant="ghost" size="sm" onClick={() => openAccount(null)}>
          <ArrowLeftIcon aria-hidden /> Subcuentas
        </Button>
        <span aria-hidden className="text-muted-foreground">/</span>
        <SubaccountSwitcher
          subaccounts={accounts}
          value={selected.id}
          onChange={openAccount}
        />
        <span className="num ml-auto text-xs text-muted-foreground">
          {position + 1} de {accounts.length}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Subcuenta anterior"
          disabled={position === 0}
          onClick={() => openAccount(accounts[position - 1].id)}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Subcuenta siguiente"
          disabled={position === accounts.length - 1}
          onClick={() => openAccount(accounts[position + 1].id)}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      </nav>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display text-lg">{selected.name}</h2>
              <StatusChip tone={status.tone}>{status.label}</StatusChip>
              {dirty && (
                <StatusChip tone="warn">Cambios sin guardar</StatusChip>
              )}
            </div>
            <p className="num mt-1 text-xs text-muted-foreground">
              <code>{selected.ghlLocationId}</code> ·{" "}
              {selected.clientName && <>Cliente {selected.clientName} · </>}
              {selected.advisors.length} asesores · {withAlerts} con avisos ·{" "}
              {selected.weeklyMessages} mensajes esta semana
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.status !== "unset" && (
              <Button variant="outline" size="sm" onClick={toggleStatus}>
                {selected.status === "active" ? (
                  <>
                    <PauseIcon aria-hidden /> Pausar IA
                  </>
                ) : (
                  <>
                    <PlayIcon aria-hidden /> Reanudar IA
                  </>
                )}
              </Button>
            )}
            {selected.status === "unset" && (
              <Button variant="outline" size="sm" onClick={toggleStatus}>
                <PlayIcon aria-hidden /> Activar IA
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </div>

        <Instrument
          label="Asesores"
          hint="Quién recibe avisos y quién tiene ajustes propios"
        >
          <AdvisorsTable
            advisors={selected.advisors}
            teamSettings={selected.settings}
            selectedId={advisor?.id}
            now={data.now}
            onSelect={(id) => selectScope(id === scope ? "team" : id)}
            onAlertsChange={setAdvisorAlerts}
          />
        </Instrument>

        <div ref={settingsRef} className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground">
              Ajustes de
            </span>
            <ScopePill
              active={scope === "team"}
              onClick={() => selectScope("team")}
            >
              <UsersIcon className="size-3.5" aria-hidden /> Equipo
            </ScopePill>
            {selected.advisors.map((a) => {
              const own = overriddenKeys(selected.settings, a).length
              return (
                <ScopePill
                  key={a.id}
                  active={scope === a.id}
                  onClick={() => selectScope(a.id)}
                >
                  <span
                    aria-hidden
                    className="num grid size-4 place-items-center rounded-full bg-secondary text-[9px] font-medium"
                  >
                    {initials(a.name)}
                  </span>
                  {a.name.split(" ")[0]}
                  {own > 0 && (
                    <span className="num text-[10px] text-primary">
                      {own}
                    </span>
                  )}
                </ScopePill>
              )
            })}
          </div>

          {advisor && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm">
                <span className="font-medium">{advisor.name}</span>{" "}
                <span className="text-muted-foreground">
                  {overrides!.size === 0
                    ? "usa los ajustes del equipo. Cambia cualquiera y quedará como propio."
                    : `tiene ${overrides!.size} ${overrides!.size === 1 ? "ajuste propio" : "ajustes propios"}; el resto lo hereda del equipo.`}
                </span>
              </p>
              {overrides!.size > 0 && (
                <Button variant="ghost" size="sm" onClick={inheritAll}>
                  <RotateCcwIcon aria-hidden /> Volver a los del equipo
                </Button>
              )}
            </div>
          )}

          {advisor && (
            <AwayCard
              advisor={advisor}
              team={selected.advisors}
              onChange={setAway}
            />
          )}

          <AutomationSettings
            key={`${selected.id}:${scope}`}
            values={values}
            onChange={setSetting}
            paused={selected.status !== "active"}
            overrides={overrides}
            onInherit={advisor ? inheritSetting : undefined}
          />

          {!advisor && (
            <>
              <StageRules
                key={selected.id}
                pipelines={selected.pipelines}
                onChange={setStageRule}
              />
              <VoiceSettings voice={selected.voice} onChange={setVoice} />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={discard}>
              Descartar
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ScopePill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** Fuera de oficina de un asesor: fechas y a quién se desvían sus leads. */
function AwayCard({
  advisor,
  team,
  onChange,
}: {
  advisor: Advisor
  team: Advisor[]
  onChange: (away: Advisor["away"]) => void
}) {
  const away = advisor.away
  const others = team.filter((a) => a.id !== advisor.id)
  const coverageLabel = (v: string) =>
    v === "manager"
      ? "Avisar al gerente"
      : `Desviar a ${others.find((a) => a.id === v)?.name ?? v}`

  return (
    <Instrument
      label="Fuera de oficina"
      hint="Vacaciones o ausencia: la IA desvía sus leads nuevos o avisa al gerente"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={Boolean(away)}
            onCheckedChange={(on) =>
              onChange(
                on
                  ? { from: "2026-09-22", to: "2026-09-26", coverage: "manager" }
                  : undefined,
              )
            }
            aria-label={`Fuera de oficina de ${advisor.name}`}
          />
          {away ? "Programado" : "No programado"}
        </label>
        {away && (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Del
              <Input
                type="date"
                value={away.from}
                onChange={(e) => onChange({ ...away, from: e.target.value })}
                className="h-7 w-36 text-xs"
                aria-label="Inicio"
              />
              al
              <Input
                type="date"
                value={away.to}
                onChange={(e) => onChange({ ...away, to: e.target.value })}
                className="h-7 w-36 text-xs"
                aria-label="Fin"
              />
            </label>
            <Select
              value={away.coverage}
              onValueChange={(v) =>
                onChange({ ...away, coverage: v ?? away.coverage })
              }
            >
              <SelectTrigger
                size="sm"
                className="w-60"
                aria-label="Quién cubre"
              >
                <SelectValue>{(v: string) => coverageLabel(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="manager">Avisar al gerente</SelectItem>
                {others.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    Desviar a {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </Instrument>
  )
}
