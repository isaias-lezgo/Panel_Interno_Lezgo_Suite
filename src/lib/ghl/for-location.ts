import "server-only"

import { ghl, GhlClient } from "./client"
import { LEZGO_SUITE_LOCATION_ID, lezgoSuite, lezgoSuiteEnabled } from "./lezgo-suite"
import { locationToken, oauthConfigured } from "./oauth"

/**
 * El token de agencia lista subcuentas pero da 401 al leer sus contactos y
 * oportunidades. Lezgo Suite tiene su token propio; las demás, el de la app
 * OAuth. Si la app no llega, se intenta con el de agencia y el error de GHL
 * sale tal cual.
 */
export async function ghlFor(id = process.env.GHL_LOCATION_ID): Promise<GhlClient> {
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
