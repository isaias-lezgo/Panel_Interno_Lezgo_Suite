import { NextResponse, type NextRequest } from "next/server"

import { panelLock, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session"

/**
 * Candado del panel: pantalla de entrada en `/entrar` y cookie de sesión
 * firmada (`src/lib/auth/session.ts`). Cubre todas las páginas y APIs —el
 * copiloto escribe en GHL y la configuración escribe en Neon—, no solo lo
 * visible.
 *
 * Falla cerrado: en producción, sin `PANEL_PASSWORD`, nadie entra. En local
 * (`next dev`) sin contraseña se deja pasar para no estorbar.
 */
export function proxy(request: NextRequest) {
  const lock = panelLock()
  const { pathname, search } = request.nextUrl
  const isLogin = pathname === "/entrar"

  if (lock.mode === "open") {
    return isLogin ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next()
  }
  if (lock.mode === "closed") {
    return new NextResponse("Falta PANEL_PASSWORD: el panel está cerrado.", { status: 503 })
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const signedIn = verifySessionToken(token, lock.user, lock.password)

  if (isLogin) {
    return signedIn ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next()
  }
  if (signedIn) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Sesión vencida o inexistente. Entra de nuevo al panel." },
      { status: 401 },
    )
  }

  const login = new URL("/entrar", request.url)
  if (pathname !== "/") login.searchParams.set("next", pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  // Todo menos los archivos estáticos que el navegador pide sin sesión.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp|jpg)$).*)"],
}
