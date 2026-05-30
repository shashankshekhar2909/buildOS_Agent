# BuildAgent UI Guidelines

Use this for all dashboard and app surfaces.

## Look And Feel

- Dark, layered, slightly futuristic.
- Avoid flat generic admin UI.
- Use depth, contrast, and deliberate spacing.
- Keep panels readable on laptop and mobile.
- Prefer calm accent use, not loud gradients everywhere.

## Composition

- Every page needs:
  - one clear primary action
  - one clear empty state
  - one obvious data source
- Prefer cards, tables, and side panels over cluttered forms.
- Keep controls grouped by task, not by data model.
- Make destructive actions visually obvious and secondary.

## Interaction

- Use subtle motion only when it clarifies state.
- Keep long workflows broken into chunks.
- Show loading, empty, error, and success states explicitly.
- For live systems, show source, freshness, and scope.

## Components

- Prefer shadcn/ui primitives.
- Extend locally instead of inventing ad hoc controls.
- Keep button labels action-first.
- Use badges for state, source, role, and mode.

### Available primitives (P7)

In `apps/dashboard-web/src/components/ui/`:

- `dialog`, `sheet`, `dropdown-menu`, `tooltip`, `tabs`, `skeleton`, `command` — Radix-backed shadcn-style
- `badge`, `button`, `card`, `input`, `select`, `separator` — base primitives

### Shared composites

In `apps/dashboard-web/src/components/`:

- `page-header.tsx` — `<PageHeader eyebrow title description actions />` gradient banner. Use for every page header.
- `data-table.tsx` — `<DataTable columns data emptyTitle emptyDescription emptyAction onRowClick />` TanStack Table with sticky header, sort, mobile card collapse.
- `empty-state.tsx` — `<EmptyState icon title description action />`.
- `status-pill.tsx` — `<StatePill v />` and `<RiskPill v />`.
- `command-palette.tsx` — global ⌘K palette (already mounted in `providers.tsx`).
- Toasts via `sonner` — `import { toast } from "sonner"` then `toast.success(...)` / `toast.error(title, { description })`.

### Design tokens

Semantic HSL CSS vars in `src/app/globals.css :root`:
`--bg`, `--surface`, `--surface-elevated`, `--border`, `--text-{primary,secondary,muted}`, `--accent`, `--ok`, `--warn`, `--bad`, `--info`, `--radius`.
Tailwind maps `background/foreground/card/popover/primary/secondary/destructive/border/input/ring` to these.
Prefer semantic classes (`bg-card`, `text-foreground`, `border-border`) for new code. Existing `bg-slate-950/40` / `border-white/[0.06]` stays on legacy pages until refactored.

### Page checklist

Before shipping a new page:

1. Wraps content in `<PageHeader>` with a primary action.
2. Loading states use `<Skeleton>` from `ui/skeleton`.
3. Empty states use `<EmptyState>` or `<DataTable emptyTitle ...>`.
4. Mutation errors surface via `toast.error(...)`, not inline-only `setErr`.
5. Forms have a primary `Button type="submit"`; ancillary buttons use `type="button"`.
6. Status appears via `<StatePill>` / `<RiskPill>` — never color-only.

## Chat And Automation

- In-app chat should feel like a real assistant surface, not a form.
- Show transcript, settings, and result state separately.
- Let the user pick agent/model when needed.
- Keep external connectors separate from in-app chat.

## Rules For Future Changes

- Update this file when the visual language changes.
- Update `CLAUDE.md` when the workflow changes.
- Update `PLAN.md` when scope or direction changes.

