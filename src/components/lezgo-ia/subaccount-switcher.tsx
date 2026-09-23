"use client"

import { useState } from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { IaStatus, Subaccount } from "@/data/lezgo-ia"
import { cn } from "@/lib/utils"

const statusOrder: IaStatus[] = ["active", "paused", "unset"]

const groupLabel: Record<IaStatus, string> = {
  active: "IA activa",
  paused: "En pausa",
  unset: "Sin configurar",
}

/**
 * Selector de subcuenta con búsqueda. Sustituye al `Select` plano: con
 * decenas de subcuentas hay que poder teclear el nombre o el cliente. Agrupa por estado de la IA para que lo activo quede arriba.
 *
 * Con `allLabel` ofrece también "todas" (valor `"todas"`), para los filtros.
 */
export function SubaccountSwitcher({
  subaccounts,
  value,
  onChange,
  allLabel,
  className,
}: {
  subaccounts: Subaccount[]
  value: string
  onChange: (id: string) => void
  allLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const current = subaccounts.find((s) => s.id === value)
  const label = current?.name ?? allLabel ?? "Elige una subcuenta"

  const pick = (id: string) => {
    setOpen(false)
    onChange(id)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("w-64 justify-between font-normal", className)}
            aria-label="Cambiar de subcuenta"
          />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Buscar subcuenta o cliente…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Ninguna subcuenta coincide.</CommandEmpty>
            {allLabel && (
              <CommandGroup>
                <CommandItem value={`__todas ${allLabel}`} onSelect={() => pick("todas")}>
                  <span className="flex-1">{allLabel}</span>
                  <span className="num text-xs text-muted-foreground">
                    {subaccounts.length}
                  </span>
                  {value === "todas" && <CheckIcon aria-hidden />}
                </CommandItem>
              </CommandGroup>
            )}
            {statusOrder.map((status) => {
              const items = subaccounts.filter((s) => s.status === status)
              if (items.length === 0) return null
              return (
                <CommandGroup
                  key={status}
                  heading={`${groupLabel[status]} · ${items.length}`}
                >
                  {items.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={`${s.name} ${s.clientName ?? ""} ${s.id}`}
                      onSelect={() => pick(s.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{s.name}</span>
                        {s.clientName && s.clientName !== s.name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.clientName}
                          </span>
                        )}
                      </span>
                      <span
                        className="num shrink-0 text-xs text-muted-foreground"
                        aria-label={`${s.advisors.length} asesores`}
                      >
                        {s.advisors.length}
                      </span>
                      {s.id === value && <CheckIcon aria-hidden />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
