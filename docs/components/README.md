# Component Documentation

Each non-trivial component in `components/` may have a matching markdown file here describing purpose, props, usage, gotchas, and accessibility.

## Convention

- Mirror the component folder structure: `components/pricing/PricingPlanCard.tsx` → `docs/components/pricing/PricingPlanCard.md`
- Use the template at `docs/_templates/component-doc.md` as a starting point
- Components in `components/ui/` (shadcn primitives) do not need docs here — they are vendored third-party code. Document your usecase components that compose them instead.

## Status

This folder is populated organically as components are built. It is not enforced by CI — it is a convention the team can adopt. If you are a receiving dev team and want to make it enforced (CI blocks PRs missing component docs), the tooling for that is straightforward to add later.
