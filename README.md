# Groom Book

Open source, self-hostable pet grooming business management and customer relationship platform.

## Features

- **Appointment scheduling** — calendar management for single or multiple groomers
- **Client & pet records** — detailed profiles with grooming history and preferences
- **Service management** — pricing, duration, and service catalog
- **Online booking portal** — customer-facing self-service booking
- **POS & invoicing** — payments, tips, and receipt generation
- **Automated reminders** — SMS and email notifications
- **Reporting dashboard** — revenue, utilization, and trend analytics
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
pnpm test
```

### Building

```bash
pnpm build
```

## Self-Hosting

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
