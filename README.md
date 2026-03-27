# GroomBook

> **The open-source scheduling and client management platform built specifically for independent pet groomers** — giving you the tools of enterprise software without the enterprise price tag or vendor lock-in.

**Built for groomers, not corporations.**

---

## Key Features

**Stop chasing confirmations**
- **Customer portal** — Clients confirm or cancel appointments on their own. Reduce no-shows with an automated waitlist.

**Your calendar, your way**
- **iCal calendar feed** — Push GroomBook appointments directly into Google Calendar or Apple Calendar. No app switching.

**Know every pet at a glance**
- **Client & pet records** — Detailed profiles with grooming history, preferences, and breed-specific notes. Full appointment notes for context on every regular.
- **Quick-find search** — Find clients and pets instantly without digging through spreadsheets.

**Staff access without stress**
- **Role-based access control (RBAC)** — Front desk sees bookings; only you see financials. Right access for every role.

**Everything else**
- **Appointment scheduling** — Calendar management for single or multiple groomers
- **Service management** — Pricing, duration, and service catalog
- **POS & invoicing** — Payments, tips, and receipt generation
- **Automated reminders** — SMS and email notifications
- **Reporting dashboard** — Revenue, utilization, and trend analytics
- **Staff impersonation** — Managers can view the customer portal as any client, with full audit logging and session controls
- **PWA** — Installable on mobile devices, works offline

---

## 🚀 Try the Demo

[**Live Demo**](https://demo.groombook.app) — explore GroomBook without installing anything.

---

## Quick Start

### Docker Compose (recommended for indie groomers)

Run GroomBook on your own hardware in minutes. Everything you need is in the box — no subscription, no vendor lock-in.

```bash
git clone https://github.com/groombook/groombook.git
cd groombook

# Start everything (Postgres + database migrations + API + web UI)
docker compose up --build
```

- **Web UI**: http://localhost:8080
- **API**: http://localhost:3000

The default `docker-compose.yml` sets `AUTH_DISABLED=true` so you can explore the app without configuring an OIDC provider. **Important:** Disable this in any internet-facing deployment.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | [Hono](https://hono.dev/) (TypeScript, Node.js) |
| Frontend | React 19 + Vite + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) |
| Database | PostgreSQL via [CNPG](https://cloudnative-pg.io/) + [Drizzle ORM](https://orm.drizzle.team/) |
| Auth | OIDC via [Authentik](https://goauthentik.io/) |
| Infra | Kubernetes (namespace: `groombook`), Flux GitOps |
| CI | GitHub Actions (self-hosted `groombook-runners`) |

## Repository Structure

```
groombook/
├── apps/
│   ├── api/          # Hono REST API
│   └── web/          # React PWA
├── packages/
│   ├── db/           # Drizzle schema + migrations
│   └── types/        # Shared TypeScript types
├── .github/
│   └── workflows/    # CI/CD pipelines
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker & Docker Compose (for local Postgres)

### Local Development

```bash
# Clone the repo
git clone https://github.com/groombook/groombook.git
cd groombook

# Install dependencies
pnpm install

# Start local Postgres
docker compose up postgres -d

# Run database migrations
DATABASE_URL=postgres://groombook:groombook@localhost:5432/groombook pnpm db:migrate

# Start API and Web in parallel
pnpm dev
```

API will be available at http://localhost:3000
Web will be available at http://localhost:5173

### Environment Variables

#### API (`apps/api/.env`)

```env
DATABASE_URL=postgres://groombook:groombook@localhost:5432/groombook
OIDC_ISSUER=https://authentik.example.com
OIDC_AUDIENCE=groombook
CORS_ORIGIN=http://localhost:5173
PORT=3000
```

### Running Tests

```bash
# Unit tests (vitest)
pnpm test

# E2E tests (Playwright) — requires the full Docker Compose stack to be running
docker compose up -d --wait
pnpm --filter @groombook/e2e test

# Open the Playwright UI (interactive test runner)
pnpm --filter @groombook/e2e test:ui

# View the last E2E test report
pnpm --filter @groombook/e2e test:report
```

E2E tests target the Docker Compose stack (`http://localhost:8080`). They use API route mocking where needed so happy-path tests are deterministic without requiring seed data.

### Building

```bash
pnpm build
```

## Self-Hosting

### Production Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables to update for production:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_DISABLED` | Set to `false` in production |
| `OIDC_ISSUER` | Authentik issuer URL |
| `OIDC_AUDIENCE` | OAuth2 audience (default: `groombook`) |
| `CORS_ORIGIN` | Public URL of the web frontend |

To use your `.env` file with Docker Compose:

```bash
docker compose --env-file .env up --build
```

### Kubernetes (production-grade deployments)

See the [groombook/infra](https://github.com/groombook/infra) repository for Kubernetes manifests and Flux configuration.

Groom Book is deployed in the `groombook` Kubernetes namespace using:
- **CNPG** for PostgreSQL
- **Authentik** for OIDC authentication
- **Flux** for GitOps-managed deployments

---

## Contributing

GroomBook thrives on contributions from the grooming community. Whether you're a groomer with a feature request, a developer fixing a bug, or someone improving docs — we'd love your help.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a pull request

All PRs require CI to pass before merge. See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Why GroomBook?

- **Open source** — You own your data. No vendor lock-in.
- **Purpose-built** — Features designed for grooming workflows, not generic scheduling.
- **Self-hosted or managed** — Run it yourself for free, or pay for hosted support (coming soon).
- **Community-driven** — Used and built by actual groomers.

---

## License

MIT
