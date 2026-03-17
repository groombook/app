FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Install deps
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS builder
COPY packages/ packages/
COPY apps/api/ apps/api/
RUN pnpm --filter @groombook/api build

# Runtime
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/db packages/db
COPY --from=builder /app/packages/types packages/types

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
