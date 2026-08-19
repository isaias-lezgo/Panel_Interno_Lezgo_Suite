import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * El copiloto contesta en Markdown porque las tablas son la forma correcta
 * de leer una lista de cuentas. Se renderiza con los mismos tokens que el
 * resto del panel para que una respuesta no parezca una isla.
 */
const components: Components = {
  p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
  h1: ({ children }) => (
    <h3 className="display mt-1 text-base">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="display mt-1 text-base">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="eyebrow mt-1">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="ml-4 list-decimal space-y-1 text-sm leading-relaxed">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="num rounded bg-muted px-1 py-0.5 text-[11px]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="num overflow-x-auto rounded-md bg-muted px-3 py-2 text-[11px] leading-relaxed">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
      {children}
    </blockquote>
  ),
  // Las tablas se desbordan dentro de su propio contenedor, nunca empujan
  // el ancho del chat.
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-muted/50">{children}</thead>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="eyebrow px-3 py-2 text-left whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top">{children}</td>
  ),
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
