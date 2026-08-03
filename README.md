# 1Person

1Person is an AI marketing and company operations platform. This repository is
a pnpm/Turborepo monorepo containing the Next.js web app, Hono API, background
workers, shared database schema, and AI workflow packages.

## Local quick start

### Prerequisites

- Node.js 20 or newer
- pnpm 9 (`corepack enable` or `npm install -g pnpm@9`)
- Docker Desktop with Docker Compose
- Git

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create the local environment file

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux/Git Bash:

```bash
cp .env.example .env
```

At minimum, replace `JWT_SECRET` and configure `OPENAI_API_KEY`. Keep unused
provider keys empty. Never commit `.env`.

### 3. Start required infrastructure

Make sure Docker Desktop is running, then start only the services required for
normal development:

```bash
pnpm docker:up:core
```

This starts PostgreSQL with pgvector, Redis, Qdrant, and Meilisearch. Langfuse
and local Whisper are optional and are not needed for the first run.

### 4. Apply all database migrations

```bash
pnpm db:migrate:all
```

This migrates both database owners:

- `@1person/core`: product and company data
- `@1person/ai-tenant`: `trustai_*` AI configuration and intelligence tables

Do not replace this command with `db:generate`. Generate creates migration
files; migrate applies the committed migrations to the database.

### 5. Start the development stack

```bash
pnpm dev
```

The recommended command starts shared package watchers, API, Web, and Worker.

| Service | URL |
| --- | --- |
| Web | http://localhost:3004 |
| API base | http://localhost:8004/api/v1 |
| API health | http://localhost:8004/health |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

The API seeds the local admin account on first startup using `ADMIN_EMAIL` and
`ADMIN_PASSWORD` from `.env`. The example defaults are `admin@1person.ai` and
`Admin@1Person2025`; change them before exposing any environment publicly.

## Run backend and frontend separately

The root `pnpm dev` command is preferred because it also watches shared
packages. To use separate terminals, build the shared packages once first:

```bash
pnpm --filter @1person/core build
pnpm --filter @1person/ai-tenant build
pnpm --filter @1person/workflow build
```

Run each command in a different terminal:

```bash
pnpm --filter @1person/api dev
```

```bash
pnpm --filter @1person/web dev
```

```bash
pnpm --filter @1person/worker dev
```

If shared package source changes while running this way, rebuild that package or
use `pnpm dev` so its watcher stays active.

## Production-mode check on a local machine

`start` only runs an existing production build. Build first:

```bash
pnpm build
```

After the build, run these in separate terminals/processes:

```bash
pnpm --filter @1person/api start
```

```bash
pnpm --filter @1person/worker start
```

```bash
pnpm --filter @1person/web start
```

Running `pnpm --filter @1person/web start` before `pnpm build` causes Next.js
to report that no production build exists in `.next`.

## Common commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:migrate:all
pnpm db:studio
docker compose ps
docker compose down
```

## Documentation

- [Detailed local setup and troubleshooting](./docs/onboarding/local-setup.md)
- [Developer onboarding](./docs/onboarding/README.md)
- [Architecture overview](./docs/onboarding/architecture.md)
- [Deployment guide](./docs/DEPLOYMENT.md)
- [Meta, Google, and Microsoft OAuth setup](./docs/guides/oauth-provider-console-setup.md)

For a first-time setup, continue with the detailed local setup guide if any
command above fails.
