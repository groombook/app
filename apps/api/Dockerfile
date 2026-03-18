FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install deps
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS builder
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @groombook/types build && \
    pnpm --filter @groombook/db build && \
    pnpm --filter @groombook/api build

# Runtime
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/db/package.json packages/db/package.json
COPY --from=builder /app/packages/types/dist packages/types/dist
COPY --from=builder /app/packages/types/package.json packages/types/package.json

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]

# Migrate stage — runs drizzle-kit migrate against the database
FROM builder AS migrate
CMD ["pnpm", "db:migrate"]

# Seed stage — populates the database with test data
FROM builder AS seed
CMD ["pnpm", "db:seed"]
