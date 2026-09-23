"use client"

import { useState } from "react"

import { ActionsTab } from "@/components/lezgo-ia/actions-tab"
import { ConfigTab } from "@/components/lezgo-ia/config-tab"
import { MessagesTab } from "@/components/lezgo-ia/messages-tab"
import { OverviewTab } from "@/components/lezgo-ia/overview-tab"
import type { LezgoIaTab } from "@/components/lezgo-ia/tabs"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LezgoIaData } from "@/data/lezgo-ia"

type Tab = LezgoIaTab

/**
 * Las dos pestañas de Lezgo IA. El tab activo se refleja en `?tab=` para que
 * un enlace a "Mensajes" abra directo ahí, sin pasar por el router: la vista
 * es puro cliente y no necesita re-renderizar el servidor.
 */
export function LezgoIaView({
  initialTab,
  initialAccount,
  data,
}: {
  initialTab: Tab
  initialAccount?: string
  data: LezgoIaData
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const { subaccounts, threads } = data

  const activeAccounts = subaccounts.filter((s) => s.status === "active").length
  const advisorsWithAlerts = subaccounts
    .flatMap((s) => s.advisors)
    .filter((a) => a.alerts).length
  const weeklyMessages = subaccounts.reduce((sum, s) => sum + s.weeklyMessages, 0)
  const pending = threads.filter((t) =>
    t.messages.some((m) => m.actions && !m.actions.some((a) => a.chosen)),
  ).length

  return (
    <div className="space-y-4">
      <section
        aria-label="Telemetría de Lezgo IA"
        className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:divide-x lg:grid-cols-4"
      >
        <Readout label="Subcuentas con IA activa" value={activeAccounts} hint={`de ${subaccounts.length} ${data.source === "ghl" ? "enlazadas a un cliente" : "conectadas"}`} />
        <Readout label="Asesores con avisos" value={advisorsWithAlerts} hint="reciben mensajes de la IA" />
        <Readout label="Mensajes esta semana" value={weeklyMessages} hint="entre la IA y los asesores" />
        <Readout label="Esperan respuesta" value={pending} hint="propuestas sin decidir" tone={pending > 0 ? "warn" : undefined} />
      </section>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as Tab
          setTab(next)
          const url = new URL(window.location.href)
          url.searchParams.set("tab", next)
          window.history.replaceState(null, "", url)
        }}
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b border-border pb-1">
          <TabsTrigger value="resumen" className="flex-none px-2">
            Resumen
            {pending > 0 && (
              <span className="num rounded-full bg-status-warn/15 px-1.5 text-[11px] text-status-warn">
                {pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="configuracion" className="flex-none px-2">
            Configuración
          </TabsTrigger>
          <TabsTrigger value="mensajes" className="flex-none px-2">
            Mensajes
          </TabsTrigger>
          <TabsTrigger value="bitacora" className="flex-none px-2">
            Bitácora
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="pt-3">
          <OverviewTab data={data} />
        </TabsContent>
        <TabsContent value="configuracion" className="pt-3">
          <ConfigTab data={data} initialAccount={initialAccount} />
        </TabsContent>
        <TabsContent value="mensajes" className="pt-3">
          <MessagesTab data={data} />
        </TabsContent>
        <TabsContent value="bitacora" className="pt-3">
          <ActionsTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Readout({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint: string
  tone?: "warn"
}) {
  return (
    <div className="px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p
        className={
          tone === "warn"
            ? "num mt-1.5 text-[22px] leading-none font-semibold text-status-warn"
            : "num mt-1.5 text-[22px] leading-none font-semibold"
        }
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
