import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { GhlError } from "./client"

/**
 * App OAuth de GHL ("Lezgo AI"), instalada a nivel agencia. Con su token de
 * agencia se pide un token por subcuenta (`POST /oauth/locationToken`), que
 * es lo que sí lee pipelines, oportunidades y conversaciones: el token
 * privado de agencia (`GHL_API_KEY`) da 401 en todo eso.
 *
 * Solo lectura: los scopes de la app son `*.readonly` más `oauth.*`.
 */

const API_BASE = "https://services.leadconnectorhq.com"
const API_VERSION = "2021-07-28"

/** Nuestra agencia. Un callback con otra `companyId` se rechaza. */
export const LEZGO_COMPANY_ID =
  process.env.GHL_COMPANY_ID ?? "LkhcnqrWIwMDHdc6oN5F"

const ROW_ID = "agency"
/** Se renueva si le quedan menos de 5 min: una llamada larga no debe caducar a medias. */
const REFRESH_MARGIN_MS = 5 * 60_000

export function oauthConfigured() {
  return Boolean(
    process.env.GHL_OAUTH_CLIENT_ID && process.env.GHL_OAUTH_CLIENT_SECRET && db,
  )
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  userType?: string
  companyId?: string
  locationId?: string
}

/* ---------------------------------------------------------------- cifrado */

// La llave sale del client secret: si el secret se regenera, los tokens
// guardados dejan de servir de todos modos y hay que reinstalar.
function key() {
  return createHash("sha256")
    .update(`ghl-oauth:${process.env.GHL_OAUTH_CLIENT_SECRET}`)
    .digest()
}

function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".")
}

function decrypt(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"))
  const decipher = createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

/* ------------------------------------------------------------ intercambio */

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GHL_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GHL_OAUTH_CLIENT_SECRET ?? "",
      user_type: "Company",
      ...params,
    }),
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new GhlError(
      payload?.error_description ?? payload?.message ?? `${response.status}`,
      response.status,
      "/oauth/token",
      payload,
    )
  }
  return payload as TokenResponse
}

function toRow(t: TokenResponse, companyId: string) {
  const now = Date.now()
  return {
    companyId,
    accessToken: encrypt(t.access_token),
    refreshToken: encrypt(t.refresh_token),
    expiresAt: new Date(now + t.expires_in * 1000).toISOString(),
    scope: t.scope,
    updatedAt: new Date(now).toISOString(),
  }
}

/**
 * Canjea el `code` del callback. Solo acepta la instalación de nuestra
 * agencia a nivel Company: cualquiera podría pegarle al callback con un
 * código de su propia cuenta y pisarnos el token.
 */
export async function exchangeCode(code: string, redirectUri: string) {
  if (!db) throw new Error("Sin DATABASE_URL no hay dónde guardar el token")
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  })
  if (t.userType !== "Company" || t.companyId !== LEZGO_COMPANY_ID) {
    throw new Error(
      t.userType !== "Company"
        ? "La app se instaló en una subcuenta, no en la agencia. Instálala desde la agencia."
        : "Esa instalación no es de la agencia Lezgo Suite.",
    )
  }
  const row = toRow(t, t.companyId)
  await db
    .insert(schema.ghlOauthTokens)
    .values({ id: ROW_ID, ...row, version: 0 })
    .onConflictDoUpdate({
      target: schema.ghlOauthTokens.id,
      set: { ...row, version: 0 },
    })
  locationTokens.clear()
  return { companyId: t.companyId, scope: t.scope }
}

/* ---------------------------------------------------------- token agencia */

let refreshing: Promise<string> | null = null

export async function oauthStatus() {
  if (!oauthConfigured()) return { connected: false as const }
  const [row] = await db!
    .select({
      scope: schema.ghlOauthTokens.scope,
      updatedAt: schema.ghlOauthTokens.updatedAt,
    })
    .from(schema.ghlOauthTokens)
    .where(eq(schema.ghlOauthTokens.id, ROW_ID))
  return row
    ? { connected: true as const, scope: row.scope, updatedAt: row.updatedAt }
    : { connected: false as const }
}

/** Token de agencia vigente; lo renueva si está por caducar. */
export async function agencyToken(): Promise<string> {
  if (!oauthConfigured()) {
    throw new GhlError("La app OAuth de GHL no está configurada.", 401, "(oauth)")
  }
  const [row] = await db!
    .select()
    .from(schema.ghlOauthTokens)
    .where(eq(schema.ghlOauthTokens.id, ROW_ID))
  if (!row) {
    throw new GhlError(
      "La app OAuth de GHL no está instalada en la agencia.",
      401,
      "(oauth)",
    )
  }
  if (new Date(row.expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return decrypt(row.accessToken)
  }
  // Una sola renovación por proceso a la vez.
  refreshing ??= refresh(row).finally(() => {
    refreshing = null
  })
  return refreshing
}

/**
 * El refresh token es de un solo uso. Si otro proceso ya lo gastó, el
 * UPDATE condicionado a `version` no toca nada y se lee lo que dejó el otro.
 */
async function refresh(row: typeof schema.ghlOauthTokens.$inferSelect) {
  let t: TokenResponse
  try {
    t = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refreshToken),
    })
  } catch (error) {
    // Puede que otro proceso lo haya renovado un instante antes.
    const [fresh] = await db!
      .select()
      .from(schema.ghlOauthTokens)
      .where(eq(schema.ghlOauthTokens.id, ROW_ID))
    if (fresh && fresh.version !== row.version) return decrypt(fresh.accessToken)
    throw error
  }
  const updated = await db!
    .update(schema.ghlOauthTokens)
    .set({ ...toRow(t, row.companyId), version: row.version + 1 })
    .where(
      and(
        eq(schema.ghlOauthTokens.id, ROW_ID),
        eq(schema.ghlOauthTokens.version, row.version),
      ),
    )
    .returning({ id: schema.ghlOauthTokens.id })
  if (updated.length === 0) {
    const [fresh] = await db!
      .select()
      .from(schema.ghlOauthTokens)
      .where(eq(schema.ghlOauthTokens.id, ROW_ID))
    return decrypt(fresh.accessToken)
  }
  return t.access_token
}

/* -------------------------------------------------------- token subcuenta */

const locationTokens = new Map<string, { token: string; expiresAt: number }>()

/** Token de una subcuenta, en memoria hasta 5 min antes de caducar. */
export async function locationToken(locationId: string): Promise<string> {
  const cached = locationTokens.get(locationId)
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached.token
  }
  const response = await fetch(`${API_BASE}/oauth/locationToken`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await agencyToken()}`,
      Version: API_VERSION,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ companyId: LEZGO_COMPANY_ID, locationId }),
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new GhlError(
      payload?.message ?? `${response.status}`,
      response.status,
      "/oauth/locationToken",
      payload,
    )
  }
  const { access_token, expires_in } = payload as TokenResponse
  locationTokens.set(locationId, {
    token: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  })
  return access_token
}
