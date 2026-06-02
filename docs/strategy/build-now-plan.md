# 1Person AI — Build-Now Plan (18-week Ship Plan)

> Version: 1.5 — updated 2026-05-18 (Block 8 Campaign Launcher + WordPress publish + image variations shipped)
> Status: **LIVE document — update mỗi tuần**
>
> **Progress**: 6 of 9 blocks shipped (Block 1 GEO, Block 2 Brand IQ, Block 3 AI Employees + Vector, Block 4 Content Grader, Block 6 FB Messenger MVP, Block 8 Multimodal + WP). 3 remaining (Blocks 5, 7, 9). Recommended next order: 5 → 7 → 9.
>
> Mục tiêu: ship "2027-grade" sản phẩm trong 18 tuần. Order theo **biggest gap × moat potential × shipping cost**.

---

## How to use this file

1. Mỗi block là 1-2 tuần focus. Tổng 9 blocks / ~18 tuần.
2. Mỗi task có **status** (☐ TODO · 🟡 IN PROGRESS · ✅ DONE · ⛔ BLOCKED · 🗑 DROPPED).
3. Khi bắt đầu task → đổi sang 🟡 + ghi ngày start.
4. Khi xong → đổi sang ✅ + ghi commit hash / PR / ngày.
5. Khi block xong, update **Block Status** + bump version ở đầu file + note learnings.

Legend:
- **Files touched**: file paths sẽ sửa hoặc tạo mới
- **Acceptance**: điều kiện để mark "done"
- **Risk**: rủi ro chính + mitigation

---

## Overview Status

| Block | Theme | Weeks | Status | Started | Shipped |
|---|---|---|---|---|---|
| 1 | GEO Layer MVP | 1-2 | ✅ MVP shipped | 2026-05-16 | `ea4690c` (2026-05-17) |
| 2 | Brand IQ Layer | 3-4 | ✅ MVP shipped | 2026-05-18 | `5781c30` (2026-05-18) |
| 3 | AI Employees UX + Vector Memory | 5-6 | ✅ MVP shipped | 2026-05-18 | this commit (2026-05-18) |
| 4 | Real-time Semantic Grader + Internal Linking | 7-8 | ✅ MVP shipped (grader only — internal linking deferred) | 2026-05-16 | `1db0b72` (2026-05-17) |
| 5 | Agent Evolution Loop (MOAT) | 9-10 | ☐ TODO | — | — |
| 6 | Omnichannel Chat (Đợt 6) | 11-12 | 🟡 MVP shipped (FB Messenger only; Inbox·Messages page added) | 2026-05-16 | `c640b1d` + Inbox page (2026-05-17) |
| 7 | Outcome-Based Pricing + Audit Cards | 13-14 | ☐ TODO | — | — |
| 8 | Multimodal SEO Pipeline | 15-16 | ✅ MVP shipped (Campaign Launcher + WP publish + image variations; real video render deferred) | 2026-05-18 | this commit (2026-05-18) |
| 9 | Programmatic SEO + Studio | 17-18 | ☐ TODO | — | — |

---

## Cross-Cutting (chạy song song mọi block)

| Task | Status | Notes |
|---|---|---|
| Enable `pgvector` extension trong PostgreSQL | ✅ done 2026-05-18 | enabled via Block 3 migration |
| WebSocket realtime (Socket.io) replace polling | ☐ TODO | Cần trước Block 6 |
| Redis Streams event bus | ☐ TODO | Cần trước Block 5 |
| OpenTelemetry traces per agent action | ☐ TODO | Cần trước Block 5 |
| Extend rate limiting to all endpoints | ☐ TODO | Security debt |
| **Walkthrough page for end users** | ✅ shipped 2026-05-17 | `/walkthrough` — full feature map with Live/Partial/Soon status |
| **Admin Setup Readiness checklist** | ✅ shipped 2026-05-17 | `/admin/setup` — 11 checks, 0-100 score, banner on admin dashboard |

---

## 🔥 BLOCK 1 — GEO Layer MVP (Tuần 1-2)

> **Why first**: 86.83% search có AI Overview. Không có cái này = outdated 2026. Closes critical gap.

**Status**: ✅ **MVP shipped 2026-05-17** — commit `ea4690c` (1126 LOC)

### Tasks

- [x] ✅ Schema mới: `geo_prompts`, `geo_mentions`, `geo_share_of_voice`
  - Files: `packages/core/src/db/schema/geo.ts`, `packages/core/drizzle/0001_geo_tracking.sql`
- [x] ✅ Service `geo-tracker.ts`: poll OpenAI + Anthropic per tracked prompt
  - Files: `apps/api/src/services/geo-tracker.ts` (283 LOC)
  - Uses existing ANTHROPIC_API_KEY + OPENAI_API_KEY. Perplexity + Gemini deferred.
  - Heuristic competitor parser reads tracked competitors from `market.listCompetitors`
- [ ] ☐ Cron daily auto-run — **deferred** (MVP = manual trigger only; cron belongs to Block 5 evolution loop)
- [x] ✅ Compute **AI Share of Voice** metric
  - Files: `geo-tracker.ts` (`getShareOfVoiceTrend`, `computeShareOfVoice` functions)
  - Note: SoV = 0 until founder adds competitors at `/market` — hint added on page
- [x] ✅ Route `/geo` API: prompt CRUD, manual Run Now, SoV trend, mentions feed
  - Files: `apps/api/src/routes/geo.ts` (152 LOC), mounted at `/api/v1/geo`
- [x] ✅ Web page `/geo` with SoV widget + prompt list + mentions feed
  - Files: `apps/web/src/app/(dashboard)/[companyId]/geo/page.tsx` (383 LOC)
  - Sidebar entry "AI Visibility (GEO)" unlockLevel 2
- [ ] ☐ Extend `seo-engine.ts` AI-citation likelihood scoring — **partial**: scoring exists in Block 4 grader. Tighter integration with seo-engine deferred.
- [ ] ☐ Schema markup expansion (Product/HowTo/Review/Organization/Breadcrumb) — **deferred** to a follow-up

### Verified working (2026-05-17)
- GET /api/v1/geo/{companyId}/prompts → returns array
- POST /api/v1/geo/{companyId}/prompts → creates tracked prompt
- POST /api/v1/geo/{companyId}/prompts/{id}/run → polls real LLMs (~9s), stores mentions, returns RunResult
- GET /api/v1/geo/{companyId}/share-of-voice?days=7 → returns current/previous/delta
- GET /api/v1/geo/{companyId}/mentions → returns recent mentions with provider/brand/competitor/sentiment
- Web page http://localhost:3004/{companyId}/geo → HTTP 200, full UI

### Acceptance
- Founder thấy 1 con số "AI Share of Voice" trên dashboard
- Click vào → thấy prompt nào brand được mention, position, sentiment
- Cron chạy ổn định 7 ngày liên tục không crash
- Mention được ít nhất ChatGPT + Perplexity (Gemini nice-to-have nếu API có)

### Risk
- LLM cost nổ → cache 24h, sample prompt thay vì exhaustive, cap budget per company
- LLM provider chặn polling → có dùng `User-Agent` đàng hoàng, không spam

---

## 🧠 BLOCK 2 — Brand IQ Layer (Tuần 3-4)

> **Why second**: Multiplier — mọi feature đã có (blog/banner/social/ads) chất lượng nhảy 30-50% sau khi có.

**Status**: ✅ **MVP shipped 2026-05-18** — single multiplier feature that lifts every other agent.

### Tasks

- [x] ✅ Schema `brand_iq_profiles` (voice, audience_personas, style_guide, visual_identity, okrs, tagline)
  - Files: `packages/core/src/db/schema/brand-iq.ts` (109 LOC), `packages/core/drizzle/0004_brand_iq.sql`
  - Versioned (latest row per company has `is_active = true`)
- [x] ✅ Service `brand-iq-extractor.ts`: URL scrape + LLM derivation
  - Files: `apps/api/src/services/brand-iq-extractor.ts` (~350 LOC)
  - Pipeline: fetch HTML (no headless browser) → extract title/meta/OG/colors/fonts from inline CSS → LLM derives voice + personas + style guide → coerce/sanitise → persist new version, mark prior inactive
- [x] ✅ Route `/brand-iq`: get-active, generate, manual patch
  - Files: `apps/api/src/routes/brand-iq.ts` (~150 LOC), mounted at `/api/v1/brand-iq`
- [x] ✅ Extend `business-context.ts` to inject Brand IQ **first** in fullContext
  - Files: `apps/api/src/services/business-context.ts` + `renderBrandIqContext()` helper
  - **Every existing agent (blog, banner, social, ads, chatbot, GEO, content grader, etc.) automatically reads Brand IQ — no per-agent prompt refactor needed.**
- [x] ✅ Quarterly OKR input UI (per-quarter objective + key results in setup wizard)
  - Files: `apps/web/src/app/(dashboard)/[companyId]/brand-iq/page.tsx` (~520 LOC)
- [x] ✅ Web page: setup wizard (empty state) → 5 facet cards (voice/personas/style/visual/OKRs) + edit dialogs + regenerate flow
- [x] ✅ Sidebar entry "Brand IQ" unlockLevel 1 (visible day 1, between Knowledge and Campaigns)
- [x] ✅ Dashboard banner: amber CTA on main dashboard when no Brand IQ yet — "Set up Brand IQ first, 30 seconds, most impactful single step"
- [x] ✅ Walkthrough updated: Brand IQ flipped from "Coming soon" → "Live", added as Step 2 in Quick Start (~most impactful~ tag)
- [x] ✅ Admin Setup Readiness: cross-company adoption check (`X of Y active companies have Brand IQ`)
- [ ] ☐ Brand IQ "score" widget showing per-agent output consistency — **deferred** (needs Block 5 evolution outcome data)

### Verified working (2026-05-18)
- POST /api/v1/brand-iq/{companyId}/generate with sample → returns version 1 in ~5.5s with tagline, 5 voice adjectives, 3 personas, style guide, visual palette from CSS
- GET /api/v1/brand-iq/{companyId}/active → returns full profile
- PUT /api/v1/brand-iq/{companyId}/active → manual facet patches work (voice + OKRs editable)
- Web /brand-iq → HTTP 200, setup wizard or 5 facet cards rendered
- Dashboard /{companyId} shows BrandIqSetupBanner when no profile, hidden when profile exists
- Walkthrough /walkthrough → Brand IQ shown as Live with green badge
- /admin/setup → "Brand IQ adoption across companies" check appears in Observability category

### Acceptance
- Founder paste URL → 5 phút có Brand IQ profile đầy đủ
- Test: generate blog 2 lần trước/sau khi có Brand IQ → blog sau có voice rõ ràng hơn
- Audience personas có 3-5 personas với pain/goal/channel rõ ràng

### Risk
- URL scrape fail / KB quá lớn → fallback to 3 samples only mode
- Brand IQ inconsistent → version + diff view, founder edit từng phần

---

## 🤖 BLOCK 3 — AI Employees UX + Vector Memory (Tuần 5-6)

> **Why third**: Chuyển nhận thức "AI tool" → "AI company". Quan trọng positioning + viral demo.

**Status**: ✅ **MVP shipped 2026-05-18** — 7 named employees with DM chat + pgvector RAG over Brand IQ.

### What shipped
- pgvector extension enabled. `embedding_chunks` table (1536-dim, ivfflat cosine index).
- `embedding-service.ts`: chunk → embed (OpenAI text-embedding-3-small) → upsert → semantic search (`<=>` cosine). Auto-index hook wired into Brand IQ generate; hooks ready for blog posts and knowledge entries.
- `team-service.ts`: 7 default employees (Cleo, Cassie, Soshie, Seomi, Geoffrey, Penn, Vio) seeded lazily per company. Each has avatar + accent color + persona prompt + KPI slot definitions.
- Chat handler grounds every reply with Brand IQ + business context + top-K semantic snippets; replies carry citations the founder can expand.
- KPI resolver maps slot keys to existing data (growth_score, blog_count, social_count, leads_count, chatbot_conversations, geo_sov, static).
- Routes: `GET /team/{cid}`, `GET /team/{cid}/{slug}`, `POST /team/{cid}/{slug}/chat`.
- Web pages: `/team` grid with 7 employee cards + memory summary; `/team/{slug}` DM-style chat with KPI strip, intro card, citation expansion per reply.
- Sidebar entry "Your AI Team" (Users icon, unlockLevel 1).
- Walkthrough updated: "AI Employees with personalities" → Live with deep link.
- Credit feature `employee_chat` registered (balanced tier, 2 credits per chat).

### Verified working (2026-05-18)
- GET /api/v1/team/{cid} → 7 employees seeded automatically, KPI snapshots resolved
- POST /api/v1/brand-iq/{cid}/generate → embedding indexed automatically (1 chunk after first gen)
- POST /api/v1/team/{cid}/cleo/chat → ~4s reply, persona-on, cites brand_iq snippet with score
- Web pages /team, /team/cleo, /team/seomi all HTTP 200

### Deferred (next iteration)
- Weekly Monday auto-check-in cron (each employee posts a status update to inbox)
- Per-employee prompt evolution loop (rolls into Block 5)
- Embedding backfill for existing knowledge entries / blog posts (currently embeds on next save)

### Tasks

- [ ] ☐ Bật pgvector extension + chuẩn bị embeddings infra
  - Files: migration mới, `apps/api/src/lib/embeddings.ts` (new)
  - Provider: OpenAI text-embedding-3-small (cheap, đủ tốt)
- [ ] ☐ Embed Brand IQ + KB + past tasks + GSC data
  - Files: `apps/api/src/services/embedding-jobs.ts` (new)
  - Cron job re-embed khi data thay đổi
- [ ] ☐ Vector search helper cho mọi agent prompt
  - Files: `apps/api/src/agents/memory.ts` (refactor)
- [ ] ☐ Agent personalities table + 7 default employees
  - Schema: `agent_personalities` (name, avatar_url, intro, kpi_dashboard_config, weekly_check_in_template)
  - Default: Cleo (CEO Strategy), Cassie (Support), Soshie (Social), Seomi (SEO), Geoffrey (GEO), Penn (Copy), Vio (Video)
  - **Founder approval needed**: tên tiếng Việt nếu muốn
  - Files: `apps/api/src/agents/personalities.ts` (new), seed migration
- [ ] ☐ Web component `EmployeeCard.tsx`: avatar + intro + current KPI + "Chat" button
  - Files: `apps/web/src/components/agents/EmployeeCard.tsx` (new)
- [ ] ☐ Page `/team` showing all employees grid
  - Files: `apps/web/src/app/(dashboard)/team/page.tsx` (new)
- [ ] ☐ Chat interface DM-style với từng employee
  - Files: `apps/web/src/app/(dashboard)/team/[name]/page.tsx` (new), route `/agents/{name}/chat` (new)
- [ ] ☐ Weekly Monday check-in: mỗi employee tự gửi inbox message với KPI tuần trước + plan tuần này
  - Files: `apps/api/src/workers/weekly-checkin-cron.ts` (new)

### Acceptance
- Founder thấy 7 nhân viên với avatar + tên + KPI
- Chat với từng người, response có context Brand IQ + KB + lịch sử
- Monday morning: 7 check-in messages trong inbox

### Risk
- Vector search cost / latency → pre-compute embeddings, cache hit count
- Naming feedback từ user → cho phép custom name per company

---

## ⚡ BLOCK 4 — Real-time Semantic Grader + Internal Linking (Tuần 7-8)

> **Why fourth**: Parity với Surfer/Clearscope trước khi push moat features.

**Status**: ✅ **Grader MVP shipped 2026-05-17** — commit `1db0b72` (1122 LOC). Internal Linking + Topic Cluster deferred.

### Tasks

- [x] ✅ Service `serp-scraper.ts`: SERP fetcher
  - Files: `apps/api/src/services/serp-scraper.ts` (160 LOC)
  - Uses SerpAPI if `SERPAPI_KEY` configured via admin, else falls back to LLM-simulated SERP (works day-1)
  - 24h in-memory cache
- [x] ✅ Service `content-grader.ts`: 5 sub-score breakdown
  - Files: `apps/api/src/services/content-grader.ts` (271 LOC)
  - Entity coverage, topic coverage, brand voice match, AI-citation likelihood, Flesch readability
  - Generates 5-10 ranked suggestions
- [x] ✅ Route `/content-editor`: POST /grade, GET /grades, GET /grades/:id
  - Files: `apps/api/src/routes/content-editor.ts` (133 LOC), mounted at `/api/v1/content-editor`
- [x] ✅ Web `/editor` UI two-column layout
  - Files: `apps/web/src/app/(dashboard)/[companyId]/editor/page.tsx` (371 LOC)
  - Animated 0-100 score widget, 5 sub-score bars, ranked suggestion list with severity color coding, past grades panel
  - Sidebar entry "Content Editor" unlockLevel 2
- [ ] ☐ Internal Linking Engine — **deferred** (needs vector embeddings — Block 3 dependency)
- [ ] ☐ Topic Cluster Visualization — **deferred**

### Verified working (2026-05-17)
- POST /api/v1/content-editor/grade with real content → returns score=37, 5 sub-scores, 5+ suggestions in ~5s
- GET /api/v1/content-editor/grades → returns past grades array
- Web page http://localhost:3004/{companyId}/editor → HTTP 200, full UI

### Acceptance
- Paste blog post → see score in <3s with live updates as user edits
- Internal linking suggests ≥3 relevant links per new post
- Topic cluster map shows existing structure + 5 gap suggestions

### Risk
- SERP scraping rate-limit / cost → cache 24h per keyword, batch
- NLP entity extraction inconsistent → use multiple passes, ensemble

---

## 🔁 BLOCK 5 — Agent Evolution Loop (Tuần 9-10) — MOAT

> **Why fifth**: Feature **không ai có**. Cần Block 1-4 chạy trước để có data feed.

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Redis Streams event bus (cross-cutting infra)
  - Files: `apps/api/src/lib/event-bus.ts` (new)
- [ ] ☐ Outcome tracking per agent action
  - Schema: `agent_outcomes` (agent_id, action_id, prompt_version, published_at, indexed_at, ranked_at, clicked_count, converted_count)
  - Files: `packages/core/src/db/schema/agent-outcomes.ts` (new)
- [ ] ☐ Service `outcome-tracker.ts`: hook vào mọi agent action → write to outcomes
  - Files: `apps/api/src/services/outcome-tracker.ts` (new)
- [ ] ☐ Prompt versioning system
  - Schema: `prompt_versions` (agent_id, version, prompt_text, created_at, active)
  - Files: `packages/core/src/db/schema/prompt-versions.ts` (new)
- [ ] ☐ A/B prompt runner: mỗi agent có 2-3 prompt versions, route requests theo split
  - Files: `apps/api/src/agents/ab-router.ts` (new)
- [ ] ☐ Evaluator cron: weekly compute winner per agent, promote
  - Files: `apps/api/src/workers/evolution-cron.ts` (new)
- [ ] ☐ Skill marketplace evolution: skill thắng nhiều → upvote, anonymized share
  - Files: extend `apps/api/src/routes/marketplace.ts`
- [ ] ☐ Weekly evolution report inbox message per founder
  - Files: extend `apps/api/src/workers/weekly-checkin-cron.ts`
  - Template: "Seomi cải thiện CTR 12% sau khi học từ 8 bài top performer của bạn"
- [ ] ☐ "Evolution" tab trong dashboard hiển thị trend per agent
  - Files: `apps/web/src/app/(dashboard)/evolution/page.tsx` (new)

### Acceptance
- Sau 2 tuần chạy, ít nhất 1 agent có evidence cải thiện measurable (CTR / conversion / approval rate)
- Founder thấy weekly report với concrete numbers
- Evolution tab hiển thị prompt version history + winner

### Risk
- Evaluation noisy / signal yếu → start với 3-5 high-volume agents (content, social), need ≥30 actions per variant for significance
- A/B mất nhiều tuần data → cho phép manual override + Bayesian early-stop

---

## 📞 BLOCK 6 — Omnichannel Chat (Tuần 11-12)

> **Why sixth**: Đợt 6 đã planned. API approval mất 2-3 tháng → **submit ngày 1 song song**.

**Status**: 🟡 **FB Messenger MVP shipped 2026-05-17** — commit `c640b1d` (1031 LOC) + Inbox·Messages page (205 LOC). Zalo/WA/IG/voice deferred until API approvals.

### Tasks (parallel: API approval + code)

- [ ] ☐ **Tuần 0 (làm ngay)**: Submit applications — **founder action required**
  - [ ] Facebook Messenger Platform API
  - [ ] Zalo Official Account API
  - [ ] WhatsApp Business Platform (Cloud API)
  - [ ] Instagram Messaging API
  - Status tracking trong file này (API Approval Tracking table below)
- [x] ✅ Service `channels/fb-messenger.ts`: webhook verify + parse + send + handleInboundMessage
  - Files: `apps/api/src/services/channels/fb-messenger.ts` (192 LOC)
- [ ] ☐ Service `channels/zalo.ts` — **deferred** (awaits Zalo OA approval)
- [ ] ☐ Service `channels/whatsapp.ts` — **deferred** (awaits WA Business approval)
- [ ] ☐ Service `channels/instagram.ts` — **deferred** (awaits IG Messaging approval)
- [x] ✅ Schema: `channel_connections` + `omnichannel_messages` (channel enum reserves all 4)
  - Files: `packages/core/src/db/schema/omnichannel.ts` (106 LOC), `packages/core/drizzle/0003_omnichannel.sql`
- [x] ✅ Encryption helper for page tokens at rest
  - Files: `apps/api/src/lib/crypto.ts` (45 LOC) — AES-256-GCM, key derived from JWT_SECRET
- [x] ✅ Authenticated route `/omnichannel` + public webhook router `/webhooks/omnichannel/messenger`
  - Files: `apps/api/src/routes/omnichannel.ts` (236 LOC)
- [x] ✅ Web Channels page: connect form, webhook URL surfaced, AI auto-reply toggle, disconnect
  - Files: `apps/web/src/app/(dashboard)/[companyId]/channels/page.tsx` (259 LOC)
  - Sidebar "Channels" (Link2 icon) unlockLevel 2
- [x] ✅ Web Inbox · Messages page: unified thread list per sender, manual Reply on latest inbound
  - Files: `apps/web/src/app/(dashboard)/[companyId]/inbox/messages/page.tsx` (205 LOC)
  - Sidebar "Inbox · Messages" (Inbox icon) unlockLevel 2
- [ ] ☐ Multi-bot personas per channel — **deferred** (Block 3 AI Employees territory)
- [ ] ☐ Voice channel (Twilio + Whisper + TTS) — **deferred**

### Verified working (2026-05-17)
- GET /api/v1/omnichannel/company/{companyId} → returns connections array
- GET /api/v1/omnichannel/company/{companyId}/messages → returns messages array
- Web page http://localhost:3004/{companyId}/channels → HTTP 200, Connect Facebook Messenger dialog with webhook URL ready to copy
- Web page http://localhost:3004/{companyId}/inbox/messages → HTTP 200, empty state with link back to Channels

### Founder action to go live
1. Create Meta App at https://developers.facebook.com
2. Add Messenger product, request `pages_messaging` permission
3. Get long-lived Page Access Token for your Page
4. Open `/channels` → Connect Facebook Messenger
5. Paste Page ID, App ID, Page Access Token, choose Verify Token
6. Copy the Webhook URL (`http://your-domain/webhooks/omnichannel/messenger`) and paste in Meta console → Messenger → Webhooks
7. Subscribe to `messages`, `messaging_postbacks` fields
8. Test: send a message to your Page → it appears in `/inbox/messages` within seconds

### Acceptance
- Founder connect FB page → tin nhắn từ FB hiển thị trong inbox app
- AI auto-reply với context (Brand IQ + KB)
- Voice call beta inbound demo

### Risk
- API approval delay → ship web widget upgrades + FB Messenger (fast approval) first, Zalo/WA later
- Compliance VN: Zalo policy strict về promotional messaging → cần legal review

---

## 💰 BLOCK 7 — Outcome-Based Pricing + Audit Cards (Tuần 13-14)

> **Why seventh**: Cần khi đã có outcome đủ chính xác để bill (sau Block 1-5).

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Define outcome SKUs
  - Article published + GSC-indexed = 1 outcome (price X)
  - Qualified lead (scored ≥ threshold) = 1 outcome (price Y)
  - Resolved support ticket (no human escalation) = 1 outcome (price Z)
  - Documented in `docs/pricing/outcomes-v1.md`
- [ ] ☐ Service `outcomes-billing.ts`: hook outcomes events → ledger entries
  - Files: `apps/api/src/services/outcomes-billing.ts` (new)
- [ ] ☐ Extend `billing.ts` for outcome plans (parallel với credit plans hiện tại)
  - Files: `apps/api/src/routes/billing.ts`
- [ ] ☐ Stripe metered billing setup
  - Files: `apps/api/src/lib/stripe.ts`
- [ ] ☐ Audit Cards system
  - Schema: `audit_cards` (action_id, agent_id, timestamp, action_type, description, attributable_to_user, reversible, undo_payload)
  - Files: `packages/core/src/db/schema/audit-cards.ts` (new)
- [ ] ☐ Hook mọi agent action → write audit card
  - Files: middleware `apps/api/src/middleware/audit.ts` (new)
- [ ] ☐ Web `AuditCard.tsx` component với "Undo" button cho reversible actions
  - Files: `apps/web/src/components/audit/AuditCard.tsx` (new)
- [ ] ☐ Trust dashboard: founder thấy mọi $ chi cho outcome gì
  - Files: `apps/web/src/app/(dashboard)/billing/outcomes/page.tsx` (new)

### Acceptance
- Founder pick plan "outcome-based" → billed only when articles published + indexed (verified via GSC)
- Audit card xuất hiện cho mọi auto-publish action
- Reversible action (e.g., scheduled post) có undo button hoạt động

### Risk
- "Indexed" / "qualified" hard to measure → start simple: GSC indexed within 14 days; lead score ≥ 70 = qualified
- Stripe metered config mistake → start with dry-run, log only mode for 1 week before live billing

---

## 🎨 BLOCK 8 — Multimodal SEO Pipeline (Tuần 15-16)

> **Why eighth**: Wedge — competitor yếu — nhưng cần Brand IQ + Content Editor trước.

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Video gen pipeline đóng kín: script → scene → real render
  - Files: extend `apps/api/src/services/video-engine.ts`
  - Provider: Runway Gen-3 or Veo3 or Pika API (admin configurable)
- [ ] ☐ Image variations per blog: 5 hero + 3 in-content auto
  - Files: extend `apps/api/src/services/image-generator.ts`
- [ ] ☐ Banner video upgrade: 15s loop variant
  - Files: extend `apps/api/src/services/creative-adapter.ts`
- [ ] ☐ YouTube auto-publish
  - Files: `apps/api/src/services/publishers/youtube.ts` (new)
- [ ] ☐ TikTok auto-publish
  - Files: `apps/api/src/services/publishers/tiktok.ts` (new)
- [ ] ☐ End-to-end pipeline: blog → script → video → YT + TikTok upload + SEO metadata
  - Files: extend `apps/api/src/services/distribution-engine.ts`

### Acceptance
- 1 blog post triggers: 5 images + 1 video + YouTube upload + TikTok upload with SEO metadata
- Quality acceptable for B2C use (not perfect, but shippable)

### Risk
- Video gen cost $$$$ → tier per plan, cap per month
- TikTok API rejection / cooldown → fallback to manual download + upload helper

---

## 🛠 BLOCK 9 — Programmatic SEO + Studio (Tuần 17-18)

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Programmatic page generator
  - Input: template + data table (CSV / Notion / Airtable) + Brand IQ
  - Output: 1k-10k unique pages
  - Files: `apps/api/src/services/programmatic-pages.ts` (new), `apps/api/src/routes/programmatic-pages.ts` (new)
- [ ] ☐ Editorial Gate
  - Duplicate check (semantic similarity vs corpus)
  - Accuracy check (against KB)
  - GEO citation likelihood score
  - Brand voice match score
  - Human approval threshold (auto-publish ≥ 90, queue otherwise)
  - Files: `apps/api/src/services/editorial-gate.ts` (new)
- [ ] ☐ Studio (no-code agent builder)
  - Founder gõ plain English: "I need a podcast guest researcher"
  - Studio creates agent with tools + budget + Brand IQ + initial prompt
  - Files: `apps/api/src/services/studio.ts` (new), `apps/api/src/routes/studio.ts` (new), `apps/web/src/app/(dashboard)/studio/page.tsx` (new)
- [ ] ☐ Marketplace seeding: 20+ pre-built agents từ Studio
  - Files: seed migration, `packages/core/src/db/seeds/marketplace-agents.ts` (new)

### Acceptance
- Founder uploads CSV with 100 cities → 100 unique landing pages with brand voice, ≥80 pass editorial gate
- Studio: 10-minute test "Create a competitor news monitor agent" works end-to-end
- Marketplace has 20+ installable agents

### Risk
- Google deindex / penalty for thin content → editorial gate strict, ramp slow (cap 50/week initial)
- Studio prompt quality varies → start with templates + slot fill, free-form later

---

## API Approval Tracking (Block 6 parallel)

| Channel | Submit Date | Status | ETA |
|---|---|---|---|
| FB Messenger | — | Not submitted | — |
| Zalo OA | — | Not submitted | — |
| WhatsApp Business | — | Not submitted | — |
| Instagram Messaging | — | Not submitted | — |

---

## Decisions Pending (founder input)

| # | Decision | Default if no answer | Block |
|---|---|---|---|
| D1 | 7 AI Employee names | Cleo/Cassie/Soshie/Seomi/Geoffrey/Penn/Vio | 3 |
| D2 | Outcome SKU prices ($ per article/lead/ticket) | TBD | 7 |
| D3 | Video provider (Runway / Veo3 / Pika) | Runway Gen-3 | 8 |
| D4 | Vietnamese vs English employee names | English (international scale) | 3 |
| D5 | Programmatic SEO weekly publish cap | 50 pages/week | 9 |

---

## Learnings & Pivots Log

> Append after each block ship. Format: `[Block N] [Date] Learning / What we'd do differently`

- **[Multi-agent parallel] [2026-05-17]** First attempt at parallel coding via 3 subagents in worktrees stalled (watchdog 600s) right at the web-UI phase. **All 3 agents had actually written code to the main repo** (worktree isolation didn't fully isolate), so progress was preserved but only after a tense `git status` check. Pivoted to: I coded sequentially in main repo, splitting shared-file edits per block via reset-and-rebuild pattern. Result: 4 clean commits (1 infra + 3 block), ~3400 LOC, all typecheck pass. **Lesson**: for blocks > 500 LOC, the watchdog is the limiting factor — split into back+front subagents or just do it directly. Worktree isolation as offered by harness is not fully reliable.
- **[Block 1] [2026-05-17]** SoV returns 0 unless competitors are tracked at `/market`. Added an in-page hint that links there. **Future**: auto-discover competitors from LLM mentions and offer "Track these?" CTA.
- **[Block 4] [2026-05-17]** LLM-simulated SERP fallback (when no SerpAPI) works but suggestions can be generic. Quality jumps noticeably with real SerpAPI. Document this in admin onboarding so founders know to add `SERPAPI_KEY` via admin.
- **[Block 6] [2026-05-17]** Block 6 agent stalled before adding the sidebar entry and the Inbox·Messages page. Verified after-the-fact via curl + page render. Took 2 extra commits to round out. **Lesson**: always grep sidebar.tsx as a smoke test after any block that adds a route.
- **[DB migrations] [2026-05-17]** `pnpm db:migrate` failed because `_journal.json` was stale vs. `__drizzle_migrations` table (project had been `db:push`-ed many times skipping journal). Bypassed by applying the 3 new SQL files directly via `docker exec ... psql < file.sql`. **Action item**: reconcile journal vs. migration table in a follow-up so `db:migrate` works again.

---

## Related Docs

- [README](./README.md) — strategy docs index
- [2027-product-vision.md](./2027-product-vision.md) — north star + 12 pillars + 5 moats
- [competitive-research-2026.md](./competitive-research-2026.md) — landscape data
- [current-feature-inventory.md](./current-feature-inventory.md) — baseline snapshot
- [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) — overall platform status
