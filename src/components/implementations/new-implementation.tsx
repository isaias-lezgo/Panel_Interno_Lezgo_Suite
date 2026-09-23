"use client"

import { useCallback, useState, useTransition } from "react"
import { PlusIcon, XIcon } from "lucide-react"

import {
  createImplementation,
  searchContacts,
} from "@/app/(panel)/implementaciones/actions"
import { LinkPicker, type PickerOption } from "@/components/clients/link-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { ImplementationContact, LocationOption } from "@/lib/types"

const contactOption = (c: ImplementationContact): PickerOption => ({
  value: c.id,
  label: c.name,
  detail: c.email ?? c.phone ?? undefined,
})

export function NewImplementation({
  locations,
  locationsError,
  contacts,
}: {
  locations: LocationOption[]
  locationsError: string | null
  /** Primera página de contactos: los clientes del panel. */
  contacts: ImplementationContact[]
}) {
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState<LocationOption | null>(null)
  const [picked, setPicked] = useState<PickerOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Lo buscado en GHL no está en `contacts`: se recuerda cada opción vista
  // para poder mostrar el nombre del contacto elegido.
  const [seen, setSeen] = useState(
    () => new Map(contacts.map((c) => [c.id, contactOption(c)])),
  )

  const reset = () => {
    setLocation(null)
    setPicked([])
    setError(null)
  }

  const pickedIds = new Set(picked.map((p) => p.value))

  // Estable: LinkPicker vuelve a buscar cada vez que cambia esta función.
  const onSearch = useCallback(async (q: string) => {
    const found = (await searchContacts(q)).map(contactOption)
    setSeen((prev) => {
      const next = new Map(prev)
      for (const o of found) next.set(o.value, o)
      return next
    })
    return found
  }, [])

  const submit = () =>
    start(async () => {
      if (!location) return
      const r = await createImplementation({
        locationId: location.id,
        contactIds: picked.map((p) => p.value),
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOpen(false)
      reset()
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon aria-hidden />
        Agregar implementación
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar implementación</DialogTitle>
          <DialogDescription>
            Elige la subcuenta de GoHighLevel y los contactos de Lezgo Suite
            que la piden. Entra en Alcance.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="eyebrow">Subcuenta de GHL</h3>
            <LinkPicker
              options={locations.map((l) => ({
                value: l.id,
                label: l.name,
                detail: l.email ?? undefined,
              }))}
              placeholder="Buscar subcuenta…"
              empty={locationsError ?? "Ninguna subcuenta coincide."}
              buttonLabel={location ? "Cambiar" : "Elegir subcuenta"}
              disabled={pending}
              onPick={(id) => {
                setLocation(locations.find((l) => l.id === id) ?? null)
                setError(null)
              }}
            />
          </div>
          {location ? (
            <div className="rounded-md border border-border px-3 py-2">
              <p className="truncate text-sm font-medium">{location.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <code className="num">{location.id}</code>
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              {locationsError ?? "Sin subcuenta elegida."}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="eyebrow">
              Contactos de Lezgo Suite{" "}
              <span className="num text-muted-foreground">({picked.length})</span>
            </h3>
            <LinkPicker
              options={contacts.map(contactOption)}
              exclude={pickedIds}
              placeholder="Buscar por nombre, correo o teléfono…"
              empty="Ningún contacto coincide."
              buttonLabel="Agregar contacto"
              disabled={pending}
              onSearch={onSearch}
              onPick={(id) => {
                const option = seen.get(id)
                if (!option || pickedIds.has(id)) return
                setPicked((prev) => [...prev, option])
                setError(null)
              }}
            />
          </div>
          {picked.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              Agrega uno o más contactos.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {picked.map((c) => (
                <li key={c.value} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.label}</span>
                    {c.detail && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.detail}
                      </span>
                    )}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Quitar a ${c.label}`}
                    onClick={() =>
                      setPicked((prev) => prev.filter((p) => p.value !== c.value))
                    }
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p role="alert" className="text-xs text-status-risk">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button
            disabled={pending || !location || picked.length === 0}
            onClick={submit}
          >
            {pending ? "Creando…" : "Crear implementación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
