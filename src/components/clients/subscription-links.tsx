"use client"

import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"

import {
  linkStripeSubscription,
  searchStripeSubscriptions,
  unlinkStripeSubscription,
} from "@/app/(panel)/clientes/actions"
import { EmptyState } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { statusLabel, statusTone } from "@/lib/clients/subscriptions"
import { money } from "@/lib/format"
import type {
  ClientDetail,
  Currency,
  SubscriptionOption,
} from "@/lib/types"

import { LinkPicker } from "./link-picker"

type Result = { ok: true } | { ok: false; error: string }

export function SubscriptionLinks({
  clientId,
  links,
  options,
  optionsTotal,
  optionsError,
  currency,
}: {
  clientId: string
  links: ClientDetail["subscriptions"]
  options: SubscriptionOption[]
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

  const toOption = (o: SubscriptionOption) => ({
    value: o.id,
    label: o.customerName,
    detail: `${o.label} · ${o.id}`,
    badge:
      o.mrr !== null ? `${money(o.mrr, currency)}/mes` : statusLabel[o.status],
  })

  const amount = (mrr: number | null) =>
    mrr === null ? "—" : `${money(mrr, currency)}/mes`

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {optionsError ?? `${optionsTotal} sin dueño en la cartera`}
        </span>
        <LinkPicker
          options={options.map(toOption)}
          onSearch={async (q) => (await searchStripeSubscriptions(q)).map(toOption)}
          placeholder="Buscar por cliente, correo o producto"
          empty="Ninguna suscripción coincide."
          buttonLabel="Agregar suscripción"
          disabled={pending || Boolean(optionsError)}
          onPick={(sub) => run(() => linkStripeSubscription(clientId, sub))}
        />
      </div>

      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}

      {links.length === 0 ? (
        <EmptyState title="Sin suscripciones">
          Elige una del desplegable. Las de un cliente de Stripe que coincide
          por correo, teléfono o nombre exacto se enlazan solas al sincronizar,
          y las nuevas de ese mismo cliente lo siguen.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((l) => (
            <li
              key={l.stripeSubscriptionId}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.customerName} ·{" "}
                  <code className="num">{l.stripeSubscriptionId}</code>
                </p>
              </div>
              <span className="num text-sm whitespace-nowrap">
                {amount(l.mrr)}
              </span>
              {l.status ? (
                <StatusChip tone={statusTone[l.status]}>
                  {statusLabel[l.status]}
                </StatusChip>
              ) : (
                <StatusChip tone="idle">Sin datos de Stripe</StatusChip>
              )}
              <StatusChip tone={l.linkedBy === "auto" ? "live" : "build"}>
                {l.linkedBy === "auto" ? "Automático" : "Manual"}
              </StatusChip>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={pending}
                aria-label={`Quitar ${l.label} de ${l.customerName}`}
                onClick={() =>
                  run(() => unlinkStripeSubscription(l.stripeSubscriptionId))
                }
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
