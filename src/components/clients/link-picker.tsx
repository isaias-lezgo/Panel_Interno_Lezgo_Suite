"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ChevronsUpDownIcon } from "lucide-react"

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

export type PickerOption = {
  value: string
  label: string
  detail?: string
  badge?: string
}

/**
 * Un desplegable con búsqueda para elegir a qué se enlaza un cliente. La
 * lista solo trae lo que nadie tiene todavía, así que elegir aquí nunca
 * roba un enlace ajeno.
 *
 * Con `onSearch` la búsqueda ocurre en el servidor y cmdk deja de filtrar:
 * los clientes de Stripe pasan de mil y mandarlos todos al navegador
 * engordaba la ficha en cientos de kilobytes.
 */
export function LinkPicker({
  options,
  placeholder,
  empty,
  buttonLabel,
  disabled,
  onPick,
  onSearch,
}: {
  options: PickerOption[]
  placeholder: string
  empty: string
  buttonLabel: string
  disabled?: boolean
  onPick: (value: string) => void
  onSearch?: (query: string) => Promise<PickerOption[]>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [remote, setRemote] = useState<{ q: string; items: PickerOption[] }>()
  const [searching, startSearch] = useTransition()
  const latest = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!onSearch || !q) return
    const id = ++latest.current
    const timer = setTimeout(() => {
      startSearch(async () => {
        const items = await onSearch(q)
        // Una respuesta vieja no debe pisar a una nueva.
        if (id === latest.current) setRemote({ q, items })
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [query, onSearch])

  // Mientras llega la respuesta se deja lo último encontrado: parpadear a
  // vacío en cada tecla se lee como "no hay nadie".
  const shown = !onSearch || !query.trim() ? options : (remote?.items ?? [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="sm" variant="outline" disabled={disabled} />}
      >
        {buttonLabel} <ChevronsUpDownIcon aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command shouldFilter={!onSearch}>
          <CommandInput
            placeholder={placeholder}
            value={onSearch ? query : undefined}
            onValueChange={onSearch ? setQuery : undefined}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>{searching ? "Buscando…" : empty}</CommandEmpty>
            <CommandGroup>
              {shown.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.detail ?? ""} ${o.value}`}
                  onSelect={() => {
                    setOpen(false)
                    onPick(o.value)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{o.label}</span>
                    {o.detail && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.detail}
                      </span>
                    )}
                  </span>
                  {o.badge && (
                    <span className="num ml-2 shrink-0 text-xs text-muted-foreground">
                      {o.badge}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
