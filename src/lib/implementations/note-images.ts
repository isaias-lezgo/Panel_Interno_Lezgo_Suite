/**
 * Límites de las imágenes de las notas rápidas. Los lee el navegador para
 * avisar antes de subir y el servidor para no confiar en el navegador.
 */

export const NOTE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const

export const NOTE_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export const NOTE_IMAGE_MAX_COUNT = 6

/** Carpeta en Blob de las imágenes de una implementación. */
export function noteImageFolder(implementationId: string) {
  return `notas/${implementationId}/`
}

/** Sin extensión: el candado (`src/proxy.ts`) deja pasar las rutas `.png`/`.jpg`. */
export function noteImageSrc(id: string) {
  return `/api/notas/imagen/${id}`
}

/** Por qué no se puede adjuntar este archivo, o `null` si se puede. */
export function noteImageProblem(file: { type: string; size: number }) {
  if (!(NOTE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Solo imágenes PNG, JPG, WebP o GIF."
  }
  if (file.size > NOTE_IMAGE_MAX_BYTES) {
    return "Cada imagen puede pesar hasta 10 MB."
  }
  return null
}
