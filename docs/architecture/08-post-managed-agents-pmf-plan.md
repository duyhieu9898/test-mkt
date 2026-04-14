# 08 — Post-Managed-Agents PMF Plan

> **Strategic response to Claude Managed Agents launch (beta header
> `managed-agents-2026-04-01`).** This doc is the execution plan for
> the 3-month PMF window under the new positioning: Business Brain +
> Data Sovereignty + Vertical Marketing Execution + Non-Tech UX.
>
> Target user: non-technical founders with data-privacy concerns.
> Target market: SEA / Vietnam first.
> PMF window: 3 months max from 2026-04-09.
>
> Reference: `06-transparent-data-system.md` (trust axis),
> `07-marketing-execution-roadmap.md` (outcome axis).

---

## 1. What Managed Agents is, and what it deliberately isn't

From the official docs (verified 2026-04-09 via WebFetch):

**What Anthropic ships:**
- Pre-built agent harness in managed cloud containers
- Built-in tools: Bash, file ops, web search/fetch, MCP
- Session-based execution with persistent file systems
- Event streaming via SSE
- Branding: partners may ship "Powered by Claude" products

**What Anthropic explicitly DOES NOT ship:**
1. **On-premise deployment** — everything runs in Anthropic cloud
2. **Tamper-evident audit chain** — only session persistence
3. **Per-end-customer data isolation** — rate limits per *your* org
4. **Structured business memory** — memory is research preview, key-value shape
5. **Ad-platform integrations** — no Meta/Google/TikTok/LinkedIn Ads
6. **CMS integrations** — no Shopify/WordPress/WooCommerce
7. **End-user dashboard / non-technical UX** — it's a developer API
8. **Vietnamese / SEA localization** — global developer tooling
9. **Pricing predictability** — pay-per-token + container + storage overhead
10. **Vertical domain knowledge** — general-purpose infrastructure

**Key insight:** Anthropic is shipping the *harness* and expecting
partners to ship the *product*. They even include branding guidelines
for partners (`"{YourAgentName} Powered by Claude"`). This is explicit
permission to build on top.

**Competitive frame:** Managed Agents is **AWS Lambda for AI agents**.
1Person is **Shopify on top of AWS** — a vertical SaaS layer with the
end-user product, the data sovereignty, and the domain workflow.
Shopify never died because of AWS. It used AWS. 1Person can use
Managed Agents as one provider in Cloud mode (via the existing
`LLMProvider` abstraction planned in W1A.2) without giving up any
moat.

---

## 2. Moat audit — what we already have vs what we need

### ✅ Already built (60% of moat work)

| Component | Lives in | Moat category |
|---|---|---|
| `trustai_*` schema (6 tables) — per-tenant isolation | `packages/ai-tenant/src/schema.ts` | Data sovereignty |
| Chain-hashed audit log + `verifyChain()` | `packages/ai-tenant/src/audit-trail.ts` | Tamper-evident trust |
| SHA-256 file hashes + `verifyDataIntegrity()` | `packages/ai-tenant/src/tenant-store.ts` | Trust |
| `TenantAI` singleton + workspace isolation | `apps/api/src/lib/tenant-ai.ts` | Trust |
| `ai_brain_*` 4 tables — brand voice, personas, products, learnings | `packages/ai-tenant/src/schema.ts` + `brain-store.ts` | Business Brain |
| Brain editor UI (Brand Voice / Customers / Products tabs) | `apps/web/.../brain/page.tsx` | Non-tech UX |
| Campaign generate → banners + posts flow | `apps/api/src/routes/campaigns.ts` | Vertical execution |
| Live workflow SSE panel (generate + launch) | `apps/web/src/components/workflow-progress-panel.tsx` | Non-tech UX |
| Launch state machine (ready → launching → live) | `apps/api/src/routes/campaigns.ts` | Vertical execution |
| Deployment mode picker (Cloud / Private / On-Prem) | `apps/web/.../settings/deployment/page.tsx` | Data sovereignty |
| Langfuse self-host + `llmGenerate` trace wrap | `docker-compose.yml`, `apps/api/src/lib/llm.ts`, `lib/langfuse.ts` | Trust + observability |
| "Why this output?" Langfuse deep link | `apps/api/src/routes/campaigns.ts: /explain` | Trust |
| Public proof page `/proof/:id` + verify button | `apps/web/src/app/proof/[companyId]/page.tsx` | Trust |
| 7 ad platform providers wired | `apps/api/src/services/platforms/providers/*` | Vertical execution |
| Landing page deploy to Vercel / Cloudflare / S3 | `apps/api/src/services/deployment-service.ts` | Vertical execution |
| Tracking engine + attribution | `apps/api/src/services/tracking-engine.ts` | Vertical execution |
| Simplified sidebar (5 core + collapsible More) | `apps/web/src/components/layout/sidebar.tsx` | Non-tech UX |
| Landing page rewritten for new positioning (W35) | `apps/web/src/app/page.tsx`, `lib/i18n.ts` | Marketing |

**60% — the foundation. Everything structural is in place.**

### ❌ Remaining 40% — organized by priority for 3-month PMF

Split into **must-ship-for-PMF (P0)** and **ship-if-time-allows (P1)**.
Anything P2 or lower is explicitly out of scope until after PMF.

---

## 3. The 40% — P0 (ship in month 1-2)

These are the items without which **we cannot demo the value
proposition on the landing page**. Every row here maps directly to a
claim on the landing page we just rewrote.

### P0-A. Trust & Sovereignty depth (Month 1, week 1-2)

| # | Item | Why it's P0 | Effort |
|---|---|---|---|
| P0-A1 | **Wire deployment mode to backend** — `W1A.6` currently writes to localStorage only. Must persist in DB per-company and actually route LLM calls through the selected mode. | Landing page claim "Cloud / Private / On-Prem" is a lie until this works. Non-negotiable. | 1 day |
| P0-A2 | **Per-tenant BYO API key storage** — encrypted in DB, used when mode=Private. Swap `llmGenerate` to read tenant key first, fall back to env. | Required for Private Cloud mode to work. | 1 day |
| P0-A3 | **On-Prem mode smoke test** — wire `tenant-ai` factory to read deployment config, route to vLLM endpoint when on-prem. Document one reference deployment (docker-compose with vLLM). | Sales proof for data-privacy customers. Core differentiator. | 1 day |
| P0-A4 | **Fix documents table duplication (W0.1 follow-up)** — rewrite `routes/tenant-ai.ts` to use `TenantAI` class instead of raw SQL. Delete `core.documents` ad-hoc path. | Proof page + trust claims depend on `trustai_*` being authoritative. Debt risk. | 1 day |
| P0-A5 | **Data export** — one-click JSON+ZIP export of tenant documents + Brain + campaigns + audit log. Landing page promises this. | Trust moat — "your data, always exportable". | 1 day |

### P0-B. Vertical execution depth (Month 1 week 3 → Month 2 week 2)

Where the demo is weakest. Without this, users see "AI generates generic banners" and leave.

| # | Item | Why it's P0 | Effort |
|---|---|---|---|
| P0-B1 | **Real banner image generation** — integrate an image model (Gemini Imagen, Banana.dev, or DALL-E) to replace the CSS-gradient stub. Pipeline: prompt → image model → S3 upload → `banners.design.backgroundValue = <url>`. | User explicitly flagged banner quality as blocker. Non-negotiable for PMF. | 2-3 days |
| P0-B2 | **Social post preview layouts** — proper Facebook/LinkedIn/X look-alike preview cards in `campaigns/[id]/page.tsx`. Match the visual language of the real platforms. | User explicitly flagged "layout hiện đại" as weak. Visual trust. | 2 days |
| P0-B3 | **Wire Brain snapshot into ALL generators** — currently `generateForExisting` reads Brain, but `marketingAutonomous.generateBanners/generatePosts` (FTUX path) doesn't. Consolidate so both paths use Brain. | Landing page promises "AI that knows your brand" — must be true everywhere. | 1 day |
| P0-B4 | **FTUX auto-build Brain from website crawl** — when user onboards with a URL, auto-extract brand voice (tone from copy analysis), products (from catalog crawl), primary persona (from positioning). Writes to `ai_brain_*` tables. | Without this, new users see empty Brain → bad first impression. Makes Brain feel "alive" from minute one. | 2 days |
| P0-B5 | **Real Launch flow for ONE platform** — pick Meta first (biggest reach in SEA). Wire `ads-engine.ts` Facebook provider to actually create campaigns via Marketing API. Token handling, ad account selection, budget validation. | Managed Agents can't publish to Meta. Our core vertical moat. | 3 days |
| P0-B6 | **Performance tracking refresh** — existing `tracking-engine.ts` has the schema. Wire daily metrics cron to poll Meta Insights API + GSC for live campaigns. Display on campaign detail page. | Closes the outcome loop. Users see actual performance. | 2 days |
| P0-B7 | **Feedback loop → Brain learnings** — when a campaign ends with metrics, write a `trustai_brain_campaign_learnings` entry summarizing what worked. Next campaign reads it. | The "self-improving" claim on landing page. | 1 day |

### P0-C. Non-tech UX polish (Month 2 week 3-4)

Polish that removes the last blockers for a non-technical founder clicking Sign Up and actually using it.

| # | Item | Why it's P0 | Effort |
|---|---|---|---|
| P0-C1 | **Vietnamese UI translation (production quality)** — current VI translations are functional but rough. Polish every visible string to conversational VN. Audit with a real non-tech user. | SEA / Vietnam is the target market. Must read naturally. | 2 days |
| P0-C2 | **Onboarding flow rework** — current FTUX dumps user into 25-page dashboard. Rebuild as a 3-step wizard: "1. Tell us your website → 2. Meet your Brain → 3. Your first campaign". | First impression. Retention depends on this. | 3 days |
| P0-C3 | **Empty states & error messages in non-tech language** — audit every Toast error, every empty card, every loading state. Remove jargon ("tenant", "queue", "drizzle"). | Trust is lost on the first unclear error. | 1 day |
| P0-C4 | **Guided "Your first campaign" tour** — tooltip overlay on first visit explaining each button. Can be as simple as a dismissible bubble sequence. | Non-tech users need hand-holding. Reduces 70% of support questions. | 2 days |
| P0-C5 | **Mobile-responsive dashboard** — current dashboard breaks below 768px. SEA founders check on phones. | Mobile usage is ~60% in SEA. | 2 days |

### P0-D. Production readiness (Month 2 week 4 → Month 3 week 1)

| # | Item | Why it's P0 | Effort |
|---|---|---|---|
| P0-D1 | **Pricing page + Stripe integration** — 3 tiers: Free (1 brain, 10 campaigns/month, cloud mode only), Pro (unlimited campaigns, BYO key), Business (on-prem mode, dedicated support). | Can't sell without pricing. | 2 days |
| P0-D2 | **Rate limiting per tenant** — prevent cost runaway from accidental loops. Per-minute + per-day LLM call limits, enforced in `TenantAI`. | Financial safety. | 1 day |
| P0-D3 | **Error tracking (Sentry or self-hosted GlitchTip)** — production error visibility. | Blind flying = death in month 3. | 1 day |
| P0-D4 | **Basic metrics dashboard (for you, not users)** — signups, campaigns generated, LLM costs, error rates. Single page for founder-only view. | You can't optimize what you don't measure. | 1 day |
| P0-D5 | **Deploy to real infrastructure** — DEPLOYMENT.md already exists. Audit + execute + domain + SSL. | Obvious. | 1-2 days |

**P0 total effort estimate: ~38-42 days of focused work.** 8-week realistic with 1 dev = **end of Month 2**.

---

## 4. The 40% — P1 (ship in month 3 if time)

Things that make the product better but don't block PMF.

| # | Item | Value |
|---|---|---|
| P1-1 | **Shopify import → auto-populate products** | Removes manual Brain data entry for e-commerce users |
| P1-2 | **WordPress publishing** | Blog publishing for SEO campaigns |
| P1-3 | **Google Ads provider wire (after Meta works)** | Second ad platform depth |
| P1-4 | **Langfuse traces linked per-asset** — store `traceId` in `trustai_query_history` per banner/post | More precise "Why this output?" drill-down |
| P1-5 | **Brain versioning UI** — see past versions of brand voice, restore | Safety net for edits |
| P1-6 | **Multi-language support in Brain** — brand voice per language | For SEA founders targeting multiple markets |
| P1-7 | **TikTok Ads SEA integration** | TikTok dominates SEA; big differentiator |
| P1-8 | **"Power user" toggle to restore old 25-page dashboard** | Migration path for existing users |

---

## 5. Explicit kill list — do NOT build in the PMF window

Things ChatGPT or instinct might tell you to build. Do not.

| ❌ Don't build | ✅ Use instead |
|---|---|
| Custom agent loop / planner | Managed Agents (when in Cloud mode) |
| Custom tool-use primitives | Managed Agents tools |
| Custom embedding pipeline | OpenAI/Cohere embedding API |
| Custom RAG framework | Current ai-tenant RAG is enough for PMF |
| Multi-agent orchestration engine | Existing `orchestrator.ts` is enough |
| Fine-tuning / custom models | Zero ROI at PMF stage |
| Knowledge graph for Brain | Current 4-table structured store is enough |
| `@trustai/core` external API (Phase 4 of plan) | **Defer to post-PMF.** Don't split focus. |
| Generic chatbot improvements | Not differentiated |
| New ad platforms beyond Meta (until Meta works end-to-end) | Depth over breadth |
| Mobile apps (iOS/Android) | Mobile web is fine for PMF |
| Internationalization beyond EN + VI | JA/KO can stay at current quality |

**Every hour on this list is an hour not spent on P0.**

---

## 6. Distribution strategy (since user confirmed plan exists)

This doc doesn't define distribution — user said they have it handled.
But P0 should support distribution with these artifacts:

- **Demo video** (2 min) showing: onboard → Brain auto-built → generate
  campaign → live panel → launch → verify integrity → "your data never
  left your control"
- **Public proof URL** for a sample company — share in DMs/tweets
  showing the tamper-evident audit chain
- **Comparison table on landing page** (built) — SEO and direct
  objection-handling
- **Case study template** — first 3 customers each get a written case
  study with real numbers

---

## 7. Suggested execution order (week by week)

### Month 1 — Foundation solidification

**Week 1** (now) — P0-A Trust & Sovereignty backend depth
- P0-A1 Deployment mode backend wire
- P0-A2 Per-tenant BYO key storage
- P0-A3 On-Prem smoke test + reference docker-compose
- P0-A4 Legacy `tenant-ai.ts` rewrite
- P0-A5 Data export

**Week 2** — Start P0-B vertical depth
- P0-B1 Banner image generation (Gemini Imagen recommended — fast, good, cheap)
- P0-B3 Brain snapshot in all generators

**Week 3** — Continue P0-B
- P0-B2 Social post preview layouts
- P0-B4 FTUX auto-build Brain from crawl

**Week 4** — Launch flow
- P0-B5 Real Meta Marketing API publish (token handling + account select + budget validation)

### Month 2 — Outcome loop + Non-tech UX

**Week 5** — Close the loop
- P0-B6 Performance tracking refresh (Meta Insights + GSC)
- P0-B7 Feedback → Brain learnings

**Week 6-7** — Non-tech UX
- P0-C1 Vietnamese polish
- P0-C2 Onboarding wizard
- P0-C3 Empty states + errors
- P0-C5 Mobile responsive

**Week 8** — Guided tour + start production prep
- P0-C4 First-campaign tour
- P0-D1 Pricing + Stripe (start)

### Month 3 — Production + first users

**Week 9** — Production readiness
- P0-D1 Stripe finish
- P0-D2 Rate limiting
- P0-D3 Error tracking
- P0-D4 Founder metrics dashboard
- P0-D5 Real deploy

**Week 10** — First 5 beta users, watch everything break
- Bug bash
- Langfuse trace review (find what the AI is doing wrong)
- P1 items if time

**Week 11-12** — Iterate with beta feedback, ship to wider list

---

## 8. Criteria for declaring PMF

PMF is declared when **all three** are true:

1. **10 non-technical users** have onboarded, generated a campaign,
   and launched to a real ad platform **without human help from you**
2. **5 of those users** come back within 7 days and generate a
   second campaign **on their own initiative**
3. **1 user** asks to upgrade to a paid plan **without being asked**

If at end of month 3 none of the three are true → pivot or kill.
If 1-2 are true → continue iterating.
If all 3 → scale distribution.

---

## 9. What happens to docs 06 and 07

- **Doc 06 (Trust)**: Phases 1-3 of its roadmap are covered by P0-A +
  some of P0-B. Phase 4 (`@trustai/core` externalization) is **deferred
  post-PMF**. Phase 5 (widgets, MCP, RBAC) also deferred.
- **Doc 07 (Outcome)**: Phase 1 (campaign spine) is DONE. Phase 2
  (verticalized agents) is partially covered by P0-B1/B2. Phase 3
  (Brain editor + lineage) is DONE. Phase 4 (external API +
  integrations + dashboard simplification) — only dashboard
  simplification shipped. Shopify/WordPress integrations deferred to P1.
- Both docs remain the reference architecture. This doc is the
  **execution filter** for the PMF window — what to build now, what to
  defer.

---

## 10. Status tracker

After each week, update this section with ✅ / 🟡 / ❌ per item.

```
P0-A1 Deployment mode backend wire       [ ]
P0-A2 Per-tenant BYO key storage         [ ]
P0-A3 On-Prem smoke test                 [ ]
P0-A4 Legacy tenant-ai rewrite           [ ]
P0-A5 Data export                        [ ]
P0-B1 Banner image generation            [ ]
P0-B2 Social post preview layouts        [ ]
P0-B3 Brain in all generators            [ ]
P0-B4 FTUX auto-build Brain              [ ]
P0-B5 Meta Marketing API publish         [ ]
P0-B6 Performance tracking refresh       [ ]
P0-B7 Feedback → Brain learnings         [ ]
P0-C1 Vietnamese polish                  [ ]
P0-C2 Onboarding wizard                  [ ]
P0-C3 Empty states + errors              [ ]
P0-C4 First-campaign tour                [ ]
P0-C5 Mobile responsive                  [ ]
P0-D1 Pricing + Stripe                   [ ]
P0-D2 Rate limiting per tenant           [ ]
P0-D3 Error tracking                     [ ]
P0-D4 Founder metrics dashboard          [ ]
P0-D5 Production deploy                  [ ]
```
