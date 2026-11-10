import { timingSafeEqual } from "node:crypto"

import { after, NextResponse, type NextRequest } from "next/server"

import { LEZGO_SUITE_LOCATION_ID } from "@/lib/ghl/lezgo-suite"
import { verifyGhlSignature } from "@/lib/ghl/webhook-signature"
import { answerInbound } from "@/lib/lezgo-ia/reply"

/**
 * Webhook de la app OAuth "Lezgo AI": GHL avisa aquí de cada mensaje
 * entrante y, si es un asesor contestando un aviso, el asistente de Lezgo IA
 * responde.
 *
 * Es la única ruta del panel fuera del candado (`src/proxy.ts`): GHL no
 * tiene sesión. Entra quien traiga una de dos cosas:
 * - la firma de GHL (`X-GHL-Signature`, Ed25519 sobre el cuerpo), o
 * - `LEZGO_IA_WEBHOOK_SECRET` en el header `x-lezgo-ia-secret` o en
 *   `?secreto=` de la URL.
 *
 * **La app está instalada en toda la agencia**, así que aquí cae el mensaje
 * entrante de cada subcuenta de cada cliente. Casi todo se descarta en las
 * primeras líneas, sin leer GHL ni Neon: solo pasa un `InboundMessage` de la
 * subcuenta Lezgo Suite que venga del contacto de pruebas. Lo descartado
 * responde 200 —un no-2xx haría que GHL lo reintente hasta 12 veces— y no
 * se guarda ni se imprime.
 *
 * Del cuerpo solo se usan `type`, `locationId` y `contactId`. El texto se
 * lee de la conversación en GHL dentro de `answerInbound`.
 *
 * Responde de inmediato y contesta después (`after`): el modelo tarda más
 * de lo que GHL espera. Con `?simular=1` y el secreto, espera y devuelve la
 * respuesta sin mandarla ni anotarla.
 */
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const url = request.nextUrl

  const secret = process.env.LEZGO_IA_WEBHOOK_SECRET
  const given = request.headers.get("x-lezgo-ia-secret") ?? url.searchParams.get("secreto") ?? ""
  const bySecret = Boolean(secret) && sameSecret(given, secret!)
  const bySignature = verifyGhlSignature(raw, request.headers.get("x-ghl-signature"))
  if (!bySecret && !bySignature) {
    return NextResponse.json({ error: "Sin firma de GHL ni secreto válido." }, { status: 401 })
  }

  const body = parse(raw)
  const contactId = body?.contactId ?? body?.contact_id
  if (typeof contactId !== "string" || !/^[\w-]{1,64}$/.test(contactId)) {
    return NextResponse.json({ ok: true, ignored: "Sin contacto." })
  }

  // Probar sin WhatsApp: solo con el secreto, nunca con un aviso de GHL.
  if (bySecret && url.searchParams.get("simular") === "1") {
    return NextResponse.json(await answerInbound(contactId, { simulate: true }))
  }

  // Lo que no es para el asistente se va aquí. `type` y `locationId` solo los
  // manda la app; un aviso con secreto y sin ellos pasa al filtro de contacto.
  const type = body?.type
  const locationId = body?.locationId
  if (
    (type !== undefined && type !== "InboundMessage") ||
    (locationId !== undefined && locationId !== LEZGO_SUITE_LOCATION_ID) ||
    contactId !== process.env.LEZGO_IA_TEST_CONTACT_ID
  ) {
    return NextResponse.json({ ok: true, ignored: "No es para el asistente." })
  }

  after(async () => {
    try {
      const result = await answerInbound(contactId)
      if (!result.ok) console.info(`Lezgo IA no contestó: ${result.ignored}`)
    } catch (error) {
      console.error("El asistente de Lezgo IA falló", error)
    }
  })
  return NextResponse.json({ ok: true })
}

function parse(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
