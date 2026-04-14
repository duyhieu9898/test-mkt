# Local Setup

Step-by-step guide to get 1Person running on your machine. Target: ~15 minutes end-to-end.

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | `>=20.0.0` | Runtime for API, web, worker |
| pnpm | `9.0.0` (pinned) | Monorepo package manager |
| Docker Desktop | Latest | Postgres, Redis, Qdrant, etc. |
| Git | Any | Obviously |

Verify:

```bash
node -v      # should be 20.x or newer
pnpm -v      # should be 9.x
docker -v    # any recent version
```

If `pnpm` is missing: `npm install -g pnpm@9.0.0`.

## 1. Clone & install

```bash
git clone <your-repo-url>
cd 1person
pnpm install
```

This installs all workspaces (apps + packages) in one shot. Expect ~2 minutes on a cold cache.

## 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill these minimum required keys:

```bash
# AI providers — you NEED at least one of these for AI features to work
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Everything else has sensible defaults, but review:
ADMIN_EMAIL=admin@1person.ai
ADMIN_PASSWORD=Admin@1Person2025   # change before deploying anywhere public
JWT_SECRET=...                     # replace the placeholder
```

Optional but useful:
- `SENTRY_DSN` — error tracking
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` — LLM trace observability (local Langfuse at http://localhost:5050)

## 3. Start infrastructure services

```bash
pnpm docker:up
```

This boots 6 containers via `docker-compose.yml`:

| Container | Port | Purpose |
|-----------|------|---------|
| `1person-postgres` | 5432 | Primary DB (Postgres 16 + pgvector) |
| `1person-redis` | 6379 | Cache + BullMQ task queue |
| `1person-qdrant` | 6333 | Vector DB for embeddings |
| `viethome-meilisearch` (shared) | 7700 | Full-text search |
| `1person-langfuse` | 5050 | LLM observability UI |
| `faster-whisper-server` | 8005 | Local speech-to-text |

Verify:

```bash
docker ps | grep 1person
```

You should see postgres, redis, qdrant, langfuse. If you already have conflicting services on these ports (e.g. another Postgres on 5432), stop them first.

## 4. Apply database schema

```bash
pnpm --filter @1person/core build        # build the core package (emits types)
pnpm --filter @1person/core db:push      # push schema directly (fast, dev only)
```

`db:push` writes all Drizzle schemas straight to the DB without generating migration files — perfect for local dev. For production, use `db:generate` + `db:migrate`.

If `db:push` warns about duplicate index names (pre-existing bug in `blog_posts`), you can create tables manually via:

```bash
docker exec 1person-postgres psql -U postgres -d oneperson -c "SELECT 1"
```

(The `db:push` warning doesn't block the rest of the schema.)

## 5. Start the dev stack

```bash
pnpm dev
```

Turbo starts all three apps in parallel:
- **API** (`apps/api`) — http://localhost:8004 (Hono, `tsx watch`, auto-reloads on save)
- **Web** (`apps/web`) — http://localhost:3004 (Next.js App Router)
- **Worker** (`apps/worker`) — BullMQ consumer for background jobs

On API startup you'll see:

```
🚀 AI Company OS API
📍 Server:  http://localhost:8004
📚 API:     http://localhost:8004/api/v1
❤️  Health:  http://localhost:8004/health
```

The API also auto-seeds an admin account on first boot (see `apps/api/src/lib/seed.ts`).

## 6. Log in

Open http://localhost:3004 and log in with:

- Email: `admin@1person.ai`
- Password: `Admin@1Person2025` (from `.env`)

You'll land on the companies picker. Create a company via the FTUX flow at `/welcome`, then you'll be redirected to the dashboard.

## Common commands

```bash
# Dev
pnpm dev                                    # start everything
pnpm --filter @1person/api dev              # just API
pnpm --filter @1person/web dev              # just web

# DB
pnpm --filter @1person/core db:push         # push schema (dev)
pnpm --filter @1person/core db:generate     # generate migration files
pnpm --filter @1person/core db:migrate      # apply migration files
pnpm --filter @1person/core db:studio       # Drizzle Studio GUI (http://localhost:5173)

# Quality
pnpm typecheck                              # tsc --noEmit across all packages
pnpm lint                                   # ESLint
pnpm test                                   # Vitest across packages
pnpm format                                 # Prettier

# Build
pnpm build                                  # build all packages/apps
pnpm clean                                  # remove dist/ + node_modules
```

## Troubleshooting

### "Port 3004 / 8004 already in use"

Another dev server is running. Find and kill:

```bash
lsof -ti:3004 | xargs kill -9
lsof -ti:8004 | xargs kill -9
```

### "Can't reach database / ECONNREFUSED 5432"

Docker containers not up. Run `pnpm docker:up` and wait 10 seconds for Postgres to accept connections.

### "Module not found: @1person/core"

You added code that imports from `@1person/core` but never built it. Run:

```bash
pnpm --filter @1person/core build
```

The core package is built to `dist/` and consumed as a compiled package (faster type-checking across the monorepo).

### API crashes with "JWT_SECRET required"

Your `.env` is missing or incomplete. Re-copy `.env.example` and fill the required keys.

### "No credits available" in UI

The admin account seed gives you a starting credit balance. If it's exhausted, top up via admin panel (`/admin`) or reset with:

```bash
docker exec -it 1person-postgres psql -U postgres -d oneperson \
  -c "UPDATE credit_balances SET monthly_remaining = 10000 WHERE company_id = '<your-company-id>';"
```

### TypeScript errors in files I didn't touch

The codebase has some known pre-existing `tsc` errors in `apps/api/src/routes/marketing-engine.ts` and `marketplace.ts`. They don't block dev. If you see errors in files you DID touch, fix them before committing.

### FTUX / AI features fail silently

Check your API keys in `.env`. Also check Langfuse at http://localhost:5050 — it traces every LLM call and shows failures with the full prompt + error.

## Next

Once everything runs, read **[architecture.md](./architecture.md)** to understand the system.
