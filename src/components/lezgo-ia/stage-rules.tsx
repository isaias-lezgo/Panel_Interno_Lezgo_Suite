"use client"

import { useState } from "react"

import { EmptyState, Instrument } from "@/components/panel/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  stageActionOptions,
  stageIdleOptions,
  type Pipeline,
  type StageRule,
} from "@/data/lezgo-ia"
import { stageKey } from "@/lib/lezgo-ia/config"
import { cn } from "@/lib/utils"

const label = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value

/**
 * Una fila por etapa del pipeline elegido: cuánto tiempo sin movimiento
 * tolera y qué hace la IA al cumplirse. Una subcuenta puede tener varios
 * pipelines en GHL (ventas, preventa, lotes…), cada uno con sus etapas.
 */
export function StageRules({
  pipelines,
  onChange,
}: {
  pipelines: Pipeline[]
  onChange: (pipelineId: string, key: string, patch: Partial<StageRule>) => void
}) {
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id)
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0]

  if (!pipeline) {
    return (
      <Instrument
        label="Reglas por etapa"
        hint="Cuánto puede quedarse quieto un lead en cada etapa y qué hace la IA."
      >
        <EmptyState title="Sin pipelines">
          No se pudieron leer los pipelines de esta subcuenta en GoHighLevel, o no tiene ninguno.
        </EmptyState>
      </Instrument>
    )
  }

  return (
    <Instrument
      label="Reglas por etapa"
      hint="Cuánto puede quedarse quieto un lead en cada etapa y qué hace la IA. Aplican a todo el equipo."
      action={
        pipelines.length > 1 ? (
          <Select value={pipeline.id} onValueChange={(v) => setPipelineId(v ?? pipeline.id)}>
            <SelectTrigger size="sm" className="w-56" aria-label="Pipeline">
              <SelectValue>
                {(v: string) => pipelines.find((p) => p.id === v)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">
            Pipeline <span className="font-medium text-foreground">{pipeline.name}</span>
          </span>
        )
      }
    >
      <div className="hidden grid-cols-[minmax(0,1fr)_11rem_13rem] gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground sm:grid">
        <span>Etapa</span>
        <span>Sin movimiento</span>
        <span>Acción</span>
      </div>
      <ul className="divide-y divide-border">
        {pipeline.stages.map((rule, index) => {
          const off = rule.idle === "off"
          return (
            <li
              key={stageKey(rule)}
              className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_11rem_13rem] sm:items-center sm:gap-3"
            >
              <span className="flex items-center gap-2.5 text-sm">
                <span className="num w-4 text-right text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span className={cn("font-medium", off && "text-muted-foreground")}>
                  {rule.stage}
                </span>
              </span>
              <Select
                value={rule.idle}
                onValueChange={(v) => onChange(pipeline.id, stageKey(rule), { idle: v ?? rule.idle })}
              >
                <SelectTrigger size="sm" className="w-full" aria-label={`Tiempo sin movimiento en ${rule.stage}`}>
                  <SelectValue>{(v: string) => label(stageIdleOptions, v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stageIdleOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={rule.action}
                onValueChange={(v) => onChange(pipeline.id, stageKey(rule), { action: v ?? rule.action })}
                disabled={off}
              >
                <SelectTrigger size="sm" className="w-full" aria-label={`Acción en ${rule.stage}`}>
                  <SelectValue>{(v: string) => label(stageActionOptions, v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stageActionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          )
        })}
      </ul>
    </Instrument>
  )
}
