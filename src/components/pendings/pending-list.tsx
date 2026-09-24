"use client"

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import {
  createPending,
  deletePending,
  togglePending,
} from "@/app/(panel)/pendientes/actions"
import { LinkPicker } from "@/components/clients/link-picker"
import { EmptyState, Instrument } from "@/components/panel/page-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { groupPendings, SIN_SUBCUENTA } from "@/lib/pendings/group"
import {
  isPendingOwner,
  OWNER_COOKIE,
  ownerName,
  PENDING_OWNERS,
  type PendingOwner,
} from "@/lib/pendings/owners"
import type { LocationOption, Pending, PendingGroup } from "@/lib/types"
import { cn } from "@/lib/utils"

type Done = { ok: true } | { ok: false; error: string }

type Edit =
  | { type: "add"; pending: Pending }
  | { type: "toggle"; id: string; done: boolean }
  | { type: "delete"; id: string }

/** Un pendiente recién escrito, mientras el servidor confirma. */
const draft = (
  body: string,
  owner: PendingOwner,
  locationId: string | null,
  name: string | null,
): Pending => ({
  id: `draft_${crypto.randomUUID()}`,
  body,
  owner,
  ghlLocationId: locationId,
  ghlLocationName: name,
  done: false,
  doneAt: null,
  createdAt: new Date().toISOString(),
})

function apply(current: Pending[], edit: Edit): Pending[] {
  if (edit.type === "add") return [...current, edit.pending]
  if (edit.type === "delete") return current.filter((p) => p.id !== edit.id)
  return current.map((p) =>
    p.id === edit.id
      ? {
          ...p,
          done: edit.done,
          doneAt: edit.done ? new Date().toISOString() : null,
        }
      : p,
  )
}

/** Un año: la pestaña se recuerda hasta que alguien abra otra. */
const rememberOwner = (owner: PendingOwner) => {
  document.cookie = `${OWNER_COOKIE}=${owner}; path=/; max-age=31536000; samesite=lax`
}

const cuenta = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`

/**
 * Los pendientes de una persona, agrupados por subcuenta. Se agrupan aquí y
 * no en el servidor para que marcar uno lo mande al pie de su grupo en el
 * acto, sin esperar el viaje de ida y vuelta. Cada persona tiene su pestaña,
 * y lo que se escribe entra en la pestaña abierta.
 */
export function PendingList({
  pendings,
  initialOwner,
  locations,
  locationsError,
}: {
  pendings: Pending[]
  initialOwner: PendingOwner
  locations: LocationOption[]
  locationsError: string | null
}) {
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [owner, setOwner] = useState(initialOwner)
  const [all, edit] = useOptimistic(pendings, apply)
  const list = all.filter((p) => p.owner === owner)

  const names = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  )
  const groups = groupPendings(list, names)
  const shown = showDone ? groups : groups.filter((g) => g.open.length > 0)
  const open = list.filter((p) => !p.done).length
  const done = list.length - open

  const run = (optimistic: Edit, fn: () => Promise<Done>) =>
    start(async () => {
      edit(optimistic)
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  const add = (body: string, locationId: string | null, name: string | null) =>
    run({ type: "add", pending: draft(body, owner, locationId, name) }, () =>
      createPending({ body, owner, locationId }),
    )

  return (
    <Tabs
      value={owner}
      onValueChange={(value) => {
        if (!isPendingOwner(value)) return
        setOwner(value)
        setError(null)
        rememberOwner(value)
      }}
    >
      <TabsList
        variant="line"
        aria-label="De quién son los pendientes"
        className="w-full justify-start overflow-x-auto border-b border-border pb-1"
      >
        {PENDING_OWNERS.map((o) => {
          const n = all.filter((p) => p.owner === o.id && !p.done).length
          return (
            <TabsTrigger key={o.id} value={o.id} className="flex-none px-2">
              {o.name}
              <span className="num text-xs text-muted-foreground">{n}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>

      <TabsContent value={owner}>
        <Instrument
          label={`Pendientes de ${ownerName(owner)}`}
          hint={`${cuenta(open, "abierto", "abiertos")} · ${cuenta(
            groups.filter((g) => g.open.length > 0).length,
            "subcuenta",
            "subcuentas",
          )} · ${cuenta(done, "hecho", "hechos")}`}
          action={
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch
                size="sm"
                checked={showDone}
                onCheckedChange={setShowDone}
                disabled={done === 0}
              />
              Ver hechos
            </label>
          }
        >
          <NewPending
            locations={locations}
            locationsError={locationsError}
            onAdd={add}
          />

          {error && (
            <p role="alert" className="border-b border-border px-4 py-2 text-xs text-status-risk">
              {error}
            </p>
          )}

          {shown.length === 0 ? (
            <EmptyState title={done > 0 ? "Nada pendiente" : "Sin pendientes"}>
              {done > 0
                ? "Todo lo escrito está hecho. Enciende “Ver hechos” para repasarlo."
                : "Escribe el primero arriba. Una frase basta."}
            </EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {shown.map((group) => (
                <Group
                  key={group.locationId ?? SIN_SUBCUENTA}
                  group={group}
                  showDone={showDone}
                  onAdd={(body) =>
                    add(body, group.locationId, group.locationId ? group.name : null)
                  }
                  onToggle={(id, value) =>
                    run({ type: "toggle", id, done: value }, () =>
                      togglePending(id, value),
                    )
                  }
                  onDelete={(id) =>
                    run({ type: "delete", id }, () => deletePending(id))
                  }
                />
              ))}
            </div>
          )}
        </Instrument>
      </TabsContent>
    </Tabs>
  )
}

/**
 * La caja de arriba: sirve para cualquier subcuenta, incluso una que todavía
 * no tiene ningún pendiente. La subcuenta elegida se queda puesta entre un
 * pendiente y el siguiente: casi siempre se escriben de a varios del mismo.
 */
function NewPending({
  locations,
  locationsError,
  onAdd,
}: {
  locations: LocationOption[]
  locationsError: string | null
  onAdd: (body: string, locationId: string | null, name: string | null) => void
}) {
  const [value, setValue] = useState("")
  const [location, setLocation] = useState<LocationOption | null>(null)

  const submit = () => {
    const body = value.trim()
    if (!body) return
    setValue("")
    onAdd(body, location?.id ?? null, location?.name ?? null)
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Input
        aria-label="Pendiente nuevo"
        placeholder="Escribe un pendiente…"
        // Alta de verdad: es el control que más se usa de la pantalla y hay
        // que poder acertarle sin apuntar.
        className="h-12 min-w-48 flex-1 px-3.5 text-base md:text-base"
        maxLength={280}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <LinkPicker
        options={[
          { value: "", label: SIN_SUBCUENTA },
          ...locations.map((l) => ({
            value: l.id,
            label: l.name,
            detail: l.email ?? undefined,
          })),
        ]}
        placeholder="Buscar subcuenta…"
        empty={locationsError ?? "Ninguna subcuenta coincide."}
        buttonLabel={
          <span className="min-w-0 truncate">
            {location ? location.name : SIN_SUBCUENTA}
          </span>
        }
        className="h-12 max-w-56 px-3.5 text-sm"
        onPick={(id) =>
          setLocation(locations.find((l) => l.id === id) ?? null)
        }
      />
      <Button type="submit" className="h-12 px-4" disabled={!value.trim()}>
        <PlusIcon aria-hidden />
        Agregar
      </Button>
    </form>
  )
}

function Group({
  group,
  showDone,
  onAdd,
  onToggle,
  onDelete,
}: {
  group: PendingGroup
  showDone: boolean
  onAdd: (body: string) => void
  onToggle: (id: string, done: boolean) => void
  onDelete: (id: string) => void
}) {
  const rows = showDone ? [...group.open, ...group.done] : group.open

  return (
    <section>
      <header className="flex items-center gap-3 bg-muted/40 px-4 py-2">
        <h3 className="truncate text-sm font-medium">{group.name}</h3>
        <span className="num ml-auto shrink-0 text-xs text-muted-foreground">
          {group.open.length}
          {group.done.length > 0 && ` · ${group.done.length} hecho${group.done.length === 1 ? "" : "s"}`}
        </span>
      </header>

      <ul className="divide-y divide-border">
        {rows.map((p) => (
          <Row
            key={p.id}
            pending={p}
            onToggle={(done) => onToggle(p.id, done)}
            onDelete={() => onDelete(p.id)}
          />
        ))}
      </ul>

      <AddToGroup name={group.name} onAdd={onAdd} />
    </section>
  )
}

function Row({
  pending,
  onToggle,
  onDelete,
}: {
  pending: Pending
  onToggle: (done: boolean) => void
  onDelete: () => void
}) {
  // Un pendiente que el servidor todavía no confirma no se puede marcar ni
  // borrar: su id no existe en Neon.
  const isDraft = pending.id.startsWith("draft_")

  return (
    <li className="group flex items-start gap-2 py-2 pr-2 pl-4 hover:bg-muted/30">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
        <Checkbox
          className="mt-0.5"
          checked={pending.done}
          disabled={isDraft}
          onCheckedChange={(value) => onToggle(value === true)}
        />
        <span
          className={cn(
            "text-sm leading-snug",
            pending.done && "text-muted-foreground line-through",
          )}
        >
          {pending.body}
        </span>
      </label>
      <Button
        size="icon-xs"
        variant="ghost"
        className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        disabled={isDraft}
        aria-label={`Eliminar “${pending.body}”`}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

/** La vía rápida: la subcuenta ya viene puesta, solo se escribe y Enter. */
function AddToGroup({
  name,
  onAdd,
}: {
  name: string
  onAdd: (body: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const field = useRef<HTMLInputElement>(null)

  const submit = () => {
    const body = value.trim()
    if (!body) return
    setValue("")
    onAdd(body)
    // Se queda abierto: de a varios es como se escriben.
    field.current?.focus()
  }

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground focus-visible:bg-muted/30 focus-visible:text-foreground focus-visible:outline-none"
        onClick={() => setOpen(true)}
      >
        <PlusIcon aria-hidden className="size-3.5" />
        Agregar a {name}…
      </button>
    )
  }

  return (
    <form
      className="p-2 pl-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && !value.trim()) {
          setOpen(false)
        }
      }}
    >
      <Input
        ref={field}
        autoFocus
        aria-label={`Pendiente nuevo para ${name}`}
        placeholder="Escribe y Enter…"
        maxLength={280}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("")
            setOpen(false)
          }
        }}
      />
    </form>
  )
}
