import { cn } from "@/lib/utils"
import type { ClientStatus, ImplementationStage, InvoiceStatus } from "@/lib/types"

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

export const clientStatusLabel: Record<
  ClientStatus,
  { label: string; tone: "live" | "build" | "warn" | "risk" | "idle" }
> = {
  live: { label: "Activo", tone: "live" },
  onboarding: { label: "Onboarding", tone: "build" },
  at_risk: { label: "En riesgo", tone: "risk" },
  churned: { label: "Baja", tone: "idle" },
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
}
