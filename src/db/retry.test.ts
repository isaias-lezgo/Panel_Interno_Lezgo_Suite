import { describe, expect, it, vi } from "vitest"

import { withConnectRetry } from "./retry"

const connFail = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("Connect Timeout Error"), {
      code: "UND_ERR_CONNECT_TIMEOUT",
    }),
  })

describe("withConnectRetry", () => {
  it("devuelve la respuesta sin reintentar cuando el primer intento funciona", async () => {
    const inner = vi.fn().mockResolvedValue(new Response("ok"))
    const fetchImpl = withConnectRetry(inner, { attempts: 3, waitMs: 0 })
    await expect(fetchImpl("http://x", {})).resolves.toBeInstanceOf(Response)
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it("reintenta un fallo de conexión y devuelve el segundo intento", async () => {
    const inner = vi
      .fn()
      .mockRejectedValueOnce(connFail())
      .mockResolvedValue(new Response("ok"))
    const fetchImpl = withConnectRetry(inner, { attempts: 3, waitMs: 0 })
    await expect(fetchImpl("http://x", {})).resolves.toBeInstanceOf(Response)
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it("se rinde tras agotar los intentos y propaga el último error", async () => {
    const inner = vi.fn().mockRejectedValue(connFail())
    const fetchImpl = withConnectRetry(inner, { attempts: 3, waitMs: 0 })
    await expect(fetchImpl("http://x", {})).rejects.toThrow("fetch failed")
    expect(inner).toHaveBeenCalledTimes(3)
  })

  it("no reintenta un error que no es de conexión", async () => {
    const inner = vi.fn().mockRejectedValue(new Error("boom"))
    const fetchImpl = withConnectRetry(inner, { attempts: 3, waitMs: 0 })
    await expect(fetchImpl("http://x", {})).rejects.toThrow("boom")
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it("no reintenta una respuesta HTTP de error: la consulta sí llegó", async () => {
    const inner = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }))
    const fetchImpl = withConnectRetry(inner, { attempts: 3, waitMs: 0 })
    const r = await fetchImpl("http://x", {})
    expect(r.status).toBe(500)
    expect(inner).toHaveBeenCalledTimes(1)
  })
})
