"use client"

import { useState } from "react"
import { ListFilterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { FilterOption, Range } from "@/lib/clients/filters"
import type { Currency } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * El filtro de una columna, colgado de su encabezado. El icono se tiñe y
 * lleva la cuenta cuando la columna está filtrando, para que se note desde
 * la tabla sin abrir nada.
 */

function Trigger({ label, active }: { label: string; active: number }) {
  return (
    <PopoverTrigger
      render={
        <Button
          variant="ghost"
          size={active ? "xs" : "icon-xs"}
          aria-label={
            active ? `Filtrar ${label} (${active} activo)` : `Filtrar ${label}`
          }
          className={cn(
            "text-muted-foreground",
            active > 0 && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        />
      }
    >
      <ListFilterIcon />
      {active > 0 && <span className="num">{active}</span>}
    </PopoverTrigger>
  )
}

/** Muchas opciones —etapas, subcuentas— piden una caja para acotarlas. */
const BUSCAR_DESDE = 8

export function SetFilter({
  label,
  options,
  selected,
  onChange,
  align = "start",
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  align?: "start" | "end"
}) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options

  const toggle = (value: string, on: boolean) =>
    onChange(on ? [...selected, value] : selected.filter((v) => v !== value))

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <Trigger label={label} active={selected.length} />
      <PopoverContent align={align} className="w-64 gap-1 p-1.5">
        {options.length > BUSCAR_DESDE && (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar ${label.toLowerCase()}`}
            aria-label={`Buscar en ${label}`}
            className="mb-1 h-7 text-sm"
          />
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nada coincide.
            </p>
          )}
          {shown.map((o) => {
            const on = selected.includes(o.value)
            return (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60",
                  o.count === 0 && !on && "text-muted-foreground",
                )}
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(next) => toggle(o.value, next)}
                />
                <span className="min-w-0 flex-1 truncate" title={o.label}>
                  {o.label}
                </span>
                <span className="num text-xs text-muted-foreground">
                  {o.count}
                </span>
              </label>
            )
          })}
        </div>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 justify-start"
            onClick={() => onChange([])}
          >
            Quitar filtro
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

const parse = (raw: string) => {
  const n = Number(raw.replace(/[^\d.]/g, ""))
  return raw.trim() === "" || Number.isNaN(n) ? null : n
}

export function RangeFilter({
  label,
  currency,
  value,
  onChange,
}: {
  label: string
  currency: Currency
  value: Range
  onChange: (next: Range) => void
}) {
  const active = (value.min !== null ? 1 : 0) + (value.max !== null ? 1 : 0)
  const code = currency.toUpperCase()

  return (
    <Popover>
      <Trigger label={label} active={active} />
      <PopoverContent align="end" className="w-64">
        <p className="text-xs text-muted-foreground">
          {label} mensual en {code}. Quien no tiene MRR queda fuera.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["min", "max"] as const).map((k) => (
            <label key={k} className="grid gap-1 text-xs">
              {k === "min" ? "Desde" : "Hasta"}
              <Input
                inputMode="numeric"
                value={value[k] ?? ""}
                onChange={(e) => onChange({ ...value, [k]: parse(e.target.value) })}
                placeholder={k === "min" ? "0" : "Sin tope"}
                className="num h-7 text-sm"
              />
            </label>
          ))}
        </div>
        {active > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => onChange({ min: null, max: null })}
          >
            Quitar filtro
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
