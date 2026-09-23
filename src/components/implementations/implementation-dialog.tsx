"use client"

import { useId, useOptimistic, useRef, useState, useTransition } from "react"
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  CornerDownRightIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import {
  addChecklistItem,
  addNote,
  deleteChecklistItem,
  deleteImplementation,
  deleteNote,
  renameImplementation,
  reorderChecklistItems,
  setImplementationDueDate,
  toggleChecklistItem,
} from "@/app/(panel)/implementaciones/actions"
import { DueChip } from "@/components/implementations/board"
import { DatePicker } from "@/components/panel/date-picker"
import { SignalMeter } from "@/components/signal/signal-meter"
import { stageLabel, StatusChip } from "@/components/signal/status-chip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { stampDate, stampDateTime } from "@/lib/format"
import { checklistProgress } from "@/lib/implementations/checklist"
import type {
  ChecklistItem,
  Implementation,
  ImplementationNote,
} from "@/lib/types"
import { cn } from "@/lib/utils"

type Done = { ok: true } | { ok: false; error: string }

type Edit =
  | { type: "toggle"; id: string; done: boolean }
  | { type: "delete"; id: string }
  | { type: "add"; item: ChecklistItem }
  | { type: "reorder"; parentId: string | null; ids: string[] }

type Group = { point: ChecklistItem; children: ChecklistItem[] }

/** Cada punto principal con sus sub-puntos: así se arrastran juntos. */
function groupChecklist(list: ChecklistItem[]): Group[] {
  const groups: Group[] = []
  for (const item of list) {
    if (!item.parentId) groups.push({ point: item, children: [] })
    else groups.find((g) => g.point.id === item.parentId)?.children.push(item)
  }
  return groups
}

function applyEdit(list: ChecklistItem[], edit: Edit): ChecklistItem[] {
  switch (edit.type) {
    case "toggle":
      return list.map((i) => (i.id === edit.id ? { ...i, done: edit.done } : i))
    case "delete":
      return list.filter((i) => i.id !== edit.id && i.parentId !== edit.id)
    case "add": {
      // Un sub-punto va tras el último hermano; un punto principal, al final.
      const { parentId } = edit.item
      if (!parentId) return [...list, edit.item]
      let at = list.findIndex((i) => i.id === parentId)
      while (list[at + 1]?.parentId === parentId) at++
      return [...list.slice(0, at + 1), edit.item, ...list.slice(at + 1)]
    }
    case "reorder": {
      const rank = new Map(edit.ids.map((id, i) => [id, i]))
      const byRank = (a: ChecklistItem, b: ChecklistItem) =>
        (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
      const groups = groupChecklist(list)
      if (!edit.parentId) groups.sort((a, b) => byRank(a.point, b.point))
      else groups.find((g) => g.point.id === edit.parentId)?.children.sort(byRank)
      return groups.flatMap((g) => [g.point, ...g.children])
    }
  }
}

/**
 * Ficha de una implementación: nombre editable y su checklist. Cada cambio
 * se ve al instante y se guarda en Neon; si falla, al cerrar la transición
 * vuelve al estado real y se dice por qué.
 */
export function ImplementationDialog({
  item,
  onOpenChange,
}: {
  item: Implementation | undefined
  onOpenChange: (open: boolean) => void
}) {
  // Al abrir, el foco va al diálogo y no al nombre: si no, parece que ya se
  // está editando. Tab lleva al nombre en un paso.
  const popup = useRef<HTMLDivElement>(null)

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent
        ref={popup}
        initialFocus={popup}
        className="flex max-h-[min(88vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-4xl">
        {/* `key` reinicia borradores y errores al cambiar de tarjeta. */}
        {item && (
          <DialogBody
            key={item.id}
            item={item}
            onDeleted={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DialogBody({
  item,
  onDeleted,
}: {
  item: Implementation
  onDeleted: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [checklist, edit] = useOptimistic(item.checklist, applyEdit)

  const run = (optimistic: Edit | null, fn: () => Promise<Done>) =>
    start(async () => {
      if (optimistic) edit(optimistic)
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  const done = checklist.filter((i) => i.done).length
  const progress = checklistProgress(checklist)
  const stage = stageLabel[item.stage]

  return (
    <>
      <DeleteButton item={item} onDeleted={onDeleted} />
      <DialogHeader className="gap-1.5 border-b border-border p-4 pr-20">
        <p className="eyebrow truncate">
          {item.ghlLocationName ?? "Implementación"}
        </p>
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        <NameField
          name={item.name}
          onSave={(name) => run(null, () => renameImplementation(item.id, name))}
        />
        <DialogDescription render={<div />} className="space-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
            {item.createdAt && (
              <span className="num text-xs">
                Creada el {stampDate(item.createdAt)}
              </span>
            )}
          </span>
          {item.contacts.length > 0 && (
            <span className="block text-xs">
              {item.contacts.map((c) => c.name).join(" · ")}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:overflow-hidden">
        <section
          aria-label="Checklist"
          className="md:flex md:min-h-0 md:flex-col"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <h3 className="eyebrow">Checklist</h3>
            <SignalMeter
              value={progress}
              tone="build"
              segments={10}
              label={`Avance del checklist: ${progress}%`}
            />
            <span className="num ml-auto text-xs text-muted-foreground">
              {done} de {checklist.length}
            </span>
          </div>

          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            {error && (
              <p role="alert" className="px-4 pt-3 text-xs text-status-risk">
                {error}
              </p>
            )}

            {checklist.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Sin puntos. Agrega el primero abajo.
              </p>
            ) : (
              <SortableChecklist
                checklist={checklist}
                onReorder={(parentId, ids) =>
                  run({ type: "reorder", parentId, ids }, () =>
                    reorderChecklistItems(item.id, parentId, ids),
                  )
                }
                row={(point, grip) => (
                  <ChecklistRow
                    point={point}
                    grip={grip}
                    onToggle={(value) =>
                      run({ type: "toggle", id: point.id, done: value }, () =>
                        toggleChecklistItem(point.id, value),
                      )
                    }
                    onDelete={() =>
                      run({ type: "delete", id: point.id }, () =>
                        deleteChecklistItem(point.id),
                      )
                    }
                    onAddChild={(label) =>
                      run(
                        {
                          type: "add",
                          item: draft(label, point.id),
                        },
                        () => addChecklistItem(item.id, label, point.id),
                      )
                    }
                  />
                )}
              />
            )}

          </div>
          <AddField
            className="border-t border-border px-4 py-3"
            placeholder="Agregar punto al checklist…"
            label="Agregar punto"
            disabled={pending}
            onAdd={(label) =>
              run({ type: "add", item: draft(label, null) }, () =>
                addChecklistItem(item.id, label),
              )
            }
          />
        </section>

        <div className="border-t border-border md:flex md:min-h-0 md:flex-col md:border-t-0 md:border-l">
          <DueDateField implementationId={item.id} dueAt={item.dueAt} />
          <QuickNotes implementationId={item.id} notes={item.notes} />
        </div>
      </div>
    </>
  )
}

/** Punto provisional mientras el servidor asigna el id real. */
function draft(label: string, parentId: string | null): ChecklistItem {
  return {
    id: `draft_${crypto.randomUUID()}`,
    parentId,
    label,
    done: false,
    position: Number.MAX_SAFE_INTEGER,
  }
}

function NameField({
  name,
  onSave,
}: {
  name: string
  onSave: (name: string) => void
}) {
  const [value, setValue] = useState(name)

  const commit = () => {
    const clean = value.trim()
    if (!clean) setValue(name)
    else if (clean !== name) onSave(clean)
  }

  return (
    <Input
      aria-label="Nombre de la implementación"
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape" && value !== name) {
          // Escape revierte el borrador; sin cambios, cierra el panel.
          e.stopPropagation()
          setValue(name)
        }
      }}
      className="-mx-2 h-auto border-transparent bg-transparent px-2 py-1 text-lg font-medium shadow-none hover:border-border focus-visible:border-ring dark:bg-transparent"
    />
  )
}

/** El arrastre solo se mueve en vertical. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/**
 * Checklist reordenable desde el asa de cada punto. Un punto principal se
 * lleva sus sub-puntos; un sub-punto solo cambia de lugar entre sus
 * hermanos. Mientras se arrastra, lo que no es hermano deja de ser destino.
 */
function SortableChecklist({
  checklist,
  onReorder,
  row,
}: {
  checklist: ChecklistItem[]
  onReorder: (parentId: string | null, ids: string[]) => void
  row: (point: ChecklistItem, grip: React.ReactNode) => React.ReactNode
}) {
  const dndId = useId()
  // `undefined`: nada en arrastre; `null`: se arrastra un punto principal.
  const [activeParent, setActiveParent] = useState<string | null | undefined>()
  const groups = groupChecklist(checklist)
  const labelOf = (id: string | number) =>
    checklist.find((i) => i.id === id)?.label ?? "el punto"

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveParent(undefined)
    if (!over || active.id === over.id) return
    const moved = checklist.find((i) => i.id === active.id)
    if (!moved) return
    const siblings = checklist
      .filter((i) => i.parentId === moved.parentId && !i.id.startsWith("draft_"))
      .map((i) => i.id)
    const from = siblings.indexOf(moved.id)
    const to = siblings.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(moved.parentId, arrayMove(siblings, from, to))
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? `${labelOf(active.id)} va en el lugar de ${labelOf(over.id)}.`
        : `${labelOf(active.id)} sigue en su lugar.`,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `${labelOf(active.id)} quedó en el lugar de ${labelOf(over.id)}.`
        : `${labelOf(active.id)} se quedó donde estaba.`,
    onDragCancel: ({ active }) =>
      `Cancelado. ${labelOf(active.id)} se quedó donde estaba.`,
  }

  const sortable = (point: ChecklistItem) => ({
    point,
    dropDisabled:
      activeParent !== undefined && point.parentId !== activeParent,
    row,
  })

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={({ active }) =>
        setActiveParent(
          checklist.find((i) => i.id === active.id)?.parentId ?? null,
        )
      }
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveParent(undefined)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Para mover un punto, presiona espacio. Usa las flechas arriba y abajo para elegir su lugar y vuelve a presionar espacio para soltarlo. Escape cancela.",
        },
      }}
    >
      <SortableContext
        items={groups.map((g) => g.point.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="py-1">
          {groups.map((g) => (
            <SortableItem key={g.point.id} {...sortable(g.point)}>
              {g.children.length > 0 && (
                <SortableContext
                  items={g.children.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul>
                    {g.children.map((c) => (
                      <SortableItem key={c.id} {...sortable(c)} />
                    ))}
                  </ul>
                </SortableContext>
              )}
            </SortableItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({
  point,
  dropDisabled,
  row,
  children,
}: {
  point: ChecklistItem
  dropDisabled: boolean
  row: (point: ChecklistItem, grip: React.ReactNode) => React.ReactNode
  children?: React.ReactNode
}) {
  const isDraft = point.id.startsWith("draft_")
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: point.id,
    disabled: {
      draggable: isDraft,
      droppable: dropDisabled,
    },
    attributes: { roleDescription: "punto reordenable" },
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative",
        isDragging && "z-10 bg-background shadow-md ring-1 ring-border",
      )}
    >
      {row(
        point,
        <button
          type="button"
          ref={setActivatorNodeRef}
          disabled={isDraft}
          {...attributes}
          {...listeners}
          aria-label={`Mover ${point.label}`}
          className="mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:invisible"
        >
          <GripVerticalIcon className="size-3.5" aria-hidden />
        </button>,
      )}
      {children}
    </li>
  )
}

function ChecklistRow({
  point,
  grip,
  onToggle,
  onDelete,
  onAddChild,
}: {
  point: ChecklistItem
  /** Asa de arrastre; la pone `SortableItem`. */
  grip: React.ReactNode
  onToggle: (done: boolean) => void
  onDelete: () => void
  onAddChild: (label: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const isDraft = point.id.startsWith("draft_")
  const isChild = Boolean(point.parentId)

  return (
    <>
      <div
        className={cn(
          "group flex items-start gap-1 py-1.5 pr-4 pl-1.5 hover:bg-muted/40",
          isChild && "pl-8",
        )}
      >
        {grip}
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 py-0.5 pl-1">
          <Checkbox
            className="mt-0.5"
            checked={point.done}
            disabled={isDraft}
            onCheckedChange={(value) => onToggle(value === true)}
          />
          <span
            className={cn(
              "text-sm leading-snug",
              isChild && "text-[13px]",
              point.done && "text-muted-foreground line-through",
            )}
          >
            {point.label}
          </span>
        </label>
        <span className="flex shrink-0 gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          {!isChild && (
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={isDraft}
              aria-label={`Agregar sub-punto a ${point.label}`}
              onClick={() => setAdding(true)}
            >
              <CornerDownRightIcon />
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={isDraft}
            aria-label={`Eliminar ${point.label}`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </span>
      </div>
      {adding && (
        <AddField
          className="py-1.5 pr-4 pl-[3.75rem]"
          placeholder="Sub-punto…"
          label="Agregar sub-punto"
          autoFocus
          disabled={false}
          onAdd={(label) => {
            onAddChild(label)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </>
  )
}

function AddField({
  placeholder,
  label,
  disabled,
  autoFocus,
  className,
  onAdd,
  onCancel,
}: {
  placeholder: string
  label: string
  disabled: boolean
  autoFocus?: boolean
  className?: string
  onAdd: (label: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState("")

  const submit = () => {
    const clean = value.trim()
    if (!clean) return
    onAdd(clean)
    setValue("")
  }

  return (
    <form
      className={cn("flex items-center gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        maxLength={300}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onCancel) {
            e.stopPropagation()
            onCancel()
          }
        }}
        className="h-8"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || !value.trim()}
      >
        <PlusIcon aria-hidden />
        Agregar
      </Button>
    </form>
  )
}

/**
 * Fecha máxima de entrega. Es opcional: vacía, el semáforo queda en azul.
 * Se guarda al elegir el día; "Quitar" la borra.
 */
function DueDateField({
  implementationId,
  dueAt,
}: {
  implementationId: string
  dueAt: string | null
}) {
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useOptimistic(dueAt)
  const inputId = useId()

  const save = (next: string | null) =>
    start(async () => {
      setValue(next)
      const r = await setImplementationDueDate(implementationId, next)
      setError(r.ok ? null : r.error)
    })

  return (
    <section
      aria-label="Fecha máxima"
      className="space-y-2 border-b border-border px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <label htmlFor={inputId} className="eyebrow">
          Fecha máxima
        </label>
        <span className="ml-auto">
          <DueChip dueAt={value} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <DatePicker
          id={inputId}
          value={value}
          placeholder="Sin fecha"
          onChange={(next) => {
            if (next !== value) save(next)
          }}
        />
        {value && (
          <Button size="sm" variant="ghost" onClick={() => save(null)}>
            Quitar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-status-risk">
          {error}
        </p>
      )}
    </section>
  )
}

type NoteEdit =
  | { type: "add"; note: ImplementationNote }
  | { type: "delete"; id: string }

/**
 * Notas rápidas: texto libre con fecha, la más reciente arriba. No se
 * editan; se borran y se escriben de nuevo.
 */
function QuickNotes({
  implementationId,
  notes,
}: {
  implementationId: string
  notes: ImplementationNote[]
}) {
  const [, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState("")
  const [list, edit] = useOptimistic(notes, (current, e: NoteEdit) =>
    e.type === "add"
      ? [e.note, ...current]
      : current.filter((n) => n.id !== e.id),
  )

  const run = (optimistic: NoteEdit, fn: () => Promise<Done>) =>
    start(async () => {
      edit(optimistic)
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  const submit = () => {
    const body = value.trim()
    if (!body) return
    setValue("")
    run(
      {
        type: "add",
        note: {
          id: `draft_${crypto.randomUUID()}`,
          body,
          createdAt: new Date().toISOString(),
        },
      },
      () => addNote(implementationId, body),
    )
  }

  return (
    <section
      aria-label="Notas rápidas"
      className="md:flex md:min-h-0 md:flex-1 md:flex-col"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h3 className="eyebrow">Notas rápidas</h3>
        <span className="num ml-auto text-xs text-muted-foreground">
          {list.length}
        </span>
      </div>

      <form
        className="space-y-2 border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Textarea
          aria-label="Nueva nota"
          placeholder="Escribe una nota…"
          value={value}
          maxLength={2000}
          rows={3}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          className="min-h-20 resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            <kbd>⌘</kbd> <kbd>Enter</kbd> para guardar
          </span>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!value.trim()}
          >
            <PlusIcon aria-hidden />
            Guardar nota
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-status-risk">
            {error}
          </p>
        )}
      </form>

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Sin notas todavía.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((note) => {
              const isDraft = note.id.startsWith("draft_")
              return (
                <li key={note.id} className="group px-4 py-3">
                  <div className="flex items-center gap-2">
                    <time
                      dateTime={note.createdAt}
                      className="num text-xs text-muted-foreground"
                    >
                      {isDraft ? "Guardando…" : stampDateTime(note.createdAt)}
                    </time>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={isDraft}
                      aria-label="Eliminar nota"
                      className="ml-auto opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      onClick={() =>
                        run({ type: "delete", id: note.id }, () =>
                          deleteNote(note.id),
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <p className="mt-1 text-sm leading-snug break-words whitespace-pre-wrap">
                    {note.body}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Junto a la X del diálogo. Borrar pide confirmación: no se puede deshacer. */
function DeleteButton({
  item,
  onDeleted,
}: {
  item: Implementation
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const confirm = () =>
    start(async () => {
      const r = await deleteImplementation(item.id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOpen(false)
      onDeleted()
    })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Eliminar la implementación ${item.name}`}
            className="absolute top-2 right-10 z-10 text-muted-foreground hover:text-destructive"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {item.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran su checklist ({plural(item.checklist.length, "punto")}) y
            sus notas ({item.notes.length}). No se puede deshacer. En
            GoHighLevel no se toca nada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-xs text-status-risk">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? "Eliminando…" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`
