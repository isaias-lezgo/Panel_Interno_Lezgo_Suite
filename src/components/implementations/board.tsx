"use client"

import {
  useId,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core"

import { moveImplementation } from "@/app/(panel)/implementaciones/actions"
import { ImplementationDialog } from "@/components/implementations/implementation-dialog"

import { SignalMeter } from "@/components/signal/signal-meter"
import { stageLabel, StatusChip } from "@/components/signal/status-chip"
import { stampDate } from "@/lib/format"
import { dueStatus } from "@/lib/implementations/due"
import type {
  Client,
  Implementation,
  ImplementationKind,
  ImplementationStage,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const stages: ImplementationStage[] = [
  "scoping",
  "building",
  "review",
  "launch",
  "live",
]

const kindLabel: Record<ImplementationKind, string> = {
  snapshot: "Snapshot",
  workflow: "Automatización",
  integration: "Integración",
  migration: "Migración",
  training: "Capacitación",
}

type Move = { id: string; stage: ImplementationStage }

const titleOf = (i: Implementation) => i.name

/**
 * Con teclado, ← y → saltan a la columna vecina. El getter por defecto
 * avanza 25 px por tecla, que en un tablero de columnas no lleva a ningún
 * lado útil.
 */
const byColumn: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, over, droppableRects, collisionRect } = context
  const step =
    event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0
  if (!active || !collisionRect || step === 0) return undefined
  event.preventDefault()

  const current = (over?.id ?? active.data.current?.stage) as ImplementationStage
  const index = Math.min(
    Math.max(stages.indexOf(current) + step, 0),
    stages.length - 1,
  )
  const rect = droppableRects.get(stages[index])
  if (!rect) return undefined
  return {
    x: rect.left + (rect.width - collisionRect.width) / 2,
    y: rect.top + 32,
  }
}

export function ImplementationBoard({
  implementations,
  clients,
}: {
  implementations: Implementation[]
  clients: Client[]
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [, startMove] = useTransition()
  const dndId = useId()

  // La tarjeta cambia de columna al soltarla; si Neon rechaza el cambio, al
  // terminar la transición vuelve sola a su etapa real.
  const [board, applyMove] = useOptimistic(
    implementations,
    (list, move: Move) =>
      list.map((i) => (i.id === move.id ? { ...i, stage: move.stage } : i)),
  )

  // Con distancia mínima un clic sigue siendo clic: el enlace al cliente
  // funciona y solo un arrastre real mueve la tarjeta.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Enter abre la ficha; espacio toma la tarjeta para moverla.
    useSensor(KeyboardSensor, {
      coordinateGetter: byColumn,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  )

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  )

  const byId = useMemo(() => new Map(board.map((i) => [i.id, i])), [board])

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const item = byId.get(String(active.id))
    const stage = over?.id as ImplementationStage | undefined
    if (!item || !stage || stage === item.stage) return
    setError(null)
    startMove(async () => {
      applyMove({ id: item.id, stage })
      const r = await moveImplementation(item.id, stage)
      if (!r.ok) setError(`No se movió ${titleOf(item)}: ${r.error}`)
    })
  }

  const nameOf = (id: string | number) => {
    const item = byId.get(String(id))
    return item ? titleOf(item) : "la tarjeta"
  }
  const stageOf = (id: string | number) =>
    stageLabel[id as ImplementationStage]?.label ?? String(id)

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} está sobre ${stageOf(over.id)}.`
        : `${nameOf(active.id)} no está sobre ninguna columna.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} se movió a ${stageOf(over.id)}.`
        : `${nameOf(active.id)} se quedó donde estaba.`,
    onDragCancel: ({ active }) =>
      `Cancelado. ${nameOf(active.id)} se quedó donde estaba.`,
  }

  const draggingItem = dragging ? byId.get(dragging) : undefined

  return (
    <div>
      {error && (
        <p role="alert" className="border-b border-border px-4 py-2 text-xs text-status-risk">
          {error}
        </p>
      )}

      <DndContext
        id={dndId}
        sensors={sensors}
        onDragStart={({ active }) => setDragging(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Para mover una tarjeta, presiona espacio o Enter. Usa las flechas izquierda y derecha para elegir la columna y vuelve a presionar espacio o Enter para soltarla. Escape cancela.",
          },
        }}
      >
        <div className="overflow-x-auto p-3">
          <div className="grid min-w-[62rem] grid-cols-5 gap-3">
            {stages.map((stage) => (
              <StageColumn
                key={stage}
                stage={stage}
                items={board.filter((i) => i.stage === stage)}
                clientById={clientById}
                dragging={dragging}
                onOpen={setOpenId}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingItem && (
            <article className="cursor-grabbing rounded-md border border-primary/60 bg-background p-3 shadow-lg">
              <CardBody
                item={draggingItem}
                client={
                  draggingItem.clientId
                    ? clientById.get(draggingItem.clientId)
                    : undefined
                }
              />
            </article>
          )}
        </DragOverlay>
      </DndContext>

      <ImplementationDialog
        item={openId ? byId.get(openId) : undefined}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </div>
  )
}

function StageColumn({
  stage,
  items,
  clientById,
  dragging,
  onOpen,
}: {
  stage: ImplementationStage
  items: Implementation[]
  clientById: Map<string, Client>
  dragging: string | null
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const label = stageLabel[stage]

  return (
    <section
      ref={setNodeRef}
      aria-label={label.label}
      className={cn(
        "-m-1 min-w-0 rounded-lg p-1 transition-colors",
        dragging && "bg-muted/30",
        isOver && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="eyebrow">{label.label}</h3>
        <span className="num text-xs text-muted-foreground">{items.length}</span>
      </header>

      <div className="min-h-20 space-y-2">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {dragging ? "Suelta aquí" : "Vacío"}
          </p>
        )}
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            client={item.clientId ? clientById.get(item.clientId) : undefined}
            onOpen={() => onOpen(item.id)}
          />
        ))}
      </div>
    </section>
  )
}

function DraggableCard({
  item,
  client,
  onOpen,
}: {
  item: Implementation
  client: Client | undefined
  onOpen: () => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.id,
    data: { stage: item.stage },
    attributes: { roleDescription: "tarjeta arrastrable" },
  })

  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${titleOf(item)}. Enter abre la ficha; espacio la mueve.`}
      // Un arrastre de más de 6 px nunca llega como clic: dnd-kit lo toma
      // antes. Lo que llega aquí es un clic de verdad.
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === "Enter" && !e.defaultPrevented) onOpen()
      }}
      className={cn(
        "cursor-pointer touch-none rounded-md border border-border bg-background p-3 transition-colors select-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        item.blocked && "border-status-warn/50",
        isDragging && "opacity-40",
      )}
    >
      <CardBody item={item} client={client} />
    </article>
  )
}

function CardBody({
  item,
  client,
}: {
  item: Implementation
  client: Client | undefined
}) {
  return (
    <>
      {client && (
        <Link
          href={`/clientes/${client.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="eyebrow block truncate hover:text-primary"
        >
          {client.name}
        </Link>
      )}
      <p className="mt-1.5 text-sm leading-snug font-medium">
        {titleOf(item)}
      </p>
      {item.ghlLocationName && item.ghlLocationName !== item.name && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.ghlLocationName}
        </p>
      )}
      {item.kind && (
        <p className="mt-1 text-xs text-muted-foreground">
          {kindLabel[item.kind]}
        </p>
      )}
      {item.contacts.length > 0 && (
        <ul
          className="mt-1 space-y-px"
          aria-label="Contactos de Lezgo Suite"
        >
          {item.contacts.map((c) => (
            <li
              key={c.id}
              className="truncate text-[11px] leading-4 text-muted-foreground"
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <SignalMeter
          value={item.progress}
          tone={item.blocked ? "warn" : "build"}
          segments={8}
          label={`Avance de ${item.name}: ${item.progress}%`}
        />
        <span className="num text-xs text-muted-foreground">
          {item.progress}%
        </span>
      </div>

      <div className="mt-2.5">
        <DueChip dueAt={item.dueAt} />
      </div>

      {item.blocked && (
        <div className="mt-2.5">
          <StatusChip tone="warn">Bloqueado</StatusChip>
          {item.blockedReason && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {item.blockedReason}
            </p>
          )}
        </div>
      )}

      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span className="num truncate">
          {item.createdAt &&
            `Creada el ${stampDate(item.createdAt)}`}
        </span>
        {item.owner && (
          <span className="truncate whitespace-nowrap">{item.owner}</span>
        )}
      </footer>
    </>
  )
}

/** Semáforo de la fecha máxima; la misma lectura que en la ficha. */
export function DueChip({ dueAt }: { dueAt: string | null }) {
  const due = dueStatus(dueAt)
  return (
    <StatusChip tone={due.tone} className="num">
      {due.label}
    </StatusChip>
  )
}
