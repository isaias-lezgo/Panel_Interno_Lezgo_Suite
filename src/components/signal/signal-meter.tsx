import { cn } from "@/lib/utils"

type Tone = "live" | "build" | "warn" | "risk" | "idle" | "signal"

const toneClass: Record<Tone, string> = {
  live: "bg-status-live",
  build: "bg-status-build",
  warn: "bg-status-warn",
  risk: "bg-status-risk",
  idle: "bg-status-idle",
  signal: "bg-primary",
}

/**
 * The signal meter — the one recurring instrument in this panel.
 *
 * A value from 0–100 rendered as discrete segments rather than a smooth bar,
 * because these numbers are read comparatively down a column, and segments
 * quantise the comparison for you. Same component on cards, table rows and
 * the client header, so a filled meter always means the same thing.
 */
export function SignalMeter({
  value,
  tone = "signal",
  segments = 10,
  className,
  label,
}: {
  value: number
  tone?: Tone
  segments?: number
  className?: string
  /** Screen-reader description. Colour alone never carries the meaning. */
  label: string
}) {
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * segments)

  return (
    <div
      className={cn("flex items-center gap-[2px]", className)}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-3 w-[3px] rounded-[1px] transition-colors",
            i < filled ? toneClass[tone] : "bg-border",
          )}
        />
      ))}
    </div>
  )
}

export function toneForHealth(health: number): Tone {
  if (health >= 80) return "live"
  if (health >= 60) return "build"
  if (health >= 45) return "warn"
  return "risk"
}
