# ============================================

# 1Person API - Optimized Production Dockerfile

# ============================================

# ---------- Base ----------

FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ---------- Dependencies ----------

FROM base AS deps

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

COPY packages/core/package.json ./packages/core/
COPY packages/ai-tenant/package.json ./packages/ai-tenant/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod=false

# ---------- Builder ----------

FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/ai-tenant/node_modules ./packages/ai-tenant/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

COPY . .

# Build shared packages first

RUN pnpm --filter @1person/core build
RUN pnpm --filter @1person/ai-tenant build

# Build api

RUN pnpm --filter @1person/api build

# ---------- Production Runner ----------

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Security: non-root user

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Root package

COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# API

COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/

# Core package

COPY --from=builder --chown=nodejs:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/package.json ./packages/core/

# AI Tenant package

COPY --from=builder --chown=nodejs:nodejs /app/packages/ai-tenant/dist ./packages/ai-tenant/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/ai-tenant/package.json ./packages/ai-tenant/

# Shared dependencies

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Workspace runtime deps

COPY --from=builder --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages/ai-tenant/node_modules ./packages/ai-tenant/node_modules

USER nodejs

WORKDIR /app/apps/api

EXPOSE 8004

CMD ["node", "dist/index.js"]
