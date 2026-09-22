import "server-only"

import { tool } from "ai"
import { z } from "zod"

import { ghl, GhlError } from "@/lib/ghl/client"
import {
  getPortfolioSummary,
  listImplementations,
  listInvoices,
  listClients,
} from "@/lib/repository"

/**
 * Everything the copilot is allowed to do.
 *
 * Read tools answer questions about the book of business; write tools reach
 * into GoHighLevel. Destructive and outward-facing tools are gated behind
 * approval in `agent.ts` — the tool itself stays dumb about that.
 */

const locationId = z
  .string()
  .optional()
  .describe(
    "GoHighLevel sub-account id. Omit to use the client's default location.",
  )

/** Turns a thrown GhlError into something the model can reason about. */
async function attempt<T>(run: () => Promise<T>) {
  try {
    return { ok: true as const, data: await run() }
  } catch (error) {
    if (error instanceof GhlError) {
      return {
        ok: false as const,
        error: error.message,
        status: error.status,
        endpoint: error.endpoint,
      }
    }
    return { ok: false as const, error: String(error) }
  }
}

export const panelTools = {
  portfolioSummary: tool({
    description:
      "Current agency numbers: MRR (cents, base currency), active clients, outstanding invoices, in-flight and blocked implementations, clients pending a Stripe or sub-account link.",
    inputSchema: z.object({}),
    execute: async () => {
      const s = await getPortfolioSummary()
      return {
        mrr: s.mrr,
        activeClients: s.activeCount,
        outstanding: s.outstanding,
        overdueInvoices: s.overdueCount,
        implementationsInFlight: s.inFlightCount,
        implementationsBlocked: s.blockedCount,
        baseCurrency: s.baseCurrency,
        unlinkedClients: s.unlinked.map((c) => c.name),
      }
    },
  }),

  findClients: tool({
    description:
      "Look up clients in the panel by name, contact, email or pipeline stage.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Matches company, contact name or email."),
      stage: z
        .string()
        .optional()
        .describe("Pipeline stage name, partial match."),
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

  listImplementations: tool({
    description:
      "Implementation projects across the book. Filter to blocked work or a single client.",
    inputSchema: z.object({
      clientId: z.string().optional(),
      blockedOnly: z.boolean().optional(),
    }),
    execute: async ({ clientId, blockedOnly }) => {
      const all = await listImplementations()
      return all.filter(
        (i) =>
          (!clientId || i.clientId === clientId) &&
          (!blockedOnly || i.blocked),
      )
    },
  }),

  listInvoices: tool({
    description: "Invoices, optionally filtered by status or client.",
    inputSchema: z.object({
      clientId: z.string().optional(),
      status: z.enum(["paid", "due", "overdue", "draft"]).optional(),
    }),
    execute: async ({ clientId, status }) => {
      const all = await listInvoices()
      return all.filter(
        (i) =>
          (!clientId || i.clientId === clientId) &&
          (!status || i.status === status),
      )
    },
  }),
}

export const ghlTools = {
  listSubAccounts: tool({
    description: "List GoHighLevel sub-accounts (locations) on the agency.",
    inputSchema: z.object({ limit: z.number().int().max(100).optional() }),
    execute: ({ limit }) => attempt(() => ghl.searchLocations({ limit })),
  }),

  findContacts: tool({
    description:
      "Search contacts in a GoHighLevel sub-account. Build filters with camelCase field names, e.g. field 'email' operator 'contains'.",
    inputSchema: z.object({
      locationId,
      filters: z
        .array(
          z.object({
            field: z.string().describe("camelCase field, e.g. email, phone, firstName, tags"),
            operator: z.enum([
              "eq",
              "not_eq",
              "contains",
              "not_contains",
              "wildcard",
              "not_wildcard",
              "exists",
              "not_exists",
              "range",
              "contains_set",
              "gt",
              "gte",
              "lt",
              "lte",
              "nested",
            ]),
            value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          }),
        )
        .optional()
        .describe("Omit to list the most recently added contacts."),
      pageLimit: z.number().int().min(1).max(100).optional(),
    }),
    execute: (input) => attempt(() => ghl.searchContacts(input)),
  }),

  getContact: tool({
    description: "Read one contact by id.",
    inputSchema: z.object({ contactId: z.string() }),
    execute: ({ contactId }) => attempt(() => ghl.getContact(contactId)),
  }),

  createContact: tool({
    description: "Create a contact in a GoHighLevel sub-account.",
    inputSchema: z.object({
      locationId,
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      tags: z.array(z.string()).optional(),
      source: z.string().optional(),
    }),
    execute: (input) => attempt(() => ghl.createContact(input)),
  }),

  updateContact: tool({
    description: "Update fields on an existing contact.",
    inputSchema: z.object({
      contactId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    execute: ({ contactId, ...rest }) =>
      attempt(() => ghl.updateContact(contactId, rest)),
  }),

  deleteContact: tool({
    description:
      "Permanently delete a contact. This cannot be undone — confirm the id first.",
    inputSchema: z.object({ contactId: z.string() }),
    execute: ({ contactId }) => attempt(() => ghl.deleteContact(contactId)),
  }),

  tagContact: tool({
    description: "Add tags to a contact.",
    inputSchema: z.object({
      contactId: z.string(),
      tags: z.array(z.string()).min(1),
    }),
    execute: ({ contactId, tags }) =>
      attempt(() => ghl.addContactTags(contactId, tags)),
  }),

  listPipelines: tool({
    description: "List opportunity pipelines and their stages for a sub-account.",
    inputSchema: z.object({ locationId }),
    execute: ({ locationId }) => attempt(() => ghl.listPipelines(locationId)),
  }),

  findOpportunities: tool({
    description: "Search opportunities in a pipeline.",
    inputSchema: z.object({
      locationId,
      pipelineId: z.string().optional(),
      status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
      limit: z.number().int().max(100).optional(),
    }),
    execute: (input) => attempt(() => ghl.searchOpportunities(input)),
  }),

  createOpportunity: tool({
    description: "Create an opportunity in a pipeline stage.",
    inputSchema: z.object({
      locationId,
      pipelineId: z.string(),
      pipelineStageId: z.string(),
      name: z.string(),
      monetaryValue: z.number().optional(),
      contactId: z.string().optional(),
    }),
    execute: (input) => attempt(() => ghl.createOpportunity(input)),
  }),

  updateOpportunity: tool({
    description: "Move an opportunity between stages or change its value.",
    inputSchema: z.object({
      opportunityId: z.string(),
      pipelineStageId: z.string().optional(),
      status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
      monetaryValue: z.number().optional(),
      name: z.string().optional(),
    }),
    execute: ({ opportunityId, ...rest }) =>
      attempt(() => ghl.updateOpportunity(opportunityId, rest)),
  }),

  deleteOpportunity: tool({
    description: "Permanently delete an opportunity. This cannot be undone.",
    inputSchema: z.object({ opportunityId: z.string() }),
    execute: ({ opportunityId }) =>
      attempt(() => ghl.deleteOpportunity(opportunityId)),
  }),

  sendMessage: tool({
    description:
      "Send an SMS or email to a contact from their GoHighLevel conversation.",
    inputSchema: z.object({
      contactId: z.string(),
      type: z.enum(["SMS", "Email"]),
      message: z.string().optional().describe("Body for SMS."),
      subject: z.string().optional().describe("Subject line for email."),
      html: z.string().optional().describe("HTML body for email."),
    }),
    execute: (input) => attempt(() => ghl.sendMessage(input)),
  }),

  listWorkflows: tool({
    description: "List automation workflows in a sub-account.",
    inputSchema: z.object({ locationId }),
    execute: ({ locationId }) => attempt(() => ghl.listWorkflows(locationId)),
  }),

  listCalendars: tool({
    description: "List calendars in a sub-account.",
    inputSchema: z.object({ locationId }),
    execute: ({ locationId }) => attempt(() => ghl.listCalendars(locationId)),
  }),
}

export const copilotTools = { ...panelTools, ...ghlTools }
