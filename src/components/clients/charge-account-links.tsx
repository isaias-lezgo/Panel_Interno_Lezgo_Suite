"use client"

import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"

import {
  linkChargeAccount,
  searchChargeAccounts,
  unlinkChargeAccount,
} from "@/app/(panel)/clientes/actions"
import { EmptyState } from "@/components/panel/page-header"
import { StatusChip } from "@/components/signal/status-chip"
import { Button } from "@/components/ui/button"
import { moneySigned, shortDate } from "@/lib/format"
import type { ChargeAccount, ClientDetail, Currency } from "@/lib/types"

import { LinkPicker } from "./link-picker"

type Result = { ok: true } | { ok: false; error: string }

/** "$1,403 · 5 recargas": lo cobrado en 12 meses, cada moneda aparte. */
function resumen(
  a: Pick<ChargeAccount, "charges" | "recharges" | "totals">,
  base: Currency,
) {
  if (a.charges === 0) return "Sin cobros en 12 meses"
  const importes = (Object.entries(a.totals) as [Currency, number][])
    .map(([c, v]) => moneySigned(v, c, base))
    .join(" + ")
  const que =
    a.recharges === a.charges
      ? `${a.recharges} ${a.recharges === 1 ? "recarga" : "recargas"}`
      : `${a.charges} ${a.charges === 1 ? "cobro" : "cobros"}`
  return `${importes} · ${que}`
}

export function ChargeAccountLinks({
  clientId,
  links,
  options,
  optionsTotal,
  optionsError,
  currency,
}: {
  clientId: string
  links: ClientDetail["chargeAccounts"]
  options: ChargeAccount[]
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

  const toOption = (a: ChargeAccount) => ({
    value: a.id,
    label: a.name,
    detail: `${a.email ?? a.id}${a.lastAt ? ` · último ${shortDate(a.lastAt)}` : ""}`,
    badge: resumen(a, currency),
  })

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {optionsError ?? `${optionsTotal} con cobros y sin dueño`}
        </span>
        <LinkPicker
          options={options.map(toOption)}
          onSearch={async (q) => (await searchChargeAccounts(q)).map(toOption)}
          placeholder="Buscar por nombre, correo o cus_"
          empty="Nadie con cobros coincide."
          buttonLabel="Agregar cuenta de cobro"
          disabled={pending || Boolean(optionsError)}
          onPick={(cus) => run(() => linkChargeAccount(clientId, cus))}
        />
      </div>

      {error && <p className="px-4 pt-3 text-xs text-status-risk">{error}</p>}

      {links.length === 0 ? (
        <EmptyState title="Sin cuentas de cobro">
          Solo hace falta si el cliente paga recargas, SPEI o cobros sueltos
          desde un cliente de Stripe que no es el de su suscripción. No suma al
          MRR.
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
                  {l.lastAt ? `Último cobro ${shortDate(l.lastAt)} · ` : ""}
                  <code className="num">{l.stripeCustomerId}</code>
                </p>
              </div>
              <span className="num text-sm whitespace-nowrap">
                {resumen(l, currency)}
              </span>
              <StatusChip tone={l.linkedBy === "auto" ? "live" : "build"}>
                {l.linkedBy === "auto" ? "Automático" : "Manual"}
              </StatusChip>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={pending}
                aria-label={`Quitar la cuenta de cobro ${l.name}`}
                onClick={() => run(() => unlinkChargeAccount(l.stripeCustomerId))}
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
