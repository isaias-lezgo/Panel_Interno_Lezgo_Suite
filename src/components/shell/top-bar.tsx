import Image from "next/image"
import Link from "next/link"

import { LinkButton } from "@/components/panel/link-button"
import { CommandMenu } from "@/components/shell/command-menu"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import type { Client } from "@/lib/types"

export function TopBar({ clients }: { clients: Client[] }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <Link
        href="/"
        aria-label="Lezgo Suite, ir al tablero"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-plate md:hidden"
      >
        <Image src="/logo-lezgo-suite.png" alt="" width={24} height={24} />
      </Link>

      <div className="min-w-0 flex-1">
        <CommandMenu clients={clients} />
      </div>

      <LinkButton
        href="/copiloto"
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
      >
        Preguntar al copiloto
      </LinkButton>

      <ThemeToggle />
    </header>
  )
}
