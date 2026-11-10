import { createPublicKey, verify } from "node:crypto"

/**
 * Firma de los webhooks de una app del Marketplace de GHL. Desde el 1 de
 * septiembre de 2026 solo llega `X-GHL-Signature`: Ed25519 sobre el cuerpo,
 * en base64, con esta llave pública (la misma para todas las apps; está en
 * la guía de webhooks de GHL). La firma RSA vieja, `X-WH-Signature`, ya no
 * se manda y no se acepta.
 *
 * La firma prueba que el aviso viene de GHL, no de qué app ni de qué
 * subcuenta: eso se filtra después, por `locationId` y contacto.
 */
const GHL_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`

export function verifyGhlSignature(
  rawBody: string,
  signature: string | null,
  publicKeyPem = GHL_WEBHOOK_PUBLIC_KEY,
) {
  if (!signature) return false
  try {
    return verify(
      null,
      Buffer.from(rawBody, "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, "base64"),
    )
  } catch {
    return false
  }
}
