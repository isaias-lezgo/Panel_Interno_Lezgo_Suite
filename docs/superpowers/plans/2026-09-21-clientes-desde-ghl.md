# Clientes desde GHL enlazados a Stripe — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El objeto cliente del panel sale de las oportunidades ganadas del pipeline "Ventas" de la subcuenta Lezgo Suite en GoHighLevel, agrupadas por contacto, y se enlaza a uno o varios clientes de Stripe y a su subcuenta de GHL: automático por correo/teléfono/nombre exacto, manual con un desplegable en la ficha.

**Architecture:** Un sync (`src/lib/clients/sync.ts`) lee GHL con un PIT de la subcuenta, agrupa por contacto (`group.ts`, puro), hace upsert en Neon y corre el auto-enlace (`match.ts`, puro). Los enlaces viven en `client_stripe_customers` (1→N) y `clients.ghl_location_id`. El repositorio sigue siendo la única superficie de lectura; las server actions escriben solo en Neon.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Neon, Stripe SDK (solo lectura), vitest, shadcn sobre Base UI + cmdk.

**Spec:** `docs/superpowers/specs/2026-09-21-clientes-desde-ghl-design.md`

## Global Constraints

- Todo texto visible en español; identificadores en inglés. Tono directo.
- Toda lectura de datos pasa por `src/lib/repository.ts`. Toda llamada a GHL por `src/lib/ghl/client.ts`; a Stripe por `src/lib/stripe/client.ts`.
- **Nunca escribir en GHL ni en Stripe.** Las actions solo escriben en Neon.
- Cifras con clase `.num`; dinero siempre `money(cents, currency)`; etiquetas `.eyebrow`; `StatusChip` con punto y palabra; tarjetas (`Instrument`) no se anidan.
- Las herramientas y el sync nunca lanzan hacia la UI: devuelven `{ ok: false, error }`.
- Variables nuevas: `GHL_LEZGO_SUITE_TOKEN`, `GHL_LEZGO_SUITE_LOCATION_ID` (ya están en `.env.local`). Location Lezgo Suite: `uRFrk77agXq9is0a0gkp`. Pipeline Ventas: `6O1DrEbm0UGM1n0urShw`.
- Hay trabajo **sin commitear** ajeno a este plan (`lezgo-ia/*`, `globals.css`, `layout.tsx`, `app-rail.tsx`, `top-bar.tsx`, `nav.ts`, `command-menu.tsx`, `CLAUDE.md`). No se revierte ni se commitea desde aquí. Trabaja en la rama `clientes-ghl` creada desde `main` **sin worktree** (el worktree perdería esos cambios). Cada commit de este plan agrega solo sus propios archivos con `git add <rutas>`; nunca `git add -A`.
- Desviación aceptada respecto al spec: los clientes se leen **directo de Neon** (la página es dinámica), sin `unstable_cache`. Solo las listas de Stripe y de locations de GHL se cachean (tags `stripe` y `ghl-locations`). Motivo: `updateTag` no puede llamarse durante el render y la sync automática al cargar la lista ocurre en render.
- `tsc` queda en rojo tras la Task 3 y vuelve a verde al terminar la Task 4. Es intencional: los tipos cambian antes que sus consumidores.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/clients/match.ts` (+ `.test.ts`) | Normalización y regla de auto-enlace. Puro. |
| `src/lib/clients/group.ts` (+ `.test.ts`) | Agrupar oportunidades ganadas por contacto y derivar el cliente. Puro. |
| `src/lib/types.ts` | `Client` nuevo, `ClientOpportunity`, `StripeLink`, `LinkedBy`. |
| `src/db/schema.ts` | `clients` redefinida, `clientOpportunities`, `clientStripeCustomers`. |
| `src/data/demo.ts` | Clientes de ejemplo con la forma nueva. |
| `src/db/seed.ts` | Vacía y llena también las tablas nuevas. |
| `src/lib/ghl/client.ts` | `searchOpportunities` con paginación y `contact`; `searchLocations` completo. |
| `src/lib/ghl/lezgo-suite.ts` | `GhlClient` con el PIT de la subcuenta. |
| `src/lib/stripe/client.ts` | `listCustomers` ya existe; se agrega `summarizeSubscriptions`. |
| `src/lib/clients/sync.ts` | `syncClientsFromGhl()`: fetch → group → upsert → auto-enlace. |
| `src/lib/repository.ts` | `listClients`, `listClientRows`, `getClientDetail`, `listStripeCustomerOptions`, `listLocationOptions`, `lastSyncAt`, `getBillingFeed` con enlaces, `getPortfolioSummary` sin salud/MRR guardado. |
| `src/app/(panel)/clientes/actions.ts` | Server actions: sync y enlaces. |
| `src/components/clients/clients-table.tsx` | Tabla nueva. |
| `src/components/clients/sync-button.tsx` | Botón "Sincronizar con GHL". |
| `src/components/clients/link-picker.tsx` | Desplegable con búsqueda (Popover + Command). |
| `src/components/clients/stripe-links.tsx` | Lista de `cus_` enlazados + picker + quitar. |
| `src/components/clients/location-link.tsx` | Subcuenta enlazada + picker + quitar. |
| `src/app/(panel)/clientes/page.tsx`, `[slug]/page.tsx` | Vistas. |
| `src/app/(panel)/page.tsx`, `ajustes/page.tsx`, `src/components/panel/telemetry-band.tsx`, `src/components/shell/command-menu.tsx`, `src/lib/ai/tools.ts` | Adaptar a los campos nuevos. |
| `scripts/stripe-map.ts`, `package.json`, `CLAUDE.md`, `.env.example` | Retirar el mapeador viejo, documentar. |

---

### Task 0: Rama

- [ ] **Step 1: Crear la rama sin tocar el working tree**

```bash
git checkout -b clientes-ghl
git status --short   # los archivos de lezgo-ia siguen ahí, sin commitear; no los toques
```

---

### Task 1: Regla de auto-enlace (`match.ts`)

**Files:**
- Create: `src/lib/clients/match.ts`
- Test: `src/lib/clients/match.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LinkTarget = { id: string; name: string | null; email: string | null; phone: string | null }
  export type LinkSubject = { id: string; names: string[]; email: string | null; phone: string | null }
  export function normalizeName(s: string): string
  export function normalizeEmail(s: string): string
  export function phoneKey(s: string | null | undefined): string | null
  export function matches(subject: LinkSubject, target: LinkTarget): boolean
  /** cardinality "many": un sujeto puede recibir varios targets. "one": 1↔1. */
  export function autoLink(subjects: LinkSubject[], targets: LinkTarget[], cardinality: "many" | "one"): Map<string, string>  // targetId → subjectId
  ```

- [ ] **Step 1: Escribir las pruebas**

```ts
// src/lib/clients/match.test.ts
import { describe, expect, it } from "vitest"

import {
  autoLink,
  matches,
  normalizeEmail,
  normalizeName,
  phoneKey,
  type LinkSubject,
  type LinkTarget,
} from "./match"

const subject = (o: Partial<LinkSubject> & { id: string }): LinkSubject => ({
  names: [],
  email: null,
  phone: null,
  ...o,
})
const target = (o: Partial<LinkTarget> & { id: string }): LinkTarget => ({
  name: null,
  email: null,
  phone: null,
  ...o,
})

describe("normalizeName", () => {
  it("quita acentos, puntuación, espacios y sufijos societarios", () => {
    expect(normalizeName("Inmobiliaria HG, S.A. de C.V.")).toBe("inmobiliariahg")
    expect(normalizeName("Janet de la Cruz y asociados ")).toBe("janetdelacruzyasociados")
    expect(normalizeName("Sebastián Muradás")).toBe("sebastianmuradas")
  })
})

describe("normalizeEmail", () => {
  it("baja a minúsculas y recorta", () => {
    expect(normalizeEmail(" Dposada@b-inmo.com ")).toBe("dposada@b-inmo.com")
  })
})

describe("phoneKey", () => {
  it("compara los últimos 10 dígitos", () => {
    expect(phoneKey("+52 1 55 1005 5391")).toBe("5510055391")
    expect(phoneKey("+525510055391")).toBe("5510055391")
  })
  it("devuelve null con menos de 10 dígitos o vacío", () => {
    expect(phoneKey("12345")).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })
})

describe("matches", () => {
  it("empata por correo", () => {
    expect(
      matches(
        subject({ id: "a", email: "Sergio.Lujano@pylpatrimonial.com" }),
        target({ id: "cus_1", email: "sergio.lujano@pylpatrimonial.com" }),
      ),
    ).toBe(true)
  })
  it("empata por teléfono con o sin el 1 de larga distancia", () => {
    expect(
      matches(
        subject({ id: "a", phone: "+528119771143" }),
        target({ id: "cus_1", phone: "+5218119771143" }),
      ),
    ).toBe(true)
  })
  it("empata por nombre exacto contra cualquiera de los nombres del sujeto", () => {
    expect(
      matches(
        subject({ id: "a", names: ["Zuriel Rodríguez", "You Can Drive"] }),
        target({ id: "loc_1", name: "You Can Drive" }),
      ),
    ).toBe(true)
  })
  it("no empata nombres parecidos pero no idénticos", () => {
    expect(
      matches(
        subject({ id: "a", names: ["You Can Drive"] }),
        target({ id: "loc_1", name: "Escuela You Can Drive" }),
      ),
    ).toBe(false)
  })
  it("no empata con campos vacíos", () => {
    expect(matches(subject({ id: "a" }), target({ id: "x" }))).toBe(false)
    expect(
      matches(subject({ id: "a", email: "" }), target({ id: "x", email: "" })),
    ).toBe(false)
  })
})

describe("autoLink", () => {
  it("enlaza todos los targets que cumplan a un sujeto (many)", () => {
    const links = autoLink(
      [subject({ id: "ricardo", email: "corporacionlacoladamexico@gmail.com" })],
      [
        target({ id: "cus_UAS7", email: "corporacionlacoladamexico@gmail.com" }),
        target({ id: "cus_V8lq", email: "corporacionlacoladamexico@gmail.com" }),
        target({ id: "cus_otro", email: "otro@x.com" }),
      ],
      "many",
    )
    expect([...links.entries()]).toEqual([
      ["cus_UAS7", "ricardo"],
      ["cus_V8lq", "ricardo"],
    ])
  })
  it("no enlaza un target que cumple para dos sujetos", () => {
    const links = autoLink(
      [
        subject({ id: "a", phone: "+525512345678" }),
        subject({ id: "b", phone: "+525512345678" }),
      ],
      [target({ id: "cus_1", phone: "+525512345678" })],
      "many",
    )
    expect(links.size).toBe(0)
  })
  it("en modo one, un sujeto que empata con dos targets no se enlaza a ninguno", () => {
    const links = autoLink(
      [subject({ id: "amir", email: "hola@amircherit.com" })],
      [
        target({ id: "loc_1", name: "Amir Cherit", email: "hola@amircherit.com" }),
        target({ id: "loc_2", name: "Amir Cherit Cuenta Respaldo", email: "hola@amircherit.com" }),
      ],
      "one",
    )
    expect(links.size).toBe(0)
  })
  it("en modo one, enlaza cuando la relación es 1↔1", () => {
    const links = autoLink(
      [subject({ id: "hg", names: ["Inmobiliaria HG"] })],
      [target({ id: "loc_hg", name: "Inmobiliaria HG" })],
      "one",
    )
    expect(links.get("loc_hg")).toBe("hg")
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm vitest run src/lib/clients/match.test.ts`
Expected: FAIL — "Cannot find module './match'".

- [ ] **Step 3: Implementar**

```ts
// src/lib/clients/match.ts

/**
 * Regla de auto-enlace entre un cliente del panel y un cliente de Stripe o
 * una subcuenta de GHL. Puro y sin dependencias para poder probarlo con
 * casos reales. Lo que no cumpla exactamente queda para el desplegable.
 */

export type LinkTarget = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

export type LinkSubject = {
  id: string
  /** Empresa, contacto y nombres de oportunidades: cualquiera vale. */
  names: string[]
  email: string | null
  phone: string | null
}

const SUFFIXES = /\b(sa de cv|s a de c v|sapi de cv|s\.?a\.?|sapi|srl|s de rl|llc|inc)\b/g

export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

export function normalizeEmail(s: string) {
  return s.trim().toLowerCase()
}

/** Últimos 10 dígitos: así `+52 1 55…` y `+52 55…` son el mismo número. */
export function phoneKey(s: string | null | undefined) {
  if (!s) return null
  const digits = s.replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : null
}

export function matches(subject: LinkSubject, target: LinkTarget) {
  if (subject.email && target.email) {
    if (normalizeEmail(subject.email) === normalizeEmail(target.email)) return true
  }
  const sp = phoneKey(subject.phone)
  const tp = phoneKey(target.phone)
  if (sp && tp && sp === tp) return true

  if (target.name) {
    const tn = normalizeName(target.name)
    if (tn && subject.names.some((n) => normalizeName(n) === tn)) return true
  }
  return false
}

/**
 * Devuelve `targetId → subjectId`. Un target que cumple para más de un
 * sujeto es ambiguo y no se enlaza. En modo `one` tampoco se enlaza un sujeto
 * que empata con más de un target: una subcuenta tiene un solo dueño y un
 * cliente una sola subcuenta.
 */
export function autoLink(
  subjects: LinkSubject[],
  targets: LinkTarget[],
  cardinality: "many" | "one",
) {
  const links = new Map<string, string>()
  const perSubject = new Map<string, string[]>()

  for (const target of targets) {
    const hits = subjects.filter((s) => matches(s, target))
    if (hits.length !== 1) continue
    links.set(target.id, hits[0].id)
    perSubject.set(hits[0].id, [...(perSubject.get(hits[0].id) ?? []), target.id])
  }

  if (cardinality === "one") {
    for (const [, targetIds] of perSubject) {
      if (targetIds.length > 1) for (const t of targetIds) links.delete(t)
    }
  }
  return links
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm vitest run src/lib/clients/match.test.ts`
Expected: PASS, 12 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients/match.ts src/lib/clients/match.test.ts
git commit -m "Regla de auto-enlace por correo, teléfono o nombre exacto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Agrupar oportunidades por contacto (`group.ts`)

**Files:**
- Create: `src/lib/clients/group.ts`
- Test: `src/lib/clients/group.test.ts`

**Interfaces:**
- Consumes: `phoneKey`, `normalizeEmail` de Task 1.
- Produces:
  ```ts
  export type WonOpportunity = {
    id: string; name: string; monetaryValue: number | null
    pipelineStageId: string; createdAt: string; updatedAt: string; lastStatusChangeAt: string | null
    contact: { id: string; name: string | null; companyName: string | null; email: string | null; phone: string | null } | null
  }
  export type ClientDraft = {
    id: string; slug: string; name: string; contactName: string
    email: string | null; phone: string | null; ghlContactId: string
    stage: string; wonAt: string
    opportunities: { id: string; name: string; monetaryValue: number; stageId: string; stageName: string; wonAt: string; updatedAt: string }[]
  }
  export function slugify(s: string): string
  export function groupWonOpportunities(opps: WonOpportunity[], stageNames: Map<string, string>): ClientDraft[]
  ```

- [ ] **Step 1: Escribir las pruebas**

```ts
// src/lib/clients/group.test.ts
import { describe, expect, it } from "vitest"

import { groupWonOpportunities, slugify, type WonOpportunity } from "./group"

const stages = new Map([
  ["st_impl", "Proceso de Implementación"],
  ["st_activo", "Cliente Activo"],
])

const opp = (o: Partial<WonOpportunity> & { id: string }): WonOpportunity => ({
  name: o.id,
  monetaryValue: 1000,
  pipelineStageId: "st_activo",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  lastStatusChangeAt: "2026-01-01T12:00:00.000Z",
  contact: {
    id: "c_" + o.id,
    name: "Contacto " + o.id,
    companyName: null,
    email: null,
    phone: null,
  },
  ...o,
})

describe("slugify", () => {
  it("quita acentos y deja guiones", () => {
    expect(slugify("Janet de la Cruz y asociados ")).toBe("janet-de-la-cruz-y-asociados")
    expect(slugify("P&L Patrimonial")).toBe("p-l-patrimonial")
  })
})

describe("groupWonOpportunities", () => {
  it("agrupa dos oportunidades del mismo contacto en un cliente", () => {
    const ricardo = {
      id: "c_ricardo",
      name: "Ricardo Perez",
      companyName: "La Colada",
      email: "corporacionlacoladamexico@gmail.com",
      phone: "+525539172659",
    }
    const out = groupWonOpportunities(
      [
        opp({ id: "o1", name: "Ricardo Perez - La Colada", contact: ricardo, lastStatusChangeAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-05T00:00:00.000Z", pipelineStageId: "st_impl" }),
        opp({ id: "o2", name: "Ricardo - ACECOB", contact: ricardo, lastStatusChangeAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", pipelineStageId: "st_activo" }),
      ],
      stages,
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("c_ricardo")
    expect(out[0].name).toBe("La Colada")
    expect(out[0].contactName).toBe("Ricardo Perez")
    expect(out[0].opportunities.map((o) => o.id)).toEqual(["o1", "o2"])
    expect(out[0].wonAt).toBe("2026-03-01")
    expect(out[0].stage).toBe("Cliente Activo")
  })

  it("agrupa contactos distintos que comparten correo o teléfono; el id es el del más antiguo", () => {
    const out = groupWonOpportunities(
      [
        opp({ id: "o1", lastStatusChangeAt: "2026-02-01T00:00:00.000Z", contact: { id: "c_new", name: "Zuriel", companyName: null, email: "zurielrc9104@gmail.com", phone: null } }),
        opp({ id: "o2", lastStatusChangeAt: "2026-01-01T00:00:00.000Z", contact: { id: "c_old", name: "Zuriel Rodríguez", companyName: null, email: null, phone: "+525588046973" } }),
        opp({ id: "o3", lastStatusChangeAt: "2026-01-15T00:00:00.000Z", contact: { id: "c_mid", name: "Z R", companyName: null, email: "ZURIELRC9104@gmail.com", phone: "+52 1 55 8804 6973" } }),
      ],
      stages,
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("c_old")
    expect(out[0].opportunities).toHaveLength(3)
  })

  it("usa el nombre del contacto cuando no hay empresa y el nombre de la oportunidad cuando no hay contacto", () => {
    const out = groupWonOpportunities(
      [
        opp({ id: "o1", contact: { id: "c1", name: "Imelda De Alba", companyName: null, email: null, phone: null } }),
        opp({ id: "o2", name: "Cellarium", contact: null }),
      ],
      stages,
    )
    expect(out.map((c) => c.name)).toEqual(["Imelda De Alba", "Cellarium"])
    expect(out[1].id).toBe("opp_o2")
  })

  it("desambigua slugs repetidos", () => {
    const out = groupWonOpportunities(
      [
        opp({ id: "o1", contact: { id: "c1", name: "Sergio Lujano", companyName: null, email: "a@x.com", phone: null } }),
        opp({ id: "o2", contact: { id: "c2", name: "Sergio Lujano", companyName: null, email: "b@x.com", phone: null } }),
      ],
      stages,
    )
    expect(out.map((c) => c.slug)).toEqual(["sergio-lujano", "sergio-lujano-2"])
  })

  it("cae a createdAt cuando no hay fecha de cambio de estado y a 'Sin etapa' si la etapa no existe", () => {
    const out = groupWonOpportunities(
      [opp({ id: "o1", lastStatusChangeAt: null, createdAt: "2026-04-04T10:00:00.000Z", pipelineStageId: "st_x" })],
      stages,
    )
    expect(out[0].wonAt).toBe("2026-04-04")
    expect(out[0].stage).toBe("Sin etapa")
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm vitest run src/lib/clients/group.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

```ts
// src/lib/clients/group.ts
import { normalizeEmail, phoneKey } from "./match"

/** La oportunidad tal como la devuelve `GET /opportunities/search`, recortada. */
export type WonOpportunity = {
  id: string
  name: string
  monetaryValue: number | null
  pipelineStageId: string
  createdAt: string
  updatedAt: string
  lastStatusChangeAt: string | null
  contact: {
    id: string
    name: string | null
    companyName: string | null
    email: string | null
    phone: string | null
  } | null
}

export type ClientDraft = {
  id: string
  slug: string
  name: string
  contactName: string
  email: string | null
  phone: string | null
  ghlContactId: string
  stage: string
  wonAt: string
  opportunities: {
    id: string
    name: string
    monetaryValue: number
    stageId: string
    stageName: string
    wonAt: string
    updatedAt: string
  }[]
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const wonDate = (o: WonOpportunity) =>
  (o.lastStatusChangeAt ?? o.createdAt).slice(0, 10)

function clean(s: string | null | undefined) {
  const t = s?.trim()
  return t ? t : null
}

/**
 * Un cliente por contacto. Dos contactos distintos con el mismo correo o el
 * mismo teléfono son la misma persona registrada dos veces: se funden y el
 * cliente toma el id del contacto con la oportunidad más antigua, para que el
 * id no cambie cuando GHL cree un duplicado nuevo.
 */
export function groupWonOpportunities(
  opps: WonOpportunity[],
  stageNames: Map<string, string>,
): ClientDraft[] {
  const sorted = [...opps].sort((a, b) => wonDate(a).localeCompare(wonDate(b)))

  // Índices de fusión: contacto, correo y teléfono apuntan al grupo.
  const groups: WonOpportunity[][] = []
  const byContact = new Map<string, number>()
  const byEmail = new Map<string, number>()
  const byPhone = new Map<string, number>()

  for (const o of sorted) {
    const c = o.contact
    const email = c?.email ? normalizeEmail(c.email) : null
    const phone = phoneKey(c?.phone)
    const found =
      (c && byContact.get(c.id)) ??
      (email ? byEmail.get(email) : undefined) ??
      (phone ? byPhone.get(phone) : undefined)

    const idx = found ?? groups.push([]) - 1
    groups[idx].push(o)
    if (c) byContact.set(c.id, idx)
    if (email) byEmail.set(email, idx)
    if (phone) byPhone.set(phone, idx)
  }

  const slugs = new Map<string, number>()
  return groups.map((members) => {
    const first = members[0]
    const latest = members.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b))
    const contact = members.map((m) => m.contact).find(Boolean) ?? null
    const company = members.map((m) => clean(m.contact?.companyName)).find(Boolean)
    const contactName = clean(contact?.name) ?? first.name
    const name = company ?? contactName

    let slug = slugify(name) || "cliente"
    const n = (slugs.get(slug) ?? 0) + 1
    slugs.set(slug, n)
    if (n > 1) slug = `${slug}-${n}`

    return {
      id: contact ? contact.id : `opp_${first.id}`,
      slug,
      name,
      contactName,
      email: clean(members.map((m) => m.contact?.email).find(Boolean)),
      phone: clean(members.map((m) => m.contact?.phone).find(Boolean)),
      ghlContactId: contact?.id ?? "",
      stage: stageNames.get(latest.pipelineStageId) ?? "Sin etapa",
      wonAt: wonDate(first),
      opportunities: members.map((m) => ({
        id: m.id,
        name: m.name,
        monetaryValue: Math.round(m.monetaryValue ?? 0),
        stageId: m.pipelineStageId,
        stageName: stageNames.get(m.pipelineStageId) ?? "Sin etapa",
        wonAt: wonDate(m),
        updatedAt: m.updatedAt,
      })),
    }
  })
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `pnpm vitest run src/lib/clients/group.test.ts`
Expected: PASS, 6 pruebas. (Si "agrupa contactos distintos…" falla porque `c_new` llega antes en `sorted`, revisa el orden: `sorted` va por `wonDate` ascendente, así que `c_old` (2026-01-01) abre el grupo.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients/group.ts src/lib/clients/group.test.ts
git commit -m "Agrupa oportunidades ganadas por contacto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tipos, esquema, demo y seed

**Files:**
- Modify: `src/lib/types.ts:5-28`
- Modify: `src/db/schema.ts:17-33`
- Modify: `src/data/demo.ts:15-~200` (bloque `clients`)
- Modify: `src/db/seed.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: tipos `Client`, `ClientOpportunity`, `StripeLink`, `LinkedBy`; tablas `clients`, `clientOpportunities`, `clientStripeCustomers`; `demo.clients`, `demo.clientOpportunities`, `demo.stripeLinks`.

- [ ] **Step 1: Tipos**

En `src/lib/types.ts` reemplaza desde `export type Plan` hasta el cierre de `Client` por:

```ts
export type LinkedBy = "auto" | "manual"

/**
 * Un cliente es un contacto de la subcuenta Lezgo Suite con al menos una
 * oportunidad ganada. Los enlaces a Stripe viven en `StripeLink`; el de la
 * subcuenta de GHL, aquí mismo.
 */
export type Client = {
  /** Id del contacto en GHL. Agrupa sus oportunidades. */
  id: string
  slug: string
  /** Empresa del contacto; si no hay, el nombre del contacto. */
  name: string
  contactName: string
  email: string | null
  phone: string | null
  ghlContactId: string
  /** Subcuenta del cliente. `null` hasta que se enlaza. */
  ghlLocationId: string | null
  ghlLocationLinkedBy: LinkedBy | null
  /** Etapa de su oportunidad más reciente, tal cual la nombra el pipeline. */
  stage: string
  /** Cierre más antiguo entre sus oportunidades. */
  wonAt: string
  syncedAt: string
  /** No apareció en la última sincronización. No se borra. */
  orphaned: boolean
  notes: string | null
}

export type ClientOpportunity = {
  id: string
  clientId: string
  name: string
  /** Pesos enteros, como lo entrega GHL. */
  monetaryValue: number
  stageId: string
  stageName: string
  wonAt: string
  updatedAt: string
}

export type StripeLink = {
  stripeCustomerId: string
  clientId: string
  linkedBy: LinkedBy
  linkedAt: string
}
```

Borra `Plan` y `ClientStatus` (ya nadie los usa al terminar la Task 4).

- [ ] **Step 2: Esquema**

En `src/db/schema.ts` reemplaza la tabla `clients` por:

```ts
export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ghlContactId: text("ghl_contact_id").notNull(),
  ghlLocationId: text("ghl_location_id"),
  ghlLocationLinkedBy: text("ghl_location_linked_by"),
  stage: text("stage").notNull(),
  wonAt: date("won_at", { mode: "string" }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }).notNull(),
  orphaned: boolean("orphaned").notNull().default(false),
  notes: text("notes"),
})

export const clientOpportunities = pgTable("client_opportunities", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  monetaryValue: integer("monetary_value").notNull().default(0),
  stageId: text("stage_id").notNull(),
  stageName: text("stage_name").notNull(),
  wonAt: date("won_at", { mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
})

export const clientStripeCustomers = pgTable("client_stripe_customers", {
  stripeCustomerId: text("stripe_customer_id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  linkedBy: text("linked_by").notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true, mode: "string" }).notNull(),
})
```

Actualiza el comentario de cabecera: "Money is stored in whole dollars" ya solo aplica a `invoices`.

- [ ] **Step 3: Demo**

En `src/data/demo.ts` reemplaza el array `clients` completo por uno con los mismos 12 ids (implementaciones, facturas y actividad los referencian) en la forma nueva. Agrega los dos arrays nuevos. Importa `ClientOpportunity` y `StripeLink` de `@/lib/types`.

```ts
const synced = "2026-09-21T09:00:00.000Z"

const demoClient = (
  id: string,
  slug: string,
  name: string,
  contactName: string,
  email: string,
  stage: string,
  wonAt: string,
  extra: Partial<Client> = {},
): Client => ({
  id,
  slug,
  name,
  contactName,
  email,
  phone: null,
  ghlContactId: id,
  ghlLocationId: null,
  ghlLocationLinkedBy: null,
  stage,
  wonAt,
  syncedAt: synced,
  orphaned: false,
  notes: null,
  ...extra,
})

export const clients: Client[] = [
  demoClient("cl_northgate", "northgate-dental", "Northgate Dental Group", "Ana Torres", "ana@northgate.example", "Cliente Activo", "2024-11-04", { ghlLocationId: "loc_9Xk2Qm4Tb", ghlLocationLinkedBy: "auto", notes: "Seis sucursales sobre un mismo snapshot." }),
  demoClient("cl_veloz", "veloz-auto", "Veloz Auto Group", "Marco Vela", "marco@veloz.example", "Cliente Activo", "2025-02-10", { ghlLocationId: "loc_Vz8Lp3Rq", ghlLocationLinkedBy: "manual" }),
  demoClient("cl_lumen", "lumen-aesthetics", "Lumen Aesthetics", "Sofía Luna", "sofia@lumen.example", "Proceso de Implementación", "2026-07-15"),
  demoClient("cl_cascade", "cascade-roofing", "Cascade Roofing Co.", "Tom Reyes", "tom@cascade.example", "Cliente Activo", "2025-06-01", { ghlLocationId: "loc_Cs4Rf7Wn" , ghlLocationLinkedBy: "auto" }),
  demoClient("cl_pinebrook", "pinebrook-legal", "Pinebrook Legal", "Laura Pine", "laura@pinebrook.example", "Cliente Activo", "2025-09-12"),
  demoClient("cl_atlas", "atlas-fitness", "Atlas Fitness Collective", "Diego Atlas", "diego@atlas.example", "Proceso de Implementación", "2026-08-01"),
  demoClient("cl_meridian", "meridian-wealth", "Meridian Wealth Partners", "Elena Mar", "elena@meridian.example", "Activo con Servicio Técnico Dedicado", "2025-01-20", { ghlLocationId: "loc_Md2Wl9Pk", ghlLocationLinkedBy: "auto" }),
  demoClient("cl_harborview", "harborview-realty", "Harborview Realty", "Pablo Haro", "pablo@harborview.example", "Cliente Activo", "2025-11-03"),
  demoClient("cl_brightpath", "brightpath-tutoring", "Brightpath Tutoring", "Rita Bright", "rita@brightpath.example", "Proceso de Implementación", "2026-08-05"),
  demoClient("cl_solstice", "solstice-home-care", "Solstice Home Care", "Iván Sol", "ivan@solstice.example", "Cliente Activo", "2025-04-18"),
  demoClient("cl_ridgeline", "ridgeline-landscaping", "Ridgeline Landscaping", "Nora Ridge", "nora@ridgeline.example", "Servicio Terminado", "2024-08-30", { orphaned: true }),
  demoClient("cl_juniper", "juniper-interiors", "Juniper Interiors", "Julia Pérez", "julia@juniper.example", "Cliente Activo", "2025-12-01"),
]

export const clientOpportunities: ClientOpportunity[] = clients.map((c) => ({
  id: `opp_${c.id}`,
  clientId: c.id,
  name: `${c.name} — Suite`,
  monetaryValue: 3527,
  stageId: "st_demo",
  stageName: c.stage,
  wonAt: c.wonAt,
  updatedAt: synced,
}))

export const stripeLinks: StripeLink[] = [
  { stripeCustomerId: "cus_demo_northgate", clientId: "cl_northgate", linkedBy: "auto", linkedAt: synced },
  { stripeCustomerId: "cus_demo_veloz", clientId: "cl_veloz", linkedBy: "manual", linkedAt: synced },
]
```

Revisa que los slugs nuevos coincidan con los que ya usaba el demo (`grep -n "slug:" src/data/demo.ts` antes de borrar) para no romper enlaces internos; si difieren, usa los viejos.

- [ ] **Step 4: Seed**

En `src/db/seed.ts`:

```ts
  await db.delete(schema.activity)
  await db.delete(schema.invoices)
  await db.delete(schema.implementations)
  await db.delete(schema.clientStripeCustomers)
  await db.delete(schema.clientOpportunities)
  await db.delete(schema.clients)
  await db.delete(schema.revenue)

  await db.insert(schema.clients).values(demo.clients)
  await db.insert(schema.clientOpportunities).values(demo.clientOpportunities)
  await db.insert(schema.clientStripeCustomers).values(demo.stripeLinks)
  await db.insert(schema.implementations).values(demo.implementations)
  await db.insert(schema.invoices).values(demo.invoices)
  await db.insert(schema.activity).values(demo.activity)
  await db.insert(schema.revenue).values(demo.revenue)
```

- [ ] **Step 5: `.env.example`**

Agrega después del bloque de `GHL_LOCATION_ID`:

```bash
# Subcuenta Lezgo Suite: de ahí salen los clientes (oportunidades ganadas del
# pipeline "Ventas"). El token de agencia NO puede leer oportunidades de una
# subcuenta; hace falta un Private Integration Token creado dentro de ella,
# con opportunities.readonly y contacts.readonly.
GHL_LEZGO_SUITE_TOKEN=
GHL_LEZGO_SUITE_LOCATION_ID=uRFrk77agXq9is0a0gkp
```

- [ ] **Step 6: Verificar lo que se puede**

Run: `pnpm vitest run`
Expected: PASS (match, group y las pruebas de Stripe existentes).
Run: `pnpm typecheck`
Expected: FALLA en consumidores (`clients-table.tsx`, `repository.ts`, `page.tsx`, `tools.ts`…). Es lo esperado hasta la Task 4. **No** debe fallar en `types.ts`, `schema.ts`, `demo.ts` ni `seed.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/db/schema.ts src/data/demo.ts src/db/seed.ts .env.example
git commit -m "Redefine el cliente: contacto de GHL con enlaces a Stripe y subcuenta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Repositorio y consumidores

**Files:**
- Modify: `src/lib/stripe/client.ts` (agregar `summarizeSubscriptions`)
- Modify: `src/lib/ghl/client.ts:227-246, 301-306` (opportunities con paginación; locations paginadas)
- Modify: `src/lib/repository.ts`
- Modify: `src/components/panel/telemetry-band.tsx`
- Modify: `src/app/(panel)/page.tsx:41-80, 95-105`
- Modify: `src/app/(panel)/ajustes/page.tsx:20-30, 178-200`
- Modify: `src/components/shell/command-menu.tsx:84-95`
- Modify: `src/lib/ai/tools.ts:67-89`
- Modify: `src/components/signal/status-chip.tsx` (quitar `clientStatusLabel`, agregar `stageTone`)

**Interfaces:**
- Produces (repository):
  ```ts
  export type ClientRow = Client & { locationName: string | null; stripeCount: number; mrr: number | null }
  export type StripeCustomerOption = { id: string; name: string; email: string | null; active: boolean; mrr: number | null }
  export type LocationOption = { id: string; name: string; email: string | null }
  export type ClientDetail = {
    client: Client; opportunities: ClientOpportunity[]
    stripe: (StripeLink & { name: string; email: string | null; active: boolean; mrr: number | null })[]
    location: LocationOption | null
    mrr: number | null
  }
  export async function listClients(): Promise<Client[]>
  export async function listClientRows(): Promise<ClientRow[]>
  export async function getClient(slug: string): Promise<Client | undefined>
  export async function getClientDetail(slug: string): Promise<ClientDetail | undefined>
  export async function listStripeLinks(): Promise<StripeLink[]>
  export async function listStripeCustomerOptions(): Promise<{ options: StripeCustomerOption[]; error: string | null }>
  export async function listLocationOptions(): Promise<{ options: LocationOption[]; error: string | null }>
  export async function lastSyncAt(): Promise<string | null>
  ```
  `mrr` siempre en **centavos de la moneda base** (`baseCurrency()`), `null` si no hay suscripciones convertibles.
- Produces (stripe/client): `summarizeSubscriptions(): Promise<Map<string, { amount: number; currency: Currency }[]>>` — por `cus_`, cada suscripción activa mensualizada en centavos.
- Produces (ghl/client): `searchOpportunities` devuelve `{ opportunities: GhlOpportunity[]; meta: { total: number; startAfter?: number; startAfterId?: string; nextPageUrl?: string } }` y acepta `startAfter`, `startAfterId`, `token`; `GhlOpportunity` gana `contact`, `createdAt`, `lastStatusChangeAt`; `listAllLocations()` pagina con `skip`.

- [ ] **Step 1: Stripe — suscripciones mensualizadas**

Al final de `src/lib/stripe/client.ts`:

```ts
import type { Currency } from "@/lib/types"   // arriba, junto al import de Stripe

/**
 * Suscripciones activas agrupadas por cliente y llevadas a mes: una anual
 * cuenta por su doceava parte. Solo mes y año; semana y día no se usan aquí.
 */
export async function summarizeSubscriptions() {
  const subs = await listActiveSubscriptions()
  const out = new Map<string, { amount: number; currency: Currency }[]>()
  for (const s of subs) {
    const cus = typeof s.customer === "string" ? s.customer : s.customer.id
    for (const item of s.items.data) {
      const price = item.price
      const unit = price.unit_amount ?? 0
      const qty = item.quantity ?? 1
      const rec = price.recurring
      if (!rec || unit === 0) continue
      const c = price.currency.toLowerCase()
      if (c !== "mxn" && c !== "usd") continue
      const perMonth =
        rec.interval === "month"
          ? (unit * qty) / rec.interval_count
          : rec.interval === "year"
            ? (unit * qty) / (12 * rec.interval_count)
            : 0
      if (!perMonth) continue
      out.set(cus, [...(out.get(cus) ?? []), { amount: Math.round(perMonth), currency: c }])
    }
  }
  return out
}
```

- [ ] **Step 2: GHL — oportunidades con contacto y paginación; locations completas**

En `src/lib/ghl/client.ts`, amplía `GhlOpportunity`:

```ts
export type GhlOpportunity = {
  id: string
  name: string
  pipelineId: string
  pipelineStageId: string
  status: "open" | "won" | "lost" | "abandoned"
  monetaryValue?: number | null
  contactId?: string
  assignedTo?: string
  createdAt?: string
  updatedAt?: string
  lastStatusChangeAt?: string | null
  /** Solo lo devuelve `GET /opportunities/search`. */
  contact?: {
    id: string
    name?: string | null
    companyName?: string | null
    email?: string | null
    phone?: string | null
  } | null
}
```

Reemplaza `searchOpportunities`:

```ts
  /**
   * `pipeline_id` va en snake_case aquí (verificado contra la API); el resto
   * de campos de búsqueda no. La paginación es por cursor: `meta.startAfter`
   * y `meta.startAfterId` de la respuesta anterior.
   */
  searchOpportunities(params: {
    locationId?: string
    pipelineId?: string
    status?: GhlOpportunity["status"]
    limit?: number
    startAfter?: number
    startAfterId?: string
    token?: string
  }) {
    return this.request<{
      opportunities: GhlOpportunity[]
      meta: { total: number; startAfter?: number; startAfterId?: string; nextPageUrl?: string }
    }>("/opportunities/search", {
      token: params.token,
      query: {
        location_id: this.locationOrThrow(params.locationId),
        pipeline_id: params.pipelineId,
        status: params.status,
        limit: params.limit ?? 25,
        startAfter: params.startAfter,
        startAfterId: params.startAfterId,
      },
    })
  }
```

Añade `token?: string` a `listPipelines(locationId?: string, token?: string)` pasándolo a `request`. Y debajo de `searchLocations`:

```ts
  /** Todas las subcuentas de la agencia. Pagina de 100 en 100 con `skip`. */
  async listAllLocations() {
    const all: GhlLocation[] = []
    for (let skip = 0; ; skip += 100) {
      const { locations } = await this.searchLocations({ limit: 100, skip })
      all.push(...locations)
      if (locations.length < 100) return all
    }
  }
```

Actualiza la nota de CLAUDE.md en la Task 8 (hoy dice `pipelineId` en camelCase; lo verificado en esta sesión con curl es `pipeline_id`).

- [ ] **Step 3: `status-chip.tsx`**

Quita `clientStatusLabel` y `ClientStatus` del import. Agrega:

```ts
/** Las etapas del pipeline "Ventas" de Lezgo Suite, por nombre. Lo que no se reconoce va en gris. */
export function stageTone(stage: string): "live" | "build" | "warn" | "risk" | "idle" {
  const s = stage.toLowerCase()
  if (s.includes("activo")) return "live"
  if (s.includes("implementaci")) return "build"
  if (s.includes("terminado") || s.includes("perdido")) return "idle"
  return "idle"
}
```

- [ ] **Step 4: Repositorio**

Reescribe `src/lib/repository.ts` (mantén `usdToMxnRate`, `baseCurrency`, `rowToInvoice`, `neonInvoices`, `cachedStripeInvoices`, `listInvoices`, `refreshBilling`, `listActivity`, `listRevenue`, `listImplementations` tal cual). Cambios:

```ts
import { and, desc, eq, inArray, max } from "drizzle-orm"
import { ghl } from "@/lib/ghl/client"
import { listCustomers, listRecentInvoices, stripeEnabled, summarizeSubscriptions } from "@/lib/stripe/client"
import { toMxn } from "@/lib/stripe/map"
import type { ActivityEvent, Client, ClientOpportunity, Currency, Implementation, Invoice, InvoiceRow, RevenuePoint, StripeLink } from "@/lib/types"

export type ClientRow = Client & { locationName: string | null; stripeCount: number; mrr: number | null }
export type StripeCustomerOption = { id: string; name: string; email: string | null; active: boolean; mrr: number | null }
export type LocationOption = { id: string; name: string; email: string | null }
export type ClientDetail = {
  client: Client
  opportunities: ClientOpportunity[]
  stripe: (StripeLink & { name: string; email: string | null; active: boolean; mrr: number | null })[]
  location: LocationOption | null
  mrr: number | null
}

export async function listClients(): Promise<Client[]> {
  if (!db) return demo.clients
  return (await db.select().from(schema.clients).orderBy(schema.clients.name)) as Client[]
}

export async function getClient(slug: string): Promise<Client | undefined> {
  if (!db) return demo.clients.find((c) => c.slug === slug)
  const [row] = await db.select().from(schema.clients).where(eq(schema.clients.slug, slug)).limit(1)
  return row as Client | undefined
}

export async function listStripeLinks(): Promise<StripeLink[]> {
  if (!db) return demo.stripeLinks
  return (await db.select().from(schema.clientStripeCustomers)) as StripeLink[]
}

export async function lastSyncAt(): Promise<string | null> {
  if (!db) return demo.clients[0]?.syncedAt ?? null
  const [row] = await db.select({ at: max(schema.clients.syncedAt) }).from(schema.clients)
  return row?.at ?? null
}

/* ------------------------------------------------------- Stripe (cacheado) */

/**
 * La lista de clientes de Stripe y sus suscripciones cambian poco y pesan:
 * cinco minutos bajo el mismo tag que las facturas, para que "Actualizar"
 * refresque todo junto.
 */
const cachedStripeCustomers = unstable_cache(
  async () => {
    const [customers, subs] = await Promise.all([listCustomers(), summarizeSubscriptions()])
    return customers.map((c) => ({
      id: c.id,
      name: c.name?.trim() || c.email || c.id,
      email: c.email ?? null,
      phone: c.phone ?? null,
      subscriptions: subs.get(c.id) ?? [],
    }))
  },
  ["stripe-customers"],
  { revalidate: 300, tags: ["stripe"] },
)

type StripeCustomerSummary = Awaited<ReturnType<typeof cachedStripeCustomers>>[number]

/** Centavos en moneda base, o `null` si ninguna suscripción se puede convertir. */
function mrrOf(subs: { amount: number; currency: Currency }[], base: Currency, fx: number | null) {
  let total: number | null = null
  for (const s of subs) {
    const v = base === "mxn" ? toMxn(s.amount, s.currency, fx) : s.currency === "usd" ? s.amount : null
    if (v === null) continue
    total = (total ?? 0) + v
  }
  return total
}

async function stripeCustomersOrNull(): Promise<{ list: StripeCustomerSummary[]; error: string | null }> {
  if (!stripeEnabled()) return { list: [], error: "Falta STRIPE_SECRET_KEY" }
  try {
    return { list: await cachedStripeCustomers(), error: null }
  } catch (error) {
    console.error("Stripe no respondió", error)
    return { list: [], error: "Stripe no respondió" }
  }
}

export async function listStripeCustomerOptions() {
  const [{ list, error }, links] = await Promise.all([stripeCustomersOrNull(), listStripeLinks()])
  const linked = new Set(links.map((l) => l.stripeCustomerId))
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const options: StripeCustomerOption[] = list
    .filter((c) => !linked.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, email: c.email, active: c.subscriptions.length > 0, mrr: mrrOf(c.subscriptions, base, fx) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"))
  return { options, error }
}

/* ---------------------------------------------------------- GHL locations */

const cachedLocations = unstable_cache(
  async () => {
    const all = await ghl.listAllLocations()
    return all.map((l) => ({ id: l.id, name: l.name.trim(), email: l.email ?? null }))
  },
  ["ghl-locations"],
  { revalidate: 3600, tags: ["ghl-locations"] },
)

export async function listLocationOptions(): Promise<{ options: LocationOption[]; error: string | null }> {
  if (!ghl.isConfigured) return { options: [], error: "Falta GHL_API_KEY" }
  try {
    const options = await cachedLocations()
    return { options: options.sort((a, b) => a.name.localeCompare(b.name, "es")), error: null }
  } catch (error) {
    console.error("GHL no respondió", error)
    return { options: [], error: "GoHighLevel no respondió" }
  }
}

/* ------------------------------------------------------------- vistas */

export async function listClientRows(): Promise<ClientRow[]> {
  const [clients, links, { list: stripe }, { options: locations }] = await Promise.all([
    listClients(),
    listStripeLinks(),
    stripeCustomersOrNull(),
    listLocationOptions(),
  ])
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const stripeById = new Map(stripe.map((c) => [c.id, c]))
  const locationById = new Map(locations.map((l) => [l.id, l.name]))
  const linksByClient = new Map<string, StripeLink[]>()
  for (const l of links) linksByClient.set(l.clientId, [...(linksByClient.get(l.clientId) ?? []), l])

  return clients.map((c) => {
    const mine = linksByClient.get(c.id) ?? []
    const subs = mine.flatMap((l) => stripeById.get(l.stripeCustomerId)?.subscriptions ?? [])
    return {
      ...c,
      locationName: c.ghlLocationId ? (locationById.get(c.ghlLocationId) ?? c.ghlLocationId) : null,
      stripeCount: mine.length,
      mrr: mrrOf(subs, base, fx),
    }
  })
}

export async function getClientDetail(slug: string): Promise<ClientDetail | undefined> {
  const client = await getClient(slug)
  if (!client) return undefined

  const [opportunities, links, { list: stripe }, { options: locations }] = await Promise.all([
    db
      ? (db.select().from(schema.clientOpportunities).where(eq(schema.clientOpportunities.clientId, client.id)).orderBy(desc(schema.clientOpportunities.wonAt)) as Promise<ClientOpportunity[]>)
      : Promise.resolve(demo.clientOpportunities.filter((o) => o.clientId === client.id)),
    listStripeLinks(),
    stripeCustomersOrNull(),
    listLocationOptions(),
  ])
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const stripeById = new Map(stripe.map((c) => [c.id, c]))
  const mine = links.filter((l) => l.clientId === client.id)
  const stripeRows = mine.map((l) => {
    const c = stripeById.get(l.stripeCustomerId)
    return {
      ...l,
      name: c?.name ?? l.stripeCustomerId,
      email: c?.email ?? null,
      active: (c?.subscriptions.length ?? 0) > 0,
      mrr: c ? mrrOf(c.subscriptions, base, fx) : null,
    }
  })
  return {
    client,
    opportunities,
    stripe: stripeRows,
    location: client.ghlLocationId ? (locations.find((l) => l.id === client.ghlLocationId) ?? { id: client.ghlLocationId, name: client.ghlLocationId, email: null }) : null,
    mrr: mrrOf(mine.flatMap((l) => stripeById.get(l.stripeCustomerId)?.subscriptions ?? []), base, fx),
  }
}
```

`getBillingFeed`: los pares salen ahora de los enlaces:

```ts
  const links = await listStripeLinks()
  const pares = links
    .map((l) => [l.stripeCustomerId, l.clientId] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))
```

`getPortfolioSummary`: quita `mrr` de clientes, `atRisk` y `health`. Devuelve:

```ts
export async function getPortfolioSummary() {
  const [rows, implementations, invoices, revenue] = await Promise.all([
    listClientRows(),
    listImplementations(),
    listInvoices(),
    listRevenue(),
  ])
  const clients: Client[] = rows
  const active = rows.filter((c) => !c.orphaned)
  const mrr = active.reduce((sum, c) => sum + (c.mrr ?? 0), 0)
  const previous = revenue.at(-2)?.recurring ?? null
  const mrrDelta = previous ? ((mrr / 100 - previous) / previous) * 100 : 0
  const outstanding = invoices.filter((i) => i.status === "overdue" || i.status === "due").reduce((sum, i) => sum + (i.amountBase ?? 0), 0)
  const overdueCount = invoices.filter((i) => i.status === "overdue").length
  const inFlight = implementations.filter((i) => i.stage !== "live")
  const blocked = implementations.filter((i) => i.blocked)
  const unlinked = active.filter((c) => c.stripeCount === 0 || !c.ghlLocationId)

  return {
    baseCurrency: baseCurrency(),
    clients,
    rows,
    implementations,
    invoices,
    revenue,
    /** Centavos en moneda base, sumados desde las suscripciones activas de Stripe. */
    mrr,
    mrrDelta,
    activeCount: active.length,
    outstanding,
    overdueCount,
    inFlightCount: inFlight.length,
    blockedCount: blocked.length,
    unlinked,
  }
}
```

Nota: `revenue.recurring` del demo son dólares enteros y el `mrr` nuevo son centavos de la base; `mrrDelta` con datos reales no es comparable. Déjalo pero rotúlalo en la banda como "vs. serie histórica" solo cuando `source` sea demo — o más simple: en la banda muestra `mrrDelta` únicamente si `!stripeEnabled()`. Elige la simple.

- [ ] **Step 5: `telemetry-band.tsx`**

Cambia las props `health: number` por `unlinked: number`, y `mrr` pasa a centavos. Línea 44: `money(mrr, baseCurrency)`. Línea 53: muestra `percent(mrrDelta, 1)` solo si `showDelta` (nueva prop booleana). Reemplaza el instrumento de salud (líneas ~100-110) por:

```tsx
        <div className="…misma clase que el tile anterior…">
          <p className="eyebrow">Sin enlazar</p>
          <span className="num text-[26px] leading-none font-semibold">{unlinked}</span>
          <p className="mt-1 text-xs text-muted-foreground">clientes sin Stripe o sin subcuenta</p>
        </div>
```

Quita los imports de `SignalMeter`/`toneForHealth` si ya no se usan en el archivo.

- [ ] **Step 6: Tablero `src/app/(panel)/page.tsx`**

Reemplaza el bloque `...summary.atRisk.map(...)` por:

```tsx
    ...summary.unlinked.slice(0, 5).map((c) => ({
      id: c.id,
      tone: "warn" as const,
      kind: "Cliente sin enlazar",
      title: c.name,
      client: c.contactName,
      detail: c.stripeCount === 0 ? "Sin cliente de Stripe." : "Sin subcuenta de GoHighLevel.",
      href: `/clientes/${c.slug}`,
    })),
```

Y en `<TelemetryBand>`: `unlinked={summary.unlinked.length}`, `showDelta={!summary.rows.some((r) => r.mrr !== null)}`, quita `health`.

- [ ] **Step 7: `ajustes/page.tsx`**

Quita `team` (línea 22) y el instrumento "Equipo" (líneas ~180-200). Agrega una conexión a `connections`:

```ts
    {
      name: "GoHighLevel · subcuenta Lezgo Suite",
      variable: "GHL_LEZGO_SUITE_TOKEN",
      ready: Boolean(process.env.GHL_LEZGO_SUITE_TOKEN),
      detail: "Token privado de la subcuenta. De ahí salen los clientes (oportunidades ganadas).",
    },
```

- [ ] **Step 8: `command-menu.tsx` (solo líneas 84-95)**

```tsx
                <CommandItem
                  key={client.id}
                  value={`${client.name} ${client.contactName}`}
                  onSelect={() => go(`/clientes/${client.slug}`)}
                >
                  <span>{client.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {client.contactName}
                  </span>
                </CommandItem>
```

No toques nada más de ese archivo: tiene cambios sin commitear de otro trabajo. Commitea con `git add -p src/components/shell/command-menu.tsx` y acepta solo este hunk.

- [ ] **Step 9: `tools.ts` `findClients`**

```ts
  findClients: tool({
    description:
      "Look up clients in the panel by name, contact, email or pipeline stage.",
    inputSchema: z.object({
      query: z.string().optional().describe("Matches company, contact name or email."),
      stage: z.string().optional().describe("Pipeline stage name, partial match."),
    }),
    execute: async ({ query, stage }) => {
      const all = await listClients()
      const q = query?.toLowerCase()
      const s = stage?.toLowerCase()
      return all.filter(
        (c) =>
          (!q ||
            c.name.toLowerCase().includes(q) ||
            c.contactName.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q)) &&
          (!s || c.stage.toLowerCase().includes(s)),
      )
    },
  }),
```

En `portfolioSummary` (líneas ~55-63) quita `clientsAtRisk` y `averageHealth`; agrega `unlinkedClients: s.unlinked.map((c) => c.name)`.

- [ ] **Step 10: Clientes — placeholder mínimo para que compile**

`src/components/clients/clients-table.tsx` y `src/app/(panel)/clientes/*` se reescriben en las Tasks 6 y 7. Para que `tsc` pase ahora, deja `clients-table.tsx` así (se reemplaza después):

```tsx
"use client"

import type { ClientRow } from "@/lib/repository"

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  return <p className="px-4 py-6 text-sm text-muted-foreground">{clients.length} clientes</p>
}
```

`clientes/page.tsx`: usa `listClientRows()` en vez de `getPortfolioSummary()` y pasa `hint={`${rows.length} clientes`}`. `clientes/[slug]/page.tsx`: cambia a `getClientDetail`, borra las `Fact` de MRR/Salud/Usuarios/Renueva y el `Row` de Responsable/Sector/Plan, y `eyebrow={client.stage}`; el resto se rehace en Task 7.

Nota: `ClientRow` se importa desde `@/lib/repository`, que es `server-only`. Para un componente cliente, **mueve los tipos** `ClientRow`, `StripeCustomerOption`, `LocationOption`, `ClientDetail` a `src/lib/types.ts` y reexpórtalos desde el repositorio. Hazlo ya, en este paso.

- [ ] **Step 11: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: todo en verde.
Run: `pnpm dev` y abre `/`, `/clientes`, `/clientes/northgate-dental`, `/ajustes`, `/facturacion`, `/implementaciones` **sin** `DATABASE_URL` (renombra la variable temporalmente en `.env.local` o exporta `DATABASE_URL=` vacía) y luego con ella. Nada debe tronar. La banda muestra "Sin enlazar".

- [ ] **Step 12: Commit**

```bash
git add src/lib/stripe/client.ts src/lib/ghl/client.ts src/lib/repository.ts src/lib/types.ts \
  src/components/panel/telemetry-band.tsx src/components/signal/status-chip.tsx \
  "src/app/(panel)/page.tsx" "src/app/(panel)/ajustes/page.tsx" src/lib/ai/tools.ts \
  src/components/clients/clients-table.tsx "src/app/(panel)/clientes/page.tsx" "src/app/(panel)/clientes/[slug]/page.tsx"
git add -p src/components/shell/command-menu.tsx   # solo el hunk de contactName
git commit -m "El repositorio sirve clientes de GHL con MRR desde Stripe

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Sync con GHL, auto-enlace y server actions

**Files:**
- Create: `src/lib/ghl/lezgo-suite.ts`
- Create: `src/lib/clients/sync.ts`
- Create: `src/app/(panel)/clientes/actions.ts`
- Test: `src/lib/clients/sync.test.ts` (solo la parte pura: `planUpserts`)

**Interfaces:**
- Consumes: `groupWonOpportunities`, `autoLink`, `GhlClient.searchOpportunities/listPipelines`, `listAllLocations`, `listCustomers`.
- Produces:
  ```ts
  // lezgo-suite.ts
  export const LEZGO_SUITE_LOCATION_ID: string
  export const VENTAS_PIPELINE_ID = "6O1DrEbm0UGM1n0urShw"
  export function lezgoSuiteEnabled(): boolean
  export const lezgoSuite: GhlClient
  // sync.ts
  export type SyncResult = { ok: true; clients: number; orphaned: number; stripeLinked: number; locationsLinked: number } | { ok: false; error: string }
  export async function syncClientsFromGhl(): Promise<SyncResult>
  export function planUpserts(drafts: ClientDraft[], existing: Pick<Client, "id" | "slug">[]): { upserts: ClientDraft[]; orphanIds: string[] }
  // actions.ts
  export async function syncClients(): Promise<SyncResult>
  export async function linkStripeCustomer(clientId: string, customerId: string): Promise<{ ok: true } | { ok: false; error: string }>
  export async function unlinkStripeCustomer(customerId: string): Promise<{ ok: true } | { ok: false; error: string }>
  export async function linkGhlLocation(clientId: string, locationId: string): Promise<{ ok: true } | { ok: false; error: string }>
  export async function unlinkGhlLocation(clientId: string): Promise<{ ok: true } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Cliente de la subcuenta**

```ts
// src/lib/ghl/lezgo-suite.ts
import "server-only"

import { GhlClient } from "./client"

/**
 * El token de agencia lista subcuentas pero no puede leer sus oportunidades
 * (401). Este cliente usa un Private Integration Token creado dentro de la
 * subcuenta Lezgo Suite, que es de donde salen los clientes del panel.
 */
export const LEZGO_SUITE_LOCATION_ID =
  process.env.GHL_LEZGO_SUITE_LOCATION_ID ?? "uRFrk77agXq9is0a0gkp"

export const VENTAS_PIPELINE_ID = "6O1DrEbm0UGM1n0urShw"

export function lezgoSuiteEnabled() {
  return Boolean(process.env.GHL_LEZGO_SUITE_TOKEN)
}

export const lezgoSuite = new GhlClient(
  process.env.GHL_LEZGO_SUITE_TOKEN,
  LEZGO_SUITE_LOCATION_ID,
)
```

- [ ] **Step 2: Prueba de `planUpserts`**

```ts
// src/lib/clients/sync.test.ts
import { describe, expect, it } from "vitest"

import type { ClientDraft } from "./group"
import { planUpserts } from "./sync"

const draft = (id: string, slug: string): ClientDraft => ({
  id, slug, name: id, contactName: id, email: null, phone: null, ghlContactId: id,
  stage: "Cliente Activo", wonAt: "2026-01-01", opportunities: [],
})

describe("planUpserts", () => {
  it("marca como huérfanos los que ya no llegan y conserva el slug de los que ya existían", () => {
    const { upserts, orphanIds } = planUpserts(
      [draft("a", "a-nuevo"), draft("c", "c")],
      [{ id: "a", slug: "a-viejo" }, { id: "b", slug: "b" }],
    )
    expect(orphanIds).toEqual(["b"])
    expect(upserts.map((u) => [u.id, u.slug])).toEqual([["a", "a-viejo"], ["c", "c"]])
  })

  it("si un slug nuevo choca con el de otro cliente existente, le agrega sufijo", () => {
    const { upserts } = planUpserts(
      [draft("nuevo", "sergio-lujano")],
      [{ id: "viejo", slug: "sergio-lujano" }],
    )
    expect(upserts[0].slug).toBe("sergio-lujano-2")
  })
})
```

Run: `pnpm vitest run src/lib/clients/sync.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Sync**

```ts
// src/lib/clients/sync.ts
import "server-only"

import { eq, inArray, notInArray, sql } from "drizzle-orm"

import { db, schema } from "@/db"
import { ghl, GhlError } from "@/lib/ghl/client"
import { lezgoSuite, lezgoSuiteEnabled, VENTAS_PIPELINE_ID } from "@/lib/ghl/lezgo-suite"
import { listCustomers, stripeEnabled } from "@/lib/stripe/client"
import type { Client } from "@/lib/types"

import { groupWonOpportunities, type ClientDraft, type WonOpportunity } from "./group"
import { autoLink, type LinkSubject, type LinkTarget } from "./match"

export type SyncResult =
  | { ok: true; clients: number; orphaned: number; stripeLinked: number; locationsLinked: number }
  | { ok: false; error: string }

/**
 * Decide qué se escribe sin tocar la base: los que llegan se upsertean
 * conservando el slug que ya tenían (las URLs no cambian); los que no llegan
 * se marcan huérfanos. Puro para poder probarlo.
 */
export function planUpserts(
  drafts: ClientDraft[],
  existing: Pick<Client, "id" | "slug">[],
) {
  const slugById = new Map(existing.map((c) => [c.id, c.slug]))
  const taken = new Set(existing.map((c) => c.slug))
  const incoming = new Set(drafts.map((d) => d.id))

  const upserts = drafts.map((d) => {
    const kept = slugById.get(d.id)
    if (kept) return { ...d, slug: kept }
    let slug = d.slug
    for (let n = 2; taken.has(slug); n++) slug = `${d.slug}-${n}`
    taken.add(slug)
    return { ...d, slug }
  })
  const orphanIds = existing.filter((c) => !incoming.has(c.id)).map((c) => c.id)
  return { upserts, orphanIds }
}

async function fetchWon(): Promise<WonOpportunity[]> {
  const out: WonOpportunity[] = []
  let startAfter: number | undefined
  let startAfterId: string | undefined
  for (;;) {
    const page = await lezgoSuite.searchOpportunities({
      pipelineId: VENTAS_PIPELINE_ID,
      status: "won",
      limit: 100,
      startAfter,
      startAfterId,
    })
    for (const o of page.opportunities) {
      out.push({
        id: o.id,
        name: o.name,
        monetaryValue: o.monetaryValue ?? null,
        pipelineStageId: o.pipelineStageId,
        createdAt: o.createdAt ?? new Date().toISOString(),
        updatedAt: o.updatedAt ?? o.createdAt ?? new Date().toISOString(),
        lastStatusChangeAt: o.lastStatusChangeAt ?? null,
        contact: o.contact
          ? { id: o.contact.id, name: o.contact.name ?? null, companyName: o.contact.companyName ?? null, email: o.contact.email ?? null, phone: o.contact.phone ?? null }
          : null,
      })
    }
    if (page.opportunities.length < 100 || !page.meta?.startAfterId) return out
    startAfter = page.meta.startAfter
    startAfterId = page.meta.startAfterId
  }
}

function toSubject(c: { id: string; name: string; contactName: string; email: string | null; phone: string | null }, extraNames: string[] = []): LinkSubject {
  return { id: c.id, names: [c.name, c.contactName, ...extraNames], email: c.email, phone: c.phone }
}

/**
 * Lee las ganadas del pipeline Ventas, las agrupa por contacto, hace upsert
 * en Neon y enlaza en automático lo que coincide exacto. Nunca lanza.
 */
export async function syncClientsFromGhl(): Promise<SyncResult> {
  if (!db) return { ok: false, error: "Falta DATABASE_URL" }
  if (!lezgoSuiteEnabled()) return { ok: false, error: "Falta GHL_LEZGO_SUITE_TOKEN" }

  try {
    const [won, { pipelines }] = await Promise.all([fetchWon(), lezgoSuite.listPipelines()])
    const ventas = pipelines.find((p) => p.id === VENTAS_PIPELINE_ID)
    const stageNames = new Map((ventas?.stages ?? []).map((s) => [s.id, s.name]))
    const drafts = groupWonOpportunities(won, stageNames)

    const existing = await db.select({ id: schema.clients.id, slug: schema.clients.slug }).from(schema.clients)
    const { upserts, orphanIds } = planUpserts(drafts, existing)
    const now = new Date().toISOString()

    for (const d of upserts) {
      await db
        .insert(schema.clients)
        .values({
          id: d.id, slug: d.slug, name: d.name, contactName: d.contactName, email: d.email, phone: d.phone,
          ghlContactId: d.ghlContactId, stage: d.stage, wonAt: d.wonAt, syncedAt: now, orphaned: false,
        })
        .onConflictDoUpdate({
          target: schema.clients.id,
          set: { name: d.name, contactName: d.contactName, email: d.email, phone: d.phone, ghlContactId: d.ghlContactId, stage: d.stage, wonAt: d.wonAt, syncedAt: now, orphaned: false },
        })
      for (const o of d.opportunities) {
        await db
          .insert(schema.clientOpportunities)
          .values({ ...o, clientId: d.id })
          .onConflictDoUpdate({ target: schema.clientOpportunities.id, set: { ...o, clientId: d.id } })
      }
    }
    if (orphanIds.length) {
      await db.update(schema.clients).set({ orphaned: true }).where(inArray(schema.clients.id, orphanIds))
    }

    const stripeLinked = await autoLinkStripe(upserts)
    const locationsLinked = await autoLinkLocations(upserts)

    return { ok: true, clients: upserts.length, orphaned: orphanIds.length, stripeLinked, locationsLinked }
  } catch (error) {
    const message = error instanceof GhlError ? `GoHighLevel: ${error.message}` : String(error)
    console.error("Sync de clientes falló", error)
    return { ok: false, error: message }
  }
}

/** Solo clientes sin ningún enlace; solo cus_ que nadie tiene. */
async function autoLinkStripe(drafts: ClientDraft[]) {
  if (!db || !stripeEnabled()) return 0
  const links = await db.select().from(schema.clientStripeCustomers)
  const linkedCus = new Set(links.map((l) => l.stripeCustomerId))
  const linkedClients = new Set(links.map((l) => l.clientId))

  const subjects = drafts
    .filter((d) => !linkedClients.has(d.id))
    .map((d) => toSubject(d, d.opportunities.map((o) => o.name)))
  if (!subjects.length) return 0

  const customers = await listCustomers()
  const targets: LinkTarget[] = customers
    .filter((c) => !linkedCus.has(c.id))
    .map((c) => ({ id: c.id, name: c.name ?? null, email: c.email ?? null, phone: c.phone ?? null }))

  const found = autoLink(subjects, targets, "many")
  const now = new Date().toISOString()
  for (const [cus, clientId] of found) {
    await db
      .insert(schema.clientStripeCustomers)
      .values({ stripeCustomerId: cus, clientId, linkedBy: "auto", linkedAt: now })
      .onConflictDoNothing()
  }
  return found.size
}

async function autoLinkLocations(drafts: ClientDraft[]) {
  if (!db || !ghl.isConfigured) return 0
  const rows = await db.select({ id: schema.clients.id, ghlLocationId: schema.clients.ghlLocationId }).from(schema.clients)
  const withLocation = new Set(rows.filter((r) => r.ghlLocationId).map((r) => r.id))
  const usedLocations = new Set(rows.map((r) => r.ghlLocationId).filter(Boolean) as string[])

  const subjects = drafts
    .filter((d) => !withLocation.has(d.id))
    .map((d) => toSubject(d, d.opportunities.map((o) => o.name)))
  if (!subjects.length) return 0

  const locations = await ghl.listAllLocations()
  const targets: LinkTarget[] = locations
    .filter((l) => !usedLocations.has(l.id))
    .map((l) => ({ id: l.id, name: l.name, email: l.email ?? null, phone: l.phone ?? null }))

  const found = autoLink(subjects, targets, "one")
  for (const [locationId, clientId] of found) {
    await db
      .update(schema.clients)
      .set({ ghlLocationId: locationId, ghlLocationLinkedBy: "auto" })
      .where(eq(schema.clients.id, clientId))
  }
  return found.size
}
```

Quita los imports que no uses (`notInArray`, `sql`) para que lint pase.

- [ ] **Step 4: Server actions**

```ts
// src/app/(panel)/clientes/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { syncClientsFromGhl, type SyncResult } from "@/lib/clients/sync"

type Result = { ok: true } | { ok: false; error: string }

function refresh() {
  revalidatePath("/clientes", "layout")
  revalidatePath("/")
  revalidatePath("/facturacion")
}

export async function syncClients(): Promise<SyncResult> {
  const result = await syncClientsFromGhl()
  refresh()
  return result
}

/** Un cus_ tiene un solo dueño: si ya está enlazado, se dice a quién. */
export async function linkStripeCustomer(clientId: string, customerId: string): Promise<Result> {
  if (!db) return { ok: false, error: "Sin base de datos: los enlaces no se guardan en modo demo." }
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) return { ok: false, error: "Id de Stripe inválido." }
  const [taken] = await db
    .select({ clientId: schema.clientStripeCustomers.clientId, name: schema.clients.name })
    .from(schema.clientStripeCustomers)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.clientStripeCustomers.clientId))
    .where(eq(schema.clientStripeCustomers.stripeCustomerId, customerId))
  if (taken && taken.clientId !== clientId) return { ok: false, error: `Ya está enlazado a ${taken.name}.` }
  await db
    .insert(schema.clientStripeCustomers)
    .values({ stripeCustomerId: customerId, clientId, linkedBy: "manual", linkedAt: new Date().toISOString() })
    .onConflictDoNothing()
  refresh()
  return { ok: true }
}

export async function unlinkStripeCustomer(customerId: string): Promise<Result> {
  if (!db) return { ok: false, error: "Sin base de datos: los enlaces no se guardan en modo demo." }
  await db.delete(schema.clientStripeCustomers).where(eq(schema.clientStripeCustomers.stripeCustomerId, customerId))
  refresh()
  return { ok: true }
}

export async function linkGhlLocation(clientId: string, locationId: string): Promise<Result> {
  if (!db) return { ok: false, error: "Sin base de datos: los enlaces no se guardan en modo demo." }
  const [taken] = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(eq(schema.clients.ghlLocationId, locationId))
  if (taken && taken.id !== clientId) return { ok: false, error: `Esa subcuenta ya es de ${taken.name}.` }
  await db.update(schema.clients).set({ ghlLocationId: locationId, ghlLocationLinkedBy: "manual" }).where(eq(schema.clients.id, clientId))
  refresh()
  return { ok: true }
}

export async function unlinkGhlLocation(clientId: string): Promise<Result> {
  if (!db) return { ok: false, error: "Sin base de datos: los enlaces no se guardan en modo demo." }
  await db.update(schema.clients).set({ ghlLocationId: null, ghlLocationLinkedBy: null }).where(eq(schema.clients.id, clientId))
  refresh()
  return { ok: true }
}
```

- [ ] **Step 5: Verificar**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: verde.

Aplica el esquema a Neon y corre la sync real (solo lectura en GHL/Stripe, escritura en Neon):

```bash
pnpm db:push        # crea client_opportunities y client_stripe_customers; redefine clients (acepta el drop de columnas: son del demo)
pnpm tsx --env-file=.env.local --conditions=react-server -e 'import("./src/lib/clients/sync.ts").then(m=>m.syncClientsFromGhl()).then(r=>console.log(r))'
```

Expected: `{ ok: true, clients: ~33, orphaned: 12, stripeLinked: ~20, locationsLinked: ~10 }`. Los 12 huérfanos son el seed del demo; bórralos con `pnpm db:seed`? **No**: el seed volvería a meter el demo. Bórralos a mano una sola vez:

```bash
pnpm tsx --env-file=.env.local -e 'import("./src/db/index.ts").then(async({db,schema})=>{const {eq}=await import("drizzle-orm");await db.delete(schema.clients).where(eq(schema.clients.orphaned,true));console.log("ok")})'
```

Si `import("...")` con `server-only` falla en tsx, agrega `--conditions=react-server` como hace `stripe:map`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ghl/lezgo-suite.ts src/lib/clients/sync.ts src/lib/clients/sync.test.ts "src/app/(panel)/clientes/actions.ts"
git commit -m "Sincroniza clientes desde las ganadas de Lezgo Suite y enlaza en automático

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Lista de clientes con sync

**Files:**
- Modify: `src/components/clients/clients-table.tsx` (reescribir)
- Create: `src/components/clients/sync-button.tsx`
- Modify: `src/app/(panel)/clientes/page.tsx`

**Interfaces:**
- Consumes: `listClientRows`, `lastSyncAt`, `syncClients`, `lezgoSuiteEnabled`, `stageTone`, `money`, `baseCurrency`.

- [ ] **Step 1: Botón de sync**

```tsx
// src/components/clients/sync-button.tsx
"use client"

import { useState, useTransition } from "react"
import { RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { SyncResult } from "@/lib/clients/sync"

export function SyncButton({ action, disabled }: { action: () => Promise<SyncResult>; disabled?: boolean }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await action()
            setNote(r.ok ? `${r.clients} clientes · ${r.stripeLinked} enlaces a Stripe · ${r.locationsLinked} subcuentas` : r.error)
          })
        }
        aria-label="Sincronizar clientes con GoHighLevel ahora"
      >
        <RotateCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? "Sincronizando…" : "Sincronizar con GHL"}
      </Button>
    </div>
  )
}
```

Como `sync.ts` es `server-only`, importar solo el **tipo** con `import type` está bien (se borra al compilar).

- [ ] **Step 2: Tabla**

```tsx
// src/components/clients/clients-table.tsx
"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { SearchIcon } from "lucide-react"

import { stageTone, StatusChip } from "@/components/signal/status-chip"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { money, shortDate } from "@/lib/format"
import type { ClientRow, Currency } from "@/lib/types"

type Filter = "todos" | "sin_enlazar" | "huerfanos"
type SortKey = "mrr" | "name" | "wonAt"

const filterLabel: Record<Filter, string> = {
  todos: "Todos",
  sin_enlazar: "Sin enlazar",
  huerfanos: "Sin oportunidad",
}
const sortLabel: Record<SortKey, string> = {
  mrr: "Mayor MRR",
  name: "Nombre A–Z",
  wonAt: "Cierre más reciente",
}

export function ClientsTable({ clients, currency }: { clients: ClientRow[]; currency: Currency }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("todos")
  const [sort, setSort] = useState<SortKey>("mrr")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => {
        if (filter === "sin_enlazar" && c.stripeCount > 0 && c.ghlLocationId) return false
        if (filter === "huerfanos" && !c.orphaned) return false
        if (!q) return true
        return [c.name, c.contactName, c.email ?? "", c.locationName ?? ""].some((s) => s.toLowerCase().includes(q))
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "es")
        if (sort === "wonAt") return b.wonAt.localeCompare(a.wonAt)
        return (b.mrr ?? -1) - (a.mrr ?? -1)
      })
  }, [clients, query, filter, sort])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por empresa, contacto, correo o subcuenta" aria-label="Buscar clientes" className="h-8 pl-8 text-sm" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Filtrar clientes">
            <SelectValue>{(v: string) => filterLabel[v as Filter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(filterLabel) as Filter[]).map((k) => (
              <SelectItem key={k} value={k}>{filterLabel[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger size="sm" className="w-44" aria-label="Ordenar clientes">
            <SelectValue>{(v: string) => sortLabel[v as SortKey]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(sortLabel) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>{sortLabel[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="num ml-auto text-xs text-muted-foreground">{rows.length} de {clients.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Ningún cliente coincide con ese filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Subcuenta GHL</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Cerrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell>
                    <Link href={`/clientes/${c.slug}`} className="block min-w-44">
                      <span className="font-medium group-hover:text-primary">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.contactName}{c.email ? ` · ${c.email}` : ""}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusChip tone={stageTone(c.stage)}>{c.stage}</StatusChip>
                      {c.orphaned && <StatusChip tone="idle">Sin oportunidad</StatusChip>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {c.locationName ?? <StatusChip tone="warn">Sin enlazar</StatusChip>}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {c.stripeCount > 0 ? <span className="num">{c.stripeCount} {c.stripeCount === 1 ? "enlazado" : "enlazados"}</span> : <StatusChip tone="warn">Sin enlazar</StatusChip>}
                  </TableCell>
                  <TableCell data-num className="text-right">
                    {c.mrr === null ? <span className="text-muted-foreground">—</span> : money(c.mrr, currency)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{shortDate(c.wonAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Página**

```tsx
// src/app/(panel)/clientes/page.tsx
import { ClientsTable } from "@/components/clients/clients-table"
import { SyncButton } from "@/components/clients/sync-button"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { syncClientsFromGhl } from "@/lib/clients/sync"
import { lezgoSuiteEnabled } from "@/lib/ghl/lezgo-suite"
import { money } from "@/lib/format"
import { baseCurrency, lastSyncAt, listClientRows } from "@/lib/repository"

import { syncClients } from "./actions"

export const metadata = { title: "Clientes" }

const HOUR = 60 * 60 * 1000

export default async function ClientesPage() {
  const last = await lastSyncAt()
  const stale = !last || Date.now() - new Date(last).getTime() > HOUR
  // Sync silenciosa si la última tiene más de una hora. Si falla, la lista
  // sigue saliendo de Neon y el botón muestra el error al apretarlo.
  if (lezgoSuiteEnabled() && stale) await syncClientsFromGhl()

  const [rows, syncedAt] = await Promise.all([listClientRows(), lastSyncAt()])
  const currency = baseCurrency()
  const active = rows.filter((r) => !r.orphaned)
  const mrr = active.reduce((s, r) => s + (r.mrr ?? 0), 0)
  const unlinked = active.filter((r) => r.stripeCount === 0 || !r.ghlLocationId).length

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Clientes"
        description="Cada oportunidad ganada en Lezgo Suite, agrupada por contacto, con su subcuenta y sus clientes de Stripe."
        actions={<SyncButton action={syncClients} disabled={!lezgoSuiteEnabled()} />}
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        {!lezgoSuiteEnabled() && (
          <p className="rounded-lg border border-status-warn/40 bg-card px-4 py-3 text-sm">
            Falta <code>GHL_LEZGO_SUITE_TOKEN</code>. La lista muestra lo que hay en la base; no se puede sincronizar con GoHighLevel.
          </p>
        )}
        <Instrument
          label="Cartera completa"
          hint={`${active.length} activos · ${money(mrr, currency)} MRR · ${unlinked} sin enlazar${syncedAt ? ` · sync ${new Date(syncedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : ""}`}
        >
          <ClientsTable clients={rows} currency={currency} />
        </Instrument>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint`. Luego `pnpm dev` → `/clientes`: se ven los ~33 clientes reales, chips de etapa, "Sin enlazar" donde toque, MRR con `$` MXN. Aprieta "Sincronizar con GHL": nota con conteos. Filtro "Sin enlazar" reduce la lista.

- [ ] **Step 5: Commit**

```bash
git add src/components/clients/clients-table.tsx src/components/clients/sync-button.tsx "src/app/(panel)/clientes/page.tsx"
git commit -m "Lista de clientes desde GHL con sync y enlaces a la vista

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Ficha con desplegables de enlace

**Files:**
- Create: `src/components/clients/link-picker.tsx`
- Create: `src/components/clients/stripe-links.tsx`
- Create: `src/components/clients/location-link.tsx`
- Modify: `src/app/(panel)/clientes/[slug]/page.tsx` (reescribir)

**Interfaces:**
- Consumes: `getClientDetail`, `listStripeCustomerOptions`, `listLocationOptions`, `listImplementations`, `listInvoices`, `listActivity`, actions de Task 5.
- Produces: `LinkPicker`, `StripeLinks`, `LocationLink` (componentes cliente).

- [ ] **Step 1: Picker genérico (Popover + Command)**

```tsx
// src/components/clients/link-picker.tsx
"use client"

import { useState } from "react"
import { ChevronsUpDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type PickerOption = { value: string; label: string; detail?: string; badge?: string }

export function LinkPicker({
  options,
  placeholder,
  empty,
  buttonLabel,
  disabled,
  onPick,
}: {
  options: PickerOption[]
  placeholder: string
  empty: string
  buttonLabel: string
  disabled?: boolean
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="sm" variant="outline" disabled={disabled} aria-expanded={open} aria-haspopup="listbox" />}
      >
        {buttonLabel} <ChevronsUpDownIcon aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.detail ?? ""} ${o.value}`}
                  onSelect={() => {
                    setOpen(false)
                    onPick(o.value)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{o.label}</span>
                    {o.detail && <span className="block truncate text-xs text-muted-foreground">{o.detail}</span>}
                  </span>
                  {o.badge && <span className="ml-2 text-xs text-muted-foreground">{o.badge}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

Si `PopoverTrigger` de Base UI no acepta `render` con `Button` así, revisa cómo lo hace `src/components/shell/command-menu.tsx` o `dropdown-menu.tsx` y copia el patrón.

- [ ] **Step 2: Enlaces a Stripe**

```tsx
// src/components/clients/stripe-links.tsx
"use client"

import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"

import { EmptyState } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/format"
import type { ClientDetail, Currency, StripeCustomerOption } from "@/lib/types"

import { LinkPicker } from "./link-picker"
import { linkStripeCustomer, unlinkStripeCustomer } from "@/app/(panel)/clientes/actions"

export function StripeLinks({
  clientId,
  links,
  options,
  optionsError,
  currency,
}: {
  clientId: string
  links: ClientDetail["stripe"]
  options: StripeCustomerOption[]
  optionsError: string | null
  currency: Currency
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">{optionsError ?? `${options.length} sin dueño en Stripe`}</span>
        <LinkPicker
          options={options.map((o) => ({
            value: o.id,
            label: o.name,
            detail: o.email ?? o.id,
            badge: o.active ? (o.mrr === null ? "Activa" : `${money(o.mrr, currency)}/mes`) : undefined,
          }))}
          placeholder="Buscar por nombre o correo"
          empty="Nadie en Stripe coincide."
          buttonLabel="Agregar cliente de Stripe"
          disabled={pending || Boolean(optionsError)}
          onPick={(cus) => run(() => linkStripeCustomer(clientId, cus))}
        />
      </div>
      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}
      {links.length === 0 ? (
        <EmptyState title="Sin cliente de Stripe">Elige uno del desplegable. Los que coinciden por correo, teléfono o nombre exacto se enlazan solos al sincronizar.</EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li key={l.stripeCustomerId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.email ?? "Sin correo"} · <code className="num">{l.stripeCustomerId}</code>
                </p>
              </div>
              <span className="num text-sm">{l.active ? (l.mrr === null ? "Activa" : `${money(l.mrr, currency)}/mes`) : "Sin suscripción"}</span>
              <StatusChip tone={l.linkedBy === "auto" ? "live" : "build"}>{l.linkedBy === "auto" ? "Automático" : "Manual"}</StatusChip>
              <Button size="icon-xs" variant="ghost" disabled={pending} aria-label={`Quitar ${l.name}`} onClick={() => run(() => unlinkStripeCustomer(l.stripeCustomerId))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Si el `size="icon-xs"` no existe en `button.tsx`, usa el nombre que sí exista para el icono de 24 px (revisa `src/components/ui/button.tsx:28-33`).

- [ ] **Step 3: Enlace a subcuenta**

```tsx
// src/components/clients/location-link.tsx
"use client"

import { useState, useTransition } from "react"
import { ExternalLinkIcon, XIcon } from "lucide-react"

import { EmptyState } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import type { Client, LocationOption } from "@/lib/types"

import { LinkPicker } from "./link-picker"
import { linkGhlLocation, unlinkGhlLocation } from "@/app/(panel)/clientes/actions"

export function LocationLink({
  client,
  location,
  options,
  optionsError,
}: {
  client: Client
  location: LocationOption | null
  options: LocationOption[]
  optionsError: string | null
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  return (
    <div>
      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}
      {location ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{location.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {location.email ?? "Sin correo"} · <code className="num">{location.id}</code>
            </p>
          </div>
          <StatusChip tone={client.ghlLocationLinkedBy === "auto" ? "live" : "build"}>
            {client.ghlLocationLinkedBy === "auto" ? "Automático" : "Manual"}
          </StatusChip>
          <Button size="sm" variant="outline" nativeButton={false} render={<a href={`https://app.gohighlevel.com/location/${location.id}`} target="_blank" rel="noreferrer" />}>
            Abrir <ExternalLinkIcon />
          </Button>
          <Button size="icon-xs" variant="ghost" disabled={pending} aria-label="Quitar subcuenta" onClick={() => run(() => unlinkGhlLocation(client.id))}>
            <XIcon />
          </Button>
        </div>
      ) : (
        <div className="px-4 py-3">
          <EmptyState title="Sin subcuenta enlazada">Elige la subcuenta de este cliente entre las de la agencia.</EmptyState>
          <div className="flex justify-center pb-2">
            <LinkPicker
              options={options.map((l) => ({ value: l.id, label: l.name, detail: l.email ?? l.id }))}
              placeholder="Buscar subcuenta"
              empty={optionsError ?? "Ninguna subcuenta coincide."}
              buttonLabel="Elegir subcuenta"
              disabled={pending || Boolean(optionsError)}
              onPick={(id) => run(() => linkGhlLocation(client.id, id))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Ficha**

Reescribe `src/app/(panel)/clientes/[slug]/page.tsx`. Conserva los helpers `Fact` y `Row` del archivo actual, el instrumento **Implementaciones** y el de **Actividad de la cuenta** tal cual (solo cambian las variables de origen). Cuerpo nuevo:

```tsx
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { LocationLink } from "@/components/clients/location-link"
import { StripeLinks } from "@/components/clients/stripe-links"
import { LinkButton } from "@/components/panel/link-button"
import { EmptyState, Instrument, PageHeader } from "@/components/panel/page-header"
import { SignalMeter } from "@/components/signal/signal-meter"
import { invoiceStatusLabel, stageLabel, stageTone, StatusChip } from "@/components/signal/status-chip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fullDate, money, relativeDays, shortDate } from "@/lib/format"
import {
  baseCurrency,
  getClientDetail,
  listActivity,
  listImplementations,
  listInvoices,
  listLocationOptions,
  listStripeCustomerOptions,
} from "@/lib/repository"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getClientDetail(slug)
  return { title: detail?.client.name ?? "Cliente" }
}

export default async function ClientePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const detail = await getClientDetail(slug)
  if (!detail) notFound()
  const { client, opportunities, stripe, location, mrr } = detail

  const [implementations, invoices, activity, stripeOptions, locationOptions] = await Promise.all([
    listImplementations(),
    listInvoices(),
    listActivity(40),
    listStripeCustomerOptions(),
    listLocationOptions(),
  ])
  const currency = baseCurrency()
  const work = implementations.filter((i) => i.clientId === client.id)
  const bills = invoices.filter((i) => i.clientId === client.id)
  const events = activity.filter((a) => a.clientId === client.id).slice(0, 6)
  const owed = bills.filter((i) => i.status === "due" || i.status === "overdue").reduce((s, i) => s + (i.amountBase ?? 0), 0)

  return (
    <div className="blueprint">
      <div className="px-4 pt-6 md:px-6">
        <LinkButton href="/clientes" variant="ghost" size="xs"><ArrowLeftIcon /> Clientes</LinkButton>
      </div>

      <PageHeader
        eyebrow={client.orphaned ? "Sin oportunidad en GHL" : "Cliente"}
        title={client.name}
        description={client.notes ?? undefined}
        className="pt-4"
        actions={<LinkButton href="/copiloto" variant="outline" size="sm">Preguntar al copiloto</LinkButton>}
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        <section className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
          <Fact label="Etapa"><StatusChip tone={stageTone(client.stage)}>{client.stage}</StatusChip></Fact>
          <Fact label="MRR">
            <span className="num text-xl font-semibold">{mrr === null ? "—" : money(mrr, currency)}</span>
            <span className="block text-xs text-muted-foreground">suscripciones activas en Stripe</span>
          </Fact>
          <Fact label="Contacto">
            <span className="text-sm">{client.contactName}</span>
            <span className="block truncate text-xs text-muted-foreground">{client.email ?? "Sin correo"}</span>
            <span className="block text-xs text-muted-foreground">{client.phone ?? "Sin teléfono"}</span>
          </Fact>
          <Fact label="Cliente desde"><span className="text-sm">{fullDate(client.wonAt)}</span></Fact>
          <Fact label="Sincronizado">
            <span className="text-sm">{shortDate(client.syncedAt.slice(0, 10))}</span>
            <span className="block text-xs text-muted-foreground">{relativeDays(client.syncedAt.slice(0, 10))}</span>
          </Fact>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Instrument label="Subcuenta de GoHighLevel" hint={location ? "Enlazada" : "Pendiente de enlazar"}>
            <LocationLink client={client} location={location} options={locationOptions.options} optionsError={locationOptions.error} />
          </Instrument>
          <Instrument label="Clientes de Stripe" hint={stripe.length ? `${stripe.length} enlazados` : "Pendiente de enlazar"}>
            <StripeLinks clientId={client.id} links={stripe} options={stripeOptions.options} optionsError={stripeOptions.error} currency={currency} />
          </Instrument>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Instrument label="Oportunidades ganadas" hint={`${opportunities.length} en el pipeline Ventas`}>
            {opportunities.length === 0 ? (
              <EmptyState title="Sin oportunidades" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oportunidad</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Cierre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">{o.name}</TableCell>
                      <TableCell><StatusChip tone={stageTone(o.stageName)}>{o.stageName}</StatusChip></TableCell>
                      <TableCell data-num className="text-right">{money(o.monetaryValue * 100, "mxn")}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{shortDate(o.wonAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Instrument>

          {/* Instrumento Facturación: copia el bloque actual tal cual, con `bills`, `owed`, `currency` en el hint */}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Instrumento Implementaciones: copia el bloque actual tal cual */}
          {/* Instrumento Actividad de la cuenta: copia el bloque actual tal cual */}
        </div>
      </div>
    </div>
  )
}
```

El valor de las oportunidades de GHL está en pesos: `money(o.monetaryValue * 100, "mxn")`. En el hint de Facturación usa `money(owed, currency)` (hoy tiene `"mxn"` fijo).

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint`. `pnpm dev`:
- Abre la ficha de un cliente sin Stripe (p. ej. "Pablo Carlos Santiago Carmona" si no se auto-enlazó): el desplegable lista `cus_` no enlazados con su correo y "$…/mes" si tienen suscripción. Elige uno → aparece con chip "Manual", el MRR de la cabecera cambia.
- Quita el enlace con la X → vuelve el estado vacío.
- Intenta enlazar un `cus_` ya tomado (edita la URL o usa otro cliente): mensaje "Ya está enlazado a …".
- Subcuenta: elige "Escuela You Can Drive" para el cliente de Zuriel → chip "Manual", botón "Abrir".
- Facturación del cliente muestra las facturas de todos sus `cus_`.
- Sin `DATABASE_URL`: las actions responden "Sin base de datos…" y se ve en rojo bajo el instrumento; nada truena.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/link-picker.tsx src/components/clients/stripe-links.tsx src/components/clients/location-link.tsx "src/app/(panel)/clientes/[slug]/page.tsx"
git commit -m "Ficha de cliente con enlaces a Stripe y subcuenta editables

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Retirar el mapeador viejo y documentar

**Files:**
- Delete: `scripts/stripe-map.ts`
- Modify: `package.json` (quitar `stripe:map`)
- Modify: `CLAUDE.md` (sección Stripe, GoHighLevel, comandos, variables)

- [ ] **Step 1: Borrar el script y el comando**

```bash
git rm scripts/stripe-map.ts
```

En `package.json` quita la línea `"stripe:map": …`. Verifica que `tsx` siga siendo necesario por `db:seed` (sí).

- [ ] **Step 2: CLAUDE.md**

`CLAUDE.md` tiene cambios sin commitear de otro trabajo: edita solo estas líneas y commitea con `git add -p`.

- En **GoHighLevel**, sustituye la viñeta de `pipelineId` por:
  `- `GET /opportunities/search` usa `pipeline_id` en snake_case (verificado con curl) y pagina por cursor con `startAfter`/`startAfterId` del `meta`.`
  y agrega:
  `- El token de agencia **no** lee contactos ni oportunidades de una subcuenta (401). Para la subcuenta Lezgo Suite hay un PIT propio: `GHL_LEZGO_SUITE_TOKEN`, envuelto en `src/lib/ghl/lezgo-suite.ts`.`
- En **Stripe**, cambia la última viñeta por:
  `- El enlace vive en `client_stripe_customers` (un cliente, varios `cus_`). Se llena solo al sincronizar cuando coincide correo, teléfono (últimos 10 dígitos) o nombre exacto; lo demás se elige en la ficha del cliente.`
- Agrega una sección **Clientes** antes de **Modelo**:
  ```
  **Clientes.** Salen de las oportunidades **ganadas** del pipeline "Ventas" de
  la subcuenta Lezgo Suite, agrupadas por contacto (`src/lib/clients/`). La
  sync corre al apretar "Sincronizar con GHL" o sola si la última tiene más
  de una hora. Un cliente que deja de aparecer se marca `orphaned`, no se
  borra. Los enlaces (Stripe y subcuenta) son la única escritura del panel y
  van solo a Neon.
  ```
- En **Comandos** quita `pnpm stripe:map` y en la de `pnpm test` pon "vitest: mapeador de Stripe, agrupación y auto-enlace de clientes".
- En **Variables de entorno** agrega `GHL_LEZGO_SUITE_TOKEN` y `GHL_LEZGO_SUITE_LOCATION_ID`.
- En **Cómo está organizado** agrega `clients/  group, match, sync` bajo `lib/` y `ghl/lezgo-suite.ts`.

- [ ] **Step 3: Verificación final**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Expected: todo verde. `pnpm build` no debe quejarse de `server-only` importado desde componentes cliente (si lo hace, revisa que `sync-button.tsx` use `import type`).

- [ ] **Step 4: Commit**

```bash
git add package.json
git add -p CLAUDE.md    # solo los hunks de esta tarea
git commit -m "Retira stripe:map; el enlace vive en el panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

- **Cobertura del spec:** modelo (T3), sync y paginación (T5), agrupación (T2), auto-enlace y reglas de ambigüedad (T1, T5), lista con botón/filtro/aviso (T6), ficha con pickers/quitar/errores (T7), facturación por enlaces (T4), actions solo-Neon (T5), pruebas (T1, T2, T5), docs y retiro de `stripe:map` (T8). La sync automática al cargar está en T6.
- **Desviación declarada:** clientes sin `unstable_cache` (ver Global Constraints).
- **Tipos:** `ClientRow`, `StripeCustomerOption`, `LocationOption`, `ClientDetail` viven en `types.ts` (T4 step 10) y se reexportan del repositorio; los componentes cliente los importan de `@/lib/types`. `SyncResult` se importa solo como tipo desde `sync.ts`.
