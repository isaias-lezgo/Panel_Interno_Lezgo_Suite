import { NextResponse, type NextRequest } from "next/server"
import { get } from "@vercel/blob"

import { getNoteImage } from "@/lib/repository"

/**
 * Sirve una imagen de nota desde el Blob privado. Pasa por el candado
 * (`src/proxy.ts`): sin sesión, 401. El archivo no cambia nunca —se sube con
 * sufijo aleatorio y las notas no se editan—, así que el navegador lo guarda.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const image = await getNoteImage(id)
  if (!image) return NextResponse.json({ error: "Esa imagen no existe." }, { status: 404 })

  const file = await get(image.pathname, { access: "private" })
  if (!file || file.statusCode !== 200) {
    return NextResponse.json({ error: "Esa imagen ya no está en Blob." }, { status: 404 })
  }

  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(file.blob.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
