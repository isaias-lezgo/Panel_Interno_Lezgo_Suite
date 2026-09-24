import { describe, expect, it } from "vitest"

import { createSessionToken, safeNext, verifySessionToken } from "./session"

describe("sesión del panel", () => {
  const now = Date.UTC(2026, 8, 24)

  it("acepta un token recién firmado", () => {
    const { token } = createSessionToken("lezgo", "secreta", now)
    expect(verifySessionToken(token, "lezgo", "secreta", now + 1000)).toBe(true)
  })

  it("rechaza el token si cambió la contraseña o el usuario", () => {
    const { token } = createSessionToken("lezgo", "secreta", now)
    expect(verifySessionToken(token, "lezgo", "otra", now)).toBe(false)
    expect(verifySessionToken(token, "otro", "secreta", now)).toBe(false)
  })

  it("rechaza un token vencido o alterado", () => {
    const { token, expires } = createSessionToken("lezgo", "secreta", now)
    expect(verifySessionToken(token, "lezgo", "secreta", expires.getTime())).toBe(false)
    const [, sig] = token.split(".")
    const later = `${expires.getTime() + 1e9}.${sig}`
    expect(verifySessionToken(later, "lezgo", "secreta", now)).toBe(false)
    expect(verifySessionToken(undefined, "lezgo", "secreta", now)).toBe(false)
    expect(verifySessionToken("basura", "lezgo", "secreta", now)).toBe(false)
  })

  it("solo regresa a rutas internas", () => {
    expect(safeNext("/clientes?x=1")).toBe("/clientes?x=1")
    expect(safeNext("https://evil.com")).toBe("/")
    expect(safeNext("//evil.com")).toBe("/")
    expect(safeNext("/\\evil.com")).toBe("/")
    expect(safeNext("/entrar")).toBe("/")
    expect(safeNext(null)).toBe("/")
  })
})
