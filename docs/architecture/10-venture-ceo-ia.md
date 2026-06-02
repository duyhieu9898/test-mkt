# 10 — Venture-Stage CEO Information Architecture

> IA restructure + surface plan for the 1Person platform's actual target
> persona: a founder running a **venture-stage company** (not a one-person
> solo, not an enterprise with OKR dashboards).
>
> Created: 2026-04-12
> Status: Draft — awaiting implementation.
> Supersedes: the orphan `/strategy` (OKR Horizon) and `/growth-brain` pages.

---

## §1 — Why this document exists

After building out docs 06–09 (Trust, Marketing, PMF, Pricing) we discovered
a confusing information architecture: **three "AI strategic" surfaces**
(`/insights`, `/strategy`, `/growth-brain`) overlap each other, and the
existing `/strategy` page is an enterprise OKR dashboard that doesn't fit
the target persona at all. At the same time, several of the venture CEO's
real needs — market intelligence, competitor tracking, sales pipeline,
meeting → knowledge distillation — have no coherent surface.

This doc re-anchors the IA on the **venture CEO persona** and maps each
stated need to a single, clear surface.

### The persona — Venture-Stage CEO (the real user)

Not a one-person solo who just wants a chatbot. Not a Fortune 500 CEO
with an OKR horizon. **A founder of a venture-stage company (seed → Series A),
running 1-15 people**, who:

- Needs AI agents to cover Marketing, Sales, SEO, Meetings, Customer Support.
- Is time-poor. Wants cross-domain answers ("what should I do today?") not
  vertical dashboards.
- Needs competitive awareness without hiring an analyst.
- Runs sales by themselves or with 1–2 reps. Deals are real — not just
  "leads from a form".
- Records team meetings and needs to extract decisions + commitments
  without re-reading transcripts.
- Cares about market trends because pivots happen fast at this stage.

### The eight CEO needs (user's own words, numbered for traceability)

1. **Hiểu về market hiện tại** — current market intelligence
2. **Hiểu về đối thủ** — competitor awareness
3. **Đề ra chiến lược marketing** (online + offline)
4. **Chiến lược sales và chốt deal**
5. **Chatbot hỗ trợ khách hàng**
6. **Tra cứu thông tin nội bộ**
7. **Tóm gọn meetings, trích xuất keywords/strategies**
8. **Action items cho CEO** từ toàn bộ kiến thức nội bộ + external scans

---

## §2 — Conflict check against docs 06–09

Before restructuring, we verified the new plan does not contradict the
existing strategy docs. **Result: mostly additive, two points of tension.**

| Doc | Directive | Alignment |
|---|---|---|
| 06 §6a | "Editable Business Brain" (brand voice / personas / products) | ✅ Consistent — we extend to 6 tabs, keep schema additive |
| 06 §6b | "Why this output?" per-asset lineage | ✅ Already done (Task #4, doc 06 alignment) |
| 06 ADR-01 | Langfuse for observability, not custom lineage tables | ✅ Respected |
| 07 §4 | "Campaigns as the spine" | ✅ Kept — Campaigns remains the marketing execution surface |
| 07 §G6 | "4 top-level surfaces: Campaigns / Brain / Performance / Settings" | ⚠️ **Tension** — see §4 below |
| 07 §5 | Out of scope: Trust UI, BYO key, external API | ✅ Respected |
| 08 §5 kill list | ❌ "Custom agent loop / planner" — use Managed Agents | ⚠️ **Tension** — see §4 below |
| 08 §5 kill list | ❌ "Multi-agent orchestration engine" | ✅ Respected — we do NOT build a new orchestrator |
| 08 §5 kill list | ❌ "Knowledge graph for Brain" | ✅ Respected — we keep the 4-table structured store |
| 08 §5 kill list | ❌ "New ad platforms beyond Meta" | ✅ Respected — no new platforms |
| 08 P0-B4 | "FTUX auto-build Brain from website crawl" | ✅ Extends — Market & Competitors builds on this |
| 08 P0-B7 | "Feedback loop → Brain learnings" | ✅ Extends — CEO Advisor reads from the same learnings |
| 09 | Credit / tier picker, admin-config | ✅ All new surfaces respect admin-config-driven costs |

### Points of tension + resolution

**Tension 1: Doc 07 §G6 says 4 top-level surfaces. This plan has 8.**

*Resolution*: Doc 07's "4 surfaces" was written when the dashboard had
25+ pages — the goal was drastic reduction. The 8 items here are already
a reduction from ~18 current surfaces, and each maps 1-to-1 to a CEO
need from §1. Grouping further (e.g., folding Sales into Campaigns)
would re-muddy the mental model. **We accept 8 items as the new minimum**,
but we collapse Knowledge + Meetings into a single tabbed surface to
honor the spirit of doc 07.

**Tension 2: Doc 08 kill list forbids "custom agent loop / planner".**

*Resolution*: The "CEO Advisor" surface does NOT build a new agent
framework. It is a **scheduled cron + prompt template** that:
- Runs once per day (or on-demand)
- Aggregates data from existing tables (campaigns, learnings, sales, market_scans, meetings)
- Makes ONE LLM call with the aggregated context
- Writes a structured brief to a new `ceo_daily_briefs` table

This is the "Chief of Staff" pattern, not an agent framework. No
planner. No tool use. Just prompt + data. Consistent with doc 08.

---

## §3 — Surface map: need → page

Every row in the user's list maps to exactly one primary surface:

| # | CEO Need | Primary Surface | Reads From | Writes To |
|---|---|---|---|---|
| 1 | Market intel | **Market & Competitors** (new) | scan service + RAG | Brain → Market Position |
| 2 | Competitor intel | **Market & Competitors** (new) | scan service + RAG | Brain → Market Position + CEO Advisor alerts |
| 3 | Marketing strategy | **Brain → Marketing Strategy** (new tab) + Campaigns | manual edits + Market scan | Campaign generator |
| 4 | Sales strategy + close | **Sales** (new; extends /leads) + **Brain → Sales Playbook** (new tab) | Brain, deal history | Deal AI assistant |
| 5 | Customer chatbot | **Chatbot** (unchanged) | Brain + Knowledge RAG | Chat history |
| 6 | Internal knowledge | **Knowledge** (merged) | docs + meetings + RAG | Company Facts |
| 7 | Meeting distillation | **Knowledge → Meetings tab** | transcripts | Brain → Marketing/Sales learnings |
| 8 | CEO action items | **CEO Advisor** (rename /insights, expand) | every table below | `ceo_daily_briefs` table |

### Nav rail (final)

```
Main:
  1. Dashboard
  2. CEO Advisor           (rename /insights, expand cross-domain)
  3. Market & Competitors  (new)
  4. Brain                 (expand 3 → 6 tabs)
  5. Campaigns             (unchanged spine — marketing online execution)
  6. Sales                 (new — replaces /leads)
  7. Knowledge             (merged /knowledge + /meetings)
  8. Chatbot               (unchanged)

More (collapsed):
  - Trust (compliance/audit)
  - Settings / Credits
```

### Retired (deleted, not hidden)

- `/strategy` — OKR Horizon page (wrong persona)
- `/growth-brain` — orphaned revenue dashboard (folded into CEO Advisor)

Orphaned backend endpoints are also removed to avoid confusion.

---

## §4 — Brain expansion: 3 → 6 tabs

Current: Brand Voice, Personas, Products.

### New tabs

| Tab | Schema additions | Purpose |
|---|---|---|
| **Market Position** | `brain_market_position` — swot { strengths, weaknesses, opportunities, threats }, differentiation (text), positioning_statement (text), last_updated_by (manual/market-scan), version | Power the "Hiểu market" need. Filled by Market scan or manual. |
| **Sales Playbook** | `brain_sales_playbook` — qualification_rules[], stages[], objections[ { objection, response }], closing_lines[], ideal_customer_profile | Power the Sales surface — deal AI reads this for every suggestion. |
| **Marketing Strategy** | `brain_marketing_strategy` — channels[ { name, enabled, notes }], budget_split, offline_channels[], voice_per_channel (map), themes[] | Campaigns generator reads this instead of hardcoded defaults. |

All new tables are per-tenant, live in `packages/ai-tenant/src/schema.ts`
under the `brain_` prefix (consistent with existing).

### Autoextract extension

The existing `brain-autoextract.ts` service is extended to optionally
populate Market Position and Marketing Strategy from the crawled
business context (not Sales Playbook — too nuanced, requires founder input).

---

## §5 — Market & Competitors (new surface)

### Pages

- **Overview** — SWOT + last scan summary
- **Competitors** — list with { name, url, notes, tags, last_scan_at, signals[] }
- **Scan history** — chronological list of scan runs + findings
- **Sources** — RSS feeds / URLs the scan watches

### Scan engine — open-source / free-first strategy

The user explicitly wants **free-first, admin-config-driven, with a
paid fallback**. Cascade:

**Tier 0 — Free & open-source (default when no paid key is set)**

| Source | Access | Cost | Notes |
|---|---|---|---|
| **Jina Reader** (`r.jina.ai`) | HTTP GET, no API key | Free (rate-limited, generous) | Converts any URL → clean markdown. Perfect for competitor page scraping. |
| **Google News RSS** | RSS feed per query | Free | `https://news.google.com/rss/search?q=<query>` — structured news. |
| **Reddit JSON API** | HTTP GET `.json` suffix | Free | Community signal for niche products. |
| **Hacker News Algolia** | HTTPS, no key | Free | Tech market signal. |
| **RSS feeds** for competitor blogs | Standard RSS | Free | Manually added by admin. |

**Tier 1 — Paid fallback (admin-config-driven)**

If the admin adds a Perplexity / Tavily / Brave Search API key via the
admin UI, the scan engine switches to the paid tier automatically for
deeper results. Keys live in `systemConfigs` (category `'integration'`,
keys `perplexity`, `tavily`, `brave_search`) — encrypted, just like the
LLM provider keys.

**No code changes** when switching tiers — config-resolver picks.

### Data flow

```
Admin adds competitor URL + keywords
    ↓
Scan worker (cron every 24h, or on-demand)
    ↓
For each competitor:
  1. Jina Reader → competitor homepage markdown
  2. Google News RSS → last 7 days news about competitor
  3. Optional: Perplexity query if key present
    ↓
LLM call (featureKey: 'market_scan') → extract:
  - signals: [{ type: 'product_launch' | 'pricing_change' | 'hire' | 'news' | 'content', text, url, date }]
  - SWOT delta vs. previous scan
  - Recommended CEO action (1 sentence)
    ↓
Write to:
  - market_scans table (raw + parsed)
  - brain_market_position (auto-update SWOT, user can accept/reject)
  - ceo_daily_briefs (as alert)
```

### Credit cost

Admin-configurable via the existing feature system. Default suggestion:
5 credits per scanned competitor per run.

---

## §6 — Sales (new surface, replaces /leads)

### Data model

- Keep existing `leads` table (inbound capture).
- **New `deals` table**: `{ id, companyId, leadId?, title, value, currency, stage, owner, close_date, next_action, next_action_due, notes, metadata, created_at, updated_at }`
- `stage` enum: `discovery → qualified → proposal → negotiation → closed_won | closed_lost`
- **New `deal_events` table** (append-only): `{ dealId, type, payload, created_at }` — email sent, meeting logged, stage changed, AI suggestion dismissed.

### UI

- Kanban board of deals by stage (primary view)
- Deal detail: timeline + AI Next Action panel + Email drafter
- "Promote lead to deal" flow from the leads list

### AI Deal Assistant

Per deal, one button → LLM call that:
- Reads the deal history + Brain → Sales Playbook
- Returns:
  - Next best action (1 sentence)
  - Draft email (if applicable)
  - Which objection class the deal likely faces
  - Confidence score

FeatureKey: `sales_deal_assistant`. Tier-aware via existing credit system.

### Rationale for picking this shape (user's question #3)

Alternatives considered:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Extend `leads` table with stage column | Minimal schema change | Conflates inbound leads + deals. Loses history. | ❌ |
| **New `deals` table + `deal_events` append-only** | Clean separation, event-sourced history, AI can replay context | 1 extra table, migration | ✅ **Chosen** |
| Use Twenty/EspoCRM as subsystem | Battle-tested | Heavy integration, another service to run | ❌ Overkill for PMF |
| Fine-tuned CRM model | "Future-proof" | No ROI at PMF stage, forbidden by doc 08 kill list | ❌ |

The chosen shape is **battle-tested** (Kanban + event log is how
HubSpot, Pipedrive, Close, Salesloft all model deals) and
**future-proof** (event log lets us add playbook automation later
without schema change).

---

## §7 — Knowledge (merged /knowledge + /meetings)

Four tabs:

1. **Documents** (current /knowledge)
2. **Meetings** (current /meetings — transcripts + AI summary)
3. **Search** (unified RAG across documents + meetings + Brain)
4. **Company Facts** (structured Q&A extracted over time)

### Meeting engine — open-source replacement

Current code (`routes/meetings.ts`) uses **OpenAI Whisper API** (paid,
~$0.006/min). The user prefers open-source. Plan:

- Add `faster-whisper-server` (open-source, MIT, exposes OpenAI-compatible
  HTTP API) to `docker-compose.yml` as an optional service.
- Image: `fedirz/faster-whisper-server:latest-cpu` (works on Mac without
  GPU) or `-cuda` variant for GPU deploys.
- Admin config UI gets a new `transcription` provider row — admin picks
  "Local (faster-whisper-server)" or "OpenAI Whisper API" (fallback).
- `routes/meetings.ts` reads the active transcription provider via
  `resolveProvider('transcription')` and calls the appropriate endpoint
  using the OpenAI-compatible API (same call shape for both).
- Cost in credits: 0 for local, 1 credit/min for OpenAI (admin-configurable).

**Default = local when docker-compose service is running.** Zero cost
to ventures who self-host.

### Meeting → Brain extraction

When a meeting finishes transcribing, an LLM call extracts:
- Keywords (top 5)
- Strategic decisions made
- Commitments (who owes what by when)
- Market insights mentioned
- Sales objections heard

These are written back to:
- `brain_campaign_learnings` (for marketing/sales insights)
- `ceo_daily_briefs` (commitments as action items)
- Optional: new `brain_meeting_insights` table if needed

---

## §8 — CEO Advisor (rename /insights, expand)

### Current: only campaigns

Reads from `campaigns` + `brain_campaign_learnings`. Shows recommendations
scoped to marketing.

### New: cross-domain

Data sources aggregated for each brief:
- Campaigns (performance + anomalies)
- Sales (pipeline health, deals without recent activity, high-value stalled deals)
- Market scans (new signals since last brief)
- Meetings (new commitments not yet acted on)
- Brain learnings (recent wins/fails)

### Pattern — "Chief of Staff" loop

(Adapted from `everything-claude-code / agents/chief-of-staff.md`. See §10
for full sourcing.)

Daily cron (configurable) runs:

```
1. Fetch data (parallel):
   - campaigns last 7d perf summary
   - deals needing attention (no activity > 3d)
   - market_scans.signals since last brief
   - meeting commitments open
   - brain_campaign_learnings last 7d
2. Compose aggregated context
3. LLM call (featureKey: 'ceo_advisor_brief')
   → {
       headline: "Your 3 most important actions today",
       actions: [{ title, why, impact, link, severity }],
       wins: [{ what, detail }],
       alerts: [{ what, detail, link }],
       weekly_trend: { ... }
     }
4. Write to ceo_daily_briefs table
5. (Optional) Email the founder
```

**Not a new agent framework.** One cron + one prompt + one table.
Explicitly consistent with doc 08 §5 kill list.

---

## §9 — Conflicts with existing features we need to retire

| Existing | Action | Reason |
|---|---|---|
| `apps/web/src/app/(dashboard)/[companyId]/strategy/page.tsx` (1303 lines) | ✅ Deleted | Enterprise OKR persona, orphaned nav |
| `apps/web/src/app/(dashboard)/[companyId]/growth-brain/page.tsx` (350 lines) | ✅ Deleted | Orphaned, folded into CEO Advisor |
| `apps/api/src/routes/strategy.ts` (781 lines) | ✅ Deleted | Backing the deleted page |
| `apps/api/src/agents/growth-brain.ts` | ✅ Deleted | Folded into CEO Advisor |
| Backend `growth-brain` endpoints in `dashboard.ts` | ✅ Deleted | Folded into CEO Advisor endpoint |
| `packages/core/src/db/schema/strategy-horizon.ts` | **KEEP** — reused by the CEO reasoning loop | See decision note below |
| `apps/worker/src/services/strategy-horizon.ts` (834 lines) | **KEEP** | Contains `runDailyStrategyRefresh` invoked by the CEO reasoning loop |
| `apps/worker/src/services/ceo-reasoning-loop.ts` (1027 lines) | **KEEP** | Battle-tested Plan → Act → Reflect agent loop; precisely the "AI CEO agent" vision of §12a |
| `apps/worker/src/services/risk-monitoring.ts`, `event-triggers.ts`, `ceo-brain.ts` | **KEEP** | Consumers of the reasoning loop |

### Decision: Option B — keep the CEO reasoning engine, retire only the OKR UI

During implementation we discovered `strategy_horizons` is reused by two
very different things:

1. The orphan `/strategy` **UI** — enterprise OKR dashboard. Retired.
2. The worker's **CEO reasoning loop** (`ceo-reasoning-loop.ts`,
   1027 lines of Plan → Act → Reflect) — which is exactly the
   battle-tested CEO agent the user's §12a vision calls for. It had
   been coded but was effectively dormant because the UI was wrong.

User confirmed **Option B** 2026-04-12: delete the OKR UI layer but keep
the reasoning engine and its backing table. The upcoming CEO Advisor
surface (§8) will READ from the reasoning loop's output instead of
re-implementing it.

Implication: there is **no drizzle migration** — the schema stays.
Future work: decouple the "quarterly / weekly / daily horizon" concept
from the reasoning loop so it can also run on-demand when the CEO
Advisor refresh button is clicked.

---

## §10 — What we borrow from `everything-claude-code`

Repo: https://github.com/affaan-m/everything-claude-code

**Important caveat.** This repo is a Claude Code harness (skills + agents
for developers using the Claude Code CLI). It is NOT an end-user business
product. We **do not copy any files directly**. We adapt the prompt
structures and workflows into our own services.

### Adoption matrix

| Pattern in repo | Where we adapt it | Status |
|---|---|---|
| `skills/market-research/` prompts (source-attributed competitor intel) | → `apps/api/src/services/market-scan.ts` prompt templates | 📋 **To implement** (§5) |
| `agents/chief-of-staff.md` (communication triage + draft) | → `services/ceo-advisor-brief.ts` prompt + daily cron | 📋 **To implement** (§8) |
| `skills/article-writing/` (voice-preserving long-form) | → upgrade existing `seo-engine.ts` / blog to bind tighter to `brain_brand_voice` | 📋 **To implement** (polish) |
| `skills/content-engine/` (multi-platform repurposing) | → extend `marketing-engine.ts` `generatePosts` with per-channel voice from Brain → Marketing Strategy | 📋 **To implement** |
| `skills/continuous-learning/` (stop-hook pattern extraction) | → extend `feedback-cron.ts` to extract learnings from meetings + campaigns | 📋 **To implement** |
| `skills/verification-loop/` (checkpoint evals) | → wire into `creative-quality.ts` (already have `validateBanner`; add validators for posts, emails) | 📋 **To implement** |
| `skills/investor-materials/` pitch deck templates | ❌ Not adopted | Out of scope for 1Person |
| Claude Code `hooks/` lifecycle | ❌ Not applicable | Dev-tool-only pattern |
| `rules/` multi-language linting | ❌ Not applicable | Dev-tool-only pattern |
| `agents/` dev-review subagents | ❌ Not applicable | Dev-tool-only pattern |

### Attribution

Every adapted service must include a header comment:

```typescript
/**
 * Adapted from everything-claude-code / skills/<name>
 * https://github.com/affaan-m/everything-claude-code
 * License: (check repo; add compatible LICENSE note)
 */
```

This preserves traceability so we don't lose the origin of these
patterns.

### Checklist before each adoption

1. Read the source skill/agent file in the repo.
2. Extract the prompt structure and the data it expects.
3. Rewrite in TypeScript against our existing types (`BusinessContext`,
   `BrainSnapshot`, etc.).
4. Add featureKey in `config-store.ts` with default tier + credit cost.
5. Add header attribution comment.
6. Add row to the tracker in §11.

---

## §11 — Implementation tracker

| # | Surface / service | Status | Notes |
|---|---|---|---|
| 11.1 | Delete orphan `/strategy` + `/growth-brain` routes + UI (UI layer only; backend reasoning loop kept) | ✅ | §9 — Option B |
| 11.2 | Sidebar restructure (8 items per §3) | ✅ | Stub pages for /market + /sales added |
| 11.3 | Brain → 3 new tabs (Market Position, Sales Playbook, Marketing Strategy) | ✅ | §4 — schema pushed, CRUD + UI shipped |
| 11.4 | Knowledge unified tab bar (Documents + Meetings + Search) | ✅ | §7 — pragmatic tab-bar navigation, no JSX refactor |
| 11.5 | faster-whisper-server open-source transcription | ✅ | §7 — docker-compose service + admin transcription category + resolveTranscriptionProvider() + meetings route swap |
| 11.6 | Meeting → Brain extraction service | ✅ | §7 — `extractMeetingBrainLearnings` writes marketInsights/objections/strategies as categorized `brain_campaign_learnings` |
| 11.7 | Market & Competitors surface + `market_scans` table + on-demand scan | ✅ | §5 — Agent A, 407 lines. Routes + services + UI all wired. Jina Reader + Google News RSS free tier. |
| 11.8 | Jina Reader + Google News RSS adapters (free tier) | ✅ | §5 — folded into Agent A scan engine |
| 11.9 | Perplexity/Tavily/Brave admin config (paid tier fallback) | ⏭️ Skipped | Out of scope per "every line must ship to UI" rule — no UI consumer yet. Defer until proven need. |
| 11.10 | Sales surface + `deals` + `deal_events` tables | ✅ | §6 — Agent B, 475 lines. Kanban + detail + events. |
| 11.11 | AI Deal Assistant prompt + route | ✅ | §6 — Agent B, inline email draft + copy-to-clipboard, no email sending. |
| 11.12 | CEO Advisor expansion + `ceo_advisor_briefs` table + refresh button | ✅ | §8 — Agent C, 437 lines. Chief of Staff aggregator across 4 domains, on-demand refresh. |
| 11.13 | Chief of Staff prompt adaptation | ✅ | Folded into 11.12 — prompt lives in `services/ceo-advisor.ts` |
| 11.14 | Market research prompt adaptation | ✅ | Folded into 11.7 — prompt lives in `services/market-scan.ts` |
| 11.15 | Article writing voice adherence upgrade | ⏭️ Cut | No UI surface — prompt polish only |
| 11.16 | Content engine multi-platform adaptation | ⏭️ Cut | No UI surface — prompt polish only |
| 11.17 | Continuous learning extraction from meetings | ✅ | Already delivered in 11.6 |
| 11.18 | Verification loop wire into post validator | ⏭️ Cut | `validateBanner` already exists, no new UI |
| 11.7 | Market & Competitors surface + `market_scans` table + scan worker | 📋 | §5 |
| 11.8 | Jina Reader + Google News RSS adapters (free tier) | 📋 | §5 |
| 11.9 | Perplexity/Tavily/Brave admin config (paid tier fallback) | 📋 | §5 |
| 11.10 | Sales surface + `deals` + `deal_events` tables | 📋 | §6 |
| 11.11 | AI Deal Assistant prompt + route | 📋 | §6 |
| 11.12 | CEO Advisor expansion + `ceo_daily_briefs` table + daily cron | 📋 | §8 |
| 11.13 | Chief of Staff prompt adaptation | 📋 | §10 |
| 11.14 | Market research prompt adaptation | 📋 | §10 |
| 11.15 | Article writing voice adherence upgrade | 📋 | §10 |
| 11.16 | Content engine multi-platform adaptation | 📋 | §10 |
| 11.17 | Continuous learning extraction from meetings | 📋 | §10 |
| 11.18 | Verification loop wire into post validator | 📋 | §10 |

Legend: 📋 pending · 🚧 in progress · ✅ done

---

## §12 — Product philosophy: dashboard-centric, on-demand, no passive push

Confirmed with the user 2026-04-12. Three principles that override
anything in this doc that contradicts them:

1. **Everything happens in the dashboard.** No emails, no push
   notifications, no daily digests. The CEO opens the product to see
   current state.
2. **Refresh is on-demand, not scheduled.** Cron-based data collection
   is explicitly rejected. Every data-gathering surface has an explicit
   "Refresh" / "Scan now" button. Stale data is fine — staleness is
   shown with a timestamp.
3. **AI drafts, the human decides.** When the AI writes a sales email
   or outreach message, it renders the text in the dashboard for the
   CEO to **copy-paste** into their own email client. We do NOT send
   on their behalf. This keeps the tool battle-tested (CEO controls
   what goes out) and eliminates the need for an email provider at PMF.

### Applied corrections to earlier sections

- **§8 CEO Advisor**: rename the table from `ceo_daily_briefs` to
  **`ceo_advisor_briefs`** (no "daily"). No cron. The surface has a
  prominent "Refresh advice" button. Each refresh runs the Chief of
  Staff prompt over current data and writes a new brief row. History
  is kept so the CEO can scroll back.
- **§5 Market & Competitors**: no scheduled scan worker. Each competitor
  card has a "Scan now" button. A top-level "Scan all competitors"
  button refreshes the whole set. Results land in `market_scans` and
  optionally push a pending update into `brain_market_position` that
  the CEO must explicitly accept.
- **§6 Sales AI Deal Assistant**: the output **always** includes a
  draft email/message in the response, rendered inline in the deal
  detail screen. A one-click "Copy" button. **No sending.** Same LLM
  call, no separate cost concern.

### Resolved: keep the OKR schema, reuse the CEO reasoning engine

User chose Option B 2026-04-12 after discovering `strategy_horizons` is
shared with the worker's 1800-line autonomous CEO reasoning loop. The
schema stays, the reasoning engine stays, only the OKR UI is retired.
See §9 for the full rationale. No drizzle migration needed.

---

## §12a — The product vision (user's words, 2026-04-12)

> "Bạn đang xây với tôi một **AI OS Platform cho các CEO**, nơi đó họ
> có các agent thực chiến giúp họ, và website ngày càng hiểu thị trường
> và tự động marketing, sale, chăm sóc khách hàng tốt nhất."

Translation: the product is an **AI Operating System for CEOs** — not a
set of point tools. The CEO opens it and finds battle-tested agents
(marketing, sales, customer care, meeting analyst, market watcher) that
progressively understand the market and auto-improve execution across
marketing, sales, and customer support.

Three design constraints this vision imposes:

1. **Agents must be battle-tested, not academic.** Every feature ships
   with a real-world workflow a venture CEO already does today. No
   features added for theoretical completeness.
2. **The website (agents) gets smarter over time.** Each refresh /
   scan / campaign / closed deal / meeting writes learnings back to
   the Brain. Next action reads them. This is the "self-improving"
   loop — closed in the dashboard, no cron required.
3. **Cross-domain awareness is the moat.** Any agent can reference any
   other domain's data (Sales agent can see Marketing learnings, CEO
   Advisor can see Meeting commitments, Market scanner can update Brain
   positioning). This is why we don't silo data per surface.

---

## §13 — Relationship to other docs

- **Doc 06** owns Trust / lineage / audit. This doc does not touch them.
- **Doc 07** owns Campaign spine. This doc keeps Campaigns as-is; the
  new surfaces feed Campaigns (Brain, Market scan, Sales).
- **Doc 08** owns PMF P0/P1 list. This doc adds new items (§11 tracker)
  that slot into P1 and post-PMF.
- **Doc 09** owns pricing/credits. Every new surface here uses the
  existing credit system with admin-config-driven costs.
