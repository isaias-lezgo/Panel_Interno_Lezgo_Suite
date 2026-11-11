"use client"

import {
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronDownIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import {
  createPending,
  deletePending,
  reorderPendingGroups,
  setPendingNotUrgent,
  togglePending,
} from "@/app/(panel)/pendientes/actions"
import { LinkPicker } from "@/components/clients/link-picker"
import { EmptyState, Instrument } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  COLLAPSED_COOKIE,
  collapseKey,
  serializeCollapsed,
} from "@/lib/pendings/collapsed"
import { groupPendings, moveGroup, SIN_SUBCUENTA } from "@/lib/pendings/group"
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
  | { type: "urgency"; id: string; notUrgent: boolean }
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
  notUrgent: false,
  doneAt: null,
  createdAt: new Date().toISOString(),
})

function apply(current: Pending[], edit: Edit): Pending[] {
  if (edit.type === "add") return [...current, edit.pending]
  if (edit.type === "delete") return current.filter((p) => p.id !== edit.id)
  if (edit.type === "urgency") {
    return current.map((p) =>
      p.id === edit.id ? { ...p, notUrgent: edit.notUrgent } : p,
    )
  }
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

type Order = Record<string, string[]>

const reorder = (current: Order, next: { owner: PendingOwner; ids: string[] }) => ({
  ...current,
  [next.owner]: next.ids,
})

/** El arrastre solo se mueve en vertical. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** Un año: la pestaña se recuerda hasta que alguien abra otra. */
const rememberOwner = (owner: PendingOwner) => {
  document.cookie = `${OWNER_COOKIE}=${owner}; path=/; max-age=31536000; samesite=lax`
}

/** Igual que la pestaña: un año, y el servidor la lee para no parpadear. */
const rememberCollapsed = (keys: Iterable<string>) => {
  document.cookie = `${COLLAPSED_COOKIE}=${serializeCollapsed(keys)}; path=/; max-age=31536000; samesite=lax`
}

const cuenta = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`

/**
 * Los pendientes de una persona, agrupados por subcuenta. Se agrupan aquí y
 * no en el servidor para que marcar uno lo mande al pie de su grupo en el
 * acto, sin esperar el viaje de ida y vuelta. Cada persona tiene su pestaña,
 * y lo que se escribe entra en la pestaña abierta. Los grupos se arrastran
 * desde el asa de su encabezado y cada persona guarda su propio orden.
 * Cada grupo se colapsa desde su nombre; qué está colapsado es cosa de este
 * navegador y no se guarda en Neon.
 */
export function PendingList({
  pendings,
  groupOrder,
  initialOwner,
  initialCollapsed,
  locations,
  locationsError,
}: {
  pendings: Pending[]
  groupOrder: Order
  initialOwner: PendingOwner
  /** Llaves de `collapseKey` que este navegador dejó cerradas. */
  initialCollapsed: string[]
  locations: LocationOption[]
  locationsError: string | null
}) {
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [owner, setOwner] = useState(initialOwner)
  const [collapsed, setCollapsed] = useState(() => new Set(initialCollapsed))
  const [all, edit] = useOptimistic(pendings, apply)
  const [order, setOrder] = useOptimistic(groupOrder, reorder)
  const list = all.filter((p) => p.owner === owner)

  const names = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  )
  const groups = groupPendings(list, names, order[owner])
  const shown = showDone ? groups : groups.filter((g) => g.open.length > 0)
  const open = list.filter((p) => !p.done).length
  const done = list.length - open
  const waiting = list.filter((p) => !p.done && p.notUrgent).length
  const shownKeys = shown.map((g) => collapseKey(owner, g.locationId))
  const allCollapsed =
    shownKeys.length > 0 && shownKeys.every((k) => collapsed.has(k))

  /**
   * Cambia qué está colapsado y lo recuerda. De paso suelta las llaves de
   * grupos que ya no existen, para que la cookie no crezca sin fin.
   */
  const collapse = (change: (next: Set<string>) => void) => {
    const next = new Set(collapsed)
    change(next)
    const alive = new Set(all.map((p) => collapseKey(p.owner, p.ghlLocationId)))
    for (const key of next) if (!alive.has(key)) next.delete(key)
    setCollapsed(next)
    rememberCollapsed(next)
  }

  const run = (optimistic: Edit, fn: () => Promise<Done>) =>
    start(async () => {
      edit(optimistic)
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  const add = (body: string, locationId: string | null, name: string | null) => {
    // Lo recién escrito tiene que verse: si su grupo estaba colapsado, se abre.
    const key = collapseKey(owner, locationId)
    if (collapsed.has(key)) collapse((next) => next.delete(key))
    run({ type: "add", pending: draft(body, owner, locationId, name) }, () =>
      createPending({ body, owner, locationId }),
    )
  }

  const move = (moved: string, target: string) => {
    const ids = moveGroup(groups, moved, target)
    start(async () => {
      setOrder({ owner, ids })
      const r = await reorderPendingGroups(owner, ids)
      setError(r.ok ? null : r.error)
    })
  }

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
          )}${
            waiting > 0 ? ` · ${cuenta(waiting, "no urgente", "no urgentes")}` : ""
          } · ${cuenta(done, "hecho", "hechos")}`}
          action={
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                disabled={shownKeys.length === 0}
                onClick={() =>
                  collapse((next) => {
                    for (const key of shownKeys) {
                      if (allCollapsed) next.delete(key)
                      else next.add(key)
                    }
                  })
                }
              >
                {allCollapsed ? (
                  <ChevronsUpDownIcon aria-hidden />
                ) : (
                  <ChevronsDownUpIcon aria-hidden />
                )}
                {allCollapsed ? "Expandir todo" : "Colapsar todo"}
              </Button>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  size="sm"
                  checked={showDone}
                  onCheckedChange={setShowDone}
                  // Sin hechos no hay qué encender, pero lo encendido siempre
                  // se puede apagar: al cambiar de pestaña o desmarcar el
                  // último hecho, la cuenta baja a 0 con el interruptor puesto.
                  disabled={done === 0 && !showDone}
                />
                Ver tareas realizadas
              </label>
            </div>
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
                ? "Todo lo escrito está hecho. Enciende “Ver tareas realizadas” para repasarlo."
                : "Escribe el primero arriba. Una frase basta."}
            </EmptyState>
          ) : (
            <SortableGroups groups={shown} onMove={move}>
              {(group, grip) => (
                <Group
                  group={group}
                  grip={grip}
                  showDone={showDone}
                  collapsed={collapsed.has(collapseKey(owner, group.locationId))}
                  onCollapse={(value) =>
                    collapse((next) => {
                      const key = collapseKey(owner, group.locationId)
                      if (value) next.add(key)
                      else next.delete(key)
                    })
                  }
                  onNotUrgent={(id, value) =>
                    run({ type: "urgency", id, notUrgent: value }, () =>
                      setPendingNotUrgent(id, value),
                    )
                  }
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
              )}
            </SortableGroups>
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

/**
 * Los grupos, reordenables desde el asa de su encabezado. "Sin subcuenta"
 * no se arrastra ni recibe: siempre va al final.
 */
function SortableGroups({
  groups,
  onMove,
  children,
}: {
  groups: PendingGroup[]
  onMove: (moved: string, target: string) => void
  children: (group: PendingGroup, grip: React.ReactNode) => React.ReactNode
}) {
  const dndId = useId()
  const sortable = groups.flatMap((g) => (g.locationId ? [g.locationId] : []))
  const nameOf = (id: string | number) =>
    groups.find((g) => g.locationId === id)?.name ?? "la subcuenta"

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onMove(String(active.id), String(over.id))
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `${nameOf(active.id)} va en el lugar de ${nameOf(over.id)}.`
        : `${nameOf(active.id)} sigue en su lugar.`,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `${nameOf(active.id)} quedó en el lugar de ${nameOf(over.id)}.`
        : `${nameOf(active.id)} se quedó donde estaba.`,
    onDragCancel: ({ active }) =>
      `Cancelado. ${nameOf(active.id)} se quedó donde estaba.`,
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Para mover una subcuenta, presiona espacio. Usa las flechas arriba y abajo para elegir su lugar y vuelve a presionar espacio para soltarla. Escape cancela.",
        },
      }}
    >
      <SortableContext items={sortable} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-border">
          {groups.map((group) =>
            group.locationId ? (
              <SortableGroup
                key={group.locationId}
                id={group.locationId}
                name={group.name}
              >
                {(grip) => children(group, grip)}
              </SortableGroup>
            ) : (
              <div key={SIN_SUBCUENTA}>{children(group, null)}</div>
            ),
          )}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableGroup({
  id,
  name,
  children,
}: {
  id: string
  name: string
  children: (grip: React.ReactNode) => React.ReactNode
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, attributes: { roleDescription: "subcuenta reordenable" } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative bg-card",
        isDragging && "z-10 shadow-md ring-1 ring-border",
      )}
    >
      {children(
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Mover ${name}`}
          className="-ml-1.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-3.5" aria-hidden />
        </button>,
      )}
    </div>
  )
}

function Group({
  group,
  grip,
  showDone,
  collapsed,
  onCollapse,
  onAdd,
  onToggle,
  onNotUrgent,
  onDelete,
}: {
  group: PendingGroup
  /** Asa de arrastre; `null` en "Sin subcuenta", que no se mueve. */
  grip: React.ReactNode
  showDone: boolean
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
  onNotUrgent: (id: string, notUrgent: boolean) => void
  onAdd: (body: string) => void
  onToggle: (id: string, done: boolean) => void
  onDelete: (id: string) => void
}) {
  const rows = showDone ? [...group.open, ...group.done] : group.open
  const waiting = group.open.filter((p) => p.notUrgent).length
  const bodyId = useId()

  return (
    <section>
      <header className="flex items-center gap-2 bg-muted/40 px-4 py-2">
        {grip ?? <span aria-hidden className="-ml-1.5 size-5 shrink-0" />}
        <h3 className="min-w-0 flex-1 text-sm font-medium">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            title={collapsed ? "Expandir" : "Colapsar"}
            className="-my-1 flex w-full min-w-0 items-center gap-1.5 rounded-sm py-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onCollapse(!collapsed)}
          >
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                collapsed && "-rotate-90",
              )}
            />
            <span className="truncate">{group.name}</span>
          </button>
        </h3>
        <span className="num shrink-0 text-xs text-muted-foreground">
          {group.open.length}
          {waiting > 0 && ` · ${waiting} no urgente${waiting === 1 ? "" : "s"}`}
          {group.done.length > 0 && ` · ${group.done.length} hecho${group.done.length === 1 ? "" : "s"}`}
        </span>
      </header>

      <div id={bodyId} hidden={collapsed}>
        <ul className="divide-y divide-border">
          {rows.map((p) => (
            <Row
              key={p.id}
              pending={p}
              onToggle={(done) => onToggle(p.id, done)}
              onNotUrgent={(value) => onNotUrgent(p.id, value)}
              onDelete={() => onDelete(p.id)}
            />
          ))}
        </ul>

        <AddToGroup name={group.name} onAdd={onAdd} />
      </div>
    </section>
  )
}

function Row({
  pending,
  onToggle,
  onNotUrgent,
  onDelete,
}: {
  pending: Pending
  onToggle: (done: boolean) => void
  onNotUrgent: (notUrgent: boolean) => void
  onDelete: () => void
}) {
  // Un pendiente que el servidor todavía no confirma no se puede marcar ni
  // borrar: su id no existe en Neon.
  const isDraft = pending.id.startsWith("draft_")
  // Lo hecho ya no espera nada: ni etiqueta ni botón.
  const waiting = pending.notUrgent && !pending.done

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
            waiting && "text-muted-foreground",
          )}
        >
          {pending.body}
        </span>
      </label>
      {waiting && (
        <StatusChip tone="idle" className="shrink-0">
          No urgente
        </StatusChip>
      )}
      {!pending.done && (
        <Button
          size="icon-xs"
          variant="ghost"
          className={cn(
            "shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            waiting && "text-foreground",
          )}
          disabled={isDraft}
          aria-pressed={pending.notUrgent}
          title={waiting ? "Quitar “no urgente”" : "Marcar como no urgente"}
          aria-label={
            waiting
              ? `Quitar “no urgente” a “${pending.body}”`
              : `Marcar “${pending.body}” como no urgente`
          }
          onClick={() => onNotUrgent(!pending.notUrgent)}
        >
          <ClockIcon />
        </Button>
      )}
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
