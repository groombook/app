# GroomBook Monorepo — Archived

> **This repository has been archived and replaced by standalone repositories.**

## Successor Repositories

| Repository | Description |
|---|---|
| [groombook/api](https://github.com/groombook/api) | Hono REST API (TypeScript, Node.js) |
| [groombook/web](https://github.com/groombook/web) | React PWA frontend |
| [groombook/charts](https://github.com/groombook/charts) | Helm charts for Kubernetes deployment |

## What Changed

- **Monorepo split complete** — The former `apps/api`, `apps/web`, and `packages/*` are now standalone repos
- **`@groombook/types`** — Inlined directly into `groombook/api` and `groombook/web`
- **E2E testing** — Now via Playwright MCP, no standalone repo needed
- **CI/CD** — Each repo has its own pipeline; see individual repos for status

## Migration Notes

If you were cloning `groombook/groombook` for local development:

```bash
# API
git clone https://github.com/groombook/api.git
cd api && pnpm install && pnpm dev

# Web (in a new terminal)
git clone https://github.com/groombook/web.git
cd web && pnpm install && pnpm dev
```

For full Docker Compose setup, see each repo's README.

## Archive Info

This repository was archived on 2026-05-14 as part of the monorepo decommission ([GRO-1081]).
The history is preserved but the repo is read-only.

---

*For Kubernetes deployments, see [groombook/infra](https://github.com/groombook/infra) (private).*