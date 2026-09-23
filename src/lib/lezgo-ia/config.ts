import { z } from "zod"

import {
  baseSettings,
  settingGroups,
  stageActionOptions,
  stageIdleOptions,
  type Advisor,
  type IaStatus,
  type SettingValues,
  type StageRule,
  type Subaccount,
  type Voice,
} from "@/data/lezgo-ia"

/**
 * Configuración de Lezgo IA: cómo se guarda, cómo se valida y cómo se
 * resuelve. Todo es código determinista, sin modelo de por medio: el motor
 * de la IA pregunta aquí "¿le aviso a este asesor ahora?" y recibe un sí o
 * un no con su razón, sin gastar tokens en releer reglas.
 *
 * Puntos de entrada para el motor:
 * - `resolveAdvisor(account, userId)` → ajustes efectivos del asesor.
 * - `stageRuleFor(account, pipelineId, stageId)` → qué tolera esa etapa.
 * - `shouldNotify({ account, userId, settingId, at })` → decisión final.
 * La lectura desde Neon está en `getLezgoIaConfig` del repositorio.
 */

/* ------------------------------------------------------------------ tipos */

export type StoredStageRules = Record<
  string,
  Record<string, { idle: string; action: string }>
>

export type StoredAdvisor = {
  userId: string
  alerts: boolean
  settings: SettingValues
  away: { from: string; to: string; coverage: string } | null
}

/** Lo que se guarda de una subcuenta. Sin fila en Neon = `defaultAccountConfig`. */
export type AccountConfig = {
  locationId: string
  status: IaStatus
  /** Zona horaria de la subcuenta en GHL; horarios y días se miden ahí. */
  timezone: string
  settings: SettingValues
  voice: Voice | null
  stageRules: StoredStageRules
  advisors: Record<string, StoredAdvisor>
}

export function defaultAccountConfig(
  locationId: string,
  timezone = "America/Mexico_City",
): AccountConfig {
  return {
    locationId,
    status: "unset",
    timezone,
    settings: { ...baseSettings },
    voice: null,
    stageRules: {},
    advisors: {},
  }
}

/* ------------------------------------------------------------- validación */

const settingDefs = new Map(
  settingGroups.flatMap((g) => g.settings).map((d) => [d.id, d]),
)

const settingValue = z.object({
  enabled: z.boolean(),
  option: z.string().max(40).optional(),
})

/** Solo claves conocidas y opciones que existen en su definición. */
const settingValues = z
  .record(z.string(), settingValue)
  .superRefine((values, ctx) => {
    for (const [id, value] of Object.entries(values)) {
      const def = settingDefs.get(id)
      if (!def) {
        ctx.addIssue({ code: "custom", message: `Ajuste desconocido: ${id}` })
        continue
      }
      if (
        value.option !== undefined &&
        def.options &&
        !def.options.some((o) => o.value === value.option)
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Opción inválida para ${def.label}: ${value.option}`,
        })
      }
    }
  })

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const saveAccountInput = z.object({
  locationId: z.string().min(1).max(64),
  status: z.enum(["active", "paused", "unset"]),
  settings: settingValues,
  voice: z.object({
    agentName: z.string().trim().min(1).max(80),
    formality: z.enum(["tu", "usted"]),
  }),
  stageRules: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        idle: z.enum(stageIdleOptions.map((o) => o.value) as [string, ...string[]]),
        action: z.enum(stageActionOptions.map((o) => o.value) as [string, ...string[]]),
      }),
    ),
  ),
  advisors: z
    .array(
      z.object({
        userId: z.string().min(1).max(64),
        alerts: z.boolean(),
        settings: settingValues,
        away: z
          .object({ from: isoDate, to: isoDate, coverage: z.string().min(1).max(64) })
          .refine((a) => a.from <= a.to, "La ausencia termina antes de empezar")
          .nullable(),
      }),
    )
    .max(500),
})

export type SaveAccountInput = z.infer<typeof saveAccountInput>

/* ----------------------------------------------------- vista ↔ configuración */

/** Clave de una regla: el id de la etapa en GHL; el nombre solo en el demo. */
export const stageKey = (rule: StageRule) => rule.id ?? rule.stage

/** Lo que el panel manda a guardar, sacado del estado de la vista. */
export function toSaveInput(account: Subaccount): SaveAccountInput {
  return {
    locationId: account.ghlLocationId,
    status: account.status,
    settings: account.settings,
    voice: account.voice,
    stageRules: Object.fromEntries(
      account.pipelines.map((p) => [
        p.id,
        Object.fromEntries(
          p.stages.map((r) => [stageKey(r), { idle: r.idle, action: r.action }]),
        ),
      ]),
    ),
    advisors: account.advisors.map((a) => ({
      userId: a.id,
      alerts: a.alerts,
      settings: a.settings ?? {},
      away: a.away ?? null,
    })),
  }
}

/**
 * Pone la configuración guardada encima de lo que vino de GHL. Un asesor o
 * una etapa que ya no existen en GHL simplemente no se pintan; su fila se
 * queda por si vuelven.
 */
export function applyConfig(account: Subaccount, config: AccountConfig | undefined): Subaccount {
  if (!config) return account
  return {
    ...account,
    status: config.status,
    settings: { ...baseSettings, ...config.settings },
    voice: config.voice ?? account.voice,
    pipelines: account.pipelines.map((p) => ({
      ...p,
      stages: p.stages.map((r) => ({
        ...r,
        ...(config.stageRules[p.id]?.[stageKey(r)] ?? {}),
      })),
    })),
    advisors: account.advisors.map((a): Advisor => {
      const saved = config.advisors[a.id]
      if (!saved) return a
      return {
        ...a,
        alerts: saved.alerts,
        settings: saved.settings,
        away: saved.away ?? undefined,
      }
    }),
  }
}

/* ------------------------------------------------------------- resolución */

/** Ajustes efectivos de un asesor: los del equipo con los suyos encima. */
export function resolveAdvisor(account: AccountConfig, userId: string) {
  const own = account.advisors[userId]
  return {
    alerts: own?.alerts ?? false,
    away: own?.away ?? null,
    settings: { ...baseSettings, ...account.settings, ...(own?.settings ?? {}) },
  }
}

export function stageRuleFor(
  account: AccountConfig,
  pipelineId: string,
  stageId: string,
) {
  return account.stageRules[pipelineId]?.[stageId] ?? { idle: "off", action: "notify" }
}

/** "30m", "2h", "3d" → milisegundos. `off` → `null`. */
export function idleMs(idle: string): number | null {
  const match = /^(\d+)(m|h|d)$/.exec(idle)
  if (!match) return null
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "m" | "h" | "d"]
  return Number(match[1]) * unit
}

/** Día (0 = domingo) y minuto del día en la zona de la subcuenta. */
function localClock(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
  return {
    weekday,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  }
}

const workDays: Record<string, number[]> = {
  lv: [1, 2, 3, 4, 5],
  ls: [1, 2, 3, 4, 5, 6],
  all: [0, 1, 2, 3, 4, 5, 6],
}

export type NotifyDecision =
  | { send: true; to: string }
  | {
      send: false
      reason:
        | "ia-inactiva"
        | "avisos-apagados"
        | "ajuste-apagado"
        | "dia-no-laborable"
        | "horario-de-silencio"
      /** Cuando la razón es de horario: se junta y sale después. */
      deferred: boolean
    }

/**
 * ¿Mandar este aviso a este asesor en este instante? Se evalúa en orden:
 * IA de la subcuenta, avisos del asesor, el ajuste en sí, fuera de oficina
 * (se desvía a quien cubre), días laborables y horario de silencio. Lo que
 * cae fuera de horario no se pierde: `deferred` le dice al motor que lo
 * encole.
 */
export function shouldNotify(input: {
  account: AccountConfig
  userId: string
  settingId: string
  at: Date
}): NotifyDecision {
  const { account, settingId, at } = input
  if (account.status !== "active") {
    return { send: false, reason: "ia-inactiva", deferred: false }
  }

  let userId = input.userId
  let advisor = resolveAdvisor(account, userId)
  const today = localClock(at, account.timezone)
  if (advisor.away && advisor.away.from <= today.date && today.date <= advisor.away.to) {
    // "manager" lo resuelve el motor: aquí no sabemos quién es el gerente.
    userId = advisor.away.coverage
    if (userId !== "manager") advisor = resolveAdvisor(account, userId)
  }

  if (userId !== "manager" && !advisor.alerts) {
    return { send: false, reason: "avisos-apagados", deferred: false }
  }
  const setting = advisor.settings[settingId]
  if (settingDefs.get(settingId)?.control !== "fixed" && !setting?.enabled) {
    return { send: false, reason: "ajuste-apagado", deferred: false }
  }

  const days = workDays[advisor.settings.workDays?.option ?? "all"] ?? workDays.all
  if (!days.includes(today.weekday)) {
    return { send: false, reason: "dia-no-laborable", deferred: true }
  }

  const quiet = advisor.settings.quietHours
  if (quiet?.enabled && quiet.option) {
    const [from, to] = quiet.option.split("-").map((h) => Number(h) * 60)
    const m = today.minutes
    const inQuiet = from > to ? m >= from || m < to : m >= from && m < to
    if (inQuiet) return { send: false, reason: "horario-de-silencio", deferred: true }
  }

  return { send: true, to: userId }
}
