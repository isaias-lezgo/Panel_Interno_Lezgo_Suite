import type { PendingOwner } from "@/lib/pendings/owners"

/**
 * Qué grupos tiene cerrados este navegador. Es cosa de la vista, no del
 * dato: vive en una cookie, que el servidor lee para pintar la lista ya
 * colapsada en vez de cerrarla después de cargar.
 */
export const COLLAPSED_COOKIE = "pendientes_colapsados"

/** Tope para no pasar de los 4 KB de una cookie. */
const MAX_KEYS = 100

/** La llave de un grupo: cada persona colapsa su pestaña por separado. */
export const collapseKey = (owner: PendingOwner, locationId: string | null) =>
  `${owner}:${locationId ?? "-"}`

export const parseCollapsed = (value: string | undefined): string[] =>
  value ? value.split("|").filter(Boolean).slice(0, MAX_KEYS) : []

export const serializeCollapsed = (keys: Iterable<string>): string =>
  [...keys].slice(0, MAX_KEYS).join("|")
