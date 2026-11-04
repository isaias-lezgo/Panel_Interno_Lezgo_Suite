"use client"

import { useState, useTransition } from "react"
import { PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { runLezgoIaNow } from "@/app/(panel)/lezgo-ia/actions"
import { Instrument } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { RunSummary } from "@/lib/lezgo-ia/run"

const skipLabel: Record<string, string> = {
  "ia-inactiva": "IA inactiva",
  "avisos-apagados": "asesor con avisos apagados",
  "ajuste-apagado": "ajuste apagado",
  "dia-no-laborable": "día no laborable",
  "horario-de-silencio": "horario de silencio",
  "sin-gerente": "sin admin que haga de gerente",
}

/**
 * Corre el motor sobre la subcuenta abierta, con la configuración guardada,
 * y muestra qué decidió. El motor es el mismo que correrá solo; este botón
 * solo lo dispara.
 */
export function EngineCard({
  locationId,
  demo,
  dirty,
}: {
  locationId: string
  demo: boolean
  dirty: boolean
}) {
  const [running, startRunning] = useTransition()
  const [repeat, setRepeat] = useState(false)
  const [result, setResult] = useState<RunSummary | null>(null)

  const run = () =>
    startRunning(async () => {
      const r = await runLezgoIaNow(locationId, { repeat })
      if (!r.ok) {
        toast.error("El motor no corrió", { description: r.error })
        return
      }
      setResult(r)
      const sent = r.messages.filter((m) => m.status === "sent").length
      toast.success(
        r.inactive
          ? "La IA de esta subcuenta no está activa"
          : r.mode === "prueba"
            ? `${sent} ${sent === 1 ? "mensaje mandado" : "mensajes mandados"} al número de pruebas`
            : "Corrida simulada: no se mandó nada",
      )
    })

  const disabledReason = demo
    ? "Datos de ejemplo: el motor necesita GHL y Neon."
    : dirty
      ? "Guarda los cambios: el motor usa la configuración guardada."
      : null

  return (
    <Instrument
      label="Motor"
      hint="Revisa el pipeline con la configuración guardada y manda los avisos por WhatsApp"
      action={
        <Button size="sm" onClick={run} disabled={running || disabledReason !== null}>
          <PlayIcon aria-hidden /> {running ? "Corriendo…" : "Correr motor ahora"}
        </Button>
      }
    >
      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={repeat}
              onCheckedChange={setRepeat}
              aria-label="Repetir avisos ya enviados"
            />
            Repetir avisos ya enviados
          </label>
          {disabledReason && (
            <p className="text-xs text-muted-foreground">{disabledReason}</p>
          )}
        </div>
        {result && <RunResultView result={result} />}
      </div>
    </Instrument>
  )
}

function RunResultView({ result }: { result: RunSummary }) {
  if (result.inactive) {
    return (
      <p className="text-muted-foreground">
        La IA de {result.location} está pausada o sin configurar: el motor no revisó nada.
        Actívala y guarda para que corra.
      </p>
    )
  }

  const skipped = Object.entries(result.skipped)
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={result.mode === "prueba" ? "build" : "idle"}>
          {result.mode === "prueba" ? "Modo prueba" : "Simulado"}
        </StatusChip>
        <span className="num text-xs text-muted-foreground">
          {result.opportunities} oportunidades abiertas
          {result.truncated && " (se leyeron las primeras)"} · {result.alerts} avisos
          detectados
        </span>
      </div>

      {result.messages.length > 0 ? (
        <ul className="space-y-1">
          {result.messages.map((m, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={m.status === "sent" ? "live" : m.status === "failed" ? "risk" : "idle"}
              >
                {m.status === "sent" ? "Mandado" : m.status === "failed" ? "Falló" : "Simulado"}
              </StatusChip>
              <span>{m.recipient}</span>
              <span className="num text-xs text-muted-foreground">
                {m.alerts} {m.alerts === 1 ? "aviso" : "avisos"}
              </span>
              {m.error && <span className="text-xs text-destructive">{m.error}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nada que mandar en esta corrida.</p>
      )}

      <ul className="num space-y-0.5 text-xs text-muted-foreground">
        {result.deferred > 0 && (
          <li>{result.deferred} en espera por horario: salen en la siguiente corrida que caiga en horario.</li>
        )}
        {result.alreadySent > 0 && <li>{result.alreadySent} ya se habían mandado antes.</li>}
        {result.postponed > 0 && (
          <li>{result.postponed} destinatarios quedan para la siguiente corrida (tope de mensajes).</li>
        )}
        {skipped.map(([reason, n]) => (
          <li key={reason}>
            {n} descartados: {skipLabel[reason] ?? reason}.
          </li>
        ))}
        {result.mode === "simulado" && (
          <li>Sin LEZGO_IA_TEST_CONTACT_ID: se anotó en la bitácora pero no salió ningún mensaje.</li>
        )}
      </ul>
    </div>
  )
}
