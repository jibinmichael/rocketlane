import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Body text: 15/22, the message size from the Linear type scale. Every other size in the product
 * is set in place (13 rows and chips, 12 secondary, 11 meta, 20 greeting); this is the only text
 * primitive that earns a component.
 */
type BodyProps<T extends ElementType> = {
  as?: T
  muted?: boolean
  children: ReactNode
  className?: string
} & Omit<ComponentPropsWithoutRef<T>, "as" | "muted" | "children" | "className">

export function Body<T extends ElementType = "p">({
  as,
  muted,
  className,
  children,
  ...rest
}: BodyProps<T>) {
  const Component = (as ?? "p") as ElementType
  return (
    <Component
      className={cn(
        "text-[15px] leading-[22px] font-normal",
        muted && "text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}
