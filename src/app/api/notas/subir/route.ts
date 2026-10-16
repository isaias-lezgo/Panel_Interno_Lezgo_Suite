import { NextResponse, type NextRequest } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"

import {
  NOTE_IMAGE_MAX_BYTES,
  NOTE_IMAGE_TYPES,
  noteImageFolder,
} from "@/lib/implementations/note-images"

/**
 * Firma el token con el que el navegador sube una imagen de nota directo a
 * Blob (Vercel no deja pasar más de 4.5 MB por una función). El candado
 * (`src/proxy.ts`) ya exigió sesión para llegar aquí.
 *
 * Sin `onUploadCompleted`: Blob llamaría de vuelta sin la cookie y el
 * candado la rechazaría. La nota se enlaza en `addNote`, que confirma con
 * `head()` que el archivo existe y lee de ahí su tipo y su tamaño.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const implementationId = clientPayload ?? ""
        if (!/^im_[\w-]+$/.test(implementationId)) {
          throw new Error("Falta la implementación de la nota.")
        }
        if (!pathname.startsWith(noteImageFolder(implementationId))) {
          throw new Error("Ruta de imagen inválida.")
        }
        return {
          allowedContentTypes: [...NOTE_IMAGE_TYPES],
          maximumSizeInBytes: NOTE_IMAGE_MAX_BYTES,
          addRandomSuffix: true,
        }
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir la imagen." },
      { status: 400 },
    )
  }
}
