import { generateKeyPairSync, sign } from "node:crypto"

import { describe, expect, it } from "vitest"

import { verifyGhlSignature } from "./webhook-signature"

const { publicKey, privateKey } = generateKeyPairSync("ed25519")
const pem = publicKey.export({ type: "spki", format: "pem" }).toString()
const body = JSON.stringify({ type: "InboundMessage", contactId: "c1" })
const signature = sign(null, Buffer.from(body), privateKey).toString("base64")

describe("verifyGhlSignature", () => {
  it("acepta el cuerpo firmado con la llave", () => {
    expect(verifyGhlSignature(body, signature, pem)).toBe(true)
  })

  it("rechaza un cuerpo alterado, una firma ajena o ninguna", () => {
    expect(verifyGhlSignature(body.replace("c1", "c2"), signature, pem)).toBe(false)
    expect(verifyGhlSignature(body, signature)).toBe(false) // llave de GHL, firma nuestra
    expect(verifyGhlSignature(body, null, pem)).toBe(false)
    expect(verifyGhlSignature(body, "no-es-base64-válido", pem)).toBe(false)
  })
})
