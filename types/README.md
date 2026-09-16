# types/

Shared TypeScript types used across multiple files.

## When to put a type here

- Type is used in 2+ files
- Type represents a domain concept (User, Invoice, Subscription)
- Type is an API response or database shape

## When NOT to put a type here

- Type is only used in one component (define it inline in that file)
- Type is a shadcn/ui prop type (already exported by the component)

## Organization

One domain per file, kebab-case:
- `user.ts` — User, UserRole, UserPreferences
- `invoice.ts` — Invoice, InvoiceLineItem, InvoiceStatus
- `api.ts` — shared API response wrappers
