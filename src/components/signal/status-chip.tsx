import { cn } from "@/lib/utils"
import type { ImplementationStage, InvoiceStatus } from "@/lib/types"

/**
 * Status always ships as a dot plus a word. A colour on its own would fail
 * anyone reading this in greyscale or with a colour vision deficiency.
 */
export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: "live" | "build" | "warn" | "risk" | "idle"
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", {
          "bg-status-live": tone === "live",
          "bg-status-build": tone === "build",
          "bg-status-warn": tone === "warn",
          "bg-status-risk": tone === "risk",
          "bg-status-idle": tone === "idle",
        })}
      />
      {children}
    </span>
  )
}

/** Las etapas del pipeline "Ventas" de Lezgo Suite, por nombre. Lo que no se reconoce va en gris. */
export function stageTone(
  stage: string,
): "live" | "build" | "warn" | "risk" | "idle" {
  const s = stage.toLowerCase()
  if (s.includes("activo")) return "live"
  if (s.includes("implementaci")) return "build"
  return "idle"
}

export const stageLabel: Record<
  ImplementationStage,
  { label: string; tone: "live" | "build" | "warn" | "risk" | "idle" }
> = {
  scoping: { label: "Alcance", tone: "idle" },
  building: { label: "Construcción", tone: "build" },
  review: { label: "Revisión", tone: "warn" },
  launch: { label: "Lanzamiento", tone: "build" },
  live: { label: "En producción", tone: "live" },
}

export const invoiceStatusLabel: Record<
  InvoiceStatus,
  { label: string; tone: "live" | "build" | "warn" | "risk" | "idle" }
> = {
  paid: { label: "Pagada", tone: "live" },
  due: { label: "Por vencer", tone: "build" },
  overdue: { label: "Vencida", tone: "risk" },
  draft: { label: "Borrador", tone: "idle" },
  void: { label: "Anulada", tone: "idle" },
  uncollectible: { label: "Incobrable", tone: "risk" },
}
