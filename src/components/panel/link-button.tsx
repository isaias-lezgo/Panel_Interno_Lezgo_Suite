import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * A button that navigates. Base UI needs `nativeButton={false}` when the
 * rendered element is an anchor, so it lives here once instead of at every
 * call site.
 */
export function LinkButton({
  href,
  children,
  ...props
}: { href: string } & Omit<
  React.ComponentProps<typeof Button>,
  "render" | "nativeButton"
>) {
  return (
    <Button {...props} nativeButton={false} render={<Link href={href} />}>
      {children}
    </Button>
  )
}
