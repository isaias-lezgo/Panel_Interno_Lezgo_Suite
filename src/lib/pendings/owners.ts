/**
 * De quién es cada pendiente. La lista está fija en el código: son las tres
 * personas del equipo y cambiarla es cosa de un deploy, no de la interfaz.
 * El orden es el de las pestañas.
 */
export const PENDING_OWNERS = [
  { id: "juan-carlos", name: "Juan Carlos" },
  { id: "isaias", name: "Isaías Rios" },
  { id: "ivan", name: "Ivan Salazar" },
] as const

export type PendingOwner = (typeof PENDING_OWNERS)[number]["id"]

/** A quien le tocan los pendientes que ya existían antes de las pestañas. */
export const DEFAULT_OWNER: PendingOwner = "isaias"

/** Recuerda la última pestaña abierta; la lee el servidor para no parpadear. */
export const OWNER_COOKIE = "pendientes_tab"

export function isPendingOwner(value: unknown): value is PendingOwner {
  return PENDING_OWNERS.some((o) => o.id === value)
}

export const ownerName = (id: PendingOwner) =>
  PENDING_OWNERS.find((o) => o.id === id)!.name
