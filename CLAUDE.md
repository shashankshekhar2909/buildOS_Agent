# BuildAgent Agent Instructions

Living instructions for future coding agents in this repo.

Keep this file and `PLAN.md` in sync when the product direction changes.

## Default Work Style

- Code first.
- Be concise.
- No fluff.
- Prefer direct edits over explanations when the task is actionable.
- Update docs when behavior or UX changes.

## UI Direction

- Follow [docs/ui-guidelines.md](/home/shashank/project/buildOsAgent/docs/ui-guidelines.md).

## Agent / Product Rules

- `PLAN.md` is the master plan.
- `CHECKLIST.md` is the build ledger.
- Update both when work lands.
- If a task changes UI direction, update this file too.
- If a task changes onboarding or setup, update `README.md`.
- Keep in-app chat, WhatsApp, Slack, Telegram, and skills aligned to one backend model.

## Build Rules

- Rebuild affected Docker images after meaningful frontend or backend changes.
- Restart the touched containers after rebuild.
- Verify health after restart.
- Keep migrations in sync with code.

## Design Change Rule

- If you change the design system, update:
  - `docs/ui-guidelines.md`
  - `PLAN.md`
  - the relevant page or component
- If you add a new app surface, give it a real empty state, real actions, and a clear data source.
