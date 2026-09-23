"use client"

import { RotateCcwIcon } from "lucide-react"

import { Instrument } from "@/components/panel/page-header"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  settingGroups,
  type SettingDef,
  type SettingValue,
  type SettingValues,
} from "@/data/lezgo-ia"
import { cn } from "@/lib/utils"

/**
 * Cada grupo es un instrumento; cada ajuste, una fila con interruptor y, si
 * aplica, una opción. El esquema vive en `src/data/lezgo-ia.ts` para que
 * agregar un ajuste sea agregar una entrada, no una fila de JSX.
 *
 * Con `overrides` la vista es la de un asesor: las claves listadas son
 * valores propios y las demás se heredan del equipo.
 */
export function AutomationSettings({
  values,
  onChange,
  paused,
  overrides,
  onInherit,
}: {
  values: SettingValues
  onChange: (id: string, value: SettingValue) => void
  paused: boolean
  /** Claves con valor propio del asesor. `undefined` = vista del equipo. */
  overrides?: Set<string>
  /** Vuelve una clave al valor del equipo. */
  onInherit?: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
      {settingGroups.map((group) => (
        <Instrument key={group.id} label={group.label} hint={group.hint}>
          <ul className="divide-y divide-border">
            {group.settings.map((setting) => (
              <SettingRow
                key={setting.id}
                setting={setting}
                value={values[setting.id] ?? { enabled: false }}
                paused={paused}
                own={overrides?.has(setting.id)}
                perAdvisor={overrides !== undefined}
                onChange={(value) => onChange(setting.id, value)}
                onInherit={onInherit ? () => onInherit(setting.id) : undefined}
              />
            ))}
          </ul>
        </Instrument>
      ))}
    </div>
  )
}

function SettingRow({
  setting,
  value,
  paused,
  own,
  perAdvisor,
  onChange,
  onInherit,
}: {
  setting: SettingDef
  value: SettingValue
  paused: boolean
  own?: boolean
  perAdvisor: boolean
  onChange: (value: SettingValue) => void
  onInherit?: () => void
}) {
  const hasSwitch = setting.control !== "fixed"
  const hasSelect = setting.control !== "switch" && setting.options
  const active = hasSwitch ? value.enabled : true
  const labelId = `setting-${setting.id}`

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 px-4 py-3",
        (!active || paused) && "text-muted-foreground",
      )}
    >
      {hasSwitch ? (
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          aria-labelledby={labelId}
          className="mt-0.5"
        />
      ) : (
        <span aria-hidden className="mt-0.5 w-8 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span id={labelId} className="text-sm font-medium text-foreground">
            {setting.label}
          </span>
          {perAdvisor &&
            (own ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Propio
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Del equipo
              </span>
            ))}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {setting.description}
        </p>
        {own && onInherit && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onInherit}
            className="mt-1.5 -ml-2 text-muted-foreground"
          >
            <RotateCcwIcon aria-hidden /> Usar el valor del equipo
          </Button>
        )}
      </div>

      {hasSelect && (
        <div className="basis-full pl-11 sm:basis-auto sm:pl-0">
          <Select
            value={value.option ?? setting.options![0].value}
            onValueChange={(option) =>
              onChange({ ...value, option: option ?? value.option })
            }
            disabled={!active}
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-44"
              aria-label={`Opción de ${setting.label}`}
            >
              <SelectValue>
                {(current: string) =>
                  setting.options!.find((o) => o.value === current)?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {setting.options!.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </li>
  )
}
