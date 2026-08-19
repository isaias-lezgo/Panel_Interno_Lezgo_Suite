import { AppRail } from "@/components/shell/app-rail"
import { MobileNav } from "@/components/shell/mobile-nav"
import { TopBar } from "@/components/shell/top-bar"
import { ghl } from "@/lib/ghl/client"
import { listClients } from "@/lib/repository"

/**
 * Un panel de operaciones no puede servir cifras congeladas en el build:
 * cada vista se renderiza por petición contra Neon y GoHighLevel.
 */
export const dynamic = "force-dynamic"

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const clients = await listClients()

  return (
    <div className="flex min-h-dvh bg-background">
      <AppRail ghlConnected={ghl.isConfigured} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          clients={clients}
          operator={{ name: "Isaias Rios", role: "Fundador" }}
        />
        <MobileNav />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
