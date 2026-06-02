# Brain Hub Architecture — Source-Agnostic + Reactive

> Version: 1.0 — 2026-05-18
> Origin: founder pushback — "stop hard-coding source list. We need a Hub where ANY data (upload / import / integrate / internal capture / external feed) flows in, and the Brain self-improves AND reacts in real time."
> Supersedes Wedge 1 ("Customer Brain") in [unique-wedges.md](./unique-wedges.md) — the spirit is the same, the architecture is now pluggable.

---

## Reframe

Old framing (mine): "Customer Brain with 4 fixed OAuth connectors (Stripe / Gong / Intercom / Plausible)."

New framing (founder's): "**Brain Hub** — a universal data plane where any source ingests on demand, plus a reactive layer that proactively drafts content/pages/videos when patterns or trends emerge."

The unlock is the *plane*, not the connectors. Each connector becomes an instance of a generic source primitive — added by config, not by re-architecture.

---

## 4 architectural layers

```
┌──────────────────────────────────────────────────────────────┐
│  L4 — REACTIONS (proactive output)                           │
│  "trend X spiked → drafted 1 blog + 1 LinkedIn + 1 chatbot   │
│   FAQ. Review or auto-publish."                              │
└──────────────────────────────────────────────────────────────┘
                              ↑
┌──────────────────────────────────────────────────────────────┐
│  L3 — WATCHERS (the reactive Brain)                          │
│  conditions on the event stream → trigger reactions           │
│  e.g. "topic mentioned ≥3 inbound msgs in 24h" → draft        │
└──────────────────────────────────────────────────────────────┘
                              ↑
┌──────────────────────────────────────────────────────────────┐
│  L2 — EVENT STREAM (normalized + embedded)                   │
│  every datapoint = 1 row in data_events                       │
│  auto-embedded into vector memory (Block 3 plug)              │
│  semantic search + cluster + anomaly detection                │
└──────────────────────────────────────────────────────────────┘
                              ↑
┌──────────────────────────────────────────────────────────────┐
│  L1 — SOURCES (universal ingestion plane)                    │
│  Manual upload  |  Import (CSV/JSON)  |  OAuth API  |        │
│  Webhook in     |  Internal tap       |  Polling feed        │
└──────────────────────────────────────────────────────────────┘
```

Each layer is independent. Adding a new source = config row. Adding a new watcher = config row. Adding a new reaction template = config row. Code only changes when we add a new SOURCE TYPE (e.g. "polling feed" if we don't have it yet).

---

## L1 — Sources (universal ingestion plane)

One table, 6 source types — covers everything the founder can throw at it.

```sql
data_sources (
  id uuid PK,
  company_id uuid,
  name varchar(120),              -- "Stripe production", "Founder's notes", "Google Trends Web3"
  type source_type,               -- enum below
  config jsonb,                   -- type-specific (OAuth tokens, polling URL, file paths)
  status varchar(20),             -- 'active' | 'paused' | 'error'
  last_synced_at timestamp,
  created_at, updated_at
)
```

### 6 source types (covers everything)

| Type | What it accepts | Examples for B2B SaaS |
|---|---|---|
| `manual_upload` | Files: PDF / DOCX / MD / TXT / CSV / audio / video | Sales decks, customer interviews, partnership emails |
| `bulk_import` | Pasted text, CSV upload, JSON paste | Old blog corpus, NPS survey CSV, churned-customer list |
| `oauth_api` | Polled OAuth integration | GSC, Stripe, Fireflies, Notion, HubSpot, Airtable, Sheets |
| `webhook_inbound` | Any system POSTs here | Linear bugs, GitHub stars, Plausible events, custom apps |
| `internal_tap` | Tap into our own existing data | Chatbot messages, omnichannel inbound, lead capture, growth-score changes |
| `polling_feed` | We poll on a schedule | Google Trends RSS, Reddit subreddits, RSS feeds, Hacker News, competitor RSS |

### Key insight: internal taps are FREE

We already collect chatbot conversations, FB Messenger DMs, lead captures, growth score deltas. **Day 1 we wire those into the event stream — zero new integration cost, immediate signal**. The founder doesn't need to configure anything for "our own data" to flow into the Brain.

### Pluggable adapters

Each source type has a normalizer interface:

```ts
interface SourceAdapter {
  type: SourceType;
  validateConfig(config: unknown): Result;
  sync(config, since?: Date): AsyncIterable<RawEvent>;
  normalize(raw: RawEvent): DataEvent;
}
```

Add a new connector = write one adapter implementation. Register it. No core changes.

---

## L2 — Event stream (the substrate)

```sql
data_events (
  id uuid PK,
  company_id uuid,
  source_id uuid FK,
  type varchar(40),               -- 'message' | 'transaction' | 'feedback' | 'trend' | 'mention' | 'pageview' | 'commit' | ...
  subject varchar(255),           -- one-line gist for human scan
  content text,                   -- the body
  payload jsonb,                  -- raw structured data
  embedding vector(1536),         -- auto-computed (Block 3 plug)
  topic_tags varchar(50)[],       -- auto-extracted topics (LLM tagger)
  sentiment varchar(20),          -- pos/neg/neutral/question/etc
  occurred_at timestamp,          -- when the event happened (NOT when we ingested)
  ingested_at timestamp default now()
)
```

Every event auto-embedded → semantic search across all of company's history works out of the box (we already shipped pgvector in Block 3).

### Auto-tagging
Every new event gets a quick LLM pass (gpt-4o-mini, ~$0.0001 per event) to extract:
- 1-3 topic tags
- Sentiment
- Is-question / is-objection / is-praise / is-trend-spike

Founder can override + the override teaches the tagger over time.

---

## L3 — Watchers (the reactive Brain)

This is where the Brain stops being a passive search index and becomes proactive.

```sql
brain_watchers (
  id uuid PK,
  company_id uuid,
  name varchar(120),              -- "Recurring objection detector", "Trend spike", "Churned customer pattern"
  condition jsonb,                -- DSL or SQL fragment
  action_template_id uuid,
  threshold jsonb,                -- {min_confidence: 0.7, auto_publish: false}
  status varchar(20),
  last_fired_at timestamp
)
```

### Examples of watcher conditions

| Watcher | Condition (plain English) | Action |
|---|---|---|
| **Recurring question** | Same topic appears in ≥3 inbound chatbot/Messenger messages within 7d | Draft FAQ entry + chatbot answer template + blog post |
| **Trend spike** | Polling source (Google Trends) reports topic score ≥80, ≥2x last week | Draft blog post + LinkedIn post + tweet thread |
| **Sales objection cluster** | Topic appears in ≥3 sales call transcripts within 30d, sentiment=question | Generate comparison page + 1-pager + Cassie response template |
| **Competitor announce** | Polling: competitor RSS / news mention of "launched" / "raised" | Draft counter-narrative blog + LinkedIn analysis |
| **Customer praise** | Event sentiment=positive, contains "best" or "love" | Pull as testimonial candidate, queue for case study |
| **Geographic interest** | Pageviews from country X spike >50% week-over-week | Suggest localized landing page + targeted social |
| **Inbound DM volume on topic** | ≥5 FB Messenger conversations in 24h about topic X | Draft chatbot FAQ entry + LinkedIn post + queue for review |

### Watcher DSL (proposed minimal)

```json
{
  "all": [
    { "source_type": "internal_tap", "subtype": "chatbot_message" },
    { "topic": "$dynamic", "min_occurrences": 3, "window": "7d" },
    { "sentiment": "question" }
  ],
  "group_by": "topic",
  "fire_when_first_seen": true,
  "cooldown": "72h"
}
```

Founder can build watchers from a UI wizard (no DSL knowledge needed). Power users edit JSON.

### Pre-seeded library

Ship with 10 default watchers tuned for B2B <$100M:
1. Recurring inbound question (3+ in 7d)
2. Sales objection cluster (3+ in 30d, requires call transcripts source)
3. Trend spike (Google Trends ≥80)
4. Competitor announce (competitor RSS mentions "launched")
5. Customer praise (sentiment positive, B2B keywords)
6. Pageview anomaly (50% spike week-over-week)
7. GEO citation spike (one of our pages newly cited by ChatGPT — uses Citation Audit from Wedge 2)
8. Lead spike on specific landing page
9. New ICP signal (lead with role matching persona)
10. Churn risk language ("cancel" / "switch" in support)

Founder enables/disables each one. Over time we add more from real usage patterns.

---

## L4 — Reactions (proactive output)

When a watcher fires, it queues a **Reaction**.

```sql
brain_reactions (
  id uuid PK,
  company_id uuid,
  watcher_id uuid FK,
  fired_at timestamp,
  trigger_payload jsonb,          -- what events caused the fire
  proposed_actions jsonb,         -- ["blog_draft", "linkedin_post", "chatbot_faq"]
  drafts jsonb,                   -- the actual generated content
  status varchar(20),             -- 'suggested' | 'approved' | 'published' | 'dismissed' | 'expired'
  reviewed_by uuid,
  reviewed_at timestamp,
  expires_at timestamp            -- trend reactions go stale fast (24-48h)
)
```

### "Today's Reactions" UI

A new dashboard surface (probably part of Brain Hub) showing:

```
📥 5 reactions waiting for review

🔥 TRENDING: "MEV Boost" mentioned 4x by Google Trends today
   → 1 blog draft, 1 LinkedIn post, 1 tweet thread queued
   [Review] [Approve all] [Dismiss]                    expires in 18h

💬 RECURRING QUESTION: "How do you compare to Alchemy on cost?"
   → 5 customers asked in past 7 days
   → Drafted comparison page + Cassie FAQ + LinkedIn post
   [Review] [Approve all] [Dismiss]                    no expiry

📈 PAGE TRAFFIC SPIKE: /blog/enterprise-ethereum +220% from US
   → Suggested: pin to LinkedIn, boost on Reddit r/ethereum
   [Review] [Approve all] [Dismiss]                    expires in 48h
```

### Auto-publish thresholds

Per watcher, founder can set:
- **Manual review only** (default — safest)
- **Auto-publish if confidence ≥ 0.85** (only for low-risk reactions like chatbot FAQ)
- **Auto-publish always** (only the bravest founders)

Plus a "Sunday digest" that summarizes the week's reactions for batch review.

---

## How this integrates with existing blocks

**Brain Hub doesn't replace anything. It connects everything.**

| Existing block | Brain Hub relationship |
|---|---|
| Block 1 — GEO tracking | New `internal_tap` source type emits GEO mention events → Brain reacts to citation spikes |
| Block 2 — Brand IQ | Brain reactions respect active Brand IQ voice when drafting |
| Block 3 — Vector memory | Brain reuses existing embedding-service for `data_events.embedding` |
| Block 4 — Content Grader | Brain reactions auto-route drafts through grader before queue |
| Block 6 — Omnichannel | FB Messenger inbound automatically becomes `internal_tap` events |
| Block 8 — Campaign Launcher | Reaction "approve" → kicks Launcher with pre-filled keyword + sources |
| Chatbot | Chat messages auto-flow as events; Brain detects recurring questions |
| Lead capture | Lead form events flow in; Brain detects ICP signals + spike anomalies |

**Critical**: we already own the chatbot + omnichannel + lead capture data. Day 1 the Brain has months of signal to learn from. No new connectors needed for the MVP demo.

---

## Phasing

Splitting into 3 phases so each phase ships value alone:

### Phase A — Sources + Events + Hub UI (~1800 LOC)
The foundation. Founder can see all data flowing in + add sources + search across everything.

- `data_sources`, `data_events` schema + migration
- Source adapters: `manual_upload`, `bulk_import`, `internal_tap`
- Internal taps wired: chatbot messages, omnichannel messages, lead capture, growth-score deltas
- File upload endpoint (PDF/CSV/TXT) with chunking → embedding
- Auto-tagger (LLM topic + sentiment per event)
- Hub UI: Sources tab (manage what's connected), Events tab (recent stream + semantic search), Analytics tab (top topics this week)

Shippable demo: "Look — every chatbot conversation, every FB message, every lead — all searchable from one place. Upload our sales decks, also searchable."

### Phase B — Watchers + Reactions (~1500 LOC)
The reactive layer. Brain becomes proactive.

- `brain_watchers`, `brain_reactions` schema
- 10 pre-seeded watcher library
- Watcher condition evaluator (cron job, every 15 min)
- Reaction generator (calls Campaign Launcher or sub-services to produce drafts)
- "Today's Reactions" dashboard with approve / dismiss / auto-publish-threshold controls
- Sunday digest email (combines with Wedge 4 — Weekly AI digest + rollback)

Shippable demo: "5 customers asked about pricing this week — Cassie noticed and drafted a FAQ + Penn drafted a comparison blog. Approve both? Click."

### Phase C — External feed adapters + OAuth connectors (~1200 LOC)
Opens up trend reactivity + customer data pull-in.

- Source adapters: `polling_feed` (Google Trends, Reddit, RSS, Hacker News firehose)
- Source adapters: `oauth_api` framework + 3 starter connectors (Fireflies/Gong/Otter, Stripe, Crisp/Intercom)
- Trend-spike watchers using polling sources
- Webhook receiver endpoint for custom inbound

Shippable demo: "Google Trends just spiked 'restaking solana' — Brain drafted blog + LinkedIn while you were on call. Review by 5pm or auto-publish."

---

## Why this beats my original "Wedge 1 Customer Brain"

| Aspect | Old (Customer Brain) | New (Brain Hub) |
|---|---|---|
| Architecture | Hard-coded 4 OAuth connectors | Pluggable: 6 source types, any adapter |
| Time-to-first-value | Wait for Stripe + Gong + Intercom OAuth approvals | Day 1: chatbot + FB inbound + leads already flow |
| Reactive vs passive | Passive (search what you want) | Proactive (watcher fires → draft) |
| Trend integration | Not in scope | Phase C ships Google Trends + Reddit + HN |
| Founder control | Hard-coded source list | Founder adds any source via config |
| Engineering scope | 1500 LOC, single block | 4500 LOC over 3 phases — but each phase ships value |
| Differentiator | "We pull customer data" | "We're the source-agnostic Brain that drafts content the moment patterns emerge" |

The new framing is **architecturally cleaner AND a bigger moat**. The pluggable plane means we can keep adding sources forever without re-architecture. The reactive layer means we generate **right now** when others generate "if asked".

---

## What replaces it in the ship plan

Wedge 1 was 1500 LOC. Brain Hub is 4500 LOC over 3 phases. Updated ordering:

```
1. Research Hub Phase 1 (multi-source research surface)  1200 LOC
2. Wedge 2: Page-level Citation Audit (extend GEO)        600 LOC  ← quick win
3. Brain Hub Phase A (sources + events + internal taps)  1800 LOC  ← foundation
4. Block 5 Evolution Loop + Wedge 4 weekly digest        1500 LOC
5. Brain Hub Phase B (watchers + reactions)              1500 LOC  ← proactive Brain
6. B2B persona presets + LinkedIn article API             500 LOC
7. Research Hub Phase 2 (voice library + sharing)        1300 LOC
8. Brain Hub Phase C (external feeds + OAuth)            1200 LOC  ← trend reactivity
9. Wedge 5: Founder ghost-writer                          800 LOC
10. Wedge 3: Sales-objection engine                      1000 LOC
```

Phases A + B together (3300 LOC) = the most differentiated thing we'd ever ship. After Phase B, "Brain Hub" becomes the headline of the entire product.

---

## Positioning sentence (updated)

> "1Person Brain Hub is the source-agnostic intelligence layer where every customer message, every lead, every Google Trends spike, every uploaded sales deck, every connected app flows into one place — and proactively drafts the blog posts (graded against top-10 SERP), landing pages, hero images (Banana), short videos (in-house engine), social posts (LinkedIn + FB), and chatbot replies that follow, then publishes them to WordPress + social with one click. **The competitor researches SERPs. We watch your business — and ship the response.**"

That's the moat: source-agnostic ingestion + reactive Brain + already-owned signals + the full ship stack (SEO grader, image gen, video, multi-channel publish) at the other end. No SEO tool, CRM tool, or content tool architecturally can match this without ground-up rebuild.

### Existing capabilities Brain Hub will dispatch to (Phase B Reactions)
When a watcher fires, it composes from the full shipped surface:
- **Blog draft** → `blog-generator.ts` + `content-grader.ts` for live SERP scoring
- **Hero image** → `image-generator.ts` (DALL-E / Gemini / Banana / Banana Pro)
- **Short video** → `video-engine.ts` (script + scene pipeline)
- **WordPress publish** → `cms-integration.ts`
- **LinkedIn / social** → `distribution-engine.ts` + per-channel adapters
- **Chatbot FAQ** → chatbot engine (existing chunked-entry knowledge)
- **GEO seeding** → `geo-tracker.ts` so we track whether the new page gets cited
- **AI Employee voice** → the 7-employee personalities own each output

Phase A (this session) ships ONLY the ingestion + event stream. Phase B wires the dispatcher into all of the above — no new generation code, just composition.

---

## Open questions for founder

1. **Approve the 3-phase Brain Hub architecture?** Phase A is shippable alone (~1800 LOC). Phase B unlocks the reactive Brain. Phase C opens trends.
2. **Sources priority for Phase A**: I propose internal taps (chatbot + omnichannel + leads) ship day 1 — free signal. Manual upload + bulk import second. Confirm?
3. **Auto-publish threshold**: ship with all watchers in "manual review only" mode by default — agree? (Safer first impression for the trust problem.)
4. **Watcher library scope**: 10 pre-seeded watchers ok for v1, or do you want a smaller set (e.g. 4) to start?
5. **Polling cost**: Google Trends API is paid (~$10-50/mo). Reddit/HN are free. Ship Phase C with free-only first?
6. **Renaming**: should "Brain Hub" be the user-facing name, or something more concrete? ("Signals", "Today's Intel", "The Watch Room"...)
