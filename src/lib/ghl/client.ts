import "server-only"

/**
 * Thin, typed wrapper over the GoHighLevel API v2.
 *
 * Everything the AI copilot can do goes through this client, so rate limits,
 * auth, and error shape are handled once. Methods are grouped by the object
 * they touch; `request` stays public as an escape hatch for endpoints we
 * have not wrapped yet.
 *
 * Docs: https://highlevel.stoplight.io/docs/integrations
 */

const API_BASE = "https://services.leadconnectorhq.com"
const API_VERSION = "2021-07-28"

export class GhlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = "GhlError"
  }
}

export type GhlContact = {
  id: string
  locationId?: string
  firstName?: string
  lastName?: string
  contactName?: string
  email?: string
  phone?: string
  tags?: string[]
  source?: string
  dateAdded?: string
  customFields?: { id: string; value: unknown }[]
}

/** One clause of a contact search. Fields are camelCase; snake_case is rejected. */
export type ContactFilter = {
  field: string
  operator:
    | "eq"
    | "not_eq"
    | "contains"
    | "not_contains"
    | "wildcard"
    | "not_wildcard"
    | "exists"
    | "not_exists"
    | "range"
    | "contains_set"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "nested"
  value?: unknown
}

export type GhlOpportunity = {
  id: string
  name: string
  pipelineId: string
  pipelineStageId: string
  status: "open" | "won" | "lost" | "abandoned"
  monetaryValue?: number
  contactId?: string
  assignedTo?: string
  updatedAt?: string
}

export type GhlLocation = {
  id: string
  name: string
  address?: string
  city?: string
  country?: string
  timezone?: string
  email?: string
  phone?: string
}

export type GhlPipeline = {
  id: string
  name: string
  stages: { id: string; name: string; position: number }[]
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Overrides the agency token — use when acting inside a sub-account. */
  token?: string
}

export class GhlClient {
  constructor(
    private readonly token = process.env.GHL_API_KEY,
    private readonly defaultLocationId = process.env.GHL_LOCATION_ID,
  ) {}

  get isConfigured() {
    return Boolean(this.token)
  }

  private locationOrThrow(locationId?: string) {
    const id = locationId ?? this.defaultLocationId
    if (!id) {
      throw new GhlError(
        "No locationId given and GHL_LOCATION_ID is not set.",
        400,
        "(client)",
      )
    }
    return id
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const token = options.token ?? this.token
    if (!token) {
      throw new GhlError(
        "GHL_API_KEY is not set. Add it to .env.local to enable live calls.",
        401,
        endpoint,
      )
    }

    const url = new URL(endpoint, API_BASE)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: API_VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    })

    const text = await response.text()
    const payload = text ? safeJson(text) : undefined

    if (!response.ok) {
      throw new GhlError(
        readMessage(payload) ?? `${response.status} ${response.statusText}`,
        response.status,
        endpoint,
        payload,
      )
    }

    return payload as T
  }

  /* ---------------------------------------------------------------- contacts */

  /**
   * Contact search is a POST with a filter body — the old `GET /contacts/`
   * list endpoint is gone. Note it takes `pageLimit`, not `limit`, and field
   * names must be camelCase.
   */
  searchContacts(params: {
    locationId?: string
    pageLimit?: number
    filters?: ContactFilter[]
    sort?: { field: string; direction: "asc" | "desc" }[]
    searchAfter?: unknown[]
  }) {
    return this.request<{
      contacts: GhlContact[]
      total?: number
      searchAfter?: unknown[]
    }>("/contacts/search", {
      method: "POST",
      body: {
        locationId: this.locationOrThrow(params.locationId),
        pageLimit: params.pageLimit ?? 20,
        filters: params.filters,
        sort: params.sort ?? [{ field: "dateAdded", direction: "desc" }],
        searchAfter: params.searchAfter,
      },
    })
  }

  getContact(contactId: string) {
    return this.request<{ contact: GhlContact }>(`/contacts/${contactId}`)
  }

  createContact(input: Partial<GhlContact> & { locationId?: string }) {
    return this.request<{ contact: GhlContact }>("/contacts/", {
      method: "POST",
      body: { ...input, locationId: this.locationOrThrow(input.locationId) },
    })
  }

  updateContact(contactId: string, input: Partial<GhlContact>) {
    return this.request<{ contact: GhlContact }>(`/contacts/${contactId}`, {
      method: "PUT",
      body: input,
    })
  }

  deleteContact(contactId: string) {
    return this.request<{ succeded: boolean }>(`/contacts/${contactId}`, {
      method: "DELETE",
    })
  }

  addContactTags(contactId: string, tags: string[]) {
    return this.request<{ tags: string[] }>(`/contacts/${contactId}/tags`, {
      method: "POST",
      body: { tags },
    })
  }

  /* ----------------------------------------------------------- opportunities */

  searchOpportunities(params: {
    locationId?: string
    pipelineId?: string
    status?: GhlOpportunity["status"]
    limit?: number
  }) {
    return this.request<{ opportunities: GhlOpportunity[] }>(
      "/opportunities/search",
      {
        query: {
          location_id: this.locationOrThrow(params.locationId),
          pipelineId: params.pipelineId,
          status: params.status,
          limit: params.limit ?? 25,
        },
      },
    )
  }

  createOpportunity(input: {
    locationId?: string
    pipelineId: string
    pipelineStageId: string
    name: string
    status?: GhlOpportunity["status"]
    monetaryValue?: number
    contactId?: string
  }) {
    return this.request<{ opportunity: GhlOpportunity }>("/opportunities/", {
      method: "POST",
      body: {
        ...input,
        status: input.status ?? "open",
        locationId: this.locationOrThrow(input.locationId),
      },
    })
  }

  updateOpportunity(
    opportunityId: string,
    input: Partial<Omit<GhlOpportunity, "id">>,
  ) {
    return this.request<{ opportunity: GhlOpportunity }>(
      `/opportunities/${opportunityId}`,
      { method: "PUT", body: input },
    )
  }

  deleteOpportunity(opportunityId: string) {
    return this.request<{ succeded: boolean }>(
      `/opportunities/${opportunityId}`,
      { method: "DELETE" },
    )
  }

  listPipelines(locationId?: string) {
    return this.request<{ pipelines: GhlPipeline[] }>(
      "/opportunities/pipelines",
      { query: { locationId: this.locationOrThrow(locationId) } },
    )
  }

  /* --------------------------------------------------------------- locations */

  /** Sub-accounts. One per client in our book of business. */
  searchLocations(params: { limit?: number; skip?: number } = {}) {
    return this.request<{ locations: GhlLocation[] }>("/locations/search", {
      query: { limit: params.limit ?? 50, skip: params.skip ?? 0 },
    })
  }

  getLocation(locationId?: string) {
    return this.request<{ location: GhlLocation }>(
      `/locations/${this.locationOrThrow(locationId)}`,
    )
  }

  listCustomFields(locationId?: string) {
    return this.request<{ customFields: { id: string; name: string }[] }>(
      `/locations/${this.locationOrThrow(locationId)}/customFields`,
    )
  }

  /* ----------------------------------------------------- conversations & ops */

  sendMessage(input: {
    contactId: string
    type: "SMS" | "Email"
    message?: string
    subject?: string
    html?: string
  }) {
    return this.request<{ conversationId: string; messageId: string }>(
      "/conversations/messages",
      { method: "POST", body: input },
    )
  }

  listWorkflows(locationId?: string) {
    return this.request<{ workflows: { id: string; name: string; status: string }[] }>(
      "/workflows/",
      { query: { locationId: this.locationOrThrow(locationId) } },
    )
  }

  listCalendars(locationId?: string) {
    return this.request<{ calendars: { id: string; name: string }[] }>(
      "/calendars/",
      { query: { locationId: this.locationOrThrow(locationId) } },
    )
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function readMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message: unknown }).message
    return Array.isArray(message) ? message.join(", ") : String(message)
  }
  return undefined
}

export const ghl = new GhlClient()
