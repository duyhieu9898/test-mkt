# 09 — Pricing & Credit System

> How 1Person charges users. The short version:
> **Subscription unlocks the system; Credits power every action;
> Quality tiers let users trade cost vs quality like Genspark.**
>
> Last updated: 2026-04-09.
> Status: Design doc. Implementation in Phase A (schema + admin UI)
> and Phase B (credit deduction + user-facing balance).

---

## 1. Core principles (non-negotiable)

1. **Everything is a credit.** Not "SEO tool $X, Banner tool $Y" —
   every action in the platform costs credits. This scales to any
   future feature without price-page rewrites.
2. **Admin controls all pricing from one screen.** No redeploy, no
   code changes. The `/admin/llm-config` screen (extended) is the
   pricing dashboard.
3. **Cost of goods is mostly fixed.** Our primary LLM is self-hosted
   (vLLM / Ollama). Cloud LLMs are optional add-ons priced higher.
4. **Quality is a user choice.** Like Genspark: user picks Fast /
   Balanced / Premium per run, cost scales 1x / 3x / 8x.
5. **User never sees raw dollars inside the product.** Credits only.
   Credits convert to $ only at purchase and top-up time.

---

## 2. Pricing tiers (subscription)

Built for non-tech founders in SEA with distinct needs.

| Plan | Monthly | Yearly (-20%) | Credits/mo | Seats | Target |
|---|---|---|---|---|---|
| **Free** | $0 | — | 100 | 1 | Trial / hobby |
| **Pro** | $29 | $279 | 500 | 1 | Solopreneur, freelancer |
| **Team** | $99 | $950 | 2,000 | 5 | Small marketing team |
| **Business** | $299 | $2,870 | 8,000 | 15 | Agency / growing co |
| **Enterprise** | custom | custom | custom | unlimited | On-prem, SLA, custom models |

**Rules:**
- Credits **roll over 1 month** (use-it-or-lose-it after 2 months)
- Pro and above = Bring-Your-Own-Key discount: **30% off credit costs**
  when using a BYO OpenAI/Anthropic key (since we don't pay the API bill)
- Team = shared credit pool across seats
- Business = Private Cloud deployment mode unlocked
- Enterprise = On-Premise + custom LLM training + white-label

**Why these numbers:**
- **$29 Pro** matches typical SaaS entry-point (Notion AI $10, Copy.ai
  $36, Jasper $39). Low enough for solo buyers to self-serve.
- **$99 Team** 3.4x Pro is the standard team markup.
- **$299 Business** hits the "agency budget" band where 3+ customer
  campaigns pay it back in a month.

---

## 3. Credit pricing table (what each action costs)

Every code path that calls an LLM or external API passes a
`featureKey`. The admin UI maps `featureKey` → `{ provider, model,
temperature, maxTokens, creditCost, qualityTiers }`. The credit cost
shown below is the **balanced tier** default. Fast = 1/3, Premium = 3x.

### Content generation
| Feature | Fast | Balanced | Premium |
|---|---|---|---|
| `campaign_social_post` | 1 | 3 | 10 |
| `campaign_banner_copy` | 1 | 3 | 10 |
| `seo_content` (1 article) | 3 | 8 | 25 |
| `chatbot` (per answer) | 0.3 | 1 | 3 |
| `brain_autoextract` | 1 | 3 | 10 |

### Creative generation
| Feature | Fast | Balanced | Premium |
|---|---|---|---|
| `banner_image` (AI image) | 5 | 15 | 40 |
| `banner_image` (Banana.dev custom) | — | 40 | 100 |
| `video_short` (15s) | 20 | 60 | 200 |

### Agent / automation
| Feature | Fast | Balanced | Premium |
|---|---|---|---|
| `campaign_generate` (full) | 20 | 50 | 150 |
| `campaign_launch` (Meta publish) | 10 | 10 | 10 |
| `auto_funnel` (LP + ads + email) | 100 | 250 | 600 |

### Data / tracking
| Feature | Cost |
|---|---|
| `website_crawl` | 3 |
| `track_campaign` (daily refresh) | 1 |
| `insight_report` (AI analysis) | 8 |
| `view_dashboard` | **free** |
| `view_history` | **free** |
| `export_data` | **free** |

### Rule of thumb: free vs credit

**Free** (retention + stickiness):
- View dashboards, history, audit log
- Read Business Brain
- Manage settings
- Data export

**Credit** (monetization):
- Any LLM call
- Any image generation
- Any external API call that costs us money
- Any agent run
- Any data refresh (Meta Insights, GSC)

---

## 4. Credit pack top-ups (high-margin upsell)

| Pack | Credits | Price | $/credit |
|---|---|---|---|
| Small | 500 | $10 | $0.020 |
| Medium | 2,000 | $30 | $0.015 |
| Large | 10,000 | $99 | $0.0099 |
| Bulk | 50,000 | $399 | $0.0080 |

- Top-ups **never expire**
- Top-ups used before monthly allocation (so the monthly refill is the
  "budget" and top-up is the reserve)
- Margin on top-ups is ~60% after cloud LLM costs because most calls
  route to self-hosted models

---

## 5. Quality tier picker (the Genspark pattern)

Every time a user triggers an action that would cost more than 1
credit, the UI shows a **tier picker**:

```
┌────────────────────────────────────────┐
│ How fancy? Credits vary by quality.   │
├────────────────────────────────────────┤
│  ⚡ Fast        1 credit   ← selected  │
│     Quick draft — good enough          │
│                                        │
│  ⭐ Balanced    3 credits               │
│     Standard quality (recommended)     │
│                                        │
│  💎 Premium     10 credits              │
│     Best model — slower, more credits  │
└────────────────────────────────────────┘
```

**Technical mapping (controlled by admin):**

Each feature in `trustai_system_configs` (category=`feature`) has a
`tiers` array:

```json
{
  "tiers": [
    {
      "name": "fast",
      "provider": "ollama",
      "model": "llama3.2",
      "creditCost": 1,
      "label": "Fast",
      "description": "Quick draft — good enough"
    },
    {
      "name": "balanced",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "creditCost": 3,
      "label": "Balanced",
      "description": "Standard quality (recommended)"
    },
    {
      "name": "premium",
      "provider": "anthropic",
      "model": "claude-opus-4-6",
      "creditCost": 10,
      "label": "Premium",
      "description": "Best model — slower, more credits"
    }
  ],
  "defaultTier": "balanced",
  "temperature": 0.7,
  "maxTokens": 2048
}
```

Admin can reassign any tier to any provider/model combo without
touching code. Turn Fast off during rate-limit incidents, raise
Premium cost during peak, etc.

---

## 6. Schema (Phase A — to implement)

### Extend `trustai_system_configs` feature rows
Already implemented in Phase A. The `value` jsonb gains a `tiers`
array field. Seed data migrates legacy `provider`/`model` to a single
`balanced` tier.

### New table `trustai_credit_balances`
```sql
CREATE TABLE trustai_credit_balances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES trustai_tenants(id) ON DELETE CASCADE,
  plan              varchar(30) NOT NULL DEFAULT 'free',  -- free|pro|team|business|enterprise
  monthly_grant     integer NOT NULL DEFAULT 100,
  current_balance   integer NOT NULL DEFAULT 100,
  topup_balance     integer NOT NULL DEFAULT 0,
  billing_period_start  timestamp NOT NULL DEFAULT now(),
  billing_period_end    timestamp NOT NULL,
  byo_key_discount  boolean NOT NULL DEFAULT false,
  updated_at        timestamp NOT NULL DEFAULT now(),
  created_at        timestamp NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);
```

### New table `trustai_credit_transactions`
Append-only, used for billing audit + "Why did I run out?" analysis.
```sql
CREATE TABLE trustai_credit_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES trustai_tenants(id) ON DELETE CASCADE,
  kind          varchar(20) NOT NULL,    -- 'debit' | 'credit' | 'grant' | 'topup' | 'refund'
  amount        integer NOT NULL,         -- positive for credit, negative for debit
  balance_after integer NOT NULL,
  feature_key   varchar(100),             -- e.g. 'campaign_banner_copy'
  tier          varchar(20),              -- fast|balanced|premium
  ref_kind      varchar(30),              -- 'llm_call' | 'image_gen' | 'stripe_topup' | 'monthly_grant'
  ref_id        uuid,                     -- trace id, campaign id, stripe session id, etc
  actor         varchar(255),
  note          text,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX trustai_credit_tx_tenant_idx ON trustai_credit_transactions(tenant_id, created_at DESC);
```

### New table `trustai_credit_plans` (admin-managed)
```sql
CREATE TABLE trustai_credit_plans (
  key               varchar(30) PRIMARY KEY,   -- 'free' | 'pro' | 'team' | 'business' | 'enterprise'
  label             varchar(100) NOT NULL,
  monthly_price_cents  integer NOT NULL,
  yearly_price_cents   integer NOT NULL,
  monthly_grant     integer NOT NULL,
  rollover_months   integer NOT NULL DEFAULT 1,
  seats             integer NOT NULL DEFAULT 1,
  byo_key_discount_pct  integer NOT NULL DEFAULT 0,
  features          jsonb NOT NULL DEFAULT '[]',  -- bullet list for pricing page
  stripe_price_id_monthly  varchar(100),
  stripe_price_id_yearly   varchar(100),
  enabled           boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0
);
```

---

## 7. Admin LLM Config screen — extensions (Phase A)

The existing `/admin/llm-config` page adds:

### Per-feature row (current):
```
Feature          | Provider   | Model          | Temp | Tokens | Status | Actions
Banner Copy      | openai     | gpt-4o-mini    | 0.8  | 1000   | [on]   | [edit]
```

### Per-feature row (new):
```
Feature          | Tiers (click to edit)                  | Default | Cost   | Status
Banner Copy      | ⚡Fast  ⭐Bal  💎Premium                 | Bal     | 3 cr   | [on]
                 | ollama  openai  claude                   |
                 | llama3  4omini  opus                     |
                 | 1cr     3cr     10cr                     |
```

Click any tier chip → popover with full dropdowns. The edit dialog
now has 3 tab sections (Fast / Balanced / Premium) instead of a single
provider/model pair.

### New provider card field
Each provider card adds a **"Credit multiplier"** number field
(default 1.0). Operators use it to scale credit cost up/down per
provider without touching individual feature rows. Useful for
penalizing expensive providers or rewarding self-hosted.

### New top-level cards

In addition to the LLM provider cards, a second row of cards for
**image generation providers** (Gemini Imagen, DALL-E, Banana.dev)
with the same "click to edit key / test / credit cost" pattern.

### Fourth row: **integrations** (Stripe, Google OAuth, Meta Ads,
Sentry, Langfuse) with their own status + connection test.

---

## 8. User-facing UI (Phase B — next turn)

### Header credit balance badge
```
┌────────────────────────────────────┐
│ 1Person  Campaigns  Brain   [💎 1,842 credits]  [⚙]  [👤] │
└────────────────────────────────────┘
```
Click → popover with:
- Current balance
- Monthly grant / used / remaining
- "Top up" button
- "Upgrade plan" link

### Action button credit cost
Every primary action button shows estimated cost:
```
[ Generate Campaign • 50 credits ]
```
And the tier picker appears on click for high-cost actions.

### Low balance warning
When balance < 10% of monthly grant:
- Yellow toast: "You're running low — top up or upgrade"
- CTA to `/pricing`

### Out of credits
When balance = 0:
- Red modal: "You're out of credits"
- Options: Top-up pack / Upgrade plan / Wait for monthly reset (shows countdown)

---

## 9. Credit deduction flow (Phase B)

Every call path:

```typescript
// 1. Pre-check
const feature = await resolveFeature('campaign_banner_copy', tier);
const canAfford = await ai.credits.canCharge(tenantId, feature.creditCost);
if (!canAfford) {
  throw new HTTPException(402, { message: 'Out of credits — top up or upgrade' });
}

// 2. Execute
const result = await llmGenerate(messages, { featureKey, tier });

// 3. Post-charge (only on success)
await ai.credits.charge(tenantId, {
  amount: feature.creditCost,
  featureKey: 'campaign_banner_copy',
  tier,
  refKind: 'llm_call',
  refId: result.traceId,
});
```

**Failure handling:**
- If LLM call fails before output → no charge
- If LLM call partially succeeds → charge fraction based on tokens
- If 402 thrown mid-flow → caller decides whether to refund (e.g.
  campaign generator refunds unused steps)

---

## 10. BYO-key discount math

Pro+ subscribers who add their own OpenAI/Anthropic key in
`/admin/llm-config` (or via the per-tenant deployment mode screen)
get a **30% discount on credit costs** for any call that uses their
key. The logic:

```typescript
const feature = await resolveFeature(featureKey, tier);
const byoKey = await ai.deployment.getByoKey(tenantId, feature.provider);
const useByo = !!byoKey;

let actualCost = feature.creditCost;
if (useByo && tenant.plan !== 'free') {
  actualCost = Math.ceil(actualCost * 0.7);
}
```

**Why:** we don't pay the API bill when they use their key, so we
share the savings. It also incentivizes BYO which reduces our egress
and validates the "your key, your data" positioning.

---

## 11. Enterprise / On-Premise pricing

Separate economics because they run on their own hardware:

| Item | Pricing |
|---|---|
| Base license | $1,500/mo minimum |
| Per-seat | $15/mo (after first 10) |
| Dedicated setup | $5,000 one-time |
| Custom model fine-tune | $10,000 one-time |
| SLA (99.9%) | +$500/mo |
| On-call support | +$1,500/mo |

No credits — unlimited usage on their own compute. We charge for:
- Software license
- Ongoing updates + security patches
- Support + SLA

---

## 12. Metrics to watch (post-launch)

| Metric | Target |
|---|---|
| Signup → Free trial activation | >60% |
| Free → Pro conversion (30 days) | >8% |
| Monthly credit utilization (Pro) | 60-80% |
| Top-up purchase rate | >15% of active Pro users |
| Tier picker "Premium" usage | 10-20% |
| Churn (Pro, monthly) | <5% |
| ARPU (Pro) | $35+ (with top-ups) |

---

## 13. Implementation phases

| Phase | What | Status |
|---|---|---|
| **A** (this turn) | Doc, schema ext (tiers field), admin UI edit for tiers+creditCost | 🟡 in progress |
| **B** (next turn) | Credit balance tables + transactions, deduction in llmGenerate, header badge, tier picker UI, 402 handling | pending |
| **C** | Stripe credit packs, plan upgrade flow, monthly grant cron, rollover logic | pending |
| **D** | Admin credit monitoring dashboard, alerts for whale tenants + abuse detection | pending |
| **E** | Enterprise sales flow, custom plan management UI, invoice generation | pending |

---

## 14. Open questions

1. **Rollover rule**: unused credits expire after 1 month? 2 months?
   Forever for paid? Decision: **1 month rollover, then expire**. Keeps
   the monthly economics clean.
2. **Free tier abuse**: 100 credits/mo too generous? Decision: start
   generous, tune down with data. Add email verification + IP-based
   rate limiting as guardrails.
3. **Fractional credits**: chatbot cost is 0.3 — integer or decimal?
   Decision: **use millicredits internally** (1 credit = 1000
   millicredits), display as integers to users.
4. **Team credit pool shared or per-seat?** Decision: **shared pool**
   for simplicity. Per-seat adds admin overhead.
5. **Overdraft**: let pro+ users go negative up to 100 credits and
   bill next month? Decision: **no overdraft for v1** — clean
   psychology, force upgrade or top-up decision.
