# Local Setup

This guide gets a new developer from a fresh clone to a working 1Person Web,
API, Worker, and database on Windows, macOS, or Linux.

## 1. Prerequisites

| Tool | Supported version | Purpose |
| --- | --- | --- |
| Node.js | 20 or newer | API, Web, Worker, and scripts |
| pnpm | 9.x | Monorepo package manager |
| Docker Desktop/Engine | Current stable | PostgreSQL, Redis, Qdrant, Meilisearch |
| Docker Compose | V2 (`docker compose`) | Local service orchestration |
| Git | Current stable | Source control |

Verify the toolchain:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

If pnpm is missing:

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

Alternatively: `npm install -g pnpm@9.0.0`.

## 2. Clone and install

```bash
git clone <repository-url>
cd 1person
pnpm install
```

Always run root commands from the repository root. pnpm installs every app and
package in the workspace from the committed `pnpm-lock.yaml`.

## 3. Configure `.env`

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux/Git Bash:

```bash
cp .env.example .env
```

Minimum local values:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oneperson
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333

JWT_SECRET=replace-with-a-long-random-local-secret
ADMIN_EMAIL=admin@1person.ai
ADMIN_PASSWORD=Admin@1Person2025

OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=

NEXT_PUBLIC_API_URL=http://localhost:8004/api/v1
WEB_URL=http://localhost:3004
LANGFUSE_ENABLED=false
```

Notes:

- The default feature configuration uses OpenAI. Configure Anthropic too only
  if a selected feature/provider needs it.
- Uploaded/generated assets require the AWS S3 variables in `.env`. Basic
  login, navigation, and non-asset flows can run without them.
- Meta, Google, and Microsoft values are optional until their Connect flows are
  tested. See the [OAuth provider setup guide](../guides/oauth-provider-console-setup.md).
- Never commit `.env`.

The API and Worker load the root `.env`. The Next.js configuration also loads
the monorepo root `.env`, so a second `apps/web/.env` file is not required.

## 4. Start required Docker services

Start Docker Desktop first. Then run:

```bash
pnpm docker:up:core
```

This starts the lightweight, required development services:

| Container | Port | Purpose |
| --- | --- | --- |
| `1person-postgres` | 5432 | PostgreSQL 16 with pgvector |
| `1person-redis` | 6379 | BullMQ queues and cache |
| `1person-qdrant` | 6333/6334 | Vector search |
| `1person-meilisearch` | 7700 | Full-text search |

Check their state:

```bash
docker compose ps
docker exec 1person-postgres pg_isready -U postgres -d oneperson
docker exec 1person-redis redis-cli ping
```

PostgreSQL should report `accepting connections`; Redis should return `PONG`.

### Optional local services

`docker-compose.yml` also defines Langfuse and a CPU Whisper server. They are
larger and are not required for the first application run. Start only the
specific optional service after configuring it; `pnpm docker:up` starts every
service in the Compose file.

## 5. Apply the database schema

Wait until PostgreSQL is healthy, then run:

```bash
pnpm db:migrate:all
```

This command is intentionally plural. The repository has two migration owners
with separate Drizzle migration tables:

1. `@1person/core` owns product/company tables.
2. `@1person/ai-tenant` owns `trustai_*` tables.

The first core migration enables the `vector` extension. The Docker image must
remain `pgvector/pgvector:pg16`; a plain PostgreSQL image does not provide this
extension.

Use these commands correctly:

| Command | Use |
| --- | --- |
| `pnpm db:migrate:all` | Apply every committed migration. Use for setup and deployment. |
| `pnpm db:generate` | Generate a new core migration after a schema change. Do not use for setup. |
| `pnpm --filter @1person/core db:push` | Development-only schema synchronization. Avoid on a shared or production DB. |
| `pnpm db:studio` | Open Drizzle Studio for local data inspection. |

## 6. Start the application

Recommended:

```bash
pnpm dev
```

Turbo starts and watches:

- `@1person/core`, `@1person/ai-tenant`, and `@1person/workflow`
- API at http://localhost:8004
- Web at http://localhost:3004
- Background Worker and schedulers

Verify the API before opening the UI:

```text
http://localhost:8004/health
```

Then open http://localhost:3004. On first API startup, the admin user is seeded
from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## 7. Run BE, FE, and Worker separately

The root command is safer for everyday work because it watches shared packages.
If separate terminals are required, build shared packages first:

```bash
pnpm --filter @1person/core build
pnpm --filter @1person/ai-tenant build
pnpm --filter @1person/workflow build
```

Terminal 1, backend API:

```bash
pnpm --filter @1person/api dev
```

Terminal 2, frontend Web:

```bash
pnpm --filter @1person/web dev
```

Terminal 3, background Worker:

```bash
pnpm --filter @1person/worker dev
```

The Web can render without the Worker, but queued tasks, schedulers, and some
publishing workflows will not complete. Run all three for end-to-end testing.

## 8. Production build check

To test production builds locally:

```bash
pnpm build
```

After the build succeeds, start API, Worker, and Web in separate terminals:

```bash
pnpm --filter @1person/api start
```

```bash
pnpm --filter @1person/worker start
```

```bash
pnpm --filter @1person/web start
```

`next start` does not build the Web app. If `.next/BUILD_ID` is missing, run
`pnpm build` first.

## 9. Common development commands

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:migrate:all
pnpm db:studio
docker compose ps
docker compose logs -f postgres
docker compose down
```

## 10. Troubleshooting

### Docker API is unavailable

Typical error:

```text
failed to connect to the docker API at npipe:////./pipe/docker_engine
```

Start Docker Desktop and wait until the engine reports that it is running.

### Redis `ECONNREFUSED` on port 6379

The API and Worker require Redis. Start it and verify `PONG`:

```bash
docker compose up -d redis
docker exec 1person-redis redis-cli ping
```

### PostgreSQL connection refused on port 5432

```bash
docker compose up -d postgres
docker exec 1person-postgres pg_isready -U postgres -d oneperson
```

Wait until the health check passes before migrating or starting the API.

### Migration says `type "vector" does not exist`

Confirm `docker-compose.yml` uses `pgvector/pgvector:pg16`, then enable the
extension in the local database and rerun migrations:

```bash
docker exec 1person-postgres psql -U postgres -d oneperson -c "CREATE EXTENSION IF NOT EXISTS vector;"
pnpm db:migrate:all
```

### Migration says an enum/table already exists

The database schema and Drizzle migration history are out of sync. Do not run
`db:generate` to repair a runtime database.

For a disposable local database only, reset all local Docker volumes and apply
the committed migrations again:

```bash
docker compose down -v
pnpm docker:up:core
pnpm db:migrate:all
```

Warning: `docker compose down -v` permanently deletes local database, queue,
and search data. Never use it against shared or production infrastructure.

### Port 3004 or 8004 is already in use

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3004 -State Listen
Get-NetTCPConnection -LocalPort 8004 -State Listen
Stop-Process -Id <PID>
```

macOS/Linux:

```bash
lsof -i :3004
lsof -i :8004
kill <PID>
```

Only stop the process after confirming that it belongs to an old 1Person dev
server.

### `navigator is not defined`

This usually means a browser-only library such as IMG.LY was imported during
Next.js server rendering. Use the existing client-only dynamic import pattern
for editor components. Clearing `.next` alone does not fix a server-side import.

### `Could not find a production build in the .next directory`

`pnpm --filter @1person/web start` was run before the Web build. Run:

```bash
pnpm --filter @1person/web build
pnpm --filter @1person/web start
```

### OAuth redirects to an old localhost or tunnel URL

Update `NEXT_PUBLIC_API_URL`, restart the API, and rebuild/restart the Web app
when switching production URLs. The exact provider callbacks are documented in
the [OAuth provider setup guide](../guides/oauth-provider-console-setup.md).

### AI features fail while the UI still loads

1. Confirm the selected provider has a real API key in `.env`.
2. Keep unused provider variables empty instead of placeholder values.
3. Check API logs for provider/model errors.
4. If `LANGFUSE_ENABLED=true`, verify the Langfuse service and keys separately.

## Next

Continue with [architecture.md](./architecture.md), then use the
[codebase tour](./codebase-tour.md) to trace a feature from UI to API and DB.
