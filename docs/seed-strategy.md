# Seed Strategy Runbook

This document describes the GroomBook seeding system across environments.

## Environment Profiles

| Profile | Staff | Clients | Invoices | Appointment Window | Auth |
|---------|-------|---------|----------|-------------------|------|
| `dev`   | 4 (1 manager, 1 receptionist, 2 groomers) | ~100 | ~1,000 | 7 days back / 30 days forward | Disabled |
| `uat`   | 8 (1 manager, 1 receptionist, 3 groomers, 3 bathers) | ~500 | ~4,000 | 30 days back / 90 days forward | Enabled |
| `demo`  | 8 (1 manager, 1 receptionist, 3 groomers, 3 bathers) | ~500 | ~4,000 | 30 days back / 90 days forward | Enabled, OOBE enabled |

## Seed Script Environment Variables

| Variable | Values | Effect |
|----------|--------|--------|
| `SEED_PROFILE` | `dev`, `uat`, `demo` | Selects data volume profile (see above). Defaults to `uat` if unset. |
| `SEED_KNOWN_USERS_ONLY` | `true` | Minimal prod/demo seed with demo users only. Overrides `SEED_PROFILE`. |
| `SEED_ADMIN_EMAIL` | email address | Creates an admin staff account with the given email. |
| `SEED_ADMIN_NAME` | name | Display name for admin account. Defaults to "Admin". |

## Re-seeding Environments

### Dev

```bash
# Run seed job manually
kubectl -n groombook-dev exec -it deploy/groombook-api -- \
  sh -c 'DATABASE_URL=$DATABASE_URL SEED_PROFILE=dev npm run db:seed'
```

Dev uses `AUTH_DISABLED=true` and accepts the `X-Dev-User-Id` header for staff impersonation.

### UAT

```bash
# Run seed job manually
kubectl -n groombook-uat exec -it deploy/groombook-api -- \
  sh -c 'DATABASE_URL=$DATABASE_URL SEED_PROFILE=uat npm run db:seed'
```

UAT uses Authentik OIDC. See Authentik UAT Personas below.

### Demo (Production-like)

Demo uses the same data volume as UAT but with `SEED_KNOWN_USERS_ONLY=true` or is provisioned via the standard seed with OOBE enabled.

```bash
# Trigger seed CronJob
kubectl -n groombook cronjob trigger seed-job --latest
```

## Authentik UAT User Personas

Credentials are stored in sealed secrets — never use plaintext values.

| Persona | Email | Role | Access Level |
|---------|-------|------|--------------|
| UAT Super User | `uat-super@groombook.dev` | Super User | Full admin access |
| UAT Staff | `uat-staff@groombook.dev` | Staff | Standard staff operations |
| UAT Customer | `uat-customer@groombook.dev` | Customer | Customer portal access |

Sealed secret: `authentik-credentials` in `groombook-uat` namespace.

## OOBE (Out-of-Box Experience) Flag

The OOBE flag controls first-run setup flow in Demo/Production environments.

- **Demo/Production**: OOBE is enabled, users see setup wizard on first login
- **Dev/UAT**: OOBE is disabled, full access granted immediately

When `SEED_KNOWN_USERS_ONLY=true`, the demo users are created but OOBE state must be initialized separately.

## Dev-Mode Access

Dev environment disables authentication for local development convenience.

```bash
AUTH_DISABLED=true
```

To impersonate a specific staff user, use the `X-Dev-User-Id` header:

```bash
curl -H "X-Dev-User-Id: <staff-id>" http://localhost:3000/api/...
```

## Seed Idempotency

The seed script is idempotent and deterministic:
- Same `SEED_PROFILE` produces identical data with same IDs
- Re-running seed updates existing records rather than creating duplicates
- Appointments, invoices, and visit logs are truncated before each seed to ensure clean state
