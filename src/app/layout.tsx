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
    default: "Lezgo Suite — Agency Control Panel",
    template: "%s · Lezgo Suite",
  },
  description:
    "Run every client account, implementation, and invoice for a white-labeled GoHighLevel practice from one console.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
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
