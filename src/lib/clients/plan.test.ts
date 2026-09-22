import { describe, expect, it } from "vitest"

import type { ClientDraft } from "./group"
import { planUpserts } from "./plan"

const draft = (id: string, slug: string): ClientDraft => ({
  id,
  slug,
  name: id,
  contactName: id,
  email: null,
  phone: null,
  ghlContactId: id,
  stage: "Cliente Activo",
  wonAt: "2026-01-01",
  opportunities: [],
})

describe("planUpserts", () => {
  it("marca como huérfanos los que ya no llegan y conserva el slug de los que ya existían", () => {
    const { upserts, orphanIds } = planUpserts(
      [draft("a", "a-nuevo"), draft("c", "c")],
      [
        { id: "a", slug: "a-viejo" },
        { id: "b", slug: "b" },
      ],
    )
    expect(orphanIds).toEqual(["b"])
    expect(upserts.map((u) => [u.id, u.slug])).toEqual([
      ["a", "a-viejo"],
      ["c", "c"],
    ])
  })

  it("si un slug nuevo choca con el de otro cliente existente, le agrega sufijo", () => {
    const { upserts } = planUpserts(
      [draft("nuevo", "sergio-lujano")],
      [{ id: "viejo", slug: "sergio-lujano" }],
    )
    expect(upserts[0].slug).toBe("sergio-lujano-2")
  })
})
