"use client"

import { useState } from "react"
import { ArrowUpIcon, CheckIcon } from "lucide-react"

import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  clockTime,
  threadKindLabel,
  type Advisor,
  type Subaccount,
  type Thread,
  type ThreadMessage,
} from "@/data/lezgo-ia"
import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

export const deliveryLabel = {
  sent: { label: "Enviado", tone: "live" },
  failed: { label: "No salió", tone: "risk" },
  simulated: { label: "Simulado", tone: "idle" },
} as const

/**
 * Un hilo IA ↔ asesor en globos, para ver de un vistazo quién dijo qué: la IA a
 * la izquierda, el asesor a la derecha, las propuestas de la IA como botones. El
 * cuadro de abajo agrega mensajes solo en memoria, y solo en el demo: un
 * hilo real (`readOnly`) es lo que mandó el motor, sin caja para contestar.
 */
export function ThreadView({
  thread,
  account,
  advisor,
  now,
  readOnly = false,
  onChange,
}: {
  now: string
  readOnly?: boolean
  thread: Thread
  account: Subaccount
  advisor: Advisor
  onChange: (update: (thread: Thread) => Thread) => void
}) {
  const [draft, setDraft] = useState("")
  const kind = threadKindLabel[thread.kind]

  const append = (text: string) => {
    const value = text.trim()
    if (!value) return
    onChange((t) => ({
      ...t,
      messages: [
        ...t.messages,
        {
          id: `local-${t.messages.length + 1}`,
          from: "advisor",
          text: value,
          at: now,
        },
      ],
    }))
    setDraft("")
  }

  const choose = (messageId: string, label: string) => {
    onChange((t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              actions: m.actions?.map((a) => ({
                label: a.label,
                chosen: a.label === label,
              })),
            }
          : m,
      ),
    }))
    append(label)
  }

  return (
    <section className="flex min-h-[32rem] flex-col rounded-lg border border-border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{thread.subject}</h2>
          <StatusChip tone={kind.tone}>{kind.label}</StatusChip>
          {thread.delivery && (
            <StatusChip tone={deliveryLabel[thread.delivery.status].tone}>
              {deliveryLabel[thread.delivery.status].label}
            </StatusChip>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {advisor.name} · {advisor.role === "admin" ? "Admin" : "Usuario"} ·{" "}
          {account.name}
          {thread.about && (
            <>
              {" "}
              · <span className="text-foreground/80">{thread.about}</span>
            </>
          )}
        </p>
        {thread.delivery?.status === "simulated" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Corrida simulada: este mensaje no se mandó a nadie.
          </p>
        )}
        {thread.delivery?.status === "failed" && (
          <p className="mt-1 text-xs text-status-risk">
            GoHighLevel no lo mandó
            {thread.delivery.error ? `: ${thread.delivery.error}` : "."}
          </p>
        )}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {thread.messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            advisor={advisor}
            onChoose={(label) => choose(message.id, label)}
          />
        ))}
      </div>

      {!readOnly && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            append(draft)
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  append(draft)
                }
              }}
              rows={1}
              placeholder={`Responder como ${advisor.name.split(" ")[0]}…`}
              aria-label="Responder en el hilo"
              className="max-h-32 min-h-9 resize-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim()}
              aria-label="Enviar respuesta"
            >
              <ArrowUpIcon />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Vista previa: la respuesta se queda en esta pantalla, no llega al
            asesor.
          </p>
        </form>
      )}
    </section>
  )
}

function Message({
  message,
  advisor,
  onChoose,
}: {
  message: ThreadMessage
  advisor: Advisor
  onChoose: (label: string) => void
}) {
  const fromIa = message.from === "ia"
  const chosen = message.actions?.find((a) => a.chosen)
  const pending = message.actions && !chosen

  // La IA a la izquierda y con tinte de marca; el asesor a la derecha y en
  // gris. Lado, relleno y nombre dicen lo mismo: no depende solo del color.
  return (
    <article className={cn("flex flex-col gap-1.5", fromIa ? "items-start" : "items-end")}>
      <p className={cn("flex items-center gap-2", !fromIa && "flex-row-reverse")}>
        <span
          aria-hidden
          className={cn(
            "num grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium",
            fromIa ? "bg-primary text-primary-foreground" : "bg-secondary",
          )}
        >
          {fromIa ? "IA" : initials(advisor.name)}
        </span>
        <span className="text-xs font-medium">
          {fromIa ? "Lezgo IA" : advisor.name}
        </span>
        <time
          dateTime={message.at}
          className="num text-[11px] text-muted-foreground"
        >
          {clockTime(message.at)}
        </time>
      </p>

      <div
        className={cn(
          "max-w-[88%] min-w-0 rounded-lg border px-3.5 py-2.5",
          fromIa
            ? "rounded-tl-sm border-primary/25 bg-primary/10"
            : "rounded-tr-sm border-border bg-secondary",
        )}
      >
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {message.text}
        </p>

        {pending && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {message.actions!.map((action) => (
              <Button
                key={action.label}
                size="xs"
                variant="outline"
                onClick={() => onChoose(action.label)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {chosen && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-status-live/10 px-2 py-1 text-xs text-status-live">
            <CheckIcon className="size-3" aria-hidden />
            {advisor.name.split(" ")[0]} eligió «{chosen.label}»
          </p>
        )}
      </div>
    </article>
  )
}
