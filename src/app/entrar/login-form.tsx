"use client"

import { useActionState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { login, type LoginState } from "./actions"

const initial: LoginState = { error: null, user: "" }

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initial)

  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="grid gap-1.5">
        <Label htmlFor="user">Usuario</Label>
        <Input
          id="user"
          name="user"
          defaultValue={state.user}
          key={state.user}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus={!state.user}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoFocus={Boolean(state.user)}
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>

      {state.error ? (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-1 h-9">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  )
}
