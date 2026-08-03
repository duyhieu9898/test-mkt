# Onboarding — 1Person AI Platform

Welcome! This guide gets a new developer productive on the 1Person codebase in under an hour.

> **1Person** is an AI Operating System for Companies — a single founder runs an entire business powered by autonomous AI agents.

## Read in this order

1. **[local-setup.md](./local-setup.md)** — Get the stack running on your machine (Docker, DB, API, Web). ~15 min.
2. **[architecture.md](./architecture.md)** — Understand what the system does, the main concepts (FTUX, Brain, CEO Advisor, Agents), and the folder layout.
3. **[codebase-tour.md](./codebase-tour.md)** — Find your way around: where routes live, where UI lives, how AI features are wired.

For third-party account connections, read
**[OAuth provider console setup](../guides/oauth-provider-console-setup.md)** to
configure or replace Meta, Google, and Microsoft developer applications.

## 60-second quick start

```bash
# Prereqs: Node 20+, pnpm 9+, Docker Desktop
git clone <repo>
cd 1person
pnpm install
cp .env.example .env            # set JWT_SECRET and OPENAI_API_KEY
pnpm docker:up:core             # postgres, redis, qdrant, meilisearch
pnpm db:migrate:all             # core + ai-tenant migrations
pnpm dev                        # shared packages + api + web + worker
```

Then open:
- Web: http://localhost:3004
- API: http://localhost:8004/api/v1
- Health: http://localhost:8004/health
- Login: `admin@1person.ai` / `Admin@1Person2025`

Something broken? See the troubleshooting section at the bottom of [local-setup.md](./local-setup.md).

## Project conventions at a glance

- **TypeScript strict mode everywhere.** If `tsc` fails, the PR fails.
- **No hardcoding.** Config goes in admin UI + DB, not `.env`. See [`feedback_admin_config_ui`](../../CLAUDE.md).
- **UI for non-technical users.** Never expose env vars, API keys, or dev jargon in the product UI.
- **Code must ship end-to-end.** Every backend endpoint should have a UI wire-up. No dead code.
- **Credits for user actions.** AI-powered actions charge credits (see `apps/api/src/lib/credits.ts`). Show cost in the UI before charging.
- **Commit style.** `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`. Scopes match app/package names.

## What to build first (learning path)

If you want to ship your first PR today:

1. Pick an existing feature area (e.g. Market, Knowledge, Chatbot) in `apps/web/src/app/(dashboard)/[companyId]/`.
2. Find its page component, trace to the API route in `apps/api/src/routes/`, trace to the service in `apps/api/src/services/`.
3. Make a small UX improvement (loading state, error handling, copy tweak) and open a PR.
4. Read [architecture.md](./architecture.md) after your first PR — it'll click faster.

## Where to ask for help

- Check existing docs first: `docs/architecture/` (system design and current feature pipelines), `docs/brainstorm/` (feature specs), `CLAUDE.md` (project vision).
- Specific features: each has a detailed brainstorm doc — e.g. `docs/brainstorm/05-ceo-advisor.md`.
- For UX questions: `docs/screen-specs/`.

Recent implementation guides:

- `docs/guides/oauth-provider-console-setup.md`
- `docs/architecture/13-ai-work-outputs.md`
- `docs/architecture/14-campaign-ai-video-pipeline.md`
- `docs/architecture/15-knowledge-crawl-data.md`
- `docs/architecture/16-ceo-advisor-intelligence.md`

---

*Last updated: 2026-08-03. If setup breaks, open an issue — the reliable repro is more valuable than fixing it silently.*
