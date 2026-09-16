import { cn } from "@/lib/utils"
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"

/**
 * Typography components — the single source of truth for all text in the app.
 * Every piece of user-facing text should flow through one of these.
 * See docs/components/shared/Typography.md for usage rules.
 */

type TypographyBaseProps<T extends ElementType> = {
  as?: T
  muted?: boolean
  children: ReactNode
  className?: string
}

type PolymorphicProps<T extends ElementType> = TypographyBaseProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof TypographyBaseProps<T>>

const mutedClass = "text-muted-foreground"

export function Display<T extends ElementType = "h1">({
  as,
  muted,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h1") as ElementType
  return (
    <Component
      className={cn(
        "text-[2.25rem] leading-[1.2] font-semibold tracking-[-0.02em]",
        muted && mutedClass,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}

export function H1<T extends ElementType = "h1">({
  as,
  muted,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h1") as ElementType
  return (
    <Component
      className={cn(
        "text-2xl leading-[1.3] font-semibold tracking-[-0.015em]",
        muted && mutedClass,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}

export function H2<T extends ElementType = "h2">({
  as,
  muted,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h2") as ElementType
  return (
    <Component
      className={cn(
        "text-xl leading-[1.4] font-semibold tracking-[-0.01em]",
        muted && mutedClass,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}

export function H3<T extends ElementType = "h3">({
  as,
  muted,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "h3") as ElementType
  return (
    <Component
      className={cn("text-base leading-[1.5] font-semibold", muted && mutedClass, className)}
      {...rest}
    >
      {children}
    </Component>
  )
}

type BodySize = "default" | "sm"

type BodyProps<T extends ElementType> = PolymorphicProps<T> & {
  size?: BodySize
}

export function Body<T extends ElementType = "p">({
  as,
  size = "default",
  muted,
  className,
  children,
  ...rest
}: BodyProps<T>) {
  const Component = (as ?? "p") as ElementType
  const sizeClass = size === "sm" ? "text-sm leading-[1.6]" : "text-[0.9375rem] leading-[1.65]"
  return (
    <Component className={cn(sizeClass, "font-normal", muted && mutedClass, className)} {...rest}>
      {children}
    </Component>
  )
}

export function Caption<T extends ElementType = "p">({
  as,
  muted = true,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "p") as ElementType
  return (
    <Component
      className={cn("text-[0.8125rem] leading-[1.5] font-normal", muted && mutedClass, className)}
      {...rest}
    >
      {children}
    </Component>
  )
}

export function Micro<T extends ElementType = "span">({
  as,
  muted = true,
  className,
  children,
  ...rest
}: PolymorphicProps<T>) {
  const Component = (as ?? "span") as ElementType
  return (
    <Component
      className={cn(
        "text-xs leading-[1.4] font-medium tracking-[0.005em] tabular-nums",
        muted && mutedClass,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  )
}

export function Code({ className, children, ...rest }: ComponentPropsWithoutRef<"code">) {
  return (
    <code
      className={cn(
        "font-mono text-[0.8125rem] leading-[1.5]",
        "bg-muted rounded-[2px] px-[0.3em] py-[0.1em]",
        className,
      )}
      {...rest}
    >
      {children}
    </code>
  )
}
