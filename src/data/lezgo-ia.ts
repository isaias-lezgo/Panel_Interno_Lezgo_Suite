/**
 * Tipos y datos de ejemplo de Lezgo IA. Con GoHighLevel conectado, las
 * subcuentas y sus asesores salen de GHL (`getLezgoIaData` en el
 * repositorio); lo que la IA todavía no produce —métricas, hilos, bitácora—
 * llega vacío. Sin GHL, la vista cae a este demo.
 */

import type { GhlAction } from "./lezgo-ia-ops"

/** Instante fijo para que "hace 2 h" se vea igual en servidor y cliente. */
export const DEMO_NOW = "2026-09-17T11:40"

export type AdvisorRole = "admin" | "user"

export type Advisor = {
  id: string
  name: string
  role: AdvisorRole
  /** `null` mientras la IA no corra en la subcuenta: no hay de dónde medirlo. */
  activeLeads: number | null
  /** Minutos que tarda en promedio en contestar a un lead. */
  responseMinutes: number | null
  lastActiveAt: string | null
  email?: string | null
  /** Si la IA le manda avisos por el canal configurado. */
  alerts: boolean
  /**
   * Ajustes propios. Solo las claves que difieren del equipo; el resto se
   * hereda de `Subaccount.settings`.
   */
  settings?: SettingValues
  /** Últimos 30 días. `null` = sin datos todavía. */
  metrics: AdvisorMetrics | null
  /** Fuera de oficina programado, si lo hay. `coverage` es el gerente u otro asesor. */
  away?: { from: string; to: string; coverage: "manager" | string }
}

export type AdvisorMetrics = {
  /** Minutos hasta el primer contacto con un lead nuevo, mediana. */
  firstResponseMin: number
  /** Leads asignados que siguen sin primer contacto. */
  noContact: number
  /** Visitas que la IA agendó a su nombre, a petición suya. */
  visitsByIa: number
  /** Propuestas de la IA que aceptó / que dejó sin responder. */
  accepted: number
  ignored: number
}

export type IaStatus = "active" | "paused" | "unset"

export type SettingValue = { enabled: boolean; option?: string }
export type SettingValues = Record<string, SettingValue>

export type Subaccount = {
  id: string
  name: string
  ghlLocationId: string
  city: string
  /** Cliente del panel dueño de la subcuenta, si viene de GHL. */
  clientName?: string
  /** Zona horaria de la subcuenta en GHL. */
  timezone?: string
  status: IaStatus
  /** Actividad de la IA en los últimos 7 días, 0–100. */
  activity: number
  /** Mensajes que la IA cruzó con asesores en los últimos 7 días. */
  weeklyMessages: number
  advisors: Advisor[]
  settings: SettingValues
  voice: Voice
  /** Pipelines de la subcuenta en GHL, cada uno con sus reglas por etapa. */
  pipelines: Pipeline[]
}

export type Voice = {
  /** Cómo se presenta la IA ante el equipo. */
  agentName: string
  /** Cómo le habla al asesor. */
  formality: "tu" | "usted"
}

export type Pipeline = {
  /** ID del pipeline en GoHighLevel. */
  id: string
  name: string
  /** Etapas en el orden del pipeline, cada una con su regla. */
  stages: StageRule[]
}

export type StageRule = {
  /** Id de la etapa en GHL. Las reglas se guardan por id, no por nombre. */
  id?: string
  stage: string
  /** Tiempo sin movimiento antes de actuar. `off` = no vigilar. */
  idle: string
  action: string
}

export const stageIdleOptions: SettingOption[] = [
  { value: "30m", label: "30 min" },
  { value: "2h", label: "2 h" },
  { value: "24h", label: "24 h" },
  { value: "48h", label: "48 h" },
  { value: "3d", label: "3 días" },
  { value: "5d", label: "5 días" },
  { value: "7d", label: "7 días" },
  { value: "14d", label: "14 días" },
  { value: "off", label: "No vigilar" },
]

export const stageActionOptions: SettingOption[] = [
  { value: "notify", label: "Avisar al asesor" },
  { value: "task", label: "Crear tarea al asesor" },
  { value: "manager", label: "Avisar al gerente" },
  { value: "lost", label: "Proponer perdido" },
]

export type SettingOption = { value: string; label: string }

export type SettingDef = {
  id: string
  label: string
  description: string
  /** `fixed` no lleva interruptor: siempre aplica, solo cambia la opción. */
  control: "switch" | "switch+select" | "fixed"
  options?: SettingOption[]
}

export type SettingGroup = {
  id: string
  label: string
  hint: string
  settings: SettingDef[]
}

export const settingGroups: SettingGroup[] = [
  {
    id: "followup",
    label: "Seguimiento de leads",
    hint: "La IA vigila el pipeline y avisa al asesor cuando algo se enfría",
    settings: [
      {
        id: "abandonedLead",
        label: "Lead abandonado",
        description:
          "Avisa al asesor cuando un lead deja de contestar y propone el siguiente paso.",
        control: "switch+select",
        options: [
          { value: "24", label: "Sin respuesta 24 h" },
          { value: "48", label: "Sin respuesta 48 h" },
          { value: "72", label: "Sin respuesta 72 h" },
        ],
      },
      {
        id: "suggestLost",
        label: "Sugerir mover a perdido",
        description:
          "Después de varios días sin respuesta la IA propone cerrar la oportunidad. El asesor confirma.",
        control: "switch+select",
        options: [
          { value: "5", label: "Después de 5 días" },
          { value: "7", label: "Después de 7 días" },
          { value: "14", label: "Después de 14 días" },
        ],
      },
      {
        id: "newLeadUntouched",
        label: "Lead nuevo sin primer contacto",
        description:
          "Recuerda al asesor si un lead recién asignado sigue sin respuesta.",
        control: "switch+select",
        options: [
          { value: "15", label: "A los 15 min" },
          { value: "30", label: "A los 30 min" },
          { value: "60", label: "A la hora" },
        ],
      },
      {
        id: "appointmentReminder",
        label: "Recordatorio de visita",
        description:
          "Recuerda al asesor la visita agendada, con los datos del lead y de la propiedad.",
        control: "switch+select",
        options: [
          { value: "1h", label: "1 h antes" },
          { value: "3h", label: "3 h antes" },
          { value: "24h", label: "Un día antes" },
        ],
      },
    ],
  },
  {
    id: "analysis",
    label: "Análisis periódico",
    hint: "Revisiones automáticas de la cartera del equipo",
    settings: [
      {
        id: "analysisFrequency",
        label: "Análisis de la cartera",
        description:
          "Revisa las oportunidades abiertas y señala las que se enfrían o se calientan.",
        control: "switch+select",
        options: [
          { value: "1h", label: "Cada hora" },
          { value: "4h", label: "Cada 4 h" },
          { value: "daily", label: "Una vez al día" },
        ],
      },
      {
        id: "dailySummary",
        label: "Resumen al gerente",
        description:
          "Un mensaje con leads nuevos, visitas del día y oportunidades sin movimiento.",
        control: "switch+select",
        options: [
          { value: "08:00", label: "A las 8:00" },
          { value: "09:00", label: "A las 9:00" },
          { value: "18:00", label: "A las 18:00" },
        ],
      },
      {
        id: "hotLeads",
        label: "Detección de leads calientes",
        description:
          "Avisa cuando un lead contesta rápido, pregunta por crédito o pide ver la propiedad.",
        control: "switch",
      },
    ],
  },
  {
    id: "notifications",
    label: "Notificaciones",
    hint: "Por dónde y cuándo la IA le escribe al asesor",
    settings: [
      {
        id: "channel",
        label: "Canal de aviso",
        description: "Los avisos al asesor salen por este canal.",
        control: "fixed",
        options: [
          { value: "whatsapp", label: "WhatsApp" },
          { value: "email", label: "Correo" },
          { value: "crm", label: "Solo dentro del CRM" },
        ],
      },
      {
        id: "workDays",
        label: "Días laborables",
        description:
          "Fuera de estos días la IA no manda avisos; los junta y los entrega el siguiente día laborable.",
        control: "fixed",
        options: [
          { value: "lv", label: "Lunes a viernes" },
          { value: "ls", label: "Lunes a sábado" },
          { value: "all", label: "Todos los días" },
        ],
      },
      {
        id: "quietHours",
        label: "Horario de silencio",
        description:
          "Los avisos que caigan en este rango se juntan y salen al terminar.",
        control: "switch+select",
        options: [
          { value: "21-08", label: "21:00 a 8:00" },
          { value: "22-07", label: "22:00 a 7:00" },
          { value: "20-09", label: "20:00 a 9:00" },
        ],
      },
    ],
  },
  {
    id: "crm",
    label: "Consultas al CRM",
    hint: "Lo que el asesor puede pedirle a la IA en lenguaje natural",
    settings: [
      {
        id: "crmQuestions",
        label: "Responder preguntas del asesor",
        description:
          "«¿Qué leads tengo sin cita esta semana?» La IA consulta el CRM y contesta por el mismo canal.",
        control: "switch",
      },
      {
        id: "crmScope",
        label: "Qué puede consultar cada rol",
        description:
          "Los admin siempre ven todo el pipeline. Esto define qué ve un usuario.",
        control: "fixed",
        options: [
          { value: "own", label: "Solo sus leads" },
          { value: "team", label: "Todo el pipeline" },
        ],
      },
      {
        id: "crmWrite",
        label: "Escribir en el CRM",
        description:
          "Mover etapa, agregar nota o agendar cita a petición del asesor.",
        control: "fixed",
        options: [
          { value: "never", label: "Nunca" },
          { value: "confirm", label: "Con confirmación" },
          { value: "free", label: "Sin confirmación" },
        ],
      },
    ],
  },
]

export const baseSettings: SettingValues = {
  abandonedLead: { enabled: true, option: "48" },
  suggestLost: { enabled: true, option: "7" },
  newLeadUntouched: { enabled: true, option: "30" },
  appointmentReminder: { enabled: true, option: "3h" },
  analysisFrequency: { enabled: true, option: "1h" },
  dailySummary: { enabled: true, option: "09:00" },
  hotLeads: { enabled: true },
  channel: { enabled: true, option: "whatsapp" },
  workDays: { enabled: true, option: "ls" },
  quietHours: { enabled: true, option: "21-08" },
  crmQuestions: { enabled: true },
  crmScope: { enabled: true, option: "own" },
  crmWrite: { enabled: true, option: "confirm" },
}

const withSettings = (overrides: SettingValues = {}): SettingValues => ({
  ...baseSettings,
  ...overrides,
})

export const baseStageRules: StageRule[] = [
  { stage: "Nuevo", idle: "30m", action: "notify" },
  { stage: "Contactado", idle: "48h", action: "task" },
  { stage: "Calificado", idle: "3d", action: "task" },
  { stage: "Visita agendada", idle: "24h", action: "notify" },
  { stage: "Visita realizada", idle: "3d", action: "task" },
  { stage: "Negociación", idle: "5d", action: "manager" },
  { stage: "Crédito en trámite", idle: "14d", action: "notify" },
  { stage: "Apartado", idle: "off", action: "notify" },
]

const withStageRules = (overrides: Partial<Record<string, Partial<StageRule>>> = {}) =>
  baseStageRules.map((rule) => ({ ...rule, ...(overrides[rule.stage] ?? {}) }))

/** El pipeline de ventas que casi toda subcuenta tiene, con sus reglas. */
const salesPipeline = (
  id: string,
  overrides: Partial<Record<string, Partial<StageRule>>> = {},
): Pipeline => ({ id, name: "Ventas", stages: withStageRules(overrides) })

export const subaccounts: Subaccount[] = [
  {
    id: "altavista",
    name: "Grupo Inmobiliario Altavista",
    ghlLocationId: "loc_Ht4Rm9Qa2",
    city: "Monterrey",
    status: "active",
    activity: 88,
    weeklyMessages: 214,
    settings: withSettings(),
    voice: {
      agentName: "Ale, asistente de Altavista",
      formality: "tu",
    },
    pipelines: [
      salesPipeline("pip_Ht4_ventas"),
      {
        id: "pip_Ht4_preventa",
        name: "Preventa Torre Alta",
        stages: [
          { stage: "Interesado", idle: "2h", action: "notify" },
          { stage: "Cotización enviada", idle: "48h", action: "task" },
          { stage: "Plan de pagos", idle: "5d", action: "task" },
          { stage: "Enganche", idle: "7d", action: "manager" },
          { stage: "Contrato", idle: "off", action: "notify" },
        ],
      },
    ],
    advisors: [
      {
        id: "alt-1",
        metrics: { firstResponseMin: 9, noContact: 0, visitsByIa: 6, accepted: 21, ignored: 2 },
        name: "Paulina Garza",
        role: "admin",
        activeLeads: 14,
        responseMinutes: 9,
        lastActiveAt: "2026-09-17T11:22",
        alerts: true,
      },
      {
        id: "alt-2",
        metrics: { firstResponseMin: 24, noContact: 2, visitsByIa: 11, accepted: 18, ignored: 7 },
        name: "Rodrigo Elizondo",
        role: "user",
        activeLeads: 31,
        responseMinutes: 24,
        lastActiveAt: "2026-09-17T10:58",
        alerts: true,
      },
      {
        id: "alt-3",
        metrics: { firstResponseMin: 15, noContact: 0, visitsByIa: 14, accepted: 25, ignored: 1 },
        name: "Mariana Treviño",
        role: "user",
        activeLeads: 27,
        responseMinutes: 15,
        lastActiveAt: "2026-09-17T11:31",
        alerts: true,
      },
      {
        id: "alt-4",
        metrics: { firstResponseMin: 52, noContact: 3, visitsByIa: 4, accepted: 9, ignored: 12 },
        name: "Andrés Cantú",
        role: "user",
        activeLeads: 19,
        responseMinutes: 52,
        lastActiveAt: "2026-09-16T19:04",
        alerts: true,
        settings: {
          abandonedLead: { enabled: true, option: "24" },
          newLeadUntouched: { enabled: true, option: "15" },
          dailySummary: { enabled: false, option: "09:00" },
        },
      },
      {
        id: "alt-5",
        metrics: { firstResponseMin: 18, noContact: 1, visitsByIa: 9, accepted: 16, ignored: 3 },
        name: "Sofía Villarreal",
        role: "user",
        activeLeads: 22,
        responseMinutes: 18,
        lastActiveAt: "2026-09-17T09:47",
        alerts: false,
        settings: {
          quietHours: { enabled: true, option: "22-07" },
        },
        away: { from: "2026-09-20", to: "2026-09-27", coverage: "alt-3" },
      },
      {
        id: "alt-6",
        metrics: { firstResponseMin: 140, noContact: 4, visitsByIa: 1, accepted: 3, ignored: 15 },
        name: "Luis Fernando Sada",
        role: "user",
        activeLeads: 8,
        responseMinutes: 140,
        lastActiveAt: "2026-09-14T17:20",
        alerts: true,
        settings: {
          suggestLost: { enabled: true, option: "14" },
        },
      },
    ],
  },
  {
    id: "casas-del-valle",
    name: "Casas del Valle",
    ghlLocationId: "loc_Qr8Nv2Ls5",
    city: "Querétaro",
    status: "active",
    activity: 64,
    weeklyMessages: 96,
    settings: withSettings({
      analysisFrequency: { enabled: true, option: "4h" },
      crmWrite: { enabled: true, option: "never" },
    }),
    voice: {
      agentName: "Vale de Casas del Valle",
      formality: "usted",
    },
    pipelines: [
      salesPipeline("pip_Qr8_ventas", {
        Nuevo: { idle: "2h" },
        Negociación: { idle: "7d", action: "notify" },
      }),
    ],
    advisors: [
      {
        id: "cdv-1",
        metrics: { firstResponseMin: 12, noContact: 0, visitsByIa: 5, accepted: 14, ignored: 1 },
        name: "Ernesto Olvera",
        role: "admin",
        activeLeads: 11,
        responseMinutes: 12,
        lastActiveAt: "2026-09-17T11:05",
        alerts: true,
      },
      {
        id: "cdv-2",
        metrics: { firstResponseMin: 21, noContact: 1, visitsByIa: 10, accepted: 17, ignored: 4 },
        name: "Daniela Rangel",
        role: "user",
        activeLeads: 24,
        responseMinutes: 21,
        lastActiveAt: "2026-09-17T10:12",
        alerts: true,
      },
      {
        id: "cdv-3",
        metrics: { firstResponseMin: 38, noContact: 2, visitsByIa: 6, accepted: 8, ignored: 9 },
        name: "Jorge Uribe",
        role: "user",
        activeLeads: 17,
        responseMinutes: 38,
        lastActiveAt: "2026-09-16T16:40",
        alerts: true,
        settings: {
          suggestLost: { enabled: true, option: "14" },
        },
      },
      {
        id: "cdv-4",
        metrics: { firstResponseMin: 27, noContact: 1, visitsByIa: 3, accepted: 6, ignored: 5 },
        name: "Karla Mondragón",
        role: "user",
        activeLeads: 13,
        responseMinutes: 27,
        lastActiveAt: "2026-09-17T08:55",
        alerts: false,
      },
    ],
  },
  {
    id: "torres-asociados",
    name: "Torres & Asociados Bienes Raíces",
    ghlLocationId: "loc_Zk3Wd7Pf1",
    city: "Ciudad de México",
    status: "paused",
    activity: 12,
    weeklyMessages: 18,
    settings: withSettings({
      abandonedLead: { enabled: true, option: "72" },
      suggestLost: { enabled: false, option: "14" },
      analysisFrequency: { enabled: true, option: "daily" },
      dailySummary: { enabled: true, option: "08:00" },
      channel: { enabled: true, option: "crm" },
    }),
    voice: {
      agentName: "Asistente Torres & Asociados",
      formality: "usted",
    },
    pipelines: [salesPipeline("pip_Zk3_ventas", { Nuevo: { idle: "24h" } })],
    advisors: [
      {
        id: "tor-1",
        metrics: { firstResponseMin: 45, noContact: 1, visitsByIa: 0, accepted: 2, ignored: 4 },
        name: "Alejandro Torres",
        role: "admin",
        activeLeads: 6,
        responseMinutes: 45,
        lastActiveAt: "2026-09-15T13:10",
        alerts: true,
      },
      {
        id: "tor-2",
        metrics: { firstResponseMin: 33, noContact: 0, visitsByIa: 0, accepted: 3, ignored: 2 },
        name: "Beatriz Lomelí",
        role: "admin",
        activeLeads: 9,
        responseMinutes: 33,
        lastActiveAt: "2026-09-16T11:48",
        alerts: true,
      },
      {
        id: "tor-3",
        metrics: { firstResponseMin: 61, noContact: 5, visitsByIa: 0, accepted: 1, ignored: 8 },
        name: "Héctor Peña",
        role: "user",
        activeLeads: 21,
        responseMinutes: 61,
        lastActiveAt: "2026-09-16T18:22",
        alerts: false,
      },
      {
        id: "tor-4",
        metrics: { firstResponseMin: 29, noContact: 1, visitsByIa: 0, accepted: 2, ignored: 3 },
        name: "Ximena Arriaga",
        role: "user",
        activeLeads: 16,
        responseMinutes: 29,
        lastActiveAt: "2026-09-17T09:30",
        alerts: false,
      },
      {
        id: "tor-5",
        metrics: { firstResponseMin: 84, noContact: 4, visitsByIa: 0, accepted: 0, ignored: 6 },
        name: "Raúl Benítez",
        role: "user",
        activeLeads: 12,
        responseMinutes: 84,
        lastActiveAt: "2026-09-13T10:05",
        alerts: false,
      },
    ],
  },
  {
    id: "vive-riviera",
    name: "Vive Riviera Realty",
    ghlLocationId: "loc_Mc6Yb1Tg8",
    city: "Playa del Carmen",
    status: "active",
    activity: 76,
    weeklyMessages: 143,
    settings: withSettings({
      quietHours: { enabled: false, option: "22-07" },
      crmScope: { enabled: true, option: "team" },
      workDays: { enabled: true, option: "all" },
    }),
    voice: {
      agentName: "Mar de Vive Riviera",
      formality: "tu",
    },
    pipelines: [
      salesPipeline("pip_Mc6_ventas", {
        Nuevo: { idle: "30m", action: "task" },
        "Crédito en trámite": { idle: "off" },
      }),
      {
        id: "pip_Mc6_lotes",
        name: "Lotes de inversión",
        stages: [
          { stage: "Nuevo", idle: "30m", action: "notify" },
          { stage: "Ficha enviada", idle: "3d", action: "task" },
          { stage: "Visita al desarrollo", idle: "5d", action: "task" },
          { stage: "Apartado", idle: "off", action: "notify" },
        ],
      },
    ],
    advisors: [
      {
        id: "riv-1",
        metrics: { firstResponseMin: 7, noContact: 0, visitsByIa: 8, accepted: 19, ignored: 1 },
        name: "Camila Ortega",
        role: "admin",
        activeLeads: 18,
        responseMinutes: 7,
        lastActiveAt: "2026-09-17T11:36",
        alerts: true,
      },
      {
        id: "riv-2",
        metrics: { firstResponseMin: 19, noContact: 1, visitsByIa: 15, accepted: 23, ignored: 3 },
        name: "Sebastián Aguirre",
        role: "user",
        activeLeads: 33,
        responseMinutes: 19,
        lastActiveAt: "2026-09-17T11:10",
        alerts: true,
      },
      {
        id: "riv-3",
        metrics: { firstResponseMin: 14, noContact: 0, visitsByIa: 12, accepted: 20, ignored: 2 },
        name: "Valeria Cruz",
        role: "user",
        activeLeads: 26,
        responseMinutes: 14,
        lastActiveAt: "2026-09-17T10:44",
        alerts: true,
      },
    ],
  },
  {
    id: "habitat-bajio",
    name: "Hábitat Bajío",
    ghlLocationId: "loc_Xs5Le9Hn4",
    city: "León",
    status: "unset",
    activity: 0,
    weeklyMessages: 0,
    settings: withSettings({
      abandonedLead: { enabled: false, option: "48" },
      suggestLost: { enabled: false, option: "7" },
      newLeadUntouched: { enabled: false, option: "30" },
      appointmentReminder: { enabled: false, option: "3h" },
      analysisFrequency: { enabled: false, option: "daily" },
      dailySummary: { enabled: false, option: "09:00" },
      hotLeads: { enabled: false },
      quietHours: { enabled: false, option: "21-08" },
      crmQuestions: { enabled: false },
    }),
    voice: {
      agentName: "Asistente Hábitat Bajío",
      formality: "tu",
    },
    pipelines: [salesPipeline("pip_Xs5_ventas")],
    advisors: [
      {
        id: "hab-1",
        metrics: { firstResponseMin: 0, noContact: 0, visitsByIa: 0, accepted: 0, ignored: 0 },
        name: "Gabriela Ponce",
        role: "admin",
        activeLeads: 0,
        responseMinutes: 0,
        lastActiveAt: "2026-09-12T12:00",
        alerts: false,
      },
      {
        id: "hab-2",
        metrics: { firstResponseMin: 0, noContact: 0, visitsByIa: 0, accepted: 0, ignored: 0 },
        name: "Iván Cortés",
        role: "user",
        activeLeads: 0,
        responseMinutes: 0,
        lastActiveAt: "2026-09-12T12:00",
        alerts: false,
      },
    ],
  },
]

export type ThreadKind = "alert" | "analysis" | "question"

export type ThreadMessage = {
  id: string
  from: "ia" | "advisor"
  text: string
  at: string
  /** Botones que la IA ofreció. `chosen` marca cuál tomó el asesor. */
  actions?: { label: string; chosen?: boolean }[]
}

export type Thread = {
  id: string
  subaccountId: string
  advisorId: string
  kind: ThreadKind
  subject: string
  /** Lead o propiedad de la que trata el hilo, si aplica. */
  about?: string
  unread: boolean
  messages: ThreadMessage[]
}

export const threads: Thread[] = [
  {
    id: "t-01",
    subaccountId: "altavista",
    advisorId: "alt-2",
    kind: "alert",
    subject: "Lead sin respuesta: Fernando Ibarra",
    about: "Depto. Torre Nuevo Sur · 2 rec.",
    unread: true,
    messages: [
      {
        id: "m-01",
        from: "ia",
        at: "2026-09-17T11:18",
        text: "Vi que Fernando Ibarra te dejó de contestar hace 2 días. Le mandaste la ficha del depto en Torre Nuevo Sur el lunes y abrió el enlace dos veces, pero no respondió. ¿Te creo una tarea para retomarlo hoy o lo mando a perdido?",
        actions: [
          { label: "Crear tarea para hoy" },
          { label: "Mover a perdido" },
          { label: "Lo veo yo" },
        ],
      },
    ],
  },
  {
    id: "t-02",
    subaccountId: "altavista",
    advisorId: "alt-3",
    kind: "question",
    subject: "¿A qué hora abre la casa muestra de Cumbres?",
    about: "Casa Cumbres Elite · 3 rec.",
    unread: true,
    messages: [
      {
        id: "m-02",
        from: "advisor",
        at: "2026-09-17T10:52",
        text: "¿A qué hora abre la casa muestra de Cumbres? Lucía Medina quiere ir el sábado.",
      },
      {
        id: "m-03",
        from: "ia",
        at: "2026-09-17T10:52",
        text: "Según el calendario «Casa muestra Cumbres» del CRM: sábado y domingo de 10:00 a 18:00; entre semana solo con cita. ¿Te agendo a Lucía el sábado a las 11:00 en tu calendario?",
        actions: [
          { label: "Agendar sábado 11:00", chosen: true },
          { label: "Proponer otra hora" },
        ],
      },
      {
        id: "m-04",
        from: "advisor",
        at: "2026-09-17T10:58",
        text: "Agendar sábado 11:00",
      },
      {
        id: "m-04b",
        from: "ia",
        at: "2026-09-17T10:58",
        text: "Listo. Visita creada en tu calendario para el sábado 19 a las 11:00 con Lucía Medina. Te recuerdo 3 h antes; tú le confirmas a ella.",
      },
    ],
  },
  {
    id: "t-03",
    subaccountId: "altavista",
    advisorId: "alt-1",
    kind: "analysis",
    subject: "Análisis de las 11:00",
    unread: false,
    messages: [
      {
        id: "m-05",
        from: "ia",
        at: "2026-09-17T11:00",
        text: "Revisión de la última hora en Altavista:\n\n• 4 leads nuevos entraron por Facebook; 3 ya tienen primer contacto, el de Andrés Cantú lleva 40 min sin respuesta.\n• Rodrigo tiene 6 oportunidades en \"Visita agendada\" sin fecha en el calendario.\n• Lead caliente: Patricia Solís (Sofía) preguntó dos veces por crédito Infonavit y pidió cotización.\n\nNada más se movió desde las 10:00.",
      },
      {
        id: "m-06",
        from: "advisor",
        at: "2026-09-17T11:04",
        text: "Recuérdale a Andrés el lead nuevo y avísame si a las 12 sigue igual.",
      },
      {
        id: "m-07",
        from: "ia",
        at: "2026-09-17T11:04",
        text: "Le avisé a Andrés por WhatsApp. Te escribo a las 12:00 si el lead sigue sin respuesta.",
      },
    ],
  },
  {
    id: "t-04",
    subaccountId: "altavista",
    advisorId: "alt-4",
    kind: "alert",
    subject: "Lead nuevo sin primer contacto",
    about: "Facebook Lead Ads · Campaña Cumbres",
    unread: true,
    messages: [
      {
        id: "m-08",
        from: "ia",
        at: "2026-09-17T11:04",
        text: "Te asignaron a Roberto Salinas hace 40 min y todavía no tiene primer contacto. Vino de la campaña de Cumbres y dejó su teléfono: +52 81 ··· 2210. ¿Lo tomas ahora o te creo una tarea para más tarde?",
        actions: [{ label: "Ya le escribo" }, { label: "Tarea para más tarde" }],
      },
    ],
  },
  {
    id: "t-05",
    subaccountId: "altavista",
    advisorId: "alt-5",
    kind: "question",
    subject: "¿Qué leads tengo sin cita esta semana?",
    unread: false,
    messages: [
      {
        id: "m-09",
        from: "advisor",
        at: "2026-09-17T09:41",
        text: "¿Qué leads tengo sin cita esta semana?",
      },
      {
        id: "m-10",
        from: "ia",
        at: "2026-09-17T09:41",
        text: "Tienes 22 leads activos y 7 no tienen cita esta semana:\n\n1. Patricia Solís — preguntó por crédito ayer\n2. Miguel Ángel Ruiz — última respuesta hace 3 d\n3. Carolina Peña — sin respuesta desde el 12 sep\n4. Jesús Domínguez — pidió llamar después del 20\n5. Ana Laura Cepeda — nueva, contactada hoy\n6. Óscar Treviño — sin respuesta desde el 10 sep\n7. Renata Gil — quiere ver Cumbres, sin fecha\n\nPatricia y Renata son las más calientes. ¿Te creo tareas para llamarles hoy?",
        actions: [
          { label: "Sí, crea las tareas", chosen: true },
          { label: "No por ahora" },
        ],
      },
      {
        id: "m-11",
        from: "advisor",
        at: "2026-09-17T09:45",
        text: "Sí, crea las tareas",
      },
      {
        id: "m-12",
        from: "ia",
        at: "2026-09-17T09:46",
        text: "Listo: dos tareas en GoHighLevel para hoy, «Llamar a Patricia Solís» y «Llamar a Renata Gil», con la ficha de Cumbres adjunta. Te las recuerdo a las 12:00 si siguen abiertas.",
      },
    ],
  },
  {
    id: "t-06",
    subaccountId: "casas-del-valle",
    advisorId: "cdv-3",
    kind: "alert",
    subject: "Sugerencia: mover a perdido a Martín Aceves",
    about: "Casa Juriquilla · Lote 14",
    unread: true,
    messages: [
      {
        id: "m-13",
        from: "ia",
        at: "2026-09-17T08:30",
        text: "Martín Aceves lleva 8 días sin contestar. Le mandaste dos seguimientos, el último el viernes, y ninguno tuvo respuesta. La regla del equipo es proponer perdido a los 7 días. ¿Lo muevo a \"Perdido\" con motivo \"Sin respuesta\"?",
        actions: [
          { label: "Mover a perdido" },
          { label: "Dale una semana más", chosen: true },
        ],
      },
      {
        id: "m-14",
        from: "advisor",
        at: "2026-09-17T08:52",
        text: "Dale una semana más, me dijo que regresaba de viaje el 20.",
      },
      {
        id: "m-15",
        from: "ia",
        at: "2026-09-17T08:52",
        text: "De acuerdo. Dejé una nota en el contacto con eso y te lo vuelvo a traer el 22 de septiembre si sigue sin responder.",
      },
    ],
  },
  {
    id: "t-07",
    subaccountId: "casas-del-valle",
    advisorId: "cdv-1",
    kind: "analysis",
    subject: "Resumen del día para el gerente",
    unread: false,
    messages: [
      {
        id: "m-16",
        from: "ia",
        at: "2026-09-17T09:00",
        text: "Buenos días, Ernesto. Casas del Valle al corte de las 9:00:\n\n• Leads nuevos ayer: 9 (6 Facebook, 2 portal, 1 referido). Todos con primer contacto.\n• Visitas hoy: 3 — Daniela 11:00 y 16:00, Jorge 13:00.\n• Sin movimiento más de 5 días: 11 oportunidades, 7 de Jorge.\n• Karla tiene los avisos apagados desde el lunes.\n\nEl tiempo de primera respuesta del equipo bajó a 24 min, 6 menos que la semana pasada.",
      },
    ],
  },
  {
    id: "t-08",
    subaccountId: "casas-del-valle",
    advisorId: "cdv-2",
    kind: "question",
    subject: "¿Zibatá acepta Fovissste?",
    about: "Depto. Zibatá · 2 rec.",
    unread: false,
    messages: [
      {
        id: "m-17",
        from: "advisor",
        at: "2026-09-16T22:10",
        text: "¿El depto de Zibatá acepta crédito Fovissste? Rocío Bravo me está preguntando.",
      },
      {
        id: "m-17b",
        from: "ia",
        at: "2026-09-16T22:10",
        text: "La ficha de Zibatá en el CRM no dice qué créditos acepta; el campo está vacío. No se lo confirme todavía. Le dejé una nota al contacto y le avisé a Ernesto para que complete la ficha.",
      },
      {
        id: "m-18",
        from: "advisor",
        at: "2026-09-17T09:02",
        text: "Gracias, lo confirmo con Ernesto.",
      },
    ],
  },
  {
    id: "t-09",
    subaccountId: "vive-riviera",
    advisorId: "riv-2",
    kind: "alert",
    subject: "Lead caliente: Thomas Reed",
    about: "Condo Aldea Zamá · Preventa",
    unread: true,
    messages: [
      {
        id: "m-19",
        from: "ia",
        at: "2026-09-17T11:27",
        text: "Thomas Reed contestó en menos de 2 min tres veces seguidas, preguntó por el plan de pagos de preventa y si puede cerrar desde Estados Unidos. Está listo para una llamada. ¿Te bloqueo hoy a las 13:00 o a las 17:00 (hora de Tulum) para llamarle?",
        actions: [{ label: "Hoy 13:00" }, { label: "Hoy 17:00" }, { label: "Yo le llamo" }],
      },
    ],
  },
  {
    id: "t-10",
    subaccountId: "vive-riviera",
    advisorId: "riv-1",
    kind: "question",
    subject: "¿Cuántas oportunidades cerró el equipo esta semana?",
    unread: false,
    messages: [
      {
        id: "m-20",
        from: "advisor",
        at: "2026-09-17T10:20",
        text: "¿Cuántas oportunidades cerró el equipo esta semana y de quién?",
      },
      {
        id: "m-21",
        from: "ia",
        at: "2026-09-17T10:20",
        text: "Del lunes 14 a hoy, Vive Riviera cerró 3 oportunidades como ganadas:\n\n• Sebastián — Condo Aldea Zamá 2B, apartado el martes\n• Valeria — Lote Bahía Príncipe, apartado el miércoles\n• Valeria — Condo Aldea Zamá 4A, apartado hoy a las 9:15\n\nHay 5 más en \"Negociación\" con fecha de cierre esta semana.",
      },
    ],
  },
  {
    id: "t-11",
    subaccountId: "vive-riviera",
    advisorId: "riv-3",
    kind: "alert",
    subject: "Recordatorio de visita a las 14:00",
    about: "Lote Bahía Príncipe · Manzana 7",
    unread: false,
    messages: [
      {
        id: "m-22",
        from: "ia",
        at: "2026-09-17T11:00",
        text: "En 3 horas tienes visita con Élodie Marchand en Bahía Príncipe, manzana 7. Ella no ha confirmado asistencia; te conviene escribirle. Lleva el plano actualizado: el de la ficha es del mes pasado.",
      },
    ],
  },
  {
    id: "t-12",
    subaccountId: "torres-asociados",
    advisorId: "tor-1",
    kind: "analysis",
    subject: "Análisis diario (IA en pausa)",
    unread: false,
    messages: [
      {
        id: "m-23",
        from: "ia",
        at: "2026-09-15T08:00",
        text: "Corte de Torres & Asociados. 12 oportunidades llevan más de 10 días sin movimiento, 7 de Raúl. Solo dejo el análisis: los avisos a asesores están en pausa desde el 11 de septiembre y no mandé ningún mensaje.",
      },
      {
        id: "m-24",
        from: "advisor",
        at: "2026-09-15T13:08",
        text: "Sigue en pausa hasta que terminemos de limpiar el pipeline.",
      },
    ],
  },
]

export const threadKindLabel: Record<
  ThreadKind,
  { label: string; tone: "live" | "build" | "warn" | "risk" | "idle" }
> = {
  alert: { label: "Alerta", tone: "warn" },
  analysis: { label: "Análisis", tone: "build" },
  question: { label: "Consulta al CRM", tone: "idle" },
}

export const iaStatusLabel: Record<
  IaStatus,
  { label: string; tone: "live" | "build" | "warn" | "risk" | "idle" }
> = {
  active: { label: "IA activa", tone: "live" },
  paused: { label: "En pausa", tone: "warn" },
  unset: { label: "Sin configurar", tone: "idle" },
}

/** Ajustes que aplican a un asesor: los del equipo con sus propios encima. */
export function effectiveSettings(team: SettingValues, advisor?: Advisor) {
  return { ...team, ...(advisor?.settings ?? {}) }
}

/** Claves en las que el asesor difiere del equipo. */
export function overriddenKeys(team: SettingValues, advisor?: Advisor) {
  const own = advisor?.settings ?? {}
  return Object.keys(own).filter(
    (key) =>
      own[key].enabled !== team[key]?.enabled ||
      (own[key].option ?? null) !== (team[key]?.option ?? null),
  )
}

/** "hace 5 min" / "hace 2 h" / "ayer" — para hilos y actividad de asesores. */
export function relativeTime(iso: string | null, now = DEMO_NOW) {
  if (!iso) return "—"
  const diff = new Date(now).getTime() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days === 1) return "ayer"
  return `hace ${days} d`
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Lo que la vista necesita, venga de GHL o del demo. */
export type LezgoIaData = {
  source: "ghl" | "demo"
  /** Instante de referencia para "hace 5 min": fijo en el demo, real con GHL. */
  now: string
  subaccounts: Subaccount[]
  threads: Thread[]
  actions: GhlAction[]
  /** Subcuentas enlazadas que GHL no devolvió. */
  failed: number
}
