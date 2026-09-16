# hooks/

Custom React hooks — non-trivial reusable hooks that encapsulate stateful logic.

## When to add a hook here

- Logic that uses React state, effects, refs, or context
- Used in 2+ components
- Non-trivial (single-line wrappers don't earn their own file)

## Naming

Every hook file is kebab-case and starts with `use-`:

- `use-local-storage.ts` → exports `useLocalStorage`
- `use-click-outside.ts` → exports `useClickOutside`
- `use-media-query.ts` → exports `useMediaQuery`

One hook per file. Named exports only.
