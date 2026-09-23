"use client"

import { useState, useTransition } from "react"
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import {
  updateClientAccount,
  type AccountPatch,
} from "@/app/(panel)/clientes/actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dueStatus } from "@/lib/implementations/due"
import type {
  AccountSource,
  BillingPeriod,
  ClientAccount,
  Derived,
  Membership,
} from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Las celdas editables de la tabla de clientes. Cada una enseña el valor ya
 * resuelto y dice de dónde salió: en gris lo que dedujo el panel, en negro
 * lo que alguien escribió. Elegir "Automático" borra lo escrito y devuelve
 * la celda a Stripe o a la etapa de GHL.
 */

export const membershipLabel: Record<Membership, string> = {
  start: "Start",
  growth: "Growth",
  pro: "Pro",
  elite: "Elite",
}

export const periodLabel: Record<BillingPeriod, string> = {
  "1m": "1 mes",
  "3m": "3 meses",
  "6m": "6 meses",
  "1y": "1 año",
}

const origen: Record<AccountSource, string> = {
  manual: "Escrito a mano.",
  stripe: "Deducido de su suscripción en Stripe.",
  ghl: "Deducido de su etapa en GoHighLevel.",
}

function hint(source: AccountSource | null, vacio: string) {
  if (!source) return vacio
  return source === "manual"
    ? `${origen.manual} Elige "Automático" para volver a lo deducido.`
    : `${origen[source]} Escríbelo para fijarlo.`
}

/** Guarda una columna y deja el error a la vista en la propia celda. */
function useSave(clientId: string) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const save = (patch: AccountPatch, revert: () => void) =>
    start(async () => {
      const r = await updateClientAccount(clientId, patch)
      if (r.ok) {
        setError(null)
        // El valor ya viene del servidor: el borrador local estorba.
        revert()
      } else {
        setError(r.error)
        revert()
      }
    })

  return { pending, error, save }
}

function Aviso({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <span title={error} className="text-status-risk">
      <TriangleAlertIcon aria-label={error} className="size-3.5 shrink-0" />
    </span>
  )
}

const triggerClass = (source: AccountSource | null, pending: boolean) =>
  cn(
    "w-full border-transparent px-1.5 hover:border-input hover:bg-muted/40",
    source !== "manual" && "text-muted-foreground",
    pending && "opacity-60",
  )

/** Un desplegable que se ve como texto hasta que lo tocas. */
function CellSelect<T extends string>({
  value,
  source,
  label,
  options,
  empty,
  pending,
  onPick,
}: {
  value: T | null
  source: AccountSource | null
  label: string
  options: { value: T; label: string }[]
  empty: string
  pending: boolean
  onPick: (v: T | null) => void
}) {
  return (
    <Select
      value={value ?? "auto"}
      onValueChange={(v) => onPick(v === "auto" || v === null ? null : (v as T))}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        title={hint(source, empty)}
        className={triggerClass(source, pending)}
      >
        <SelectValue>
          {(v: string) =>
            v === "auto" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              (options.find((o) => o.value === v)?.label ?? v)
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Automático</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MembershipCell({
  clientId,
  field,
}: {
  clientId: string
  field: ClientAccount["membership"]
}) {
  const { pending, error, save } = useSave(clientId)
  const [draft, setDraft] = useState<Membership | null | undefined>()
  const value = draft === undefined ? field.value : draft

  return (
    <div className="flex items-center gap-1">
      <CellSelect
        value={value}
        source={draft === undefined ? field.source : "manual"}
        label="Membresía"
        empty="Ningún producto de Stripe nombra el nivel. Elígelo a mano."
        pending={pending}
        options={(Object.keys(membershipLabel) as Membership[]).map((m) => ({
          value: m,
          label: membershipLabel[m],
        }))}
        onPick={(v) => {
          setDraft(v)
          save({ membership: v }, () => setDraft(undefined))
        }}
      />
      <Aviso error={error} />
    </div>
  )
}

export function PeriodCell({
  clientId,
  field,
}: {
  clientId: string
  field: ClientAccount["period"]
}) {
  const { pending, error, save } = useSave(clientId)
  const [draft, setDraft] = useState<BillingPeriod | null | undefined>()
  const value = draft === undefined ? field.value : draft

  return (
    <div className="flex items-center gap-1">
      <CellSelect
        value={value}
        source={draft === undefined ? field.source : "manual"}
        label="Periodicidad"
        empty="Sin suscripción activa en Stripe. Elige cada cuánto se cobra."
        pending={pending}
        options={(Object.keys(periodLabel) as BillingPeriod[]).map((p) => ({
          value: p,
          label: periodLabel[p],
        }))}
        onPick={(v) => {
          setDraft(v)
          save({ billingPeriod: v }, () => setDraft(undefined))
        }}
      />
      <Aviso error={error} />
    </div>
  )
}

export function SupportCell({
  clientId,
  field,
}: {
  clientId: string
  field: ClientAccount["support"]
}) {
  const { pending, error, save } = useSave(clientId)
  const [draft, setDraft] = useState<boolean | null | undefined>()
  const value = draft === undefined ? field.value : draft
  const source = draft === undefined ? field.source : "manual"

  return (
    <div className="flex items-center gap-1">
      <Select
        value={value === null ? "auto" : value ? "si" : "no"}
        onValueChange={(v) => {
          const next = v === "auto" || v === null ? null : v === "si"
          setDraft(next)
          save({ supportActive: next }, () => setDraft(undefined))
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Servicio técnico"
          title={hint(
            source,
            "Sin suscripción ni etapa que lo diga. Márcalo a mano.",
          )}
          className={triggerClass(source, pending)}
        >
          <SelectValue>
            {(v: string) =>
              v === "auto" ? (
                <span className="text-muted-foreground">—</span>
              ) : v === "si" ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-status-live"
                  />
                  Activo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-status-idle"
                  />
                  Sin servicio
                </span>
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Automático</SelectItem>
          <SelectItem value="si">Activo</SelectItem>
          <SelectItem value="no">Sin servicio</SelectItem>
        </SelectContent>
      </Select>
      <Aviso error={error} />
    </div>
  )
}

/**
 * El vencimiento sale del fin del periodo en curso en Stripe, así que se
 * mueve solo cada renovación. Escribir una fecha lo congela; el botón de
 * volver lo suelta.
 */
export function DueCell({
  clientId,
  field,
}: {
  clientId: string
  field: Derived<string>
}) {
  const { pending, error, save } = useSave(clientId)
  const [draft, setDraft] = useState<string | null | undefined>()
  const value = draft === undefined ? field.value : draft
  const source = draft === undefined ? field.source : "manual"
  const estado = dueStatus(value)

  return (
    <div className="flex items-center gap-1">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", {
          "bg-status-risk": estado.tone === "risk",
          "bg-status-warn": estado.tone === "warn",
          "bg-status-live": estado.tone === "live",
          "bg-status-build": estado.tone === "build",
        })}
      />
      <input
        type="date"
        value={value ?? ""}
        aria-label="Vencimiento de licencia"
        title={`${value ? estado.label : "Sin fecha de vencimiento"}. ${hint(
          source,
          "Sin suscripción activa en Stripe. Escribe la fecha.",
        )}`}
        onChange={(e) => {
          const next = e.target.value || null
          setDraft(next)
          save({ licenseDueAt: next }, () => setDraft(undefined))
        }}
        className={cn(
          "num h-7 w-[7.5rem] rounded-md border border-transparent bg-transparent px-1 text-sm outline-none hover:border-input hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          source !== "manual" && "text-muted-foreground",
          pending && "opacity-60",
        )}
      />
      {source === "manual" && (
        <button
          type="button"
          aria-label="Volver a la fecha de Stripe"
          title="Volver a la fecha de Stripe"
          onClick={() => {
            setDraft(null)
            save({ licenseDueAt: null }, () => setDraft(undefined))
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <RotateCcwIcon className="size-3" />
        </button>
      )}
      <Aviso error={error} />
    </div>
  )
}
