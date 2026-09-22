import type { ClientDraft } from "./group"
import type { Client } from "@/lib/types"

/**
 * Decide qué se escribe sin tocar la base: los que llegan se upsertean
 * conservando el slug que ya tenían (las URLs no cambian); los que no llegan
 * se marcan huérfanos. Puro para poder probarlo.
 */
export function planUpserts(
  drafts: ClientDraft[],
  existing: Pick<Client, "id" | "slug">[],
) {
  const slugById = new Map(existing.map((c) => [c.id, c.slug]))
  const taken = new Set(existing.map((c) => c.slug))
  const incoming = new Set(drafts.map((d) => d.id))

  const upserts = drafts.map((d) => {
    const kept = slugById.get(d.id)
    if (kept) return { ...d, slug: kept }
    let slug = d.slug
    for (let n = 2; taken.has(slug); n++) slug = `${d.slug}-${n}`
    taken.add(slug)
    return { ...d, slug }
  })
  const orphanIds = existing
    .filter((c) => !incoming.has(c.id))
    .map((c) => c.id)
  return { upserts, orphanIds }
}
