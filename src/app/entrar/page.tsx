import type { Metadata } from "next"
import Image from "next/image"

import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Entrar" }

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="dark grid size-10 place-items-center rounded-lg bg-brand-plate">
            <Image src="/logo-lezgo-casa.png" alt="" width={26} height={26} priority />
          </div>
          <div>
            <p className="text-base font-semibold leading-tight">Lezgo Suite</p>
            <p className="text-sm text-muted-foreground">Panel interno del equipo</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Entrar al panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usa el usuario y la contraseña del equipo.
          </p>
          <LoginForm next={next ?? ""} />
        </div>
      </div>
    </main>
  )
}
