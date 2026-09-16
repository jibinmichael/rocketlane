# Documentation

This folder contains project documentation that lives in the repo alongside the code. It is meant for humans (including future maintainers and receiving dev teams).

## Structure

- **`adr/`** — Architecture Decision Records. Short markdown files capturing the why behind non-trivial technical decisions. Read these first to understand how we got here.
- **`components/`** — Component-level documentation. One `.md` file per non-trivial component, explaining purpose, when to use, when not to, and gotchas. Populated as components are built.
- **`_templates/`** — Copy-paste templates for creating new ADRs and component docs.

## Conventions

- Documentation is written in markdown, kept in version control, and reviewed alongside code changes.
- ADRs are immutable once accepted. If a decision is superseded, the new ADR references the old one and marks the old status as "Superseded."
- Component docs live next to the docs they document in folder structure (`docs/components/<domain>/`).

## How to add new docs

- **New ADR** → copy `_templates/adr.md`, rename to `NNNN-short-title.md`, increment the number sequentially, put it in `adr/`.
- **New component doc** → copy `_templates/component-doc.md`, rename to `ComponentName.md`, put it in `components/<domain>/`.

