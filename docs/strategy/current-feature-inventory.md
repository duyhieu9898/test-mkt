# 1Person AI — Current Feature Inventory

> Snapshot date: 2026-05-17 (updated post Block 1/4/6 MVP ship)
> Method: Codebase exploration via Explore agent. File paths verified.
> **This is a baseline snapshot.** Re-run after each major ship to refresh.

## 2026-05-17 update — what changed since 2026-05-16 baseline

| Change | Status | Commit |
|---|---|---|
| **GEO/LLMO tracking** (Block 1) | ❌ → ✅ | `ea4690c` |
| **On-page real-time grader** (Block 4) | ❌ → ✅ | `1db0b72` |
| **Cross-channel chat — FB Messenger** (Block 6) | ❌ → 🟡 (FB only) | `c640b1d` + inbox page |
| **Unified inbox messages viewer** | ❌ → ✅ | inbox/messages page |
| **Walkthrough + Admin Setup Readiness** | ❌ → ✅ | `90553be` |
| **Brand IQ Layer** (Block 2) | ❌ → ✅ | 2026-05-18 |
| Other "CRITICAL MISSING" items below | unchanged | — |


Legend: ✅ YES (shipped) · 🟡 PARTIAL (skeleton or limited) · ❌ NO (not implemented)

---

## CONTENT / SEO

### Keyword Research & Content Strategy — 🟡 PARTIAL
- Files: `apps/api/src/routes/seo-engine.ts:445-594`, `seo-engine.ts:876-1083`
- **Implemented**: LLM keyword opportunity suggestions (volume, difficulty, intent), real-time GSC enrichment (position, clicks, impressions, CTR), unified keyword dashboard merging GSC + content + AI suggestions, content gap detection.
- **Gaps**: No 3rd-party data (Ahrefs/Semrush API); no SERP analysis depth; no question/intent clustering.

### Content Brief & Outline Generation — ✅ YES
- Files: `apps/api/src/routes/seo-engine.ts:600-781`, `apps/api/src/services/blog-generator.ts`
- **Implemented**: Multi-keyword blog batch (1500w target), auto FAQ + tags + schema, 3 banner angles + 2 social posts per blog.

### SERP Analysis & Competitor Content — 🟡 PARTIAL
- Files: `apps/api/src/services/competitor-brief.ts:30-121`, `apps/api/src/services/market-scan.ts`, `apps/api/src/routes/market.ts:111-150`
- **Implemented**: Competitor website scanning, signal extraction, strength/weakness brief, 3 tactical actions per competitor, brain memory integration.
- **Gaps**: No SERP scraping, no backlink analysis, no content word-count comparison.

### On-Page SEO Scoring / Content Grader — ✅ YES (MVP)
- Files: `apps/api/src/services/content-grader.ts`, `apps/api/src/services/serp-scraper.ts`, `apps/api/src/routes/content-editor.ts`, `apps/web/src/app/(dashboard)/[companyId]/editor/page.tsx`
- 5 sub-scores (entity coverage vs SERP, topic coverage, brand voice match, AI-citation likelihood, Flesch readability) + ranked suggestions.
- SerpAPI integration with LLM-simulated fallback.
- **Gaps for v2**: internal linking engine, topic cluster map (need vector embeddings — Block 3 dependency)

### Internal Linking Suggestions — ❌ NO

### Topical Authority / Topic Clusters — 🟡 PARTIAL
- Files: `apps/api/src/routes/seo-engine.ts:500-514`
- **Implemented**: LLM-generated related topics per keyword.
- **Gaps**: No silos, no hub-spoke mapping, no content decay tracking.

### Schema Markup — ✅ YES (limited types)
- Files: `apps/api/src/routes/seo-engine.ts:679-680`
- **Implemented**: FAQPage + Article schema auto-generated per blog.
- **Gaps**: No Product, HowTo, Review, Organization, Breadcrumb.

### AI Overview / LLMO / GEO Optimization — ✅ YES (MVP)
- Files: `apps/api/src/services/geo-tracker.ts`, `apps/api/src/routes/geo.ts`, `apps/web/src/app/(dashboard)/[companyId]/geo/page.tsx`, `packages/core/src/db/schema/geo.ts`
- Polls OpenAI + Anthropic per tracked prompt, parses brand + competitor mentions, computes AI Share of Voice trend (7-day vs prior 7-day), surfaces in dashboard widget.
- **Gaps for v2**: Perplexity + Gemini providers, daily cron auto-run, auto-detect competitors, AI-citation-likelihood scoring integration with seo-engine.ts

### Backlink & Link Building — ❌ NO

### Technical SEO Audit — ❌ NO

### Rank Tracking — ✅ YES (via GSC)
- Files: `apps/api/src/routes/seo-engine.ts:876-1083`

### Content Refresh / Decay Detection — ❌ NO

---

## WRITING / CREATIVE

### Long-Form Article Writer — ✅ YES
- Files: `apps/api/src/services/blog-generator.ts`

### Blog Generator with Research — 🟡 PARTIAL
- AI-native research only; no external fact-checking.

### Tone / Voice / Brand Customization — ✅ YES (auto-generated since 2026-05-18)
- Files: `apps/api/src/services/brand-iq-extractor.ts`, `apps/api/src/routes/brand-iq.ts`, `apps/web/src/app/(dashboard)/[companyId]/brand-iq/page.tsx`, `packages/core/src/db/schema/brand-iq.ts`, `apps/api/src/services/business-context.ts` (injection)
- Block 2 shipped: auto-extract from URL + 1-5 samples → voice + 3-5 personas + style guide + visual identity (palette/fonts/logo) + tagline + quarterly OKRs.
- Versioned profile (latest active row per company). Manual edit per facet via PUT.
- **Every existing agent automatically benefits** — Brand IQ injected at the front of `buildBusinessContext().fullContext`.

### Templates Library — ✅ YES
- Files: `apps/api/src/routes/templates.ts`, `apps/api/src/services/template-service.ts`, `packages/core/src/db/schema/templates.ts`
- 5 default templates (SaaS, E-commerce, Agency, Creator, Local Service).

### Image Generation — ✅ YES
- Files: `apps/api/src/services/image-generator.ts:1-100`
- DALL-E 3, Gemini Imagen, Banana, Banana Pro. Admin-configured quality tiers, DB-driven provider selection, credit cost per provider.
- **Gaps**: No batch API, no style library.

### Video Generation — 🟡 PARTIAL
- Files: `apps/api/src/services/video-engine.ts:1-100`
- Script gen (hook/body/CTA), scene breakdown (15/30/60s), animation options, 9:16/16:9/1:1.
- **Gaps**: No actual video rendering, no music/voiceover.

### Banner / Creative System (Multi-Size) — ✅ YES
- Files: `apps/api/src/routes/seo-engine.ts:714-743`, `apps/api/src/services/creative-adapter.ts`, `apps/api/src/routes/marketing-engine.ts`
- 3 strategic angles, gradient backgrounds, multi-size adaptation.

### Brand Kit / Asset Library — ✅ YES
- Files: `apps/api/src/routes/assets-library.ts`, `apps/api/src/routes/assets.ts`, `packages/core/src/db/schema/assets.ts`

### Plagiarism / AI Detection — ❌ NO

### Multilingual / Translation — 🟡 PARTIAL
- Files: `apps/api/src/routes/seo-engine.ts:32,613`
- Blog accepts language param. No multi-language UI, no auto-translate templates.

---

## GROWTH / MARKETING OPS

### Multi-Channel Campaigns — ✅ YES
- Files: `apps/api/src/routes/campaigns.ts`

### Social Media Scheduling & Publishing — ✅ YES
- Files: `apps/api/src/routes/social.ts:1-104`, `apps/api/src/services/meta-publisher.ts`
- FB, IG, LinkedIn. Draft → Schedule → Publish. SOCIAL_PUBLISH_ENABLED flag.
- **Gaps**: No platform char-limit checks, no image upload in social route.

### Ad Creation (Meta / Google / TikTok / LinkedIn) — ✅ YES (frameworks)
- Files: `apps/api/src/services/ads-engine.ts`, `apps/api/src/routes/ads.ts`, `apps/api/src/services/marketing-frameworks.ts`
- AIDA, viral frameworks, A/B angle templates.
- **Gaps**: No DCO, no auto-bid management.

### Landing Page Builder — ✅ YES
- Files: `apps/api/src/routes/landing-pages.ts:1-200`, `apps/api/src/services/landing-page-service.ts`, `apps/api/src/routes/seo-engine.ts:688-711`
- AI gen, drag-drop sections (hero/features/problem/solution/testimonials/FAQ/CTA), SEO customization, subdomain publish, lead capture.
- **Gaps**: No A/B in builder, no dynamic section reorder API.

### A/B Testing / Experiments — 🟡 PARTIAL
- Files: `apps/api/src/services/marketing-frameworks.ts`
- Templates only. No runner, no results analysis, no stat significance.

### Funnel Analytics — 🟡 PARTIAL
- Files: `apps/api/src/services/attribution.ts`
- Skeleton. No visualization, no step-by-step conversion rates.

### Lead Capture / CRM — ✅ YES
- Files: `apps/api/src/routes/lead-capture.ts:1-150`, `apps/api/src/routes/leads.ts`, `apps/api/src/services/lead-capture-engine.ts`, `apps/api/src/routes/outreach.ts:20-75`
- Public lead capture (rate-limited 20/hr), scoring, status workflow, custom fields + tags.

### Email Sequences / Drip — ✅ YES
- Files: `apps/api/src/services/outreach-engine.ts:1-50`, `apps/api/src/routes/outreach.ts:142-150`
- Resend + SendGrid. Sequence CRUD, enrollment, open/click/reply tracking schema.
- **Gaps**: No visual drip builder, no trigger-based enrollment.

### Chatbot / Omnichannel Inbox — 🟡 PARTIAL (web widget + FB Messenger shipped; Zalo/WA/IG schema-reserved)
- Files: existing web widget at `apps/api/src/routes/chatbot.ts` + new omnichannel at `apps/api/src/services/channels/fb-messenger.ts`, `apps/api/src/routes/omnichannel.ts`, `apps/api/src/lib/crypto.ts`, `apps/web/src/app/(dashboard)/[companyId]/channels/page.tsx`, `apps/web/src/app/(dashboard)/[companyId]/inbox/messages/page.tsx`, `packages/core/src/db/schema/omnichannel.ts`
- FB Messenger: webhook verify handshake, payload parser, Graph API send, AES-256-GCM-encrypted page token storage, AI auto-reply opt-in.
- Unified inbox page with thread grouping + manual reply.
- **Gaps**: Zalo / WhatsApp / Instagram services not coded yet (schema reserves enum values); voice channel deferred; founder must register Meta App + paste Page Access Token to go live.

### Outreach Automation — 🟡 PARTIAL (email only)
- Files: `apps/api/src/services/outreach-engine.ts`, `apps/api/src/routes/outreach.ts:100-140`
- **Gaps**: No LinkedIn automation, no campaign templates, no unsubscribe.

### Workflow / Automation Builder — 🟡 PARTIAL
- Files: `apps/api/src/routes/workflows.ts`, `packages/workflow/`, `apps/api/src/agents/orchestrator.ts:1-150`
- Marketing distribution workflow, content calendar gen, DAG executor.
- **Gaps**: No UI workflow builder.

---

## AI AGENTS / ORCHESTRATION

### Multi-Agent System — ✅ YES
- Files: `apps/api/src/agents/index.ts`, `apps/api/src/agents/agent-registry.ts`, `apps/api/src/agents/orchestrator.ts`, `apps/api/src/routes/agents.ts:1-150`
- Roles: CEO, marketing_manager, sales_manager, content_creator, ads_specialist, analyst, support, developer, custom.
- Capabilities (basic/intermediate/advanced), KPI targets, budget limits, dept + supervisor hierarchy.

### Agent Task Queue / Orchestrator — ✅ YES
- Files: `apps/api/src/agents/orchestrator.ts:1-150`, `apps/api/src/lib/queue.ts`
- DAG dependency resolution, sequential exec, auto-expand from suggestions.

### Memory / RAG / Vector DB — 🟡 PARTIAL (no vector)
- Files: `apps/api/src/agents/memory.ts`, `apps/api/src/services/knowledge-extraction.ts`, `packages/core/src/db/schema/memory.ts`, `apps/api/src/routes/knowledge.ts`
- Memory store (context/events/feedback), KB CRUD, GSC stored as KB entry, brain extraction.
- **Gaps**: No vector embeddings, no semantic search.

### Tool Use / Function Calling — ✅ YES
- Files: `apps/api/src/intelligence/tools.ts`, `apps/api/src/services/tool-registry-service.ts`, `apps/api/src/services/skill-registry-service.ts`

### Evaluation / KPI Tracking — ✅ YES
- Files: `apps/api/src/services/execution-metrics-service.ts`, `apps/api/src/services/performance-tracker.ts`, `apps/api/src/routes/execution-metrics.ts`

### Agent Evolution / Prompt Improvement — 🟡 PARTIAL
- Files: `apps/api/src/agents/feedback-loop.ts`
- Skeleton exists. **No active prompt optimization, no A/B prompts running.**
> **MOAT OPPORTUNITY** — see [build-now-plan.md](./build-now-plan.md) Block 5.

### Budget Enforcement / Cost Tracking — ✅ YES
- Files: `apps/api/src/routes/budget.ts`, `apps/api/src/routes/economy.ts`, `apps/api/src/lib/credits.ts`
- Per-feature credit costs, agent budget limits, economy simulation.

### Marketplace for Skills/Agents — ✅ YES
- Files: `apps/api/src/routes/marketplace.ts`, `packages/core/src/db/schema/marketplace.ts`

### Workflow Templates / Playbooks — ✅ YES
- Files: `apps/api/src/routes/playbooks.ts`, `apps/api/src/services/playbook-service.ts`, `packages/core/src/db/schema/playbooks.ts`
- 5 default playbooks (idea → mvp → launch → growth → optimize).

---

## ANALYTICS / INTELLIGENCE

### Dashboard / KPIs — ✅ YES
- Files: `apps/api/src/routes/dashboard.ts:1-200`, `apps/api/src/services/dashboard-service.ts`
- Overview, agent status, pipeline, intelligence layer, activity log, content pipeline.

### Real SEO Data Integration — 🟡 PARTIAL (GSC only)
- Files: `apps/api/src/routes/seo-engine.ts:528-574`, `apps/api/src/services/gsc-client.ts`, `apps/api/src/routes/integrations.ts:109-120`
- GSC OAuth, query perf (position/clicks/impressions/CTR), 28-day window, auto-enrich.
- **Gaps**: No Ahrefs/Semrush/Moz, no GA4.

### Social Analytics — ❌ NO

### Ad Performance Tracking — 🟡 PARTIAL
- Files: `apps/api/src/routes/tracking.ts`

### Competitor Monitoring — ✅ YES
- Files: `apps/api/src/routes/market.ts`, `apps/api/src/services/competitor-brief.ts`, `apps/api/src/services/competitor-comparison.ts`, `apps/api/src/services/positioning-map.ts`
- Unlimited competitors, weekly scans, strength/weakness, positioning map, market digest.
- **Gaps**: No price tracking, no news monitoring, no social listening.

### Gamification (Growth Score, Missions, Streaks) — ✅ YES
- Files: `apps/api/src/routes/gamification.ts`, `apps/api/src/services/growth-score.ts:1-150`, `apps/api/src/services/daily-missions.ts`
- Growth Score 0-100 + 4 subscores (marketing, SEO, automation, revenue), sub-metric breakdown, trend, level 1-4, daily missions, streaks, mission complete/skip + rewards.
> **UNIQUE — no competitor has this.**

### Reporting / Exports — 🟡 PARTIAL
- Files: `apps/api/src/routes/export.ts`

---

## PLATFORM

### Multi-Tenant — ✅ YES
- Files: `packages/ai-tenant/src/tenant-store.ts`, `apps/api/src/lib/tenant-ai.ts`

### Admin Panel / RBAC — ✅ YES
- Files: `apps/api/src/routes/admin.ts:1-150`, `apps/api/src/routes/admin-config.ts`, `apps/api/src/routes/admin-credits.ts`, `apps/api/src/routes/admin-publish.ts`
- User mgmt, company stats, site config (section/locale), LLM provider mgmt, feature→LLM mapping, credit cost config.

### Billing / Stripe — ✅ YES
- Files: `apps/api/src/routes/billing.ts:1-100`, `apps/api/src/lib/stripe.ts`
- Checkout sessions, plans (free/pro/business), subscription tracking, webhooks.
- **Gaps**: No usage-based, no invoice mgmt, no upgrade/downgrade UX.

### API / Webhooks — ✅ YES
- Files: `apps/api/src/routes/webhooks.ts`, `apps/api/src/routes/lead-capture.ts`
- Public lead capture API, webhook registration + firing, event types.

### Integrations (Google, Meta) — ✅ YES (framework)
- Files: `apps/api/src/routes/integrations.ts:1-150`, `apps/api/src/services/platforms/`
- 1-click OAuth orchestrator, auth URL → callback → token exchange, platform availability, GSC + FB + IG + Meta Ads + Google Ads + LinkedIn.

### White-Label — ❌ NO

### Mobile — ❌ NO

---

## CRITICAL MISSING (from competitive analysis)

> See [2027-product-vision.md](./2027-product-vision.md) and [competitive-research-2026.md](./competitive-research-2026.md) for full context.

1. ~~**GEO/LLMO tracking** — table stakes 2026.~~ ✅ shipped 2026-05-17 (Block 1, OpenAI+Anthropic, no cron yet)
2. **Vector embeddings / semantic RAG**.
3. **Active prompt optimization loop** (skeleton exists, not running).
4. ~~**Brand IQ auto-extraction** (Jasper IQ pattern).~~ ✅ shipped 2026-05-18 (Block 2, URL+samples→profile, auto-injected into all agents)
5. ~~**On-page real-time grader** (Surfer/Clearscope baseline).~~ ✅ shipped 2026-05-17 (Block 4, SerpAPI+LLM fallback)
6. **Topic cluster / internal linking engine**.
7. **Outcome-based billing**.
8. **Audit cards** for AI actions.
9. **AI Employees with personalities** (Sintra UX).
10. **Programmatic SEO at scale with editorial gates**.
11. 🟡 **Cross-channel chat** — FB Messenger shipped 2026-05-17 (Block 6); Zalo/WhatsApp/IG/voice still missing.
12. **Visual/video integrated with SEO pipeline**.
13. **Real-time WebSocket updates** (currently polling).
14. **Studio (no-code agent builder)**.
15. **Mobile native app**.

---

## Routes Summary (63 routes)

**Content**: seo-engine, blog, landing-pages
**Marketing**: marketing-engine, campaigns, ads, social, outreach, workflows
**Intelligence**: dashboard, market, gamification, insights, tracking
**Platform**: admin, billing, integrations, auth, companies
**Growth**: playbooks, templates, guidance, execution, deployment-mode

## Services (50+ files)

blog-generator, landing-page-service, image-generator, video-engine, competitor-brief, market-scan, growth-score, daily-missions, outreach-engine, ads-engine, distribution-engine, marketing-frameworks, creative-adapter, website-analyzer, ceo-advisor, marketing-autonomous, performance-tracker.

## Active Integrations

- Google Search Console (OAuth + query perf)
- Stripe (checkout)
- Resend + SendGrid (email)
- DALL-E, Gemini Imagen, Banana (image)
- Meta, Google Ads, LinkedIn (platform OAuth)
