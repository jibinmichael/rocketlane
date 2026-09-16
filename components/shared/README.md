# components/shared/

Components used in 2+ product domains.

## Promotion rule

Components move into this folder ONLY after they're used in 2+ domains. Never pre-emptively.

If a component is only used in one domain, it lives in that domain's folder (e.g., `components/pricing/PricingPlanCard.tsx`).

## Examples of things that genuinely belong here

- `EmptyState.tsx` — used across dashboard, inbox, search
- `LoadingSpinner.tsx` — used everywhere
- `ConfirmDialog.tsx` — generic confirmation modal

## Naming

Still follows usecase-based naming from CLAUDE.md §3:
- `EmptyState.tsx` ✓ (describes a usecase)
- `GenericModal.tsx` ✗ (too generic — rename to what it actually does)
