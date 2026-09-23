"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
  AlertTriangleIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  SquareIcon,
  XIcon,
} from "lucide-react"

import { Markdown } from "@/components/ai/markdown"
import { toolLabel } from "@/components/ai/tool-labels"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Loose view of a tool part. The typed union is exhaustive per tool name, but
 * this transcript renders every tool the same way, so it reads them
 * structurally instead.
 */
type ToolPart = {
  type: string
  toolCallId: string
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied"
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: {
    id: string
    approved?: boolean
    isAutomatic?: boolean
    reason?: string
  }
}

const suggestions = [
  "¿Qué clientes no tienen Stripe o subcuenta enlazada?",
  "Implementaciones que vencen esta semana y qué les falta",
  "¿Cuánto tenemos vencido en Stripe y de qué clientes?",
  "¿Qué subcuentas tienen Lezgo IA sin configurar?",
]

export function CopilotChat() {
  const { messages, sendMessage, status, error, addToolApprovalResponse, stop } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/copilot" }),
    })

  const [input, setInput] = useState("")
  const endRef = useRef<HTMLDivElement>(null)
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, status])

  const submit = (text: string) => {
    const value = text.trim()
    if (!value || busy) return
    sendMessage({ text: value })
    setInput("")
  }

  return (
    <div className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col justify-center px-4 py-12">
            <h2 className="display text-lg">¿Qué necesitas de GoHighLevel?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              El copiloto lee la cartera del panel y opera sobre la API de
              GoHighLevel. Las acciones destructivas y los envíos a clientes te
              piden confirmación antes de ejecutarse.
            </p>
            <ul className="mt-6 space-y-2">
              {suggestions.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => submit(text)}
                    className="w-full rounded-md border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/50"
                  >
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {messages.map((message) => (
              <article key={message.id} className="flex gap-3">
                <span
                  className={cn(
                    "num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium",
                    message.role === "user"
                      ? "bg-secondary"
                      : "bg-primary text-primary-foreground",
                  )}
                  aria-hidden
                >
                  {message.role === "user" ? "TÚ" : "LS"}
                </span>

                <div className="min-w-0 flex-1 space-y-3">
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return message.role === "user" ? (
                        <p
                          key={index}
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                        >
                          {part.text}
                        </p>
                      ) : (
                        <Markdown key={index}>{part.text}</Markdown>
                      )
                    }

                    if (part.type.startsWith("tool-")) {
                      return (
                        <ToolCard
                          key={index}
                          part={part as unknown as ToolPart}
                          onRespond={addToolApprovalResponse}
                        />
                      )
                    }

                    return null
                  })}
                </div>
              </article>
            ))}

            {busy && (
              <p className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" aria-hidden />
                Pensando…
              </p>
            )}

            <div ref={endRef} />
          </div>
        )}
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          No se pudo completar la respuesta: {error.message}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(input)
        }}
        className="border-t border-border p-3"
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit(input)
              }
            }}
            rows={1}
            placeholder="Pide un reporte o una acción en GoHighLevel…"
            aria-label="Mensaje para el copiloto"
            className="max-h-40 min-h-9 resize-none"
          />
          {busy ? (
            <Button type="button" size="icon" variant="outline" onClick={stop} aria-label="Detener">
              <SquareIcon />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              aria-label="Enviar mensaje"
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Enter envía · Shift + Enter agrega una línea
        </p>
      </form>
    </div>
  )
}

function ToolCard({
  part,
  onRespond,
}: {
  part: ToolPart
  onRespond: (response: { id: string; approved: boolean }) => void
}) {
  const [open, setOpen] = useState(false)
  const label = toolLabel(part.type)
  const needsDecision =
    part.state === "approval-requested" && !part.approval?.isAutomatic

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background",
        needsDecision && "border-status-warn/60",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <ToolState state={part.state} />
        <span className="text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={open}
        >
          {open ? "Ocultar" : "Detalle"}
          <ChevronDownIcon
            className={cn("size-3 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>

      {needsDecision && (
        <div className="border-t border-border px-3 py-2.5">
          <p className="text-xs">
            Esta acción modifica datos reales o sale hacia un cliente.
            ¿La ejecuto?
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="xs"
              onClick={() =>
                onRespond({ id: part.approval!.id, approved: true })
              }
            >
              <CheckIcon /> Aprobar
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                onRespond({ id: part.approval!.id, approved: false })
              }
            >
              <XIcon /> Rechazar
            </Button>
          </div>
        </div>
      )}

      {part.state === "output-denied" && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Acción rechazada.
          {part.approval?.reason ? ` Motivo: ${part.approval.reason}` : ""}
        </p>
      )}

      {part.state === "output-error" && (
        <p className="border-t border-border px-3 py-2 text-xs text-destructive">
          {part.errorText ?? "La herramienta devolvió un error."}
        </p>
      )}

      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          <Payload title="Entrada" value={part.input} />
          {part.output !== undefined && (
            <Payload title="Resultado" value={part.output} />
          )}
        </div>
      )}
    </div>
  )
}

function ToolState({ state }: { state: ToolPart["state"] }) {
  if (state === "output-available")
    return <CheckIcon className="size-3 shrink-0 text-status-live" aria-hidden />
  if (state === "output-error" || state === "output-denied")
    return <XIcon className="size-3 shrink-0 text-status-risk" aria-hidden />
  if (state === "approval-requested")
    return (
      <AlertTriangleIcon
        className="size-3 shrink-0 text-status-warn"
        aria-hidden
      />
    )
  return (
    <Loader2Icon
      className="size-3 shrink-0 animate-spin text-muted-foreground"
      aria-hidden
    />
  )
}

function Payload({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="eyebrow mb-1">{title}</p>
      <pre className="num max-h-56 overflow-auto rounded bg-muted px-2 py-1.5 text-[11px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
