import "server-only"

import { tool } from "ai"
import { z } from "zod"

import { settingGroups, type SettingValues } from "@/data/lezgo-ia"
import { dueStatus } from "@/lib/implementations/due"
import { groupPendings } from "@/lib/pendings/group"
import {
  getBillingFeed,
  getClientDetail,
  getLezgoIaData,
  getPortfolioSummary,
  getRevenueSeries,
  lastSyncAt,
  listActivity,
  listClientRows,
  listFreeLocationOptions,
  listImplementations,
  listLocationLinks,
  listLocationOptions,
  listPendings,
  listStripeCustomerOptions,
  listStripeLinks,
} from "@/lib/repository"
import type {
  ClientRow,
  Implementation,
  ImplementationStage,
  InvoiceStatus,
} from "@/lib/types"

/**
 * Lo que el copiloto puede leer del panel: clientes con sus enlaces a
 * Stripe y a GHL, implementaciones, pendientes, facturas, series y la
 * configuración de Lezgo IA. Todo pasa por el repositorio, igual que las
 * páginas, así que el copiloto ve exactamente lo que ve el equipo.
 *
 * Son solo lecturas. Lo que el panel escribe a Neon lo escribe el equipo
 * desde la interfaz.
 */

/** Sin acentos ni mayúsculas: quien escribe "duran" espera ver "Durán". */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

/** Un cliente por id de contacto, por slug o por nombre (parcial). */
function matchClient(rows: ClientRow[], ref: string) {
  const exact = rows.find((c) => c.id === ref || c.slug === ref)
  if (exact) return [exact]
  const q = plano(ref)
  return rows.filter(
    (c) =>
      plano(c.name).includes(q) ||
      plano(c.contactName).includes(q) ||
      plano(c.email ?? "").includes(q),
  )
}

/** Lo que el modelo necesita de una fila de cliente, sin ruido. */
function clientSummary(c: ClientRow) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    contactName: c.contactName,
    email: c.email,
    phone: c.phone,
    ghlStage: c.stage,
    wonAt: c.wonAt,
    orphaned: c.orphaned,
    subaccounts: c.locationNames,
    stripeCustomers: c.stripeCount,
    mrr: c.mrr,
    unconvertedSubs: c.unconvertedSubs,
    account: c.account,
  }
}

function implementationSummary(i: Implementation, withDetail: boolean) {
  const done = i.checklist.filter((p) => p.done).length
  return {
    id: i.id,
    name: i.name,
    clientId: i.clientId,
    subaccountId: i.ghlLocationId ?? null,
    subaccountName: i.ghlLocationName ?? null,
    kind: i.kind,
    stage: i.stage,
    progress: i.progress,
    owner: i.owner,
    dueAt: i.dueAt,
    due: dueStatus(i.dueAt).label,
    blocked: i.blocked,
    blockedReason: i.blockedReason ?? null,
    updatedAt: i.updatedAt,
    contacts: i.contacts.map((c) => c.name),
    checklist: withDetail
      ? i.checklist.map((p) => ({
          label: p.label,
          done: p.done,
          sub: p.parentId !== null,
        }))
      : { done, total: i.checklist.length },
    openItems: withDetail
      ? undefined
      : i.checklist.filter((p) => !p.done).slice(0, 5).map((p) => p.label),
    notes: withDetail
      ? i.notes.map((n) => ({ at: n.createdAt, body: n.body }))
      : i.notes.slice(0, 2).map((n) => ({ at: n.createdAt, body: n.body })),
  }
}

/* --------------------------------------------------- ajustes de Lezgo IA */

const settingDefs = new Map(
  settingGroups.flatMap((g) => g.settings).map((d) => [d.id, d]),
)

/** `{ abandonedLead: { enabled, option: "48" } }` → "Lead abandonado: Sin respuesta 48 h". */
function describeSettings(values: SettingValues | undefined) {
  if (!values) return []
  return Object.entries(values).map(([id, v]) => {
    const def = settingDefs.get(id)
    const option = def?.options?.find((o) => o.value === v.option)?.label
    return {
      id,
      label: def?.label ?? id,
      enabled: def?.control === "fixed" ? true : v.enabled,
      option: option ?? v.option ?? null,
    }
  })
}

/* ------------------------------------------------------------ herramientas */

export const panelTools = {
  portfolioSummary: tool({
    description:
      "Agency snapshot: MRR (cents, base currency), active and orphaned clients, outstanding and overdue invoices, implementations in flight and blocked, clients missing a Stripe or sub-account link, open pendings, last GHL sync and which data sources are connected.",
    inputSchema: z.object({}),
    execute: async () => {
      const [s, pendings, syncedAt] = await Promise.all([
        getPortfolioSummary(),
        listPendings(),
        lastSyncAt(),
      ])
      return {
        baseCurrency: s.baseCurrency,
        stripeConnected: s.stripeConnected,
        fxDefined: s.fxDefined,
        mrr: s.mrr,
        activeClients: s.activeCount,
        orphanedClients: s.orphanedCount,
        stripeLinks: s.stripeLinkCount,
        clientsWithUnconvertedSubs: s.unconvertedClients,
        outstanding: s.outstanding,
        overdueInvoices: s.overdueCount,
        voidedInvoices: s.voidedInvoices,
        implementationsInFlight: s.inFlightCount,
        implementationsBlocked: s.blockedCount,
        openPendings: pendings.filter((p) => !p.done).length,
        lastGhlSync: syncedAt,
        unlinkedClients: s.unlinked.map((c) => ({
          name: c.name,
          slug: c.slug,
          missingStripe: c.stripeCount === 0,
          missingSubaccount: c.locationNames.length === 0,
        })),
      }
    },
  }),

  findClients: tool({
    description:
      "Search panel clients (won deals in the Lezgo Suite 'Ventas' pipeline). Each row carries its linked GHL sub-accounts, number of Stripe customers, MRR and the four account fields (membership, billing period, license due date, technical support) with the source of each value.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Matches company, contact name or email; accents ignored."),
      stage: z
        .string()
        .optional()
        .describe("GHL pipeline stage name, partial match."),
      membership: z.enum(["start", "growth", "pro", "elite"]).optional(),
      missingLink: z
        .enum(["stripe", "subaccount", "any"])
        .optional()
        .describe("Only clients without that link."),
      includeOrphaned: z
        .boolean()
        .optional()
        .describe("Orphaned clients no longer appear in GHL. Default false."),
    }),
    execute: async ({ query, stage, membership, missingLink, includeOrphaned }) => {
      const rows = await listClientRows()
      const q = query ? plano(query) : null
      const s = stage ? plano(stage) : null
      return rows
        .filter(
          (c) =>
            (includeOrphaned || !c.orphaned) &&
            (!q ||
              plano(c.name).includes(q) ||
              plano(c.contactName).includes(q) ||
              plano(c.email ?? "").includes(q)) &&
            (!s || plano(c.stage).includes(s)) &&
            (!membership || c.account.membership.value === membership) &&
            (!missingLink ||
              (missingLink !== "subaccount" && c.stripeCount === 0) ||
              (missingLink !== "stripe" && c.locationNames.length === 0)),
        )
        .map(clientSummary)
    },
  }),

  getClient: tool({
    description:
      "Full file of one client: account fields, won opportunities, linked Stripe customers (cus_ ids with their active subscription lines and MRR), linked GHL sub-accounts (ids and names), implementations, open pendings of their sub-accounts and their invoices.",
    inputSchema: z.object({
      client: z
        .string()
        .describe("Client id (GHL contact id), slug, or part of the name."),
    }),
    execute: async ({ client }) => {
      const rows = await listClientRows()
      const matches = matchClient(rows, client)
      if (matches.length === 0) {
        return { ok: false as const, error: `Ningún cliente coincide con "${client}".` }
      }
      if (matches.length > 1) {
        return {
          ok: false as const,
          error: "Varios clientes coinciden; pide que elija uno.",
          candidates: matches.slice(0, 10).map((c) => ({ slug: c.slug, name: c.name })),
        }
      }
      const row = matches[0]
      const [detail, implementations, pendings, billing] = await Promise.all([
        getClientDetail(row.slug),
        listImplementations(),
        listPendings(),
        getBillingFeed(),
      ])
      if (!detail) return { ok: false as const, error: "El cliente ya no existe." }
      const locationIds = new Set(detail.locations.map((l) => l.ghlLocationId))
      return {
        ok: true as const,
        baseCurrency: billing.baseCurrency,
        client: clientSummary(row),
        notes: detail.client.notes,
        opportunities: detail.opportunities.map((o) => ({
          name: o.name,
          stage: o.stageName,
          valueMxn: o.monetaryValue,
          wonAt: o.wonAt,
        })),
        stripe: detail.stripe.map((s) => ({
          customerId: s.stripeCustomerId,
          name: s.name,
          email: s.email,
          linkedBy: s.linkedBy,
          active: s.active,
          mrr: s.mrr,
          subscriptionLines: s.plan,
        })),
        subaccounts: detail.locations.map((l) => ({
          id: l.ghlLocationId,
          name: l.name,
          linkedBy: l.linkedBy,
        })),
        implementations: implementations
          .filter(
            (i) =>
              i.clientId === row.id ||
              (i.ghlLocationId && locationIds.has(i.ghlLocationId)),
          )
          .map((i) => implementationSummary(i, false)),
        openPendings: pendings
          .filter((p) => !p.done && p.ghlLocationId && locationIds.has(p.ghlLocationId))
          .map((p) => ({ body: p.body, subaccount: p.ghlLocationName, createdAt: p.createdAt })),
        invoices: billing.invoices
          .filter((i) => i.clientId === row.id)
          .map((i) => ({
            number: i.number,
            amount: i.amount,
            currency: i.currency,
            status: i.status,
            issuedAt: i.issuedAt,
            dueAt: i.dueAt,
            paidAt: i.paidAt ?? null,
            memo: i.memo,
          })),
      }
    },
  }),

  listLinks: tool({
    description:
      "Client ↔ GHL sub-account and client ↔ Stripe customer associations. Also lists sub-accounts nobody owns and Stripe customers linked to no client (paying ones first).",
    inputSchema: z.object({
      kind: z.enum(["subaccounts", "stripe"]),
      unlinkedOnly: z
        .boolean()
        .optional()
        .describe("Only what has no owner yet."),
      query: z
        .string()
        .optional()
        .describe("Filters Stripe customers by name, email or cus_ id."),
    }),
    execute: async ({ kind, unlinkedOnly, query }) => {
      const rows = await listClientRows()
      const clientName = new Map(rows.map((c) => [c.id, c.name]))
      if (kind === "subaccounts") {
        if (unlinkedOnly) {
          const { options, error } = await listFreeLocationOptions()
          return { error, free: options.map((l) => ({ id: l.id, name: l.name })) }
        }
        const [links, { options, error }] = await Promise.all([
          listLocationLinks(),
          listLocationOptions(),
        ])
        const name = new Map(options.map((l) => [l.id, l.name]))
        return {
          error,
          links: links.map((l) => ({
            subaccountId: l.ghlLocationId,
            subaccountName: name.get(l.ghlLocationId) ?? null,
            client: clientName.get(l.clientId) ?? l.clientId,
            linkedBy: l.linkedBy,
            linkedAt: l.linkedAt,
          })),
        }
      }
      if (unlinkedOnly) {
        const { options, total, error } = await listStripeCustomerOptions(
          query ?? "",
          40,
        )
        return { error, total, shown: options.length, free: options }
      }
      const links = await listStripeLinks()
      return {
        links: links.map((l) => ({
          customerId: l.stripeCustomerId,
          client: clientName.get(l.clientId) ?? l.clientId,
          linkedBy: l.linkedBy,
          linkedAt: l.linkedAt,
        })),
      }
    },
  }),

  listImplementations: tool({
    description:
      "Implementation projects (snapshot, workflow, integration, migration, training) with stage, owner, due-date traffic light, checklist progress and recent notes. Pass implementationId for the full checklist and every note.",
    inputSchema: z.object({
      implementationId: z.string().optional(),
      query: z
        .string()
        .optional()
        .describe("Matches implementation name, sub-account or contact."),
      clientId: z.string().optional(),
      subaccountId: z.string().optional(),
      stage: z
        .enum(["scoping", "building", "review", "launch", "live"])
        .optional(),
      blockedOnly: z.boolean().optional(),
      dueWithinDays: z
        .number()
        .int()
        .optional()
        .describe("Only those due within N days, overdue included."),
    }),
    execute: async (f) => {
      const all = await listImplementations()
      if (f.implementationId) {
        const one = all.find((i) => i.id === f.implementationId)
        return one
          ? implementationSummary(one, true)
          : { ok: false as const, error: "No existe esa implementación." }
      }
      const q = f.query ? plano(f.query) : null
      const limit = f.dueWithinDays
      return all
        .filter(
          (i) =>
            (!q ||
              plano(i.name).includes(q) ||
              plano(i.ghlLocationName ?? "").includes(q) ||
              i.contacts.some((c) => plano(c.name).includes(q))) &&
            (!f.clientId || i.clientId === f.clientId) &&
            (!f.subaccountId || i.ghlLocationId === f.subaccountId) &&
            (!f.stage || i.stage === (f.stage as ImplementationStage)) &&
            (!f.blockedOnly || i.blocked) &&
            (limit === undefined ||
              (i.dueAt !== null &&
                i.stage !== "live" &&
                Date.parse(i.dueAt) - Date.now() <= limit * 86_400_000)),
        )
        .map((i) => implementationSummary(i, false))
    },
  }),

  listPendings: tool({
    description:
      "Quick to-dos grouped by GHL sub-account (oldest open first). A pending is one sentence, optionally tied to a sub-account; no date, owner or priority.",
    inputSchema: z.object({
      subaccount: z
        .string()
        .optional()
        .describe("Sub-account id or part of its name."),
      includeDone: z.boolean().optional(),
    }),
    execute: async ({ subaccount, includeDone }) => {
      const [rows, { options }] = await Promise.all([
        listPendings(),
        listLocationOptions(),
      ])
      const names = new Map(options.map((l) => [l.id, l.name]))
      const q = subaccount ? plano(subaccount) : null
      return groupPendings(rows, names)
        .filter(
          (g) =>
            !q || g.locationId === subaccount || plano(g.name).includes(q),
        )
        .map((g) => ({
          subaccountId: g.locationId,
          subaccount: g.name,
          open: g.open.map((p) => ({ body: p.body, createdAt: p.createdAt })),
          done: includeDone
            ? g.done.map((p) => ({ body: p.body, doneAt: p.doneAt }))
            : g.done.length,
        }))
        .filter((g) => g.open.length > 0 || includeDone)
    },
  }),

  listInvoices: tool({
    description:
      "Invoices from Stripe (last 12 months) or Neon. Amounts in cents of `currency`; `amountBase` is the base-currency conversion (null when it cannot be converted). 'overdue' = automatic retries exhausted; void and uncollectible never count as receivable.",
    inputSchema: z.object({
      clientId: z.string().optional(),
      customer: z
        .string()
        .optional()
        .describe("Customer name or invoice number, partial."),
      status: z
        .enum(["paid", "due", "overdue", "draft", "void", "uncollectible"])
        .optional(),
      unlinkedOnly: z
        .boolean()
        .optional()
        .describe("Only invoices whose Stripe customer is linked to no client."),
      since: z.string().optional().describe("YYYY-MM-DD, by issue date."),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    execute: async ({ clientId, customer, status, unlinkedOnly, since, limit }) => {
      const feed = await getBillingFeed()
      const q = customer ? plano(customer) : null
      const matches = feed.invoices
        .filter(
          (i) =>
            (!clientId || i.clientId === clientId) &&
            (!q || plano(i.customerName).includes(q) || plano(i.number).includes(q)) &&
            (!status || i.status === (status as InvoiceStatus)) &&
            (!unlinkedOnly || i.clientId === null) &&
            (!since || i.issuedAt >= since),
        )
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      const sum = (s: InvoiceStatus) =>
        matches
          .filter((i) => i.status === s)
          .reduce((t, i) => t + (i.amountBase ?? 0), 0)
      return {
        source: feed.source,
        stale: feed.stale,
        baseCurrency: feed.baseCurrency,
        usdToMxn: feed.usdToMxn,
        count: matches.length,
        totalsBase: { paid: sum("paid"), due: sum("due"), overdue: sum("overdue") },
        unconverted: matches.filter((i) => i.amountBase === null).length,
        invoices: matches.slice(0, limit ?? 50).map((i) => ({
          id: i.id,
          number: i.number,
          clientId: i.clientId,
          customer: i.customerName,
          amount: i.amount,
          currency: i.currency,
          amountBase: i.amountBase,
          status: i.status,
          issuedAt: i.issuedAt,
          dueAt: i.dueAt,
          paidAt: i.paidAt ?? null,
          memo: i.memo,
          url: i.hostedUrl ?? null,
        })),
      }
    },
  }),

  revenueSeries: tool({
    description:
      "Last 12 months from Stripe: collected per month (paid invoices) and new vs canceled subscriptions per month. Cents in base currency; `omitted` counts what could not be converted. There is no expansion series.",
    inputSchema: z.object({}),
    execute: () => getRevenueSeries(),
  }),

  recentActivity: tool({
    description: "Latest events logged in the panel (GHL, billing, implementations, clients, AI).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    execute: ({ limit }) => listActivity(limit ?? 15),
  }),

  lezgoIaStatus: tool({
    description:
      "Lezgo IA configuration per GHL sub-account: AI status (active, paused, unset), team settings, voice, advisors (alerts, out-of-office, per-advisor overrides, open leads) and per-stage pipeline rules. Without subaccount returns one line per sub-account; with it, the full configuration.",
    inputSchema: z.object({
      subaccount: z
        .string()
        .optional()
        .describe("Sub-account id or part of its name or client name."),
    }),
    execute: async ({ subaccount }) => {
      const data = await getLezgoIaData()
      const meta = {
        source: data.source,
        failedSubaccounts: data.failed,
        note:
          data.source === "demo"
            ? "Datos de ejemplo: GHL o Neon no están conectados."
            : "La IA todavía no corre: métricas, hilos y bitácora llegan vacíos a propósito.",
      }
      if (!subaccount) {
        return {
          ...meta,
          subaccounts: data.subaccounts.map((s) => ({
            id: s.ghlLocationId,
            name: s.name,
            client: s.clientName ?? null,
            status: s.status,
            advisors: s.advisors.length,
            advisorsWithAlerts: s.advisors.filter((a) => a.alerts).length,
            pipelines: s.pipelines.length,
            watchedStages: s.pipelines
              .flatMap((p) => p.stages)
              .filter((r) => r.idle !== "off").length,
          })),
        }
      }
      const q = plano(subaccount)
      const s = data.subaccounts.find(
        (a) =>
          a.ghlLocationId === subaccount ||
          plano(a.name).includes(q) ||
          plano(a.clientName ?? "").includes(q),
      )
      if (!s) return { ...meta, ok: false as const, error: "No hay subcuenta de Lezgo IA con ese nombre." }
      return {
        ...meta,
        id: s.ghlLocationId,
        name: s.name,
        client: s.clientName ?? null,
        timezone: s.timezone ?? null,
        status: s.status,
        voice: s.voice,
        teamSettings: describeSettings(s.settings),
        advisors: s.advisors.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email ?? null,
          role: a.role,
          alerts: a.alerts,
          openLeads: a.activeLeads,
          away: a.away ?? null,
          overrides: describeSettings(a.settings),
        })),
        pipelines: s.pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          stages: p.stages.map((r) => ({ stage: r.stage, idle: r.idle, action: r.action })),
        })),
      }
    },
  }),
}
