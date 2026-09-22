import {
  boolean,
  date,
  integer,
  pgTable,
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

export const implementations = pgTable("implementations", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  stage: text("stage").notNull(),
  progress: integer("progress").notNull().default(0),
  owner: text("owner").notNull(),
  dueAt: date("due_at", { mode: "string" }).notNull(),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  blocked: boolean("blocked").notNull().default(false),
  blockedReason: text("blocked_reason"),
})

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

export const revenue = pgTable("revenue", {
  month: text("month").primaryKey(),
  recurring: integer("recurring").notNull(),
  new: integer("new").notNull(),
  expansion: integer("expansion").notNull(),
  churn: integer("churn").notNull(),
})
