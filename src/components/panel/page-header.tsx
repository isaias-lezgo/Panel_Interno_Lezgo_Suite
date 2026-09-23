import { cn } from "@/lib/utils"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 px-4 pt-8 pb-6 md:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-2 text-2xl md:text-[28px]">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * An instrument: a labelled panel with a hairline top rule. Cards in this
 * product never nest — one instrument holds one reading or one list.
 */
export function Instrument({
  label,
  hint,
  action,
  children,
  className,
}: {
  label: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="eyebrow">{label}</h2>
          {hint && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        {action}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && (
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      )}
    </div>
  )
}
