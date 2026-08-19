"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { flatNav } from "@/lib/nav"
import type { Client } from "@/lib/types"

export function CommandMenu({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full max-w-72 justify-between text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <SearchIcon className="size-3.5" />
          Buscar clientes y secciones
        </span>
        <kbd className="num rounded border border-border px-1 text-[10px]">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Salta a un cliente o a una sección del panel."
      >
        {/* CommandDialog sólo aporta el diálogo: el contexto de cmdk lo tiene
            <Command>, y sin él CommandInput no encuentra su store. */}
        <Command>
          <CommandInput placeholder="Escribe el nombre de un cliente o una sección…" />
          <CommandList>
            <CommandEmpty>No hay coincidencias.</CommandEmpty>
            <CommandGroup heading="Ir a">
              {flatNav.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.title}
                  onSelect={() => go(item.href)}
                >
                  <item.icon className="size-4" />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Clientes">
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`${client.name} ${client.industry}`}
                  onSelect={() => go(`/clientes/${client.slug}`)}
                >
                  <span>{client.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {client.industry}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
