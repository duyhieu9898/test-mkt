# Research Hub — Design Proposal

> Version: 0.1 — 2026-05-18 (draft, awaiting founder approval before code)
> Origin: founder feedback that Brand IQ is one-shot vs Rankability's flexible Researcher.
> Backed by audit in [competitive-research-2026.md § Appendix A](./competitive-research-2026.md).

---

## Problem

Today, 1Person's research surface (Brand IQ) is:
- **One-shot**: paste URL → AI returns voice + personas + visuals. Done. No way back.
- **Single-source**: only the URL drives extraction. No external knowledge, no GSC, no competitor URLs, no founder notes.
- **Opaque**: founder can't tell which output came from which input. AI shows "99% confidence" but provenance is invisible.
- **Non-iterative**: regenerate replaces. No diff. No saved sessions. No client review.

The audit of 13 competing tools confirms this is well below market. Every serious research surface in the category gives the founder:
- Multi-source data toggles (Rankability, Writesonic, Outranking, NeuronWriter)
- Named, persistent, re-runnable sessions (MarketMuse Saved Views, Frase docs)
- Per-suggestion source attribution (NeuronWriter, Frase, Outranking)
- Brand voice as a trained, switchable asset (ContentShake 50, GrowthBar)
- Persistent negative-feedback corpus (Surfer term blacklist)
- Per-item client approval link (Rankability)

**Goal of this redesign**: make 1Person's research surface the most user-steerable in the category by combining the best of all 13, while preserving our existing primitives (Brand IQ profile, vector RAG, AI Employees, GEO tracking).

---

## Naming & IA

New top-level surface: **`/research`** (sidebar entry "Research", unlockLevel 1, between Knowledge and Brand IQ).

Five sibling tabs, founder-friendly verbs:

| Tab | Verb | Job-to-be-done |
|---|---|---|
| **Discover** | "find what to talk about" | Seed topics + locale + source toggles → keyword + audience + GEO-prompt + content-gap suggestions |
| **Analyze** | "score what I've got" | Paste keyword list or URL → SERP metrics, intent, KO score, **Personalized Difficulty vs my domain** (MarketMuse pattern) |
| **Compare** | "see how I stack up" | Domain + 1-3 competitors → gap report (keywords / topics / brand voice diff / GEO citation diff) |
| **Brief** | "write a brief that downstream agents will follow" | Frase-style structured brief object — Guidelines / SERP / Outline / Topics / Personas / Voice — fully editable, provenance-tagged |
| **Library** | "save and re-run" | Named research sessions, diff vs prior runs, re-share, **persistent term blacklist** scoped to each Brand Voice (Surfer pattern) |

Brand IQ becomes a **consumer** of Research Hub outputs, not the entry point. When a founder approves a Brief, downstream auto-updates: Brand IQ personas, GEO prompts, SEO Engine queue, Campaign Launcher suggested keywords.

---

## Data Sources panel (the core fix)

Visible on every tab. Each source has an on/off toggle and a small status (✓ connected, ⚠ partial, ✗ missing). Founder controls **what the AI is allowed to see**.

| # | Source | Status today | Notes |
|---|---|---|---|
| 1 | **Primary website URL** | ✅ (Brand IQ scrape) | Required for Discover; optional elsewhere |
| 2 | **Additional URLs** | ❌ | Unbounded (Outranking pattern); for case studies, About page, blog samples |
| 3 | **Writing samples** | ✅ (Brand IQ) | Already present; surface as a picker |
| 4 | **File uploads (PDF / DOCX / MD)** | ❌ | New: chunk + embed → semantic recall |
| 5 | **Plain-text notes** | ❌ | New: founder's audience intuition, sales-call notes |
| 6 | **Knowledge Base entries** | ✅ (exists) | Surface as multi-select picker |
| 7 | **Google Search Console** | ✅ (SEO Engine only) | Lift up — toggle in Research Hub too (Writesonic pattern) |
| 8 | **Competitors from Market** | ✅ (Market & Competitors) | Multi-select picker |
| 9 | **Past research runs** | ❌ | RAG over Library tab history |
| 10 | **Vector memory (Block 3)** | ✅ | Already in chat flow; explicit toggle here |
| 11 | **GEO mentions (Block 1)** | ✅ | New toggle so research sees how AI engines describe us |
| 12 | **Google Analytics** *(future)* | ❌ | Writesonic has this — defer |
| 13 | **Ahrefs / Semrush import** *(future)* | ❌ | Defer to v2 |

Founder can save **Source profiles** (e.g. "Standard B2B research" = URL + Brand IQ + GSC + competitors). Re-applied across sessions. Surfer-style persistence.

---

## Provenance on every suggestion

Every AI-generated item (keyword, persona pain point, suggested headline, audience description, brief section) carries a **source chip** in the UI:

```
🌐 from your website                         [edit] [regenerate w/ different sources]
📊 from GSC (last 28 days)
📄 from "About Us.pdf" you uploaded
🏢 from competitor: chainstack.com
🧠 from your knowledge base entry "Pricing FAQ"
🤖 from AI inference (no source — verify)
```

This is the deepest fix for the "AI confidence 99%" trust gap. Non-technical founders trust output they can trace.

---

## Iteration model

- Every Research session is a **named, persistent object** in `research_sessions` table.
- Each session has versions (regenerate creates v2, doesn't overwrite v1).
- **Diff view** between versions (which fields changed, which sources added/removed).
- **Re-run from any tab** without losing downstream brief edits (Outranking pattern).
- Hosts a Surfer-style **persistent term blacklist** per Brand Voice profile.

---

## Brand Voice as a first-class trainable asset (ContentShake pattern)

Today Brand IQ stores ONE voice profile per company. Redesign:

- `brand_voices` table — many per company, each named ("Founder casual", "Sales formal", "Documentation neutral").
- Each voice trained from user-uploaded samples (existing) PLUS optional URLs (new).
- Voice **switchable per content piece** in Campaign Launcher, Content Editor, Chatbot.
- Voice **persistent across all generations** — if you blacklist a phrase in voice X, no agent ever uses it again.

---

## Client / VA approval flow (Rankability + Frase pattern)

Each Brief or research session gets a **shareable link**:
- Read-only or comment-enabled
- Per-item approve / reject / comment (Rankability uniquely has this)
- No 1Person account required for the reviewer (Frase pattern)
- White-label option (defer to v2)

Critical for solo founders who hand work to a VA, freelance writer, or fractional CMO.

---

## Schema sketch (new tables)

```sql
research_sessions (
  id uuid PK, company_id uuid FK,
  name varchar(120) NOT NULL,           -- founder-named
  topics jsonb,                          -- ["blockchain dev services", "Web3 audit"]
  country varchar(8), city varchar(80),
  source_toggles jsonb,                  -- {website:true, gsc:true, kb:true, uploads:["file_id_1"]}
  current_version int DEFAULT 1,
  status varchar(20),                    -- 'draft' | 'shared' | 'approved' | 'archived'
  share_token varchar(64) UNIQUE,        -- for shareable link (Frase pattern)
  created_at, updated_at
)

research_session_versions (
  id uuid PK, session_id uuid FK,
  version int,
  outputs jsonb,                         -- discover/analyze/compare/brief outputs
  citations jsonb,                       -- {field_path: [source_chips]}
  created_at,
  generated_by varchar(20)               -- 'ai' | 'manual'
)

research_uploaded_files (
  id uuid PK, company_id uuid FK,
  filename, content_type, size_bytes,
  storage_path,                          -- deploy/research-uploads/*
  embedding_status varchar(20),          -- 'pending' | 'done' | 'failed'
  created_at
)

brand_voices (
  id uuid PK, company_id uuid FK,
  name varchar(80),
  voice jsonb,                           -- BrandIqVoice shape from Block 2
  trained_from_sample_ids jsonb,         -- which uploads/URLs trained this
  is_default boolean,
  created_at, updated_at
)

term_blacklist (
  id uuid PK, company_id uuid FK,
  brand_voice_id uuid FK NULL,           -- scoped to a voice OR company-wide if NULL
  term text,
  reason text,                            -- why founder blacklisted
  created_at
)

research_review_comments (
  id uuid PK, session_id uuid FK,
  reviewer_name varchar(80),              -- guest reviewers
  reviewer_email varchar(255),
  target_field_path text,                 -- "outputs.discover.keywords[3]"
  comment text,
  decision varchar(20),                   -- 'approve' | 'reject' | 'comment'
  created_at
)
```

---

## Migration: how Brand IQ relates

- **Keep** `brand_iq_profiles` for now — Research Hub publishes the active voice profile + personas there as a write-through cache (so existing readers of Brand IQ keep working).
- **Brand IQ page** stays, but becomes "Active Brand Voice (synthesized from your latest Research session)" with a "View source research" link.
- Long-term: `brand_iq_profiles` collapses into `brand_voices` + `research_session_versions`. Defer that refactor.

---

## Build phases

Estimated total: ~3500 LOC across 3 phases. Each phase shippable independently.

### Phase 1 — Multi-source Discover (most impactful, ~1200 LOC)
- New `/research` route + sidebar entry
- Discover tab only: topics multi-tag + country + 7 toggleable sources (URL/uploads/notes/KB/GSC/competitors/vector)
- New tables: `research_sessions`, `research_session_versions`, `research_uploaded_files`
- File upload endpoint + chunking + embedding (reuses embedding-service from Block 3)
- LLM run that respects source toggles + writes provenance-tagged outputs
- Wire to existing Brand IQ: "Apply to Brand IQ" button publishes voice + personas
- Walkthrough updates Brand IQ entry to point at Research Hub first

### Phase 2 — Library + iteration + sharing (~1300 LOC)
- Library tab with named sessions, versions, diff view
- Shareable link (no-account reviewer pattern from Frase)
- Per-item approve/reject/comment (Rankability pattern)
- Brand Voice library: multiple voices per company, switchable
- Term blacklist (Surfer pattern) scoped to each voice
- Campaign Launcher + Content Editor get a "Voice" dropdown

### Phase 3 — Analyze + Compare + Brief tabs (~1000 LOC)
- Analyze tab: paste keyword list → bulk SERP metrics + Personalized Difficulty
- Compare tab: domain vs competitors → gap report
- Brief tab: Frase-style structured brief object, fully editable, push to Content Editor / Campaign Launcher
- Stage-level regeneration (re-run any tab without losing downstream)

---

## Wiring with existing blocks (preserves work, doesn't break)

| Existing | Relationship after redesign |
|---|---|
| **Block 1 — GEO** | Discover tab seeds GEO prompts from topic list with one click |
| **Block 2 — Brand IQ** | Reads/writes published voice from Research Hub; standalone editor stays |
| **Block 3 — Vector / AI Employees** | Vector toggle in source panel; employees read research session as memory |
| **Block 4 — Content Editor** | Brief tab pushes to editor; voice dropdown applies term blacklist |
| **Block 6 — Omnichannel** | Chatbot reads active voice + persona from research |
| **Block 8 — Campaign Launcher** | Voice dropdown; brief from Research auto-fills keyword + brief fields |
| **Walkthrough** | "Research" becomes the new Step 1 of Quick Start; Brand IQ demoted to Step 1b |

---

## What we explicitly do NOT build (yet)

- White-label client portal (defer to v2)
- Ahrefs / Semrush data import (defer)
- Google Analytics integration (defer)
- City-level local SEO targeting (Clearscope pattern — useful but niche)
- Curated niche-specific keyword libraries (RankIQ pattern — slow to build manually)
- Real-time collaboration (Google-Docs-style live cursors)
- MCP server interface (Writesonic has, defer)

---

## Open questions for founder

1. **Phase 1 scope ok?** Phase 1 = Discover tab + multi-source + provenance + "Apply to Brand IQ". ~1200 LOC, ~1 session.
2. **Sidebar position**: "Research" between Knowledge and Brand IQ? Or replace Brand IQ slot entirely?
3. **File upload size cap**: 10 MB / file? 50 MB? Per-company quota?
4. **GSC scoping**: Research Hub uses the same GSC connection from SEO Engine? (Recommended yes.)
5. **Voice library now or Phase 2?** Some users (bap-blockchain) might want 1 voice forever. Phase 1 ships single voice; Phase 2 adds library.
6. **Should we keep "AI Confidence 99%" anywhere?** Recommend removing — it's a confidence-trick, replace with provenance.

---

## Recommended next step

Approve Phase 1 scope → I code it in one session, ~1200 LOC, 5-6 commits. Phases 2 + 3 follow after you've used Phase 1 with bap-blockchain to validate the IA.

If you want to go bigger, all 3 phases is ~3500 LOC, ~2-3 sessions.

If you want to think more first, I can wait — but if you approve, Phase 1 unblocks the bap-blockchain workflow you specifically called out (you'd get GSC + uploads + competitor URLs + notes as toggleable sources for the launcher).
