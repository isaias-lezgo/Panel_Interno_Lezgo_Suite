"use client"

import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Which icon shows is decided by CSS, not by state, so there is nothing for
 * the server and the client to disagree about on hydration. It reads the
 * theme from <html>, not from the nearest `.dark`: the top bar is always dark.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden size-4 [html.dark_&]:block" />
      <MoonIcon className="size-4 [html.dark_&]:hidden" />
    </Button>
  )
}
