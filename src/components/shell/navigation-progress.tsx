"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/**
 * Next no avisa cuándo empieza una navegación, así que la rayita arranca con
 * el clic en un enlace interno (o con `startNavigation()` para las que salen
 * de `router.push`) y termina cuando cambia la URL.
 */
const START = "panel:navigation-start"

export function startNavigation() {
  window.dispatchEvent(new Event(START))
}

/** Espera antes de mostrarse: una vista ya precargada entra sin parpadeo. */
const SHOW_AFTER_MS = 120
/** Por si la navegación se cancela y la URL nunca cambia. */
const GIVE_UP_AFTER_MS = 15_000

function isInternalNavigation(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false
  }
  const anchor = (event.target as Element | null)?.closest?.("a[href]")
  if (!(anchor instanceof HTMLAnchorElement)) return false
  if (anchor.target && anchor.target !== "_self") return false
  if (anchor.hasAttribute("download")) return false

  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return false
  // Mismo destino o solo cambia el ancla: no hay nada que cargar.
  return (
    url.pathname !== window.location.pathname ||
    url.search !== window.location.search
  )
}

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const url = `${pathname}?${searchParams}`
  const urlRef = useRef(url)
  // Desde qué URL salió la navegación: en cuanto la URL es otra, terminó.
  const [started, setStarted] = useState<{ from: string; shown: boolean }>()
  const pending = started?.from === url

  useEffect(() => {
    urlRef.current = url
  }, [url])

  useEffect(() => {
    const start = () => setStarted({ from: urlRef.current, shown: false })
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigation(event)) start()
    }
    // En captura: `<Link>` hace `preventDefault` en su propio clic, así que
    // en burbuja todo enlace del panel parecería cancelado.
    document.addEventListener("click", onClick, true)
    window.addEventListener(START, start)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener(START, start)
    }
  }, [])

  useEffect(() => {
    if (!pending) return
    const show = setTimeout(
      () => setStarted((s) => s && { ...s, shown: true }),
      SHOW_AFTER_MS,
    )
    const giveUp = setTimeout(() => setStarted(undefined), GIVE_UP_AFTER_MS)
    return () => {
      clearTimeout(show)
      clearTimeout(giveUp)
    }
  }, [pending])

  if (!pending || !started.shown) return null
  return (
    <div
      className="nav-progress"
      role="progressbar"
      aria-label="Cargando la vista"
    />
  )
}
