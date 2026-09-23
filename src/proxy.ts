import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Candado del panel: HTTP Basic con `PANEL_USER` y `PANEL_PASSWORD`. Cubre
 * todas las páginas y APIs —el copiloto escribe en GHL y la configuración
 * escribe en Neon—, no solo lo visible.
 *
 * Falla cerrado: en producción, sin `PANEL_PASSWORD`, nadie entra. En local
 * (`next dev`) sin contraseña se deja pasar para no estorbar.
 *
 * Es un candado de equipo, no un sistema de usuarios: todos comparten la
 * misma contraseña y no hay registro de quién hizo qué.
 */
export function proxy(request: NextRequest) {
  const user = process.env.PANEL_USER ?? "lezgo"
  const password = process.env.PANEL_PASSWORD

  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next()
    return new NextResponse("Falta PANEL_PASSWORD: el panel está cerrado.", {
      status: 503,
    })
  }

  const header = request.headers.get("authorization") ?? ""
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8")
    const colon = decoded.indexOf(":")
    if (
      colon > 0 &&
      same(decoded.slice(0, colon), user) &&
      same(decoded.slice(colon + 1), password)
    ) {
      return NextResponse.next()
    }
  }

  return new NextResponse("Acceso restringido al equipo de Lezgo Suite.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Panel Lezgo Suite", charset="UTF-8"' },
  })
}

/** Compara en tiempo constante; hashear primero iguala las longitudes. */
function same(a: string, b: string) {
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(a), digest(b))
}

export const config = {
  // Todo menos los archivos estáticos que el navegador pide sin credenciales.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp|jpg)$).*)"],
}
