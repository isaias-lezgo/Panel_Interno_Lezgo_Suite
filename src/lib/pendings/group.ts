import type { Pending, PendingGroup } from "@/lib/types"

/** El grupo de lo que no es de nadie. Siempre se dibuja al final. */
export const SIN_SUBCUENTA = "Sin subcuenta"

/** Cuándo se cerró; un hecho viejo sin `doneAt` se ordena por cuándo nació. */
const closedAt = (p: Pending) => p.doneAt ?? p.createdAt

/**
 * Agrupa los pendientes por subcuenta y los deja listos para pintarse. El
 * nombre sale de `names` —lo que GHL dice hoy— y cae al guardado cuando GHL
 * no contesta o la subcuenta ya no está; si tampoco hay, queda el id, que al
 * menos se puede buscar.
 */
export function groupPendings(
  rows: Pending[],
  names: ReadonlyMap<string, string>,
): PendingGroup[] {
  const groups = new Map<string, PendingGroup>()

  for (const row of rows) {
    const id = row.ghlLocationId
    const key = id ?? ""
    let group = groups.get(key)
    if (!group) {
      group = {
        locationId: id,
        name: id
          ? (names.get(id) ?? row.ghlLocationName ?? id)
          : SIN_SUBCUENTA,
        open: [],
        done: [],
      }
      groups.set(key, group)
    }
    if (row.done) group.done.push(row)
    else group.open.push(row)
  }

  for (const group of groups.values()) {
    group.open.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    group.done.sort((a, b) => closedAt(b).localeCompare(closedAt(a)))
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.locationId) return 1
    if (!b.locationId) return -1
    return a.name.localeCompare(b.name, "es")
  })
}
