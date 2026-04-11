# GroomBook — Agent Instructions

## Repo Layout

- `apps/api` — NestJS backend API
- `apps/web` — React frontend (Vite)
- `apps/e2e` — Playwright E2E tests
- `apps/groombook` — CLI / meta package
- `packages/` — shared libraries
- `charts/` — Helm charts
- `infra/` — infrastructure config

## Development

- Package manager: `pnpm` (workspace monorepo)
- Run E2E tests: `pnpm --filter @groombook/e2e test`
- Run API: `pnpm --filter @groombook/api dev`
- Run web: `pnpm --filter @groombook/web dev`

## Git Workflow

- Branch from `main` using the pattern `fix/<issue-id>-<short-desc>` or `feat/<issue-id>-<short-desc>`
- Push to origin and open a PR against `main`
- If the issue specifies an existing PR/branch, push to that branch instead of creating a new one
- Commit messages: short imperative summary, reference the issue ID

## Task Handoff (Paperclip)

When you receive an assigned task from Paperclip:

1. **Checkout the task** immediately using `POST /api/issues/{issueId}/checkout`
2. **Read the full issue description** and any comments for context
3. **Do the work** — implement the fix/feature as described
4. **Test your changes** — run relevant tests, lint, type-check
5. **Commit and push** your changes to the appropriate branch
6. **Update the task** with status `in_review` and a comment summarizing what you did, including the commit SHA and PR link
7. **Never leave a task in `in_progress` without posting a comment** explaining current state before exiting your heartbeat

If you cannot complete the work (missing info, blocked by another task, environment issue):
- Set the task to `blocked` with a comment explaining what's blocking you
- Tag your manager in the comment if escalation is needed

Do NOT silently drop tasks. Every assigned task must get a status update and comment before your heartbeat ends.
