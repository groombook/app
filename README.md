# Groom Book

**Built for groomers, not corporations.** Open source scheduling and client management — purpose-built for independent pet groomers.

## Features

- **Appointment scheduling** — calendar management for single or multiple groomers
- **iCal calendar feed** — push appointments to Google Calendar or Apple Calendar
- **Waitlist system** — automatically fill cancelled slots to reduce no-show revenue loss
- **Quick-find client/pet search** — instant lookup of client and pet records at the counter
- **Client & pet records** — detailed profiles with grooming history, breed data, and preferences
- **Appointment notes** — per-visit notes so you never lose context on a regular
- **Customer portal** — clients confirm or cancel appointments without calling the shop
- **Service management** — pricing, duration, and service catalog
- **Online booking portal** — customer-facing self-service booking
- **POS & invoicing** — payments, tips, and receipt generation
- **Automated reminders** — SMS and email notifications
- **RBAC** — role-appropriate access for front desk, groomers, and owners
- **Reporting dashboard** — revenue, utilization, and trend analytics
- **Staff impersonation** — managers can view the customer portal as any client, with full audit logging and session controls
- **PWA** — installable on mobile devices, works offline

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

### Docker Compose (recommended for single-server deployments)

The fastest way to run Groom Book is with Docker Compose. This starts PostgreSQL, runs database migrations, and serves both the API and web frontend.

```bash
git clone https://github.com/groombook/groombook.git
cd groombook

# Start everything (Postgres + migrate + API + web)
docker compose up --build
```

- **Web UI**: http://localhost:8080
- **API**: http://localhost:3000

The default `docker-compose.yml` sets `AUTH_DISABLED=true` so you can explore the app without configuring an OIDC provider. **Disable this in any internet-facing deployment.**

#### Production configuration

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

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a pull request

All PRs require CI to pass before merge.

## License

MIT
