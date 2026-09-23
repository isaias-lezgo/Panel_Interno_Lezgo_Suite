/** Pestañas de Lezgo IA. En un módulo sin "use client" para que la página
 * (servidor) pueda validar `?tab=` con el mismo listado. */
export type LezgoIaTab =
  | "resumen"
  | "configuracion"
  | "mensajes"
  | "bitacora"

export const lezgoIaTabs: LezgoIaTab[] = [
  "resumen",
  "configuracion",
  "mensajes",
  "bitacora",
]

export function parseLezgoIaTab(value: string | undefined): LezgoIaTab {
  return lezgoIaTabs.includes(value as LezgoIaTab)
    ? (value as LezgoIaTab)
    : "resumen"
}
