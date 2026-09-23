import { NextResponse, type NextRequest } from "next/server"

import { exchangeCode } from "@/lib/ghl/oauth"

/**
 * Callback de la app OAuth de GHL. GHL redirige aquí al instalarla con
 * `?code=`; se canjea por el token de agencia y se vuelve a Ajustes con el
 * resultado. La ruta no dice "ghl": GHL rechaza redirect URLs con su marca.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const back = new URL("/ajustes", url.origin)
  const code = url.searchParams.get("code")

  if (!code) {
    back.searchParams.set("oauth", "error")
    back.searchParams.set("detalle", url.searchParams.get("error") ?? "GHL no mandó el código")
    return NextResponse.redirect(back)
  }

  try {
    // Debe ser idéntica a la registrada en la app, sin query.
    await exchangeCode(code, `${url.origin}${url.pathname}`)
    back.searchParams.set("oauth", "ok")
  } catch (error) {
    console.error("OAuth de GHL falló", error)
    back.searchParams.set("oauth", "error")
    back.searchParams.set(
      "detalle",
      error instanceof Error ? error.message : "No se pudo canjear el código",
    )
  }
  return NextResponse.redirect(back)
}
