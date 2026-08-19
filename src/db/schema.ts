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
 * Money is stored in whole dollars — we never invoice fractional cents.
 */

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  industry: text("industry").notNull(),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  mrr: integer("mrr").notNull().default(0),
  ghlLocationId: text("ghl_location_id").notNull(),
  owner: text("owner").notNull(),
  seats: integer("seats").notNull().default(0),
  health: integer("health").notNull().default(0),
  startedAt: date("started_at", { mode: "string" }).notNull(),
  renewsAt: date("renews_at", { mode: "string" }).notNull(),
  notes: text("notes"),
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
