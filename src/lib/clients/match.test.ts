import { describe, expect, it } from "vitest"

import {
  autoLink,
  matches,
  normalizeEmail,
  normalizeName,
  phoneKey,
  type LinkSubject,
  type LinkTarget,
} from "./match"

const subject = (o: Partial<LinkSubject> & { id: string }): LinkSubject => ({
  names: [],
  email: null,
  phone: null,
  ...o,
})
const target = (o: Partial<LinkTarget> & { id: string }): LinkTarget => ({
  name: null,
  email: null,
  phone: null,
  ...o,
})

describe("normalizeName", () => {
  it("quita acentos, puntuación, espacios y sufijos societarios", () => {
    expect(normalizeName("Inmobiliaria HG, S.A. de C.V.")).toBe("inmobiliariahg")
    expect(normalizeName("Janet de la Cruz y asociados ")).toBe(
      "janetdelacruzyasociados",
    )
    expect(normalizeName("Sebastián Muradás")).toBe("sebastianmuradas")
  })
})

describe("normalizeEmail", () => {
  it("baja a minúsculas y recorta", () => {
    expect(normalizeEmail(" Dposada@b-inmo.com ")).toBe("dposada@b-inmo.com")
  })
})

describe("phoneKey", () => {
  it("compara los últimos 10 dígitos", () => {
    expect(phoneKey("+52 1 55 1005 5391")).toBe("5510055391")
    expect(phoneKey("+525510055391")).toBe("5510055391")
  })
  it("devuelve null con menos de 10 dígitos o vacío", () => {
    expect(phoneKey("12345")).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })
})

describe("matches", () => {
  it("empata por correo", () => {
    expect(
      matches(
        subject({ id: "a", email: "Sergio.Lujano@pylpatrimonial.com" }),
        target({ id: "cus_1", email: "sergio.lujano@pylpatrimonial.com" }),
      ),
    ).toBe(true)
  })
  it("empata por teléfono con o sin el 1 de larga distancia", () => {
    expect(
      matches(
        subject({ id: "a", phone: "+528119771143" }),
        target({ id: "cus_1", phone: "+5218119771143" }),
      ),
    ).toBe(true)
  })
  it("empata por nombre exacto contra cualquiera de los nombres del sujeto", () => {
    expect(
      matches(
        subject({ id: "a", names: ["Zuriel Rodríguez", "You Can Drive"] }),
        target({ id: "loc_1", name: "You Can Drive" }),
      ),
    ).toBe(true)
  })
  it("no empata nombres parecidos pero no idénticos", () => {
    expect(
      matches(
        subject({ id: "a", names: ["You Can Drive"] }),
        target({ id: "loc_1", name: "Escuela You Can Drive" }),
      ),
    ).toBe(false)
  })
  it("no empata con campos vacíos", () => {
    expect(matches(subject({ id: "a" }), target({ id: "x" }))).toBe(false)
    expect(
      matches(subject({ id: "a", email: "" }), target({ id: "x", email: "" })),
    ).toBe(false)
  })
})

describe("autoLink", () => {
  it("enlaza todos los targets que cumplan a un sujeto (many)", () => {
    const links = autoLink(
      [subject({ id: "ricardo", email: "corporacionlacoladamexico@gmail.com" })],
      [
        target({ id: "cus_UAS7", email: "corporacionlacoladamexico@gmail.com" }),
        target({ id: "cus_V8lq", email: "corporacionlacoladamexico@gmail.com" }),
        target({ id: "cus_otro", email: "otro@x.com" }),
      ],
      "many",
    )
    expect([...links.entries()]).toEqual([
      ["cus_UAS7", "ricardo"],
      ["cus_V8lq", "ricardo"],
    ])
  })
  it("no enlaza un target que cumple para dos sujetos", () => {
    const links = autoLink(
      [
        subject({ id: "a", phone: "+525512345678" }),
        subject({ id: "b", phone: "+525512345678" }),
      ],
      [target({ id: "cus_1", phone: "+525512345678" })],
      "many",
    )
    expect(links.size).toBe(0)
  })
  it("en modo one, un sujeto que empata con dos targets no se enlaza a ninguno", () => {
    const links = autoLink(
      [subject({ id: "amir", email: "hola@amircherit.com" })],
      [
        target({ id: "loc_1", name: "Amir Cherit", email: "hola@amircherit.com" }),
        target({
          id: "loc_2",
          name: "Amir Cherit Cuenta Respaldo",
          email: "hola@amircherit.com",
        }),
      ],
      "one",
    )
    expect(links.size).toBe(0)
  })
  it("en modo one, enlaza cuando la relación es 1↔1", () => {
    const links = autoLink(
      [subject({ id: "hg", names: ["Inmobiliaria HG"] })],
      [target({ id: "loc_hg", name: "Inmobiliaria HG" })],
      "one",
    )
    expect(links.get("loc_hg")).toBe("hg")
  })
})
