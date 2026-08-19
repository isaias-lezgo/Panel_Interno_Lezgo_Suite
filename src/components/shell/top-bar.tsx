import Link from "next/link"

import { LinkButton } from "@/components/panel/link-button"
import { CommandMenu } from "@/components/shell/command-menu"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import type { Client } from "@/lib/types"
import { initials } from "@/lib/format"

export function TopBar({
  clients,
  operator,
}: {
  clients: Client[]
  operator: { name: string; role: string }
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <Link href="/" className="display text-sm md:hidden">
        LEZGO
      </Link>

      <div className="flex-1">
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

      <div className="flex items-center gap-2 border-l border-border pl-3">
        <span className="num grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-medium">
          {initials(operator.name)}
        </span>
        <span className="hidden leading-tight lg:block">
          <span className="block text-xs font-medium">{operator.name}</span>
          <span className="eyebrow">{operator.role}</span>
        </span>
      </div>
    </header>
  )
}
