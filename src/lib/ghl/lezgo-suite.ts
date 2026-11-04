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

/**
 * WhatsApp del equipo, conectado con la app de GoGHL ("Whatsapp, iMessage
 * and SMS") como el proveedor "WhatsApp QR" de esta subcuenta. Verificado
 * con un envío real: `type: "SMS"` más este proveedor sale por WhatsApp;
 * `type: "WhatsApp"` sería el canal oficial de Meta, otro número.
 */
export const WHATSAPP_PROVIDER_ID = "6a22bfc4fcbd457e97784fbb"

/**
 * Instancia de GoGHL por la que salen los avisos: `{WA#2}` es el 442 931
 * 5445. Va en cada mensaje: GoGHL recuerda en el contacto (tag `wa:`) el
 * último número usado, y sin la etiqueta saldría por ese.
 */
export const WHATSAPP_INSTANCE = 2

/**
 * Manda un WhatsApp a un contacto de Lezgo Suite. GoGHL quita la etiqueta
 * antes de entregar. Que GHL acepte no garantiza la entrega: GoGHL puede
 * fallar después (teléfono desconectado, destino sin WhatsApp).
 */
export function sendWhatsApp(contactId: string, text: string) {
  return lezgoSuite.sendMessage({
    type: "SMS",
    contactId,
    conversationProviderId: WHATSAPP_PROVIDER_ID,
    message: `{WA#${WHATSAPP_INSTANCE}} ${text}`,
  })
}
