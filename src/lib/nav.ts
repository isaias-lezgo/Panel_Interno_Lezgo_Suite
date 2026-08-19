import type { LucideIcon } from "lucide-react"
import {
  Banknote,
  Gauge,
  Hammer,
  Settings,
  Sparkles,
  Users,
} from "lucide-react"

export type NavItem = { href: string; title: string; icon: LucideIcon }
export type NavGroup = { label: string; items: NavItem[] }

export const nav: NavGroup[] = [
  {
    label: "Resumen",
    items: [{ href: "/", title: "Tablero", icon: Gauge }],
  },
  {
    label: "Cartera",
    items: [
      { href: "/clientes", title: "Clientes", icon: Users },
      { href: "/implementaciones", title: "Implementaciones", icon: Hammer },
      { href: "/facturacion", title: "Facturación", icon: Banknote },
    ],
  },
  {
    label: "Automatización",
    items: [
      { href: "/copiloto", title: "Copiloto", icon: Sparkles },
      { href: "/ajustes", title: "Ajustes", icon: Settings },
    ],
  },
]

export const flatNav: NavItem[] = nav.flatMap((group) => group.items)
