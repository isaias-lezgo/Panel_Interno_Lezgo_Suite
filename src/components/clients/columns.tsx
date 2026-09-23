"use client"

import { useSyncExternalStore } from "react"
import { Columns3Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Qué columnas se ven en la tabla de clientes. Son diez y no caben juntas
 * en una pantalla de portátil, así que cada quien enciende las suyas y la
 * elección se queda en el navegador. La columna "Cliente" no se apaga: sin
 * ella la fila no dice de quién habla.
 */

export type ColumnKey =
  | "etapa"
  | "membresia"
  | "soporte"
  | "periodicidad"
  | "vencimiento"
  | "subcuenta"
  | "stripe"
  | "mrr"
  | "cerrado"

export const columnLabel: Record<ColumnKey, string> = {
  etapa: "Etapa",
  membresia: "Membresía",
  soporte: "Servicio técnico",
  periodicidad: "Periodicidad",
  vencimiento: "Vencimiento",
  subcuenta: "Subcuenta GHL",
  stripe: "Stripe",
  mrr: "MRR",
  cerrado: "Cerrado",
}

/** El orden en el que se dibujan, encendidas o no. */
export const columnOrder: ColumnKey[] = [
  "etapa",
  "membresia",
  "soporte",
  "periodicidad",
  "vencimiento",
  "subcuenta",
  "stripe",
  "mrr",
  "cerrado",
]

/** Lo que se ve al llegar: todo menos Stripe y Cerrado, que caben peor. */
export const defaultColumns: ColumnKey[] = [
  "etapa",
  "membresia",
  "soporte",
  "periodicidad",
  "vencimiento",
  "subcuenta",
  "mrr",
]

const CLAVE = "lezgo.clientes.columnas"

/**
 * La elección vive fuera de React —en `localStorage`— y por eso se lee con
 * `useSyncExternalStore`: el servidor devuelve las de siempre y el navegador
 * las guardadas, sin que el primer render pinte un HTML distinto al del
 * servidor. `guardadas` se conserva para que la instantánea sea estable.
 */
let guardadas: ColumnKey[] | null = null
const oyentes = new Set<() => void>()

function leer(): ColumnKey[] {
  if (guardadas) return guardadas
  try {
    const raw = localStorage.getItem(CLAVE)
    const saved = raw ? JSON.parse(raw) : null
    guardadas = Array.isArray(saved)
      ? columnOrder.filter((c) => saved.includes(c))
      : defaultColumns
  } catch {
    // Un navegador sin almacenamiento se queda con las de siempre.
    guardadas = defaultColumns
  }
  return guardadas
}

function escribir(next: ColumnKey[]) {
  guardadas = next
  try {
    localStorage.setItem(CLAVE, JSON.stringify(next))
  } catch {}
  for (const o of oyentes) o()
}

function suscribir(cb: () => void) {
  oyentes.add(cb)
  return () => {
    oyentes.delete(cb)
  }
}

export function useColumns() {
  const columns = useSyncExternalStore(suscribir, leer, () => defaultColumns)

  const toggle = (key: ColumnKey, on: boolean) =>
    escribir(
      on
        ? columnOrder.filter((c) => c === key || columns.includes(c))
        : columns.filter((c) => c !== key),
    )

  return { columns, toggle, reset: () => escribir(defaultColumns) }
}

export function ColumnPicker({
  columns,
  toggle,
  reset,
}: ReturnType<typeof useColumns>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Elegir columnas">
            <Columns3Icon />
            Columnas
            <span className="num text-muted-foreground">{columns.length + 1}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
          {columnOrder.map((key) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={columns.includes(key)}
              closeOnClick={false}
              onCheckedChange={(on) => toggle(key, on)}
            >
              {columnLabel[key]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={reset}>Restablecer</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
