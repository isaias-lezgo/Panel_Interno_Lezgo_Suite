import { expect, test } from "vitest"

test("el runner corre y los alias de ruta resuelven", async () => {
  const { money } = await import("@/lib/format")
  expect(typeof money).toBe("function")
})
