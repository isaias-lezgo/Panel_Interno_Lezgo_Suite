import {
  baseSettings,
  type Advisor,
  type Pipeline,
  type Subaccount,
} from "@/data/lezgo-ia"
import type { GhlLocation, GhlPipeline, GhlUser } from "@/lib/ghl/client"
import { TIME_ZONE } from "@/lib/time"

/**
 * Traduce una subcuenta real de GHL al modelo de Lezgo IA. La IA todavía no
 * corre en ninguna, así que todo lo que ella produciría —métricas, mensajes,
 * actividad— queda en `null` o en cero, y la subcuenta arranca "Sin
 * configurar". Lo que sí es real: nombre, asesores
 * y su rol; con la app OAuth, también los pipelines y los leads abiertos de
 * cada asesor.
 */
export function toSubaccount(input: {
  location: GhlLocation
  users: GhlUser[]
  clientName: string
  /** Usuarios del equipo Lezgo: tienen acceso a la subcuenta, no son asesores. */
  isStaff: (user: GhlUser) => boolean
  /** `null` = la app OAuth no dio acceso a esta subcuenta. */
  pipelines?: GhlPipeline[] | null
  /** Oportunidades abiertas por id de usuario. */
  openLeads?: Record<string, number> | null
}): Subaccount {
  const { location, users, clientName, isStaff } = input
  const pipelines = input.pipelines ?? null
  const advisors = advisorUsers(users, isStaff)
    .map((u) => ({ ...toAdvisor(u), activeLeads: input.openLeads?.[u.id] ?? null }))
    .sort(
      (a, b) =>
        Number(b.role === "admin") - Number(a.role === "admin") ||
        a.name.localeCompare(b.name, "es"),
    )
  const name = location.name.trim()

  return {
    id: location.id,
    name,
    ghlLocationId: location.id,
    city: location.city?.trim() || "Sin ciudad",
    clientName,
    timezone: location.timezone || TIME_ZONE,
    status: "unset",
    activity: 0,
    weeklyMessages: 0,
    advisors,
    settings: { ...baseSettings },
    voice: { agentName: `Asistente ${name}`, formality: "tu" },
    pipelines: (pipelines ?? []).map(toPipeline),
  }
}

/** Los usuarios que cuentan como asesores: vivos y que no son del equipo Lezgo. */
export function advisorUsers(users: GhlUser[], isStaff: (user: GhlUser) => boolean) {
  return users.filter((u) => !u.deleted && !isStaff(u))
}

/**
 * Las etapas llegan tal cual de GHL, en su orden. La regla arranca en "No
 * vigilar": qué tolera cada etapa lo decide el equipo al dar de alta la
 * subcuenta, no un valor que parezca elegido.
 */
function toPipeline(p: GhlPipeline): Pipeline {
  return {
    id: p.id,
    name: p.name,
    stages: [...p.stages]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, stage: s.name, idle: "off", action: "notify" })),
  }
}

function toAdvisor(user: GhlUser): Advisor {
  const name =
    user.name?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Sin nombre"
  return {
    id: user.id,
    name,
    email: user.email ?? null,
    role: user.roles?.role === "admin" ? "admin" : "user",
    activeLeads: null,
    responseMinutes: null,
    lastActiveAt: null,
    alerts: false,
    metrics: null,
  }
}
