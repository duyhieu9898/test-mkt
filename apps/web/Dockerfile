# ============================================
# 1Person Web - Optimized Production Dockerfile
# ============================================

FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# --- Dependencies ---
FROM base AS deps

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY packages/core/package.json ./packages/core/
COPY packages/workflow/package.json ./packages/workflow/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --prod=false

# --- Build ---
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/workflow/node_modules ./packages/workflow/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY . .

# Build-time env
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build dependency order
RUN pnpm --filter @1person/core build
RUN pnpm --filter @1person/workflow build
RUN pnpm --filter @1person/web build

# --- Production ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Security
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# Standalone output
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/standalone ./

# Static assets
COPY --from=builder --chown=nextjs:nextjs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["node", "server.js"]