"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { flatNav } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Secciones del panel"
      className="flex gap-1 overflow-x-auto border-b border-border bg-rail px-3 py-2 md:hidden"
    >
      {flatNav.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5" aria-hidden />
            {item.title}
          </Link>
        )
      })}
    </nav>
  )
}
