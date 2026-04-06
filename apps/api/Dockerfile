# ============================================
# 1Person API - Production Dockerfile
# ============================================
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --prod=false

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @1person/core build
RUN pnpm --filter @1person/api build

# --- Production ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

WORKDIR /app/apps/api

EXPOSE 8004

CMD ["node", "dist/index.js"]
