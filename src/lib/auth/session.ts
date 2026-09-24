import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * Sesión del candado del panel: una cookie firmada, sin tabla en Neon.
 *
 * El valor es `<vence>.<firma>`, con la firma HMAC-SHA256 de usuario y
 * vencimiento. La llave se deriva de `PANEL_PASSWORD`, así que cambiar la
 * contraseña cierra todas las sesiones abiertas de golpe.
 *
 * Sigue siendo un candado de equipo: una sola contraseña compartida, sin
 * registro de quién hizo qué.
 */

export const SESSION_COOKIE = "lezgo_session"
export const SESSION_DAYS = 30

export type PanelLock =
  | { mode: "open" } // local sin contraseña: no pide login
  | { mode: "closed" } // producción sin contraseña: nadie entra
  | { mode: "locked"; user: string; password: string }

export function panelLock(): PanelLock {
  const password = process.env.PANEL_PASSWORD
  if (!password) {
    return process.env.NODE_ENV === "production" ? { mode: "closed" } : { mode: "open" }
  }
  return { mode: "locked", user: process.env.PANEL_USER ?? "lezgo", password }
}

function key(password: string) {
  return createHash("sha256").update(`lezgo-panel-session:${password}`).digest()
}

function sign(user: string, expires: number, password: string) {
  return createHmac("sha256", key(password)).update(`${user}.${expires}`).digest("base64url")
}

export function createSessionToken(
  user: string,
  password: string,
  now = Date.now(),
): { token: string; expires: Date } {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000
  return { token: `${expires}.${sign(user, expires, password)}`, expires: new Date(expires) }
}

export function verifySessionToken(
  token: string | undefined,
  user: string,
  password: string,
  now = Date.now(),
): boolean {
  if (!token) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const expires = Number(token.slice(0, dot))
  if (!Number.isFinite(expires) || expires <= now) return false
  return same(token.slice(dot + 1), sign(user, expires, password))
}

/** Compara en tiempo constante; hashear primero iguala las longitudes. */
export function same(a: string, b: string) {
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(a), digest(b))
}

/** Solo rutas internas: evita que `?next=` mande a otro dominio. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/"
  }
  if (next.startsWith("/entrar")) return "/"
  return next
}
