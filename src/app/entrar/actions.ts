"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  createSessionToken,
  panelLock,
  safeNext,
  same,
  SESSION_COOKIE,
} from "@/lib/auth/session"

export type LoginState = { error: string | null; user: string }

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const lock = panelLock()
  if (lock.mode === "open") redirect("/")
  if (lock.mode === "closed") return { error: "Falta PANEL_PASSWORD: el panel está cerrado.", user: "" }

  const user = String(form.get("user") ?? "").trim()
  const password = String(form.get("password") ?? "")
  // Evalúa ambas comparaciones siempre, para no revelar cuál falló.
  const userOk = same(user, lock.user)
  const passwordOk = same(password, lock.password)

  if (!userOk || !passwordOk) {
    // Frena los intentos en serie sin necesitar estado entre instancias.
    await new Promise((r) => setTimeout(r, 800))
    return { error: "Usuario o contraseña incorrectos.", user }
  }

  const { token, expires } = createSessionToken(lock.user, lock.password)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  })

  redirect(safeNext(form.get("next")))
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect("/entrar")
}
