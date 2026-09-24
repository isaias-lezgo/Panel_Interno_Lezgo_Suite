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
 *
 * `order` son los ids de subcuenta en el orden en que la persona los dejó al
 * arrastrarlos. Los que no aparecen ahí van después, por nombre, y "Sin
 * subcuenta" siempre al final.
 */
export function groupPendings(
  rows: Pending[],
  names: ReadonlyMap<string, string>,
  order: readonly string[] = [],
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

  const rank = new Map(order.map((id, i) => [id, i]))
  return [...groups.values()].sort((a, b) => {
    if (!a.locationId) return 1
    if (!b.locationId) return -1
    const ra = rank.get(a.locationId) ?? Infinity
    const rb = rank.get(b.locationId) ?? Infinity
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name, "es")
  })
}

/**
 * El orden nuevo tras soltar `moved` en el lugar de `target`. Se calcula
 * sobre todos los grupos con subcuenta, también los que "Ver hechos" tiene
 * escondidos, y se guarda completo: desde el primer arrastre, cada
 * subcuenta de la pestaña queda con su lugar explícito.
 */
export function moveGroup(
  groups: readonly PendingGroup[],
  moved: string,
  target: string,
): string[] {
  const ids = groups.flatMap((g) => (g.locationId ? [g.locationId] : []))
  const from = ids.indexOf(moved)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
