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

/**
 * Un hilo IA ↔ asesor, con el mismo lenguaje visual que el copiloto: avatar a
 * la izquierda, texto a la derecha, las propuestas de la IA como botones. El
 * cuadro de abajo agrega mensajes solo en memoria.
 */
export function ThreadView({
  thread,
  account,
  advisor,
  now,
  onChange,
}: {
  now: string
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

  return (
    <article className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium",
          fromIa ? "bg-primary text-primary-foreground" : "bg-secondary",
        )}
      >
        {fromIa ? "IA" : initials(advisor.name)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-xs font-medium">
            {fromIa ? "Lezgo IA" : advisor.name}
          </span>
          <time dateTime={message.at} className="num text-[11px] text-muted-foreground">
            {clockTime(message.at)}
          </time>
        </p>
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
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
