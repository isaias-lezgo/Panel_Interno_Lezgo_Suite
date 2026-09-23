"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { nav } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function AppRail({ ghlConnected }: { ghlConnected: boolean }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Secciones del panel"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-rail md:flex"
    >
      <Link
        href="/"
        aria-label="Lezgo Suite, ir al tablero"
        className="flex h-16 items-center justify-center border-b border-border bg-brand-plate focus-visible:outline-offset-[-2px]"
      >
        <Image
          src="/logo-lezgo-suite.png"
          alt=""
          width={40}
          height={40}
          priority
        />
      </Link>

      <div className="flex-1 space-y-6 px-3 py-4">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="eyebrow px-2 pb-2">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 h-4 w-[2px] rounded-full bg-primary transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <item.icon className="size-4" aria-hidden />
                      {item.title}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-4">
        <p className="eyebrow">GoHighLevel</p>
        <p className="mt-2 flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              ghlConnected ? "bg-status-live" : "bg-status-idle",
            )}
          />
          {ghlConnected ? "API conectada" : "Sin conexión"}
        </p>
        {!ghlConnected && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Agrega GHL_API_KEY para ejecutar llamadas reales.
          </p>
        )}
      </div>
    </nav>
  )
}
