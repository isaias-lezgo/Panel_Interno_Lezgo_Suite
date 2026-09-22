import "server-only"

import { GhlClient } from "./client"

/**
 * El token de agencia lista subcuentas pero no puede leer sus oportunidades
 * (401). Este cliente usa un Private Integration Token creado dentro de la
 * subcuenta Lezgo Suite, que es de donde salen los clientes del panel.
 */
export const LEZGO_SUITE_LOCATION_ID =
  process.env.GHL_LEZGO_SUITE_LOCATION_ID ?? "uRFrk77agXq9is0a0gkp"

export const VENTAS_PIPELINE_ID = "6O1DrEbm0UGM1n0urShw"

export function lezgoSuiteEnabled() {
  return Boolean(process.env.GHL_LEZGO_SUITE_TOKEN)
}

export const lezgoSuite = new GhlClient(
  process.env.GHL_LEZGO_SUITE_TOKEN,
  LEZGO_SUITE_LOCATION_ID,
)
