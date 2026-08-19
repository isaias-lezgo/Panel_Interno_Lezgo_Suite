import type { Metadata } from "next"
import { Archivo, Inter_Tight, JetBrains_Mono } from "next/font/google"

import { ThemeProvider } from "@/components/providers/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const display = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
})

const body = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-body",
})

const data = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data",
})

export const metadata: Metadata = {
  title: {
    default: "Lezgo Suite — Panel interno",
    template: "%s · Lezgo Suite",
  },
  description:
    "Gestiona clientes, implementaciones y facturación de una agencia que revende GoHighLevel en marca blanca, desde una sola consola.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${data.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
