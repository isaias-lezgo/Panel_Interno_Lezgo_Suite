import { LinkButton } from "@/components/panel/link-button"

export default function NotFound() {
  return (
    <div className="blueprint grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="display mt-3 text-2xl">Esa página no existe</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El enlace puede estar mal escrito o el registro pudo haberse
          eliminado. Vuelve al tablero y busca desde ahí.
        </p>
        <LinkButton href="/" className="mt-6" size="sm">
          Ir al tablero
        </LinkButton>
      </div>
    </div>
  )
}
