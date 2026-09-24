"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { fullDate } from "@/lib/format"
import { mexicoDay } from "@/lib/time"
import { cn } from "@/lib/utils"

/*
 * Las fechas viajan como `YYYY-MM-DD` y se calculan en UTC: así sumar días o
 * cambiar de mes nunca se corre por la zona del navegador.
 */
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`)
const format = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return format(d)
}
const addMonths = (iso: string, n: number) => {
  const d = parse(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  // Del 31 de enero a febrero se queda en el último día, no salta a marzo.
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return format(d)
}
const monthOf = (iso: string) => iso.slice(0, 7)

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"]
const WEEKDAY_NAMES = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
]

/** Seis semanas que empiezan en lunes y cubren el mes de `iso`. */
function monthGrid(iso: string) {
  const first = parse(`${monthOf(iso)}-01`)
  const offset = (first.getUTCDay() + 6) % 7
  const start = addDays(format(first), -offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function monthTitle(iso: string) {
  return parse(iso).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function dayName(iso: string) {
  return parse(iso).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

const PRESETS = [
  { label: "En 1 semana", days: 7 },
  { label: "En 2 semanas", days: 14 },
  { label: "En 1 mes", months: 1 },
] as const

/**
 * Selector de fecha del panel. Flechas mueven el día, Re Pág / Av Pág el mes,
 * Inicio / Fin la semana; Enter elige.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Elegir fecha",
  label,
}: {
  id?: string
  value: string | null
  onChange: (next: string | null) => void
  placeholder?: string
  /** Nombre accesible del botón cuando no hay `<label>` que lo nombre. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [today, setToday] = useState(() => mexicoDay())
  const [cursor, setCursor] = useState(value ?? today)
  const grid = useRef<HTMLDivElement>(null)
  // Solo se enfoca el día tras moverse con el teclado, no al pasar de mes
  // con los botones: si no, el foco saltaría del botón a la cuadrícula.
  const focusDay = useRef(false)

  useEffect(() => {
    if (!open || !focusDay.current) return
    focusDay.current = false
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)
      ?.focus()
  }, [cursor, open])

  const pick = (iso: string | null) => {
    onChange(iso)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const weekday = (parse(cursor).getUTCDay() + 6) % 7
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1),
      PageDown: () => addMonths(cursor, 1),
      Home: () => addDays(cursor, -weekday),
      End: () => addDays(cursor, 6 - weekday),
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    focusDay.current = true
    setCursor(move())
  }

  const month = monthOf(cursor)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const now = mexicoDay()
          setToday(now)
          setCursor(value ?? now)
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            aria-label={label}
            className={cn(
              "h-8 flex-1 justify-start gap-2 px-2.5 font-normal",
              !value && "text-muted-foreground",
            )}
          />
        }
      >
        <CalendarIcon aria-hidden className="text-muted-foreground" />
        <span className="num truncate">
          {value ? fullDate(value) : placeholder}
        </span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto gap-3 p-3"
        // Al abrir, el foco va al día elegido (o a hoy), no al botón de mes.
        initialFocus={() =>
          grid.current?.querySelector<HTMLElement>('[tabindex="0"]') ?? true
        }
      >
        <div className="flex items-center gap-1">
          <p
            aria-live="polite"
            className="flex-1 pl-1 text-sm font-medium first-letter:uppercase"
          >
            {monthTitle(cursor)}
          </p>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Mes anterior"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Mes siguiente"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>

        <div
          ref={grid}
          role="grid"
          aria-label={monthTitle(cursor)}
          onKeyDown={onKeyDown}
          className="grid grid-cols-7 gap-0.5"
        >
          <div role="row" className="contents">
            {WEEKDAYS.map((d, i) => (
              <abbr
                key={d}
                role="columnheader"
                title={WEEKDAY_NAMES[i]}
                className="flex h-7 items-center justify-center text-xs text-muted-foreground no-underline"
              >
                {d}
              </abbr>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, week) => (
            <div key={week} role="row" className="contents">
              {monthGrid(cursor)
                .slice(week * 7, week * 7 + 7)
                .map((day) => {
                  const selected = day === value
                  const isToday = day === today
                  const outside = monthOf(day) !== month
                  return (
                    <div key={day} role="gridcell" aria-selected={selected}>
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={day === cursor ? 0 : -1}
                        aria-label={dayName(day)}
                        aria-current={isToday ? "date" : undefined}
                        onClick={() => pick(day)}
                        className={cn(
                          "num relative flex size-8 items-center justify-center rounded-md text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          outside && "text-muted-foreground/60",
                          isToday && !selected && "font-semibold text-primary",
                          selected &&
                            "bg-primary font-medium text-primary-foreground hover:bg-primary/90",
                        )}
                      >
                        {Number(day.slice(8))}
                        {isToday && (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute bottom-1 size-1 rounded-full",
                              selected ? "bg-primary-foreground" : "bg-primary",
                            )}
                          />
                        )}
                      </button>
                    </div>
                  )
                })}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <Button size="xs" variant="outline" onClick={() => pick(today)}>
            Hoy
          </Button>
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="xs"
              variant="outline"
              onClick={() =>
                pick(
                  "days" in p ? addDays(today, p.days) : addMonths(today, p.months),
                )
              }
            >
              {p.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
