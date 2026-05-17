# 1Person AI — Build-Now Plan (18-week Ship Plan)

> Version: 1.0 — created 2026-05-16
> Status: **LIVE document — update mỗi tuần**
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
| 1 | GEO Layer MVP | 1-2 | ☐ TODO | — | — |
| 2 | Brand IQ Layer | 3-4 | ☐ TODO | — | — |
| 3 | AI Employees UX + Vector Memory | 5-6 | ☐ TODO | — | — |
| 4 | Real-time Semantic Grader + Internal Linking | 7-8 | ☐ TODO | — | — |
| 5 | Agent Evolution Loop (MOAT) | 9-10 | ☐ TODO | — | — |
| 6 | Omnichannel Chat (Đợt 6) | 11-12 | ☐ TODO | — | — |
| 7 | Outcome-Based Pricing + Audit Cards | 13-14 | ☐ TODO | — | — |
| 8 | Multimodal SEO Pipeline | 15-16 | ☐ TODO | — | — |
| 9 | Programmatic SEO + Studio | 17-18 | ☐ TODO | — | — |

---

## Cross-Cutting (chạy song song mọi block)

| Task | Status | Notes |
|---|---|---|
| Enable `pgvector` extension trong PostgreSQL | ☐ TODO | Cần trước Block 3 |
| WebSocket realtime (Socket.io) replace polling | ☐ TODO | Cần trước Block 6 |
| Redis Streams event bus | ☐ TODO | Cần trước Block 5 |
| OpenTelemetry traces per agent action | ☐ TODO | Cần trước Block 5 |
| Extend rate limiting to all endpoints | ☐ TODO | Security debt |

---

## 🔥 BLOCK 1 — GEO Layer MVP (Tuần 1-2)

> **Why first**: 86.83% search có AI Overview. Không có cái này = outdated 2026. Closes critical gap.

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Schema mới: `geo_prompts`, `geo_mentions`, `geo_share_of_voice`
  - Files: `packages/core/src/db/schema/geo.ts` (new), migration
- [ ] ☐ Service `geo-tracker.ts`: poll ChatGPT + Perplexity + Gemini APIs
  - Files: `apps/api/src/services/geo-tracker.ts` (new)
  - Use ANTHROPIC_API_KEY, OPENAI_API_KEY, add PERPLEXITY_API_KEY + GEMINI_API_KEY
  - Cache 24h to avoid cost explosion
- [ ] ☐ Cron daily job poll 20-50 prompts của brand → đo mention count, position, sentiment
  - Files: `apps/api/src/workers/geo-cron.ts` (new), wire in `index.ts`
- [ ] ☐ Compute **AI Share of Voice** metric (% mention vs competitors trong cùng prompt set)
  - Files: `apps/api/src/services/geo-sov.ts` (new)
- [ ] ☐ Route `/geo` API: dashboard data, prompt CRUD, trend 7/30 ngày
  - Files: `apps/api/src/routes/geo.ts` (new), wire in `index.ts`
- [ ] ☐ Web dashboard widget "AI Share of Voice" với trend chart
  - Files: `apps/web/src/components/growth-dashboard/AIShareOfVoice.tsx` (new)
- [ ] ☐ Extend `seo-engine.ts` với AI-citation likelihood scoring (heuristic: structured answer + schema + entity coverage)
  - Files: `apps/api/src/routes/seo-engine.ts`
- [ ] ☐ Schema markup expansion: thêm Product, HowTo, Review, Organization, Breadcrumb
  - Files: `apps/api/src/services/blog-generator.ts`, `apps/api/src/services/schema-builder.ts` (new)

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

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Schema: `brand_iq_profile` (voice, audience_personas, knowledge_base, style_guide, visual_identity, okrs)
  - Files: `packages/core/src/db/schema/brand-iq.ts` (new)
- [ ] ☐ Service `brand-iq-extractor.ts`: input URL + 3 writing samples → output structured Brand IQ
  - Files: `apps/api/src/services/brand-iq-extractor.ts` (new)
  - Pipeline: scrape URL → analyze tone/style → extract personas → chunk KB → infer visuals (colors from CSS)
- [ ] ☐ Route `/brand-iq`: setup wizard, edit, regenerate
  - Files: `apps/api/src/routes/brand-iq.ts` (new)
- [ ] ☐ Mở rộng `business-context.ts` để serve Brand IQ thay vì raw text
  - Files: `apps/api/src/services/business-context.ts`
- [ ] ☐ Refactor mọi agent prompt template reference Brand IQ
  - Files: `apps/api/src/agents/**/*.ts` (sweep)
  - Acceptance: blog, social, ads, banner, email outreach đều dùng same voice profile
- [ ] ☐ Quarterly OKR input UI: founder gõ 3 OKR → tất cả agent re-align
  - Files: `apps/web/src/app/(dashboard)/brand-iq/page.tsx` (new)
- [ ] ☐ Brand IQ "score" widget: hiển thị mức độ output consistency của agents
  - Files: `apps/web/src/components/brand-iq/ConsistencyScore.tsx` (new)

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

**Status**: ☐ TODO

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

**Status**: ☐ TODO

### Tasks

- [ ] ☐ Service `serp-scraper.ts`: lấy top 10 real-time (SerpAPI hoặc tự crawl với rotation)
  - Files: `apps/api/src/services/serp-scraper.ts` (new)
- [ ] ☐ Service `content-grader.ts`: score 0-100 dựa trên
  - SERP top 10 entities coverage
  - NLP topic coverage (dùng OpenAI/Anthropic structured extraction)
  - AI-citation likelihood (Block 1 đã có)
  - Brand voice match (Brand IQ từ Block 2)
  - Files: `apps/api/src/services/content-grader.ts` (new)
- [ ] ☐ Route `/content-editor`: paste content → score + recommendations
  - Files: `apps/api/src/routes/content-editor.ts` (new)
- [ ] ☐ Web Content Editor UI với live scoring
  - Files: `apps/web/src/app/(dashboard)/editor/page.tsx` (new)
  - Components: score widget, missing entities list, suggestions panel
- [ ] ☐ Internal Linking Engine
  - Files: `apps/api/src/services/internal-linking-engine.ts` (new)
  - Input: new blog content + existing blog corpus (vector search)
  - Output: top 5 link suggestions with anchor text + relevance score
- [ ] ☐ Topic Cluster Visualization
  - Files: `apps/api/src/services/topic-cluster.ts` (new), `apps/web/src/components/seo/TopicClusterMap.tsx` (new)
  - Hub-spoke từ content đã có, đề xuất gap

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

**Status**: ☐ TODO

### Tasks (parallel: API approval + code)

- [ ] ☐ **Tuần 0 (làm ngay hôm nay)**: Submit applications
  - Facebook Messenger Platform API
  - Zalo Official Account API
  - WhatsApp Business Platform (Cloud API)
  - Instagram Messaging API
  - Status tracking trong file này
- [ ] ☐ Service `channel-fb.ts`: FB Messenger webhook + send/receive
  - Files: `apps/api/src/services/channels/fb-messenger.ts` (new)
- [ ] ☐ Service `channel-zalo.ts`: Zalo OA send/receive
  - Files: `apps/api/src/services/channels/zalo.ts` (new)
- [ ] ☐ Service `channel-whatsapp.ts`: WA Cloud API send/receive
  - Files: `apps/api/src/services/channels/whatsapp.ts` (new)
- [ ] ☐ Service `channel-ig.ts`: IG DM
  - Files: `apps/api/src/services/channels/instagram.ts` (new)
- [ ] ☐ Schema: `omnichannel_messages`, `channel_connections`
  - Files: `packages/core/src/db/schema/omnichannel.ts` (new)
- [ ] ☐ Unified inbox: 1 view tất cả channel, AI auto-reply, handoff threshold
  - Files: `apps/api/src/routes/inbox.ts` (extend), `apps/web/src/app/(dashboard)/inbox/page.tsx`
- [ ] ☐ Multi-bot architecture: mỗi bot có persona riêng (sales/support/qualifier)
  - Files: extend `apps/api/src/routes/chatbot.ts`
- [ ] ☐ Voice channel (beta): Twilio + Whisper + TTS cho inbound call
  - Files: `apps/api/src/services/channels/voice.ts` (new)

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

(empty)

---

## Related Docs

- [README](./README.md) — strategy docs index
- [2027-product-vision.md](./2027-product-vision.md) — north star + 12 pillars + 5 moats
- [competitive-research-2026.md](./competitive-research-2026.md) — landscape data
- [current-feature-inventory.md](./current-feature-inventory.md) — baseline snapshot
- [`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md) — overall platform status
