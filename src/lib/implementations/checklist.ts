/**
 * Checklist con el que nace toda implementación. Cada implementación recibe
 * su propia copia al crearse: marcar, agregar o borrar puntos en una no toca
 * a las demás ni a esta plantilla.
 */
export type ChecklistTemplateItem = { label: string; children?: string[] }

export const CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  { label: "Información del cliente dentro de la plataforma" },
  { label: "Idioma español predeterminado" },
  { label: "Método de pago conectado" },
  {
    label:
      "Asesores y permisos claros entre administradores, usuarios y gente de marketing",
  },
  { label: "Pipeline(s) configurados" },
  { label: "Campos de contacto" },
  { label: "Campos de oportunidad" },
  { label: "Definir estructura de asignaciones" },
  { label: "Números de teléfono (Documentos de aprobación)" },
  { label: "WhatsApp API" },
  {
    label:
      "Integración WhatsApp Físico, definiendo jerarquía de uso de números y desactivando creación de contactos",
  },
  {
    label:
      "Definir estructura de pautas y conectar lo necesario (Formularios de META, Mensajes de WhatsApp, Google)",
  },
  { label: "Definir Dashboard de Ventas y Dashboard de MKT" },
]

/** Filas listas para insertar, con ids nuevos y padres resueltos. */
export function checklistRows(implementationId: string) {
  const rows: {
    id: string
    implementationId: string
    parentId: string | null
    label: string
    done: boolean
    position: number
  }[] = []
  CHECKLIST_TEMPLATE.forEach((item, i) => {
    const id = `ck_${crypto.randomUUID()}`
    rows.push({ id, implementationId, parentId: null, label: item.label, done: false, position: i })
    item.children?.forEach((label, j) =>
      rows.push({
        id: `ck_${crypto.randomUUID()}`,
        implementationId,
        parentId: id,
        label,
        done: false,
        position: j,
      }),
    )
  })
  return rows
}

/** Avance de 0 a 100: cada punto, sea principal o sub-punto, pesa igual. */
export function checklistProgress(items: { done: boolean }[]) {
  if (items.length === 0) return 0
  return Math.round((items.filter((i) => i.done).length / items.length) * 100)
}
