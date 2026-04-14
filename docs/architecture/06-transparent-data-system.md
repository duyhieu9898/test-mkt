# 06 — Transparent Data System

> AnythingLLM gap analysis, recommended adoptions, and roadmap for the
> 1Person trust-grade data infrastructure (codename: **`@trustai/core`**).
>
> Last updated: 2026-04-08
> Status: Strategy doc — informs follow-up implementation plans.

---

## §1 — Why this document exists

Non-technical business owners using 1Person ask the same three questions
before they will trust any AI product:

1. **Where does my data live?**
2. **Who can see it?**
3. **Can it leak — and how would I even know?**

We have already built a partial answer (per-tenant isolation, chain-hashed
audit, public proof page), but the surface area users *touch* is too
small for them to feel it. AnythingLLM (https://anythingllm.com) is the
closest open-source analogue and ships several pieces we lack. This doc:

- Inventories what is already built.
- Compares feature-by-feature with AnythingLLM.
- Recommends what to **adopt**, **improve**, or **skip**, ranked by priority.
- Defines the **external API surface** we will expose, because sister
  projects share the same data-privacy concern and we plan to
  externalize this infrastructure as **`@trustai/core`**.
- Lays out a phased build roadmap.

The transparency layer is not a compliance checkbox — it is positioned
as our **product moat**. AnythingLLM is "AI infrastructure for humans";
we want to be **"AI Employee for Business, with a Glass Box."**

---

## §2 — Current state inventory (verified against the repo)

A surprisingly complete foundation already lives in
[`packages/ai-tenant/`](../../packages/ai-tenant). The header comment in
[`src/index.ts`](../../packages/ai-tenant/src/index.ts) explicitly says
*"This module is INDEPENDENT — no imports from `@1person/core`. It can
be extracted as a standalone SaaS service."* That extraction is the
externalization play in §5.

| # | Capability | File | Status |
|---|---|---|---|
|  1 | Tenant isolation (every query filters by `tenantId`) | `packages/ai-tenant/src/tenant-store.ts`, `rag-pipeline.ts` | ✅ Done |
|  2 | Per-tenant file storage on disk (`{storagePath}/{tenantId}/`) | `tenant-store.ts: uploadDocument` | ✅ Done |
|  3 | SHA-256 file hashing + integrity verification | `tenant-store.ts`, `index.ts: verifyDataIntegrity` | ✅ Done |
|  4 | Document chunking + embedding (OpenAI-compatible API; works with vLLM) | `rag-pipeline.ts: chunkText`, `storeChunks` | ✅ Done |
|  5 | RAG query that returns `sources[]` with chunks | `rag-pipeline.ts: query`, `types.ts: QueryResponse` | ✅ Done |
|  6 | Per-tenant agents (system prompt, tone, temperature, tools) | `agent-runtime.ts`, `schema.ts: tenantAgents` | ✅ Done |
|  7 | **Chain-hashed append-only audit log** (tamper detection) | `audit-trail.ts`, `schema.ts: auditLog` | ✅ Done |
|  8 | Query history with `traceId` + retrieved chunk IDs | `schema.ts: queryHistory` | ✅ Done |
|  9 | Public proof page + `TrustBanner` component | `apps/web/src/app/proof/[companyId]/page.tsx`, `components/trust-banner.tsx` | ✅ Done |
| 10 | `/ai-brain` page with transparency tab | `apps/web/src/app/(dashboard)/[companyId]/ai-brain/page.tsx` | ✅ Done |
| 11 | Audit HTTP routes | `apps/api/src/routes/audit.ts` | ✅ Done |
| 12 | Knowledge upload UI | `apps/web/src/app/(dashboard)/[companyId]/knowledge/page.tsx` | ✅ Done |
| 13 | Schema duplicated in `packages/core/src/db/schema/knowledge.ts` (`documents` table) | core | ⚠️ Two parallel `documents` tables: `core.documents` and `ai_tenant.tenant_documents` |

**Honest assessment.** We have the engine. We do not have the dashboard,
and we do not have the public API. The `@1person/ai-tenant` package is
**not yet wired** into `apps/api` or `apps/web`; uploads still go through
the ad-hoc `core.documents` path. Consolidation onto the trust-grade
module is the single biggest unlock — every other improvement compounds
on top of it.

---

## §3 — AnythingLLM feature matrix

Verified via WebFetch on `docs.anythingllm.com` and the
`Mintplex-Labs/anything-llm` GitHub README.

### What AnythingLLM does well

- **Vector DB pluggability** — LanceDB (default), PGVector, Pinecone,
  Qdrant, Chroma, Weaviate, Milvus, Astra DB, Zilliz.
- **LLM provider matrix** — OpenAI, Anthropic, Gemini, Bedrock, Ollama,
  LM Studio, LocalAI, Together, Fireworks, Groq, Mistral, Cohere,
  OpenRouter, DeepSeek, vLLM, and many others.
- **Embedder options** — Native, OpenAI, Azure, LocalAI, Ollama,
  LM Studio, Cohere.
- **No-code agent builder** with MCP compatibility and "Intelligent Skill
  Selection" (claims ~80% token reduction).
- **Embeddable chat widget** as a separate submodule.
- **Developer REST API** with API-key auth, exposed at `/api/docs` on
  each instance — covers workspace management, document embed/update,
  chat. Keys can be created and revoked on the fly.
- **Multi-user mode** with permissions (Docker version).
- **SQLite** default, **Postgres** alternative storage backend.
- **Telemetry off-switch** (`DISABLE_TELEMETRY` env var) and an explicit
  "no IP collection" statement.
- **Desktop apps** (Mac/Win/Linux) for true local mode.

### What AnythingLLM does poorly (our opportunity)

- **No data lineage UI** beyond "the chunk has the original text
  attached." There is no visualization of *which docs → which chunks →
  which answer*. The official RAG doc page is even marked legacy.
- **No editable business memory layer.** It is a doc-RAG box, not a
  structured brand / persona / product brain.
- **No "Why this output?" explainability button.**
- **No tamper-evident audit chain.** We already have this.
- **Dev-centric UI.** Vector DB choice, embedder choice, and chunk-size
  knobs are exposed to end users — wrong target audience for us.
- **Unclear source citations** in chat responses (current version).
- **No public proof / shareable trust link** like our `/proof/:companyId`.

### Decision matrix — Adopt / Improve / Skip

| # | Feature | AnythingLLM | Us today | Decision | Priority |
|---|---|---|---|---|---|
|  1 | Workspace = isolated context | ✅ | ✅ (`tenants` table) | **Keep**, rename UI to *Business Brain* | — |
|  2 | Multi-vector-DB support | 9 backends | ❌ (jsonb stub) | **Adopt pgvector first**, add Qdrant later via interface | P0 |
|  3 | Multi-LLM provider matrix | 20+ | Partial (`vllm`/`openai`/`anthropic` types) | **Adopt** as `LLMProvider` interface; ship Bring-Your-Own-API-Key UI | P0 |
|  4 | Multi-embedder support | 7 | Partial | **Adopt** same interface pattern | P1 |
|  5 | Document parsers (PDF/DOCX/TXT/URL/audio) | ✅ | Partial (PDF / URL / text / image) | **Improve** — add DOCX, XLSX, audio (Whisper) | P1 |
|  6 | No-code agent builder | ✅ generic | Per-tenant agent config | **Improve** — ship 4 prebuilt verticalized agents (SEO / Ads / Content / Banner) instead of a generic builder | P1 |
|  7 | Agent skills / MCP tools | ✅ | `tools` jsonb (unused) | **Adopt** MCP compatibility for extensibility | P2 |
|  8 | Embeddable chat widget | ✅ | ❌ | **Adopt** — high value as "AI Sales Agent" on customer sites | P2 |
|  9 | Developer REST API | ✅ at `/api/docs` | Internal only | **Adopt** — this is the externalization play | P0 |
| 10 | API-key auth + rotation | ✅ | ❌ | **Adopt** | P0 |
| 11 | Multi-user / RBAC inside a workspace | ✅ | Single-owner | **Adopt** — needed for teams | P2 |
| 12 | Data export / portability | ✅ | ❌ | **Adopt** — JSON + ZIP of raw files | P1 |
| 13 | Telemetry off-switch | ✅ | ❌ explicit flag | **Adopt** + document what we log | P1 |
| 14 | Desktop / fully-local mode | ✅ | ❌ | **Skip for v1** — offer "Private Cloud" deployment instead | — |
| 15 | Cite sources in answers | Unclear | ✅ (`QueryResponse.sources[]`) | **Already better — surface in UI** | P0 |
| 16 | Tamper-evident audit chain | ❌ | ✅ chain-hashed | **Already better — productize and market it** | P0 |
| 17 | "Why this output?" explainability | ❌ | ❌ | **Build — our differentiator** | P0 |
| 18 | Editable Business Brain (brand / persona / product) | ❌ | ❌ | **Build — our differentiator** | P0 |
| 19 | Data lineage graph (output ← chunks ← docs ← sources) | ❌ | data exists, no UI | **Build — our differentiator** | P0 |
| 20 | Public proof / shareable trust link | ❌ | ✅ `/proof/:companyId` | **Already better — polish + market** | P1 |

---

## §4 — Architecture: the six layers

A clean six-layer mental model for both our own team and any external
project that consumes the infrastructure:

```
L1  Data Source     ← crawlers, integrations, file uploads
L2  Storage         ← per-tenant files + ai_tenant_documents + ai_document_chunks (pgvector)
L3  Memory (Brain)  ← editable structured knowledge: brand voice, persona, products, campaigns
L4  RAG / Retrieval ← embed → search → rerank, returns sources[] with chunk IDs
L5  Reasoning       ← LLM call + explain trace (which sources, which prompt, why)
L6  Trust Surface   ← audit chain, integrity proofs, "why this output", lineage UI, public proof
```

L1, L2, L4, and L5 mostly exist today. **L3 and L6 are the gaps — and L6
is the moat.** Any external consumer can plug in at any layer; the
default consumption point is L4 (RAG queries) plus L6 (trust endpoints).

---

## §5 — Externalization plan: `@trustai/core`

We will repackage `@1person/ai-tenant` as **`@trustai/core`**, a
drop-in trust-grade RAG + audit module that any sister project can adopt
to answer the "where is my data?" question with a verifiable, one-click
proof. Two delivery shapes:

### Shape A — Library (npm)

```ts
import { createTenantAI } from '@trustai/core';

const ai = createTenantAI({
  databaseUrl: process.env.DATABASE_URL!,
  llm: { provider: 'vllm', baseUrl, model },
  embedding: { provider: 'vllm', baseUrl, model, dimensions: 384 },
  storagePath: '/data/tenants',
});
```

The class shape already exists in
[`packages/ai-tenant/src/index.ts`](../../packages/ai-tenant/src/index.ts).
Outstanding work: published types, README, semver, CI, license decision.

### Shape B — Hosted REST API (the real product)

Minimum endpoint set. Every request `Authorization: Bearer <api_key>`,
every API key scoped to one or more tenant IDs, every mutation logged
to the chain-hashed audit trail.

```
POST   /v1/tenants                                  create tenant (workspace)
GET    /v1/tenants/:id

POST   /v1/tenants/:id/documents                    upload (multipart)
GET    /v1/tenants/:id/documents
DELETE /v1/tenants/:id/documents/:docId

POST   /v1/tenants/:id/query                        RAG → { answer, sources[], traceId }

GET    /v1/tenants/:id/audit                        paginated audit log
GET    /v1/tenants/:id/audit/verify                 chain integrity check
GET    /v1/tenants/:id/documents/:docId/proof       file hash proof

GET    /v1/tenants/:id/lineage/:traceId             full lineage for an output   ← NEW
GET    /v1/tenants/:id/explain/:traceId             "why this output" payload    ← NEW

POST   /v1/tenants/:id/export                       data export (async job)

GET    /v1/tenants/:id/agents                       CRUD on agents
POST   /v1/tenants/:id/memory/brand                 Business Brain CRUD          ← NEW
POST   /v1/tenants/:id/memory/persona
POST   /v1/tenants/:id/memory/products
```

The first nine map 1:1 to existing methods on the `TenantAI` class
(`initTenant`, `uploadDocument`, `listDocuments`, `query`, `getAuditLog`,
`verifyDataIntegrity`, `getDocumentProof`, `createAgent`, …). The
endpoints marked NEW require the new work in §6.

**API-key model.** Keys belong to a *consumer project*, not a user. A
consumer key can be scoped to one tenant or many. Keys are rotatable,
revocable, and rate-limited per key. Usage is metered per key for
billing.

---

## §6 — The three moat features (deep dives)

### 6a. Editable Business Brain (the L3 memory layer)

Conceptually we add four new structured knowledge stores (Drizzle DDL
deferred to the implementation plan):

- **`ai_brain_brand_voice`** — tone, words to use / avoid, examples,
  version history.
- **`ai_brain_personas`** — customer segments with attributes.
- **`ai_brain_products`** — structured product catalog.
- **`ai_brain_campaigns`** — past campaigns and outcomes.

All four are versioned, all editable from a non-technical UI, and all
retrievable as structured context for any agent run. AnythingLLM has
none of this — they have only an unstructured doc bag.

### 6b. Data lineage and "Why this output?"

We already store `traceId`, `retrievedChunkIds`, `promptTokens`, and
inference timing in
[`schema.ts: queryHistory`](../../packages/ai-tenant/src/schema.ts).
Three additions complete the picture:

1. **Persist the rendered prompt** + LLM model + temperature +
   brain-version snapshot at query time.
2. **Build a UI**: tap any AI output → modal showing  
   *docs used → chunks used → brain entries used → prompt → model* →
   "edit any of these and regenerate."
3. **Expose** `/v1/.../explain/:traceId` over the public API so external
   consumers can render the same modal.

This is the single feature most likely to convert a skeptical
non-technical user into a believer. AnythingLLM cannot do it.

### 6c. Tamper-evident audit (already built — productize it)

[`audit-trail.ts`](../../packages/ai-tenant/src/audit-trail.ts) already
implements an append-only chain hash. Productization work:

- Surface `verifyDataIntegrity()` and `getDocumentProof()` in the UI as
  a one-click *"Verify my data"* button on the proof page.
- Document the chain-hash mechanism in plain-language for non-technical
  users (the Vietnamese-language explainer is its own follow-up task).
- Add a marketing surface on the public proof page that explains *why*
  the green checkmark means something.

---

## §7 — Phased roadmap

### Phase 0 — Consolidation (the prerequisite)

- Wire `@1person/ai-tenant` into `apps/api` and replace the ad-hoc
  `core.documents` upload path used by
  `apps/api/src/routes/knowledge.ts`.
- Migrate existing companies → tenants 1:1 by `companyId` (using the
  existing `externalId` field on `ai_tenants`).
- Decide between dual-write for one release or hard cutover.
  **Recommendation:** dual-write for one release, then drop
  `core.documents`.

### Phase 1 — Trust UI moat (P0)

- pgvector wiring (replace the `jsonb` embedding stub in
  `trustai_document_chunks`).
- `LLMProvider` and `EmbeddingProvider` interfaces + Bring-Your-Own-Key
  UI for OpenAI, Anthropic, Gemini, OpenRouter at minimum.
- Surface `sources[]` in the chat UI with per-citation hover.
- Build the "Why this output?" modal driven by **Langfuse** (see ADR-01
  below) — no custom lineage table needed.
- Polish `/proof/:companyId` and add the one-click "Verify integrity"
  button.

### ADR-01 — Use Langfuse (self-hosted) for lineage, tracing, and
"Why this output?" instead of building it ourselves

**Date:** 2026-04-09
**Status:** Accepted
**Decision owner:** product founder

**Context.** The original plan (this doc §6b + implementation plan
W0.3 + W1A.3 + tracing half of W1B.4) called for building a
per-query lineage table, a rendered-prompt snapshot, a brain-version
snapshot, and a "Why this output?" modal UI from scratch. Estimated
effort: ~1 week of pure plumbing before any user-facing value lands.

**Decision.** Adopt [Langfuse](https://langfuse.com) in self-host mode
for all LLM observability, lineage, tracing, and the "Why this
output?" UI. Langfuse is an open-source (MIT) LLM observability
platform with first-class support for per-call tracing, nested
spans, prompt versioning, session grouping, and a ready-made
trace-inspection UI that covers the explainability requirement.

**Consequences — what this buys us.**
- **W0.3 (lineage data model)** collapses into a thin wrapper that
  tags each `TenantAI.query()` call with a Langfuse trace. No new
  DB tables.
- **W1A.3 ("Why this output?" modal)** becomes a deep link from any
  generated asset into the Langfuse trace inspector. The Langfuse
  UI already renders prompt, model, temperature, sources, and
  timings — we get it for free.
- **W1B.4 (live workflow visualization)** keeps its custom SSE panel
  for the top-level campaign-flow view, but each step's `[Why?]`
  button deep-links into Langfuse for the drill-down. The event bus
  still emits for the panel; Langfuse just stores the per-LLM-call
  detail.

**Consequences — costs.**
- One additional self-hosted service (Postgres-backed, single
  container). Deploys alongside 1Person.
- Langfuse SDK must be wired into `packages/ai-tenant/src/rag-pipeline.ts`
  (LLM + embedding calls) and into the marketing generator services
  that do raw LLM calls.
- Our `trustai_query_history` table becomes **supplementary** rather
  than the primary lineage store. Still useful for billing and
  tenant-scoped counts, but not the trace canon.

**What we keep building ourselves (non-negotiable).**
- Chain-hashed `trustai_audit_log` — Langfuse does not have
  tamper-evident audit. This is part of our trust moat.
- `trustai_documents` file hashes + `verifyDataIntegrity()` —
  Langfuse is about LLM traces, not files.
- Per-tenant file isolation on disk — unchanged.
- The Business Brain (W0.2) — Langfuse stores traces, not
  structured business knowledge.

**Privacy note.** Langfuse self-host means traces live on the same
infrastructure as the rest of 1Person. For W1A.6 (On-Premise mode),
the Langfuse server is deployed on the customer's own infrastructure
along with Postgres and vLLM — no egress.

**Superseded sections of this doc.** §6b is now partially delivered
by Langfuse; we keep the section as the conceptual description but
the implementation path is Langfuse, not custom tables.

### Phase 2 — External API (the infra-for-other-projects play)

- API-key issuance, rotation, and scoping.
- Publish the v1 REST surface from §5.
- Rate limiting and per-key usage metering.
- SDK packages: `@trustai/node`, `@trustai/python`.
- Public docs site for consumer projects.

### Phase 3 — Business Brain and advanced

- Editable brand voice / persona / products / campaigns tables and UI.
- Data export / portability (JSON + ZIP of raw files).
- Embeddable chat widget.
- Four prebuilt verticalized business agents (SEO / Ads / Content /
  Banner).
- MCP tool support for the agent runtime.

---

## §8 — Out of scope

These are deliberately *not* on the roadmap and should be declined if
asked:

- **Desktop / fully-offline app.** Solved instead via "Private Cloud"
  deployment for enterprise customers.
- **Generic no-code agent builder.** Non-technical users do not want
  one — they want verticalized agents that already know how to do their
  job. AnythingLLM optimizes for the wrong audience here.
- **Replacing Anthropic / OpenAI as the foundation model provider.** We
  abstract over them; we do not compete with them.

---

## Appendix A — Mapping to existing files

| Component | Path |
|---|---|
| Standalone module (extractable) | [`packages/ai-tenant/`](../../packages/ai-tenant) |
| Public API surface (today) | [`packages/ai-tenant/src/index.ts`](../../packages/ai-tenant/src/index.ts) |
| Schema (`ai_tenants`, `ai_tenant_documents`, `ai_document_chunks`, `ai_audit_log`, `ai_query_history`) | [`packages/ai-tenant/src/schema.ts`](../../packages/ai-tenant/src/schema.ts) |
| Tenant store + file storage | [`packages/ai-tenant/src/tenant-store.ts`](../../packages/ai-tenant/src/tenant-store.ts) |
| RAG pipeline (chunk + embed + retrieve + LLM) | [`packages/ai-tenant/src/rag-pipeline.ts`](../../packages/ai-tenant/src/rag-pipeline.ts) |
| Chain-hashed audit | [`packages/ai-tenant/src/audit-trail.ts`](../../packages/ai-tenant/src/audit-trail.ts) |
| Per-tenant agents | [`packages/ai-tenant/src/agent-runtime.ts`](../../packages/ai-tenant/src/agent-runtime.ts) |
| Public proof page | [`apps/web/src/app/proof/[companyId]/page.tsx`](../../apps/web/src/app/proof/[companyId]/page.tsx) |
| Trust banner component | [`apps/web/src/components/trust-banner.tsx`](../../apps/web/src/components/trust-banner.tsx) |
| AI brain page (transparency tab host) | [`apps/web/src/app/(dashboard)/[companyId]/ai-brain/page.tsx`](../../apps/web/src/app/(dashboard)/[companyId]/ai-brain/page.tsx) |
| Knowledge upload UI | [`apps/web/src/app/(dashboard)/[companyId]/knowledge/page.tsx`](../../apps/web/src/app/(dashboard)/[companyId]/knowledge/page.tsx) |
| Audit HTTP routes | [`apps/api/src/routes/audit.ts`](../../apps/api/src/routes/audit.ts) |
| Knowledge HTTP routes (legacy `core.documents` path — to retire) | [`apps/api/src/routes/knowledge.ts`](../../apps/api/src/routes/knowledge.ts) |

## Appendix B — Sources

- AnythingLLM docs: https://docs.anythingllm.com
- AnythingLLM GitHub: https://github.com/Mintplex-Labs/anything-llm
- AnythingLLM RAG explainer (legacy):
  https://docs.anythingllm.com/chatting-with-documents/rag-in-anythingllm
- AnythingLLM API doc:
  https://docs.anythingllm.com/features/api
- Internal brainstorm package (working draft, not checked in):
  `~/Downloads/ai_marketing_os_package/`
