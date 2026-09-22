"use client"

import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"

import {
  linkStripeCustomer,
  searchStripeCustomers,
  unlinkStripeCustomer,
} from "@/app/(panel)/clientes/actions"
import { EmptyState } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/format"
import type {
  ClientDetail,
  Currency,
  StripeCustomerOption,
} from "@/lib/types"

import { LinkPicker } from "./link-picker"

type Result = { ok: true } | { ok: false; error: string }

export function StripeLinks({
  clientId,
  links,
  options,
  optionsTotal,
  optionsError,
  currency,
}: {
  clientId: string
  links: ClientDetail["stripe"]
  options: StripeCustomerOption[]
  optionsTotal: number
  optionsError: string | null
  currency: Currency
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn()
      setError(r.ok ? null : r.error)
    })

  const toOption = (o: StripeCustomerOption) => ({
    value: o.id,
    label: o.name,
    detail: o.email ?? o.id,
    badge: o.active
      ? o.mrr === null
        ? "Activa"
        : `${money(o.mrr, currency)}/mes`
      : undefined,
  })

  const amount = (mrr: number | null, active: boolean) =>
    !active ? "Sin suscripción" : mrr === null ? "Activa" : `${money(mrr, currency)}/mes`

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {optionsError ?? `${optionsTotal} sin dueño en Stripe`}
        </span>
        <LinkPicker
          options={options.map(toOption)}
          onSearch={async (q) => (await searchStripeCustomers(q)).map(toOption)}
          placeholder="Buscar por nombre o correo"
          empty="Nadie en Stripe coincide."
          buttonLabel="Agregar cliente de Stripe"
          disabled={pending || Boolean(optionsError)}
          onPick={(cus) => run(() => linkStripeCustomer(clientId, cus))}
        />
      </div>

      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}

      {links.length === 0 ? (
        <EmptyState title="Sin cliente de Stripe">
          Elige uno del desplegable. Los que coinciden por correo, teléfono o
          nombre exacto se enlazan solos al sincronizar.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li
              key={l.stripeCustomerId}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.email ?? "Sin correo"} ·{" "}
                  <code className="num">{l.stripeCustomerId}</code>
                </p>
              </div>
              <span className="num text-sm whitespace-nowrap">
                {amount(l.mrr, l.active)}
              </span>
              <StatusChip tone={l.linkedBy === "auto" ? "live" : "build"}>
                {l.linkedBy === "auto" ? "Automático" : "Manual"}
              </StatusChip>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={pending}
                aria-label={`Quitar ${l.name}`}
                onClick={() => run(() => unlinkStripeCustomer(l.stripeCustomerId))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
