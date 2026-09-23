/**
 * Bitácora de acciones en GoHighLevel. Datos de ejemplo, igual que
 * `lezgo-ia.ts`.
 */

export type ActionKind = "stage" | "appointment" | "task" | "note" | "tag"

export type GhlAction = {
  id: string
  subaccountId: string
  advisorId: string
  at: string
  kind: ActionKind
  contact: string
  text: string
  /** Enlace al contacto en GoHighLevel. */
  ghlUrl: string
  /** Si el asesor o el gerente la deshicieron desde el panel. */
  undone?: boolean
  /** Las acciones que el asesor pidió no se deshacen desde aquí. */
  reversible: boolean
}

export const actionKindLabel: Record<
  ActionKind,
  { label: string; tone: "live" | "build" | "warn" | "risk" | "idle" }
> = {
  stage: { label: "Movió etapa", tone: "build" },
  appointment: { label: "Agendó visita", tone: "live" },
  task: { label: "Creó tarea", tone: "live" },
  note: { label: "Agregó nota", tone: "idle" },
  tag: { label: "Etiquetó", tone: "idle" },
}

const ghl = (locationId: string, contactId: string) =>
  `https://login.lezgosuite.com/v2/location/${locationId}/contacts/detail/${contactId}`

export const actions: GhlAction[] = [
  {
    id: "a-01",
    subaccountId: "altavista",
    advisorId: "alt-3",
    at: "2026-09-17T10:58",
    kind: "appointment",
    contact: "Lucía Medina",
    text: "Visita a Casa Cumbres Elite el sábado 19 a las 11:00, a petición de Mariana.",
    ghlUrl: ghl("loc_Ht4Rm9Qa2", "c_8Fk2Lm"),
    reversible: true,
  },
  {
    id: "a-03",
    subaccountId: "altavista",
    advisorId: "alt-5",
    at: "2026-09-17T09:46",
    kind: "task",
    contact: "Patricia Solís",
    text: "Tarea para hoy: «Llamar a Patricia Solís», con la ficha de Cumbres. A petición de Sofía.",
    ghlUrl: ghl("loc_Ht4Rm9Qa2", "c_2Qw9Xa"),
    reversible: false,
  },
  {
    id: "a-04",
    subaccountId: "altavista",
    advisorId: "alt-5",
    at: "2026-09-17T09:46",
    kind: "task",
    contact: "Renata Gil",
    text: "Tarea para hoy: «Llamar a Renata Gil», con la ficha de Cumbres. A petición de Sofía.",
    ghlUrl: ghl("loc_Ht4Rm9Qa2", "c_7Hj1Pd"),
    reversible: false,
  },
  {
    id: "a-05",
    subaccountId: "altavista",
    advisorId: "alt-4",
    at: "2026-09-17T11:04",
    kind: "note",
    contact: "Roberto Salinas",
    text: "«Lead de campaña Cumbres sin primer contacto a los 40 min. Aviso enviado a Andrés.»",
    ghlUrl: ghl("loc_Ht4Rm9Qa2", "c_5Nb3Ke"),
    reversible: true,
  },
  {
    id: "a-07",
    subaccountId: "altavista",
    advisorId: "alt-2",
    at: "2026-09-15T17:30",
    kind: "stage",
    contact: "Marco Ledesma",
    text: "De «Visita realizada» a «Negociación» a petición de Rodrigo.",
    ghlUrl: ghl("loc_Ht4Rm9Qa2", "c_9Lp4Tq"),
    reversible: false,
  },
  {
    id: "a-09",
    subaccountId: "casas-del-valle",
    advisorId: "cdv-3",
    at: "2026-09-17T08:52",
    kind: "note",
    contact: "Martín Aceves",
    text: "«Regresa de viaje el 20 de septiembre; volver a proponer perdido el 22.»",
    ghlUrl: ghl("loc_Qr8Nv2Ls5", "c_4Mn7Yt"),
    reversible: true,
  },
  {
    id: "a-11",
    subaccountId: "casas-del-valle",
    advisorId: "cdv-3",
    at: "2026-09-12T09:00",
    kind: "stage",
    contact: "Sandra Ochoa",
    text: "De «Contactado» a «Perdido» con motivo «Sin respuesta», aprobado por Jorge.",
    ghlUrl: ghl("loc_Qr8Nv2Ls5", "c_8Kj5Wa"),
    reversible: true,
    undone: true,
  },
  {
    id: "a-13",
    subaccountId: "vive-riviera",
    advisorId: "riv-2",
    at: "2026-09-17T11:27",
    kind: "tag",
    contact: "Thomas Reed",
    text: "Etiqueta «Lead caliente»: tres respuestas en menos de 2 min y preguntó por plan de pagos.",
    ghlUrl: ghl("loc_Mc6Yb1Tg8", "c_7Qs3Dn"),
    reversible: true,
  },
  {
    id: "a-14",
    subaccountId: "vive-riviera",
    advisorId: "riv-3",
    at: "2026-09-17T09:15",
    kind: "stage",
    contact: "Andrea Lozano",
    text: "De «Negociación» a «Apartado», a petición de Valeria.",
    ghlUrl: ghl("loc_Mc6Yb1Tg8", "c_5Rt8Bv"),
    reversible: false,
  },
]
