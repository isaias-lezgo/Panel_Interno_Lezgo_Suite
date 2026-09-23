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
  /** GHL lo devuelve en minúsculas; para mostrar usa `firstName`/`lastName`. */
  contactName?: string
  companyName?: string | null
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

export type GhlLocation = {
  id: string
  companyId?: string
  name: string
  address?: string
  city?: string
  country?: string
  timezone?: string
  email?: string
  phone?: string
}

/** Usuario de GHL. `roles.type` es "account" para los de subcuenta. */
export type GhlUser = {
  id: string
  name: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  deleted?: boolean
  dateAdded?: string
  roles?: {
    type?: "account" | "agency"
    role?: "admin" | "user"
    locationIds?: string[]
  }
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
    /** Texto libre: nombre, correo, teléfono o empresa. */
    query?: string
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
        query: params.query,
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
      meta: {
        total: number
        startAfter?: number
        startAfterId?: string
        nextPageUrl?: string
      }
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

  listPipelines(locationId?: string, token?: string) {
    return this.request<{ pipelines: GhlPipeline[] }>(
      "/opportunities/pipelines",
      { token, query: { locationId: this.locationOrThrow(locationId) } },
    )
  }

  /* --------------------------------------------------------------- locations */

  /** Sub-accounts. One per client in our book of business. */
  searchLocations(params: { limit?: number; skip?: number } = {}) {
    return this.request<{ locations: GhlLocation[] }>("/locations/search", {
      query: { limit: params.limit ?? 50, skip: params.skip ?? 0 },
    })
  }

  /** Todas las subcuentas de la agencia. Pagina de 100 en 100 con `skip`. */
  async listAllLocations() {
    const all: GhlLocation[] = []
    for (let skip = 0; ; skip += 100) {
      const { locations } = await this.searchLocations({ limit: 100, skip })
      all.push(...locations)
      if (locations.length < 100) return all
    }
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

  /* ------------------------------------------------------------------- users */

  /**
   * Usuarios de una subcuenta. Con token de agencia `GET /users/?locationId=`
   * responde "Token's user type mismatch!"; hay que usar `/users/search` con
   * `companyId`. Trae también a los de agencia que tienen acceso a la
   * subcuenta, con `roles.type` = "account" igual que los del cliente.
   */
  searchUsers(params: { companyId: string; locationId: string; limit?: number }) {
    return this.request<{ users: GhlUser[]; count: number }>("/users/search", {
      query: {
        companyId: params.companyId,
        locationId: params.locationId,
        limit: params.limit ?? 100,
      },
    })
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
