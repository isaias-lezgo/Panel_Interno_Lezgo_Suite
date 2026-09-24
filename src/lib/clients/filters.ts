import type { ClientRow } from "@/lib/types"
import { daysUntil } from "@/lib/implementations/due"

import { membershipLabel, periodLabel } from "./account"

/**
 * Filtros por columna de la tabla de clientes. Cada columna reparte las filas
 * en valores con nombre —una membresía, un tramo de vencimiento, una
 * subcuenta— y el filtro deja pasar las que caen en alguno de los elegidos.
 * El MRR es la excepción: se filtra por rango. Puro para poder probarlo sin
 * navegador.
 */

export type ClientColumn =
  | "etapa"
  | "membresia"
  | "soporte"
  | "periodicidad"
  | "vencimiento"
  | "subcuenta"
  | "stripe"
  | "mrr"
  | "cerrado"

export type SetColumn = Exclude<ClientColumn, "mrr">

/** Unidades enteras de la moneda base, no centavos: es lo que se teclea. */
export type Range = { min: number | null; max: number | null }

export type ColumnFilters = {
  sets: Partial<Record<SetColumn, string[]>>
  mrr: Range
}

export const noFilters: ColumnFilters = {
  sets: {},
  mrr: { min: null, max: null },
}

/** El valor de lo que no está: sin membresía, sin subcuenta, sin fecha. */
export const NONE = "__none"

export type FilterOption = { value: string; label: string; count: number }

const vencimientoLabel: Record<string, string> = {
  vencida: "Vencida",
  "7": "En 7 días o menos",
  "30": "De 8 a 30 días",
  mas: "En más de 30 días",
  [NONE]: "Sin fecha",
}

const cerradoLabel: Record<string, string> = {
  "30": "Últimos 30 días",
  "90": "De 1 a 3 meses",
  "365": "De 3 meses a un año",
  mas: "Hace más de un año",
}

/**
 * Los valores con orden fijo. Etapa y subcuenta no están: sus valores salen
 * de la cartera, no de una lista que conozcamos.
 */
const fixed: Partial<Record<SetColumn, Record<string, string>>> = {
  membresia: { ...membershipLabel, [NONE]: "Sin definir" },
  soporte: { si: "Activo", no: "Sin servicio", [NONE]: "Sin definir" },
  periodicidad: { ...periodLabel, [NONE]: "Sin definir" },
  vencimiento: vencimientoLabel,
  stripe: { si: "Enlazado", [NONE]: "Sin enlazar" },
  cerrado: cerradoLabel,
}

function dueBucket(iso: string | null, now: Date) {
  if (!iso) return NONE
  const days = daysUntil(iso, now)
  if (days < 0) return "vencida"
  if (days <= 7) return "7"
  if (days <= 30) return "30"
  return "mas"
}

function wonBucket(iso: string, now: Date) {
  const ago = -daysUntil(iso, now)
  if (ago <= 30) return "30"
  if (ago <= 90) return "90"
  if (ago <= 365) return "365"
  return "mas"
}

/** En qué valores cae una fila para una columna. Una subcuenta por enlace. */
export function valuesOf(
  column: SetColumn,
  c: ClientRow,
  now = new Date(),
): string[] {
  switch (column) {
    case "etapa":
      return [c.stage]
    case "membresia":
      return [c.account.membership.value ?? NONE]
    case "soporte": {
      const v = c.account.support.value
      return [v === null ? NONE : v ? "si" : "no"]
    }
    case "periodicidad":
      return [c.account.period.value ?? NONE]
    case "vencimiento":
      return [dueBucket(c.account.licenseDueAt.value, now)]
    case "subcuenta":
      return c.locationNames.length ? c.locationNames : [NONE]
    case "stripe":
      return [c.stripeCount > 0 ? "si" : NONE]
    case "cerrado":
      return [wonBucket(c.wonAt, now)]
  }
}

function inRange(cents: number | null, { min, max }: Range) {
  if (min === null && max === null) return true
  // Sin MRR no hay con qué comparar: un rango lo deja fuera.
  if (cents === null) return false
  const units = cents / 100
  return (min === null || units >= min) && (max === null || units <= max)
}

/**
 * Las filas que pasan todos los filtros de las columnas en `visible`. Una
 * columna escondida no filtra: nadie adivina por qué faltan filas si el
 * filtro que las quitó no está a la vista.
 */
export function applyFilters(
  rows: ClientRow[],
  filters: ColumnFilters,
  visible: ReadonlySet<ClientColumn>,
  now = new Date(),
) {
  const sets = (Object.entries(filters.sets) as [SetColumn, string[]][]).filter(
    ([k, v]) => visible.has(k) && v.length > 0,
  )
  const mrr = visible.has("mrr") ? filters.mrr : noFilters.mrr

  return rows.filter(
    (c) =>
      inRange(c.mrr, mrr) &&
      sets.every(([k, chosen]) =>
        valuesOf(k, c, now).some((v) => chosen.includes(v)),
      ),
  )
}

/**
 * Los valores que ofrece el filtro de una columna, con cuántas filas caen en
 * cada uno. `rows` ya debe venir filtrada por las demás columnas, para que el
 * conteo diga cuántas quedarían al marcarlo.
 */
export function optionsFor(
  column: SetColumn,
  rows: ClientRow[],
  now = new Date(),
): FilterOption[] {
  const counts = new Map<string, number>()
  for (const c of rows) {
    for (const v of new Set(valuesOf(column, c, now))) {
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }

  const labels = fixed[column]
  if (labels) {
    return Object.entries(labels).map(([value, label]) => ({
      value,
      label,
      count: counts.get(value) ?? 0,
    }))
  }

  // Etapas y subcuentas: las más pobladas arriba, "Sin enlazar" al final.
  return [...counts]
    .filter(([v]) => v !== NONE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([value, count]) => ({ value, label: value, count }))
    .concat(
      counts.has(NONE)
        ? [{ value: NONE, label: "Sin enlazar", count: counts.get(NONE)! }]
        : [],
    )
}

export function isActive(
  column: ClientColumn,
  filters: ColumnFilters,
): boolean {
  if (column === "mrr") {
    return filters.mrr.min !== null || filters.mrr.max !== null
  }
  return (filters.sets[column]?.length ?? 0) > 0
}

/** Quita el filtro de una columna; sirve para contar las opciones de esa. */
export function without(
  filters: ColumnFilters,
  column: ClientColumn,
): ColumnFilters {
  if (column === "mrr") return { ...filters, mrr: noFilters.mrr }
  const sets = { ...filters.sets }
  delete sets[column]
  return { ...filters, sets }
}
