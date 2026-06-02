# Unique Wedges — Market Gaps No Tool Currently Fills

> Version: 1.0 — 2026-05-18
> Origin: founder asked "what does the market need that current tools DON'T have — so we have selling points unique to us?"
> Lens: B2B companies under $100M revenue (per [b2b-sub-100m-focus.md](./b2b-sub-100m-focus.md))
>
> **This is hypothesis, not validated demand.** All 8 ideas need founder-interview validation before we commit. But all 8 are technically buildable on top of what's already shipped.

---

## Method

I scanned the 13-tool audit ([competitive-research-2026.md § Appendix A](./competitive-research-2026.md)) for gaps no tool fills, then cross-checked with what B2B <$100M founders actually need to ship growth. Filtered for:

1. **Genuinely unmet** — no tool in the audit has this
2. **Critical for B2B <$100M** — fits the segment, not enterprise / not consumer
3. **Buildable in <2000 LOC** — leverages our existing primitives (Brand IQ, vector RAG, AI Employees, Campaign Launcher, GEO)

8 wedges survived. 4 recommended to mix into ship plan now.

---

## The 8 wedges

### Wedge 1 — Customer Brain ⭐ (killer)

**What's missing**: Every tool researches the market (SERP, competitors, AI Overviews). **No tool researches your actual customers** — pulling from Stripe + support tickets + sales call transcripts + NPS responses + product analytics to find content angles based on real customer questions.

**Example**: "80% of customers who churned last month mentioned 'X' in support tickets → generate 3 blog posts handling X, 1 LinkedIn thread, 1 sales-enablement one-pager."

**Why we win**: We already have vector RAG (Block 3), Brand IQ (Block 2), Campaign Launcher (Block 8), lead capture. Add 3-4 OAuth connectors (Stripe, Fireflies/Gong/Otter, Crisp/Intercom, Plausible/Fathom) → flywheel no SEO tool can copy because they don't have CRM/Stripe data, and no CRM tool can copy because they don't have GEO/publish.

**Cross-discipline = moat.**

**Ship cost**: ~1500 LOC.

---

### Wedge 2 — Page-level AI Search Citation Audit ⭐ (quick win)

**What's missing**: Profound, Otterly, Writesonic, Semrush AI Visibility, Rankability AI Tracked Topics — all track **brand mentions** in AI engines. **None show WHICH PAGE on your domain got cited, the exact snippet that was quoted, and why that snippet won.**

**Example**: "ChatGPT cited bap-blockchain.com/blog/enterprise-eth-pos in response to 'best Ethereum scaling layer for fintech' — quoted snippet: [...]. Pages X, Y on your domain are close to being cited — tune Z for higher likelihood."

**Why we win**: We already have GEO tracking (Block 1) + Content Grader (Block 4). Combine → page-level citation audit. Differentiator vs all existing GEO tools.

**Ship cost**: ~600 LOC. Extends Block 1.

---

### Wedge 3 — Sales-objection content engine

**What's missing**: Tools optimize content for SEO traffic. **No tool pulls from sales call transcripts** (Gong/Fireflies/Otter), detects recurring objections, and auto-generates the pages that handle them.

**Example**: "Last 10 sales calls — 7 prospects asked 'how do you compare to Alchemy on cost' → generate `bap-blockchain.com/compare/alchemy` landing page + LinkedIn post + Cassie chatbot response template."

**Why we win**: B2B SaaS workflow that every founder needs and no tool serves. Fireflies/Gong OAuth + LLM objection extraction + Campaign Launcher orchestration.

**Ship cost**: ~1000 LOC.

---

### Wedge 4 — "What did AI ship this week" digest + 1-click rollback ⭐ (quick win — solves trust)

**What's missing**: Every tool auto-publishes but doesn't solve the **founder trust problem**. Solo founder fear #1: "if AI publishes wrong, my brand suffers." Sintra/Jasper have no governance. HubSpot has Audit Cards but it's enterprise-feel.

**Example**: Every Sunday digest: "Cleo published 3 blog posts → here. Soshie scheduled 12 social posts → here. Cassie auto-replied to 47 inbound messages → here. Penn drafted 2 LinkedIn articles → here. [Review all] [Approve all] [Rollback this specific item]."

**Why we win**: This is the trust UX no one ships for the SMB price point. Extension of the Audit Cards idea from Block 7 but founder-grade UX, weekly cadence, one-click rollback per item. Doesn't require outcome billing complexity.

**Ship cost**: ~400 LOC. Slot into Block 5 (Evolution Loop) or as its own mini-block 5.5.

---

### Wedge 5 — Founder thought-leadership ghost-writer (LinkedIn-native)

**What's missing**: Brand IQ extracts COMPANY voice. But founder thought leadership on LinkedIn needs PERSONAL voice. Every tool generates generic LinkedIn content — anyone can tell it's AI.

**Example**: Train on 50 of the founder's past tweets + 30 LinkedIn posts → daily LinkedIn post drafted in their actual voice, with hooks tuned for LinkedIn algorithm, scheduled at optimal time. Engagement insights show which post style wins for that founder specifically.

**Why we win**: Every B2B founder wants to post LinkedIn but doesn't have time. ContentShake has brand voice but not "founder voice" framing or LinkedIn-native distribution. Extends Brand IQ (Block 2) — voice library is already in research-hub-design Phase 2.

**Ship cost**: ~800 LOC.

---

### Wedge 6 — Publish to GitHub README / docs site / Reddit / Hacker News / Dev.to / Indie Hackers

**What's missing**: Every tool publishes to WordPress + social. **For technical B2B SaaS, marketing actually lives in docs.example.com, GitHub README, Reddit r/SaaS, Hacker News, Indie Hackers, Dev.to.** No tool publishes there.

**Why we win**: Niche but it's exactly our segment (technical B2B SaaS founders). GitHub OAuth + Reddit API + HN/Indie Hackers submission helpers. Extension of Campaign Launcher (Block 8).

**Ship cost**: ~700 LOC.

---

### Wedge 7 — Counterfactual / predictive recommendations

**What's missing**: Every analytics tool shows retrospective ("traffic dropped X%"). **No tool predicts** ("if you publish 2 more LinkedIn posts per week, expected revenue +$Y with 80% confidence").

**Why we win**: Requires Evolution Loop (Block 5) to be running for 4-8 weeks to have training data. Once shipped, it's the unique predictive layer no SEO tool offers.

**Ship cost**: ~600 LOC. Has to wait for Block 5 to produce data.

---

### Wedge 8 — Co-marketing partner matcher

**What's missing**: B2B founders want to swap-promote with non-competing SaaS at similar stage. Currently they hunt manually on Twitter/LinkedIn.

**Example**: "Founder X at Stripe-stack SaaS with similar ARR posted yesterday about CTO hiring — auto-draft a swap-promote pitch?"

**Why we win**: Network-effect feature. Buildable with LinkedIn API + ICP matching from our Brand IQ + Market data.

**Ship cost**: ~500 LOC.

---

## Filtered for ship plan

Filtering rubric:

| Wedge | Unique | B2B critical | Build cost | Action |
|---|---|---|---|---|
| 1. Customer Brain | 🟢🟢🟢 | 🟢🟢🟢 | 1500 LOC | **TOP 1 — add as Block 10** |
| 2. Citation Audit | 🟢🟢 | 🟢🟢🟢 | 600 LOC | **TOP 2 — quick win, add as Block 1.5** |
| 3. Sales-objection engine | 🟢🟢🟢 | 🟢🟢🟢 | 1000 LOC | **TOP 3 — add as Block 11** |
| 4. AI digest + rollback | 🟢🟢 | 🟢🟢🟢 | 400 LOC | **TOP 4 — slot into Block 5 or 5.5** |
| 5. Founder ghost-writer | 🟢🟢 | 🟢🟢 | 800 LOC | After Research Hub Phase 2 |
| 6. GitHub/Reddit/HN publish | 🟢🟢🟢 | 🟢 (niche) | 700 LOC | Block 11.5 (optional for SaaS tier) |
| 7. Predictive recs | 🟢🟢 | 🟢🟢 | 600 LOC | After Block 5 has data (3+ months later) |
| 8. Co-marketing matcher | 🟢 | 🟢 | 500 LOC | Optional v2 |

---

## Recommended ship-plan integration

If founder approves, the updated order becomes:

1. **Research Hub Phase 1** (multi-source + provenance) — ~1200 LOC
2. **Wedge 2: Citation Audit** (extend GEO) — ~600 LOC, quick win
3. **B2B persona presets + LinkedIn article API** — ~500 LOC
4. **Block 5: Evolution Loop** + **Wedge 4: Weekly digest + rollback** — ~1500 LOC combined
5. **Wedge 1: Customer Brain** (Block 10) — ~1500 LOC, killer wedge
6. **Research Hub Phase 2** (Voice library + blacklist + sharing) — ~1300 LOC
7. **Wedge 5: Founder ghost-writer** — ~800 LOC
8. **Wedge 3: Sales-objection engine** (Block 11) — ~1000 LOC
9. **Wedge 6: GitHub/Reddit/HN publish** (optional for SaaS tier) — ~700 LOC

Total: ~9100 LOC over 8-10 ship sessions. Drops Block 7 (outcome billing) and shrinks Block 9 (programmatic SEO + studio).

---

## Positioning impact

After these 4 wedges land on top of what's already shipped, the elevator pitch is:

> "1Person is the only AI marketing platform that researches YOUR customers, not the market. Seven named AI employees read your support tickets and sales calls, surface what real buyers ask, draft the blog posts and landing pages that answer them — graded live against the top-10 SERP (Surfer-style, bundled), generate the hero images via Banana and short videos via the in-house video engine, publish to WordPress + LinkedIn + your social channels with one click, track which pages ChatGPT cites you in — and send a Sunday digest of everything AI shipped this week with one-click rollback per item. For B2B founders under $100M, not for enterprises."

The new wedges are **additions** to a platform that already ships:
- **GEO/LLMO tracking** (Block 1) — track ChatGPT / Claude / Perplexity citations
- **Brand IQ** (Block 2) — auto-extract voice + audience + style from URL
- **AI Employees + Vector RAG** (Block 3) — 7 named employees, DM-able
- **Content Grader** (Block 4) — bundled Surfer-style scoring
- **Omnichannel** (Block 6) — FB Messenger inbound (LinkedIn DM next)
- **Image generation** — 4 providers including Banana + Banana Pro
- **Video engine** — script + scene pipeline + asset-gen
- **Campaign Launcher** (Block 8) — 1-keyword → blog + hero image + WP + LinkedIn + GEO seed
- **Gamification** — Growth Score, Daily Missions, Streaks

That's the positioning no competitor can copy without rebuilding their stack.

---

## Validation needed before commit

These 8 wedges are MY hypothesis after the audit + general B2B SaaS knowledge. Founder should validate before we burn weeks on them. Suggested validation steps:

1. Talk to 5-10 B2B founders <$100M about each wedge — would they pay?
2. Specifically validate Wedge 1 (Customer Brain) — is the connector burden acceptable? (Stripe + Fireflies + Crisp = serious OAuth lifts)
3. Check: any of these already exist as a feature in a tool not in our 13-tool audit? (e.g. Common Room, Apollo.io, Salesloft, Gong itself)

If founder skips validation and ships anyway, that's a calculated bet — the technical risk is low, the demand risk is the unknown.

---

## Open questions for founder

1. Approve the re-ordered ship plan above?
2. Validation before ship? (Recommend yes for Wedge 1; rest are lower-risk.)
3. Customer Brain (Wedge 1) requires multiple OAuth connectors — confirm we go down this rabbit hole?
4. Drop Block 7 (outcome billing) for Wedge 4 (weekly digest + rollback) — replacing complex pricing with simpler trust mechanism?
5. Block 9 — drop programmatic SEO + Studio; keep B2B Playbook Templates only (per [b2b-sub-100m-focus.md](./b2b-sub-100m-focus.md))?
