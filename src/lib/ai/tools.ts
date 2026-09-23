import "server-only"

import { tool } from "ai"
import { z } from "zod"

import { panelTools } from "@/lib/ai/panel-tools"
import { ghl, GhlClient, GhlError } from "@/lib/ghl/client"
import {
  LEZGO_SUITE_LOCATION_ID,
  lezgoSuite,
  lezgoSuiteEnabled,
} from "@/lib/ghl/lezgo-suite"
import { locationToken, oauthConfigured } from "@/lib/ghl/oauth"
import { listClients, listLocationLinks } from "@/lib/repository"

/**
 * Everything the copilot is allowed to do.
 *
 * Panel reads live in `panel-tools.ts`; the tools here reach into
 * GoHighLevel. Destructive and outward-facing tools are gated behind
 * approval in `agent.ts` — the tool itself stays dumb about that.
 */

const locationId = z
  .string()
  .optional()
  .describe(
    "GoHighLevel sub-account id. Omit to use the default location. Pass it whenever you know it: it picks the token that can read that sub-account.",
  )

/**
 * El token de agencia lista subcuentas pero da 401 al leer sus contactos y
 * oportunidades. Lezgo Suite tiene su token propio; las demás, el de la app
 * OAuth. Si la app no llega, se intenta con el de agencia y el error de GHL
 * vuelve al modelo tal cual.
 */
async function ghlFor(id = process.env.GHL_LOCATION_ID): Promise<GhlClient> {
  if (!id) return ghl
  if (id === LEZGO_SUITE_LOCATION_ID && lezgoSuiteEnabled()) return lezgoSuite
  if (!oauthConfigured()) return ghl
  try {
    return new GhlClient(await locationToken(id), id)
  } catch (error) {
    console.error(`Sin token OAuth para ${id}; se usa el de agencia`, error)
    return ghl
  }
}

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

export const ghlTools = {
  listSubAccounts: tool({
    description:
      "List GoHighLevel sub-accounts (locations) on the agency, each with the panel client that owns it, if any.",
    inputSchema: z.object({ limit: z.number().int().max(100).optional() }),
    execute: ({ limit }) =>
      attempt(async () => {
        const [{ locations }, links, clients] = await Promise.all([
          ghl.searchLocations({ limit }),
          listLocationLinks(),
          listClients(),
        ])
        const name = new Map(clients.map((c) => [c.id, c.name]))
        const owner = new Map(
          links.map((l) => [l.ghlLocationId, name.get(l.clientId) ?? l.clientId]),
        )
        return locations.map((l) => ({
          id: l.id,
          name: l.name,
          email: l.email ?? null,
          client: owner.get(l.id) ?? null,
        }))
      }),
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
    execute: (input) =>
      attempt(async () => (await ghlFor(input.locationId)).searchContacts(input)),
  }),

  getContact: tool({
    description: "Read one contact by id.",
    inputSchema: z.object({ locationId, contactId: z.string() }),
    execute: ({ locationId, contactId }) =>
      attempt(async () => (await ghlFor(locationId)).getContact(contactId)),
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
    execute: (input) =>
      attempt(async () => (await ghlFor(input.locationId)).createContact(input)),
  }),

  updateContact: tool({
    description: "Update fields on an existing contact.",
    inputSchema: z.object({
      locationId,
      contactId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    execute: ({ locationId, contactId, ...rest }) =>
      attempt(async () =>
        (await ghlFor(locationId)).updateContact(contactId, rest),
      ),
  }),

  deleteContact: tool({
    description:
      "Permanently delete a contact. This cannot be undone — confirm the id first.",
    inputSchema: z.object({ locationId, contactId: z.string() }),
    execute: ({ locationId, contactId }) =>
      attempt(async () => (await ghlFor(locationId)).deleteContact(contactId)),
  }),

  tagContact: tool({
    description: "Add tags to a contact.",
    inputSchema: z.object({
      locationId,
      contactId: z.string(),
      tags: z.array(z.string()).min(1),
    }),
    execute: ({ locationId, contactId, tags }) =>
      attempt(async () =>
        (await ghlFor(locationId)).addContactTags(contactId, tags),
      ),
  }),

  listPipelines: tool({
    description: "List opportunity pipelines and their stages for a sub-account.",
    inputSchema: z.object({ locationId }),
    execute: ({ locationId }) =>
      attempt(async () => (await ghlFor(locationId)).listPipelines(locationId)),
  }),

  findOpportunities: tool({
    description: "Search opportunities in a pipeline.",
    inputSchema: z.object({
      locationId,
      pipelineId: z.string().optional(),
      status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
      limit: z.number().int().max(100).optional(),
    }),
    execute: (input) =>
      attempt(async () =>
        (await ghlFor(input.locationId)).searchOpportunities(input),
      ),
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
    execute: (input) =>
      attempt(async () =>
        (await ghlFor(input.locationId)).createOpportunity(input),
      ),
  }),

  updateOpportunity: tool({
    description: "Move an opportunity between stages or change its value.",
    inputSchema: z.object({
      locationId,
      opportunityId: z.string(),
      pipelineStageId: z.string().optional(),
      status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
      monetaryValue: z.number().optional(),
      name: z.string().optional(),
    }),
    execute: ({ locationId, opportunityId, ...rest }) =>
      attempt(async () =>
        (await ghlFor(locationId)).updateOpportunity(opportunityId, rest),
      ),
  }),

  deleteOpportunity: tool({
    description: "Permanently delete an opportunity. This cannot be undone.",
    inputSchema: z.object({ locationId, opportunityId: z.string() }),
    execute: ({ locationId, opportunityId }) =>
      attempt(async () =>
        (await ghlFor(locationId)).deleteOpportunity(opportunityId),
      ),
  }),

  sendMessage: tool({
    description:
      "Send an SMS or email to a contact from their GoHighLevel conversation.",
    inputSchema: z.object({
      locationId,
      contactId: z.string(),
      type: z.enum(["SMS", "Email"]),
      message: z.string().optional().describe("Body for SMS."),
      subject: z.string().optional().describe("Subject line for email."),
      html: z.string().optional().describe("HTML body for email."),
    }),
    execute: ({ locationId, ...input }) =>
      attempt(async () => (await ghlFor(locationId)).sendMessage(input)),
  }),

  listWorkflows: tool({
    description: "List automation workflows in a sub-account.",
    inputSchema: z.object({ locationId }),
    execute: ({ locationId }) =>
      attempt(async () => (await ghlFor(locationId)).listWorkflows(locationId)),
  }),

  listCalendars: tool({
    description: "List calendars in a sub-account.",
    inputSchema: z.object({ locationId }),
    execute: ({ locationId }) =>
      attempt(async () => (await ghlFor(locationId)).listCalendars(locationId)),
  }),
}

export const copilotTools = { ...panelTools, ...ghlTools }
