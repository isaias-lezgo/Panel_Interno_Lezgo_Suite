import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

/**
 * Schema mirrors the domain types in `src/lib/types.ts` one-to-one so the
 * repository can hand rows straight to the UI without a mapping layer.
 * `invoices` stores whole dollars (demo data); everything from Stripe is
 * cents and never touches these tables.
 */

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  ghlContactId: text("ghl_contact_id").notNull(),
  stage: text("stage").notNull(),
  wonAt: date("won_at", { mode: "string" }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }).notNull(),
  orphaned: boolean("orphaned").notNull().default(false),
  notes: text("notes"),
  /**
   * Las cuatro columnas de cuenta que se editan en la tabla. Todas aceptan
   * `null` a propósito: vacío significa "usa lo que diga Stripe o la etapa
   * de GHL", y la sincronización nunca las escribe.
   */
  supportActive: boolean("support_active"),
  licenseDueAt: date("license_due_at", { mode: "string" }),
  billingPeriod: text("billing_period"),
  membership: text("membership"),
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

/**
 * Subcuentas de GHL de cada cliente: un cliente puede tener varias, una
 * subcuenta tiene un solo dueño. Quitar un enlace lo archiva (`excluded`).
 */
export const clientGhlLocations = pgTable("client_ghl_locations", {
  ghlLocationId: text("ghl_location_id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  linkedBy: text("linked_by").notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true, mode: "string" }).notNull(),
})

/**
 * Una implementación nace de una subcuenta de GHL y de uno o más contactos
 * de Lezgo Suite. Tipo, responsable y entrega se llenan después, por eso
 * aceptan `null`. `clientId` apunta al cliente del panel cuando alguno de
 * los contactos lo es.
 */
export const implementations = pgTable("implementations", {
  id: text("id").primaryKey(),
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  ghlLocationId: text("ghl_location_id"),
  ghlLocationName: text("ghl_location_name"),
  name: text("name").notNull(),
  kind: text("kind"),
  stage: text("stage").notNull(),
  progress: integer("progress").notNull().default(0),
  owner: text("owner"),
  dueAt: date("due_at", { mode: "string" }),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  blocked: boolean("blocked").notNull().default(false),
  blockedReason: text("blocked_reason"),
})

/**
 * Checklist propio de cada implementación. Nace de la plantilla en
 * `src/lib/implementations/checklist.ts`; un punto con `parentId` es un
 * sub-punto y se borra con su padre.
 */
export const implementationChecklistItems = pgTable(
  "implementation_checklist_items",
  {
    id: text("id").primaryKey(),
    implementationId: text("implementation_id")
      .notNull()
      .references(() => implementations.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(
      (): AnyPgColumn => implementationChecklistItems.id,
      { onDelete: "cascade" },
    ),
    label: text("label").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
)

/** Notas rápidas de una implementación: texto libre con fecha, sin edición. */
export const implementationNotes = pgTable("implementation_notes", {
  id: text("id").primaryKey(),
  implementationId: text("implementation_id")
    .notNull()
    .references(() => implementations.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})

/** Contactos de la subcuenta Lezgo Suite ligados a una implementación. */
export const implementationContacts = pgTable(
  "implementation_contacts",
  {
    implementationId: text("implementation_id")
      .notNull()
      .references(() => implementations.id, { onDelete: "cascade" }),
    ghlContactId: text("ghl_contact_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
  },
  (t) => [primaryKey({ columns: [t.implementationId, t.ghlContactId] })],
)

/**
 * Un pendiente: una frase y, si viene al caso, la subcuenta de la que es.
 * `ghl_location_name` es la foto del nombre al escribirlo, como en
 * `implementations`, para que la lista se lea aunque GHL no conteste.
 * Marcar hecho no borra: `done_at` ordena los tachados al pie del grupo.
 * `owner` es la pestaña en la que vive (`src/lib/pendings/owners.ts`).
 */
export const pendings = pgTable("pendings", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  owner: text("owner").notNull().default("isaias"),
  ghlLocationId: text("ghl_location_id"),
  ghlLocationName: text("ghl_location_name"),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
})

/**
 * El orden de los grupos de subcuenta en la pestaña de cada persona, tal
 * como lo dejó al arrastrarlos. Una subcuenta sin fila aquí va después de
 * las ordenadas, por nombre; "Sin subcuenta" no tiene fila y va al final.
 */
export const pendingGroupOrder = pgTable(
  "pending_group_order",
  {
    owner: text("owner").notNull(),
    ghlLocationId: text("ghl_location_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.ghlLocationId] })],
)

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  issuedAt: date("issued_at", { mode: "string" }).notNull(),
  dueAt: date("due_at", { mode: "string" }).notNull(),
  paidAt: date("paid_at", { mode: "string" }),
  memo: text("memo").notNull(),
})

export const activity = pgTable("activity", {
  id: text("id").primaryKey(),
  at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
  kind: text("kind").notNull(),
  actor: text("actor").notNull(),
  summary: text("summary").notNull(),
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
})


/**
 * Tokens de la app OAuth de GHL. Una sola fila (`id = "agency"`): el token de
 * agencia y su refresh token, cifrados con AES-GCM (`src/lib/ghl/oauth.ts`).
 * Cada refresh token sirve una vez; `version` evita que dos renovaciones
 * simultáneas se pisen.
 */
export const ghlOauthTokens = pgTable("ghl_oauth_tokens", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  scope: text("scope").notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
})

/**
 * Configuración de Lezgo IA por subcuenta. Solo guarda lo que el equipo
 * eligió; los asesores, pipelines y etapas siguen saliendo de GHL.
 * - `settings`: los del equipo, `{ [settingId]: { enabled, option? } }`.
 * - `stageRules`: `{ [pipelineId]: { [stageId]: { idle, action } } }`, por id
 *   de GHL: renombrar una etapa no pierde su regla.
 * Leer y resolver con `src/lib/lezgo-ia/config.ts`, no directo.
 */
export const lezgoIaAccounts = pgTable("lezgo_ia_accounts", {
  ghlLocationId: text("ghl_location_id").primaryKey(),
  status: text("status").notNull().default("unset"),
  settings: jsonb("settings").notNull().default({}),
  voice: jsonb("voice"),
  stageRules: jsonb("stage_rules").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
})

/**
 * Ajustes de un asesor dentro de una subcuenta. Un mismo usuario de GHL en
 * dos subcuentas tiene dos filas. `settings` guarda solo lo que difiere del
 * equipo; lo demás se hereda.
 */
export const lezgoIaAdvisors = pgTable(
  "lezgo_ia_advisors",
  {
    ghlLocationId: text("ghl_location_id").notNull(),
    ghlUserId: text("ghl_user_id").notNull(),
    alerts: boolean("alerts").notNull().default(false),
    settings: jsonb("settings").notNull().default({}),
    awayFrom: date("away_from", { mode: "string" }),
    awayTo: date("away_to", { mode: "string" }),
    /** "manager" o el id de GHL del asesor que cubre. */
    awayCoverage: text("away_coverage"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.ghlLocationId, t.ghlUserId] })],
)
