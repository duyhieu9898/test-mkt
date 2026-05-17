# ============================================
# 1Person API - Production Dockerfile
# Optimized for:
# - pnpm monorepo
# - production stability
# - smaller runtime image
# - non-root security
# - drizzle/runtime compatibility
# ============================================

# ---------- Base ----------
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ---------- Dependencies ----------
FROM base AS deps

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod=false

# ---------- Builder ----------
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY . .

# Build shared package first
RUN pnpm --filter @1person/core build

# Build api
RUN pnpm --filter @1person/api build

# ---------- Production Runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Security: non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Root package
COPY --from=builder /app/package.json ./

# API
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Core package
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/src ./packages/core/src
COPY --from=builder /app/packages/core/drizzle.config.ts ./packages/core/
COPY --from=builder /app/packages/core/package.json ./packages/core/

# Shared dependencies
COPY --from=builder /app/node_modules ./node_modules

# Optional:
# Uncomment ONLY if runtime gets MODULE_NOT_FOUND

COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/core/node_modules ./packages/core/node_modules

# Permissions
RUN chown -R nodejs:nodejs /app

USER nodejs

WORKDIR /app/apps/api

EXPOSE 8004

CMD ["node", "dist/index.js"]