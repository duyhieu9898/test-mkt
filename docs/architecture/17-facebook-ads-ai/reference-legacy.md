# Archived legacy handoff — not authoritative

> This historical file is retained for lookup only. Use the focused documents
> in [the Facebook Ads AI index](./README.md) for current decisions; they win
> whenever this archive differs.

# Facebook Ads AI Optimization — Final Product & Implementation Handoff

> Tài liệu này là bản tổng hợp cuối cùng của toàn bộ quyết định đã chốt về feature **Facebook Ads AI Optimization** để agent CLI tiếp tục triển khai trên **repo hiện có**.
>
> Mục tiêu của tài liệu là mô tả **product intent, UX flow, Meta integration assumptions, AI/skill logic, recommendation flow, approval flow, measurement loop và MVP boundary**.
>
> Agent CLI cần **inspect repo hiện tại trước**, sau đó tích hợp feature này theo conventions, framework, database, auth, UI system và AI stack đang có (đặc biệt là package `@1person/core`, Drizzle ORM tại `packages/core/src/db/schema/ads.ts`, `adsEngine` tại `apps/api/src/services/ads-engine.ts`, và `adsRouter` tại `apps/api/src/routes/ads.ts`). Không tạo một app song song và không refactor rộng ngoài phạm vi cần thiết.
>
> **Implementation gate:** không được bắt đầu Milestone A cho đến khi hoàn tất Milestone 0 (§48). Repo hiện tại chưa có ad-account discovery hoặc ad-token encryption. Các khả năng đó phải được xây và test trước, không được giả định là đã có.
>
> **MVP scope decision (approved):** V1 is an **AI performance analyst + media-buyer copilot**. It connects existing Meta Ads, syncs and explains performance, then produces evidence-backed recommendations. V1 does **not** generate/upload creative assets, create ad variations, or mutate Meta budgets, status, copy, or creative. Users record a recommendation as saved, rejected, or manually handled outside 1Person. The mutation, creative-draft, and before/after measurement material below is **Phase 2+ only** and must not expand the V1 implementation.

---

# 1. Product Definition

Feature cần xây:

> **Facebook Ads AI Optimization** cho phép doanh nghiệp kết nối Facebook Ads hiện có, xem campaign/ad set/ad/creative cùng metrics, dùng AI để phát hiện vấn đề và giải thích nguyên nhân, rồi đưa ra đề xuất để user tự quyết định hành động.

Core value:

```text
Không chỉ:
"Đây là số liệu Facebook Ads"

Mà phải trả lời:
1. Ads nào đang có vấn đề?
2. Vấn đề là gì?
3. Vì sao hệ thống nghĩ như vậy?
4. Nên thay đổi gì?
5. User nên xử lý việc này thế nào?
6. User đã lưu, từ chối hay tự xử lý recommendation?
```

North-star loop:

```text
Observe → Understand → Recommend → User decides / acts manually → Record disposition
```

---

# 2. Current Meta Test Assets & Environment Setup

Hiện có một "khách hàng giả lập" dùng cho development.

```text
Facebook Page ID:
1334266003093993

Facebook Ad Account ID:
266601327407628

Graph Ad Account ID:
act_266601327407628

Business Portfolio:
Không sử dụng / hiện không tạo được

business_id:
nullable / optional
```

Meta Developer App & Repo Configuration:

```text
Cấu hình OAuth hiện có trong file .env:
FACEBOOK_APP_ID=<from .env>
FACEBOOK_APP_SECRET=<secret — NEVER commit to docs or code>

Chi tiết cấp quyền & console setup:
Xem docs/guides/oauth-provider-console-setup.md

Use case:
"Tạo và quản lý quảng cáo bằng API Marketing"
Marketing API
```

> ⚠️ **Secret đã lộ trong phiên bản trước của tài liệu này. Rotate `FACEBOOK_APP_SECRET` trong Meta Developer Dashboard ngay.**

Không dùng use case quảng cáo mobile app bằng Ads Manager.

---

# 3. Meta Architecture Decision

## 3.1 Customer owns advertising assets

Target model:

```text
Customer Facebook User
        ↓
Customer Page / Ad Account
        ↓
Authorize SaaS
        ↓
SaaS
        ↓
Read / Analyze / Recommend
        ↓
User decides and acts manually
```

Khách hàng vẫn sở hữu:

- Facebook account
- Page
- Ad Account
- Business Portfolio nếu họ có
- Pixel / Dataset
- Instagram asset
- payment method
- campaign spend
- advertising history

SaaS chỉ được cấp quyền.

---

## 3.2 Business Portfolio is NOT required by UX

Application không được có logic kiểu:

```ts
if (!businessId) {
  throw new Error("Business required")
}
```

Sai.

Đúng:

```text
Meta Connection
   ├── business_id      optional
   ├── Page             optional / operation-specific
   └── Ad Account       required cho Ads operations
```

User-facing UX không hỏi:

```text
Business Manager ID
Business Portfolio ID
Meta App ID
Access Token
Graph API ID
```

UX chỉ cần:

```text
Connect Facebook
      ↓
Discover Assets
      ↓
Select Page
      ↓
Select Ad Account
```

---

# 4. Production Constraint

SaaS có thể được phát triển và deploy mà chưa có Meta Business Portfolio của chính SaaS.

Development hiện tại có thể tiến hành với:

```text
Meta Developer App
Development mode
Current Facebook user
Current Page
Current Ad Account
```

Tuy nhiên, khi một Meta App trung tâm của SaaS muốn cho **arbitrary external customers** authorize và sử dụng `ads_read` / `ads_management`, phía Meta có thể yêu cầu:

```text
Advanced Access
App Review
Business Verification
Tech Provider / access verification
```

Điểm quan trọng:

> Business Portfolio của khách không thay thế verification của Meta App/platform.

Không tìm cách bypass bằng:

```text
cookie scraping
browser automation
unofficial API
mua BM
mua tài khoản
shared password
manual stolen token
```

Use official Meta APIs only.

---

# 5. Current Permission Intent

MVP / development cần tối thiểu:

```text
ads_read
```

`read_insights` chỉ thêm khi Meta yêu cầu cho endpoint Insights đã dùng và phải được ghi rõ trong submission. `ads_management` và Page scopes không thuộc read-only MVP. Không xin `business_management` mặc định. Luồng Ads OAuth phải dùng scope riêng theo capability, không dùng lại scope rộng của social publishing.

Có thể cần thêm nếu operation Page cụ thể yêu cầu:

```text
pages_manage_ads
```

Nguyên tắc:

> Chỉ xin permission khi feature thực sự cần.

Không cần mặc định ở MVP:

```text
business_management
instagram_*
leads_retrieval
pages_manage_posts
```

---

# 6. UX Reference / Mockup Summary

Mockup đã thống nhất flow:

```text
1. Campaigns — Before Connect
2. Connect Facebook
3. Facebook Permission
4. Select Page + Ad Account
5. Connected Successfully
6. Campaign Overview
7. Campaign Detail
8. AI Analysis
9. AI Recommendations
10. Review Replace Creative
11. Review Improve Copy
12. Review Optimize Budget
13. Review Summary
14. Approve
15. Apply
16. Success
17. Track & Learn (Phase 2+)
```

Tinh thần UX tham khảo các product như:

```text
Madgicx
Bïrch
Smartly
```

Pattern chung:

```text
Connect
→ Observe
→ Analyze
→ Recommend
→ Human Approve
→ Apply
→ Measure
```

Không clone UI của họ; chỉ học interaction model.

---

# 7. Final User Journey

## 7.1 Before Connect

User vào:

```text
Campaigns
```

Nếu Meta chưa connect:

```text
Facebook not connected

[ Connect Facebook ]
```

Có thể giải thích:

```text
Connect Facebook to:
✓ sync campaign performance
✓ analyze ads with AI
✓ detect issues
✓ receive optimization recommendations
✓ decide what to do next with clear evidence
```

Không tạo cảm giác app tự ý chỉnh ads.

---

## 7.2 Connect Facebook

Click:

```text
[ Continue with Facebook ]
```

Flow:

```text
Facebook OAuth
      ↓
Authorize
      ↓
Discover accessible Pages and Ad Accounts
```

Không nhập ID thủ công.

---

## 7.3 Select Assets

MVP:

```text
Select one Page
Select one Ad Account
```

### Asset-discovery contract — REQUIRED

`Page` và `Ad Account` là hai asset riêng; không được lưu Page ID vào
`ad_connections.platformAccountId` hoặc suy ra Ad Account từ Page đầu tiên.

Sau OAuth, backend phải lấy và trả về một asset-picker payload tối thiểu:

```ts
type MetaConnectableAssets = {
  pages: Array<{ id: string; name: string; tasks?: string[] }>;
  adAccounts: Array<{
    id: string;                 // canonical Graph ID, e.g. act_123
    accountId: string;          // numeric ID where Meta returns it
    name: string;
    currency?: string;
    timezoneName?: string;
    status?: string;
    capabilities?: { read: boolean; manage: boolean };
  }>;
};
```

The user explicitly selects an accessible Ad Account. Store its numeric
`accountId` separately from the optional selected Page ID; normalize to the
Graph `act_<accountId>` form exactly once at the Meta-provider boundary so
`act_act_123` can never be constructed. A Page is
required only for operations whose creative/object configuration requires one.

UI:

```text
Facebook Page
[ ... ]

Facebook Ad Account
[ ... ]

[ Connect ]
```

Multi-account có thể để sau.

---

## 7.4 Initial Sync

Sau connect:

```text
Connected Successfully
```

Sync ngầm:

```text
✓ Page
✓ Ad Account
✓ Campaigns
✓ Ad Sets
✓ Ads
✓ Creative metadata
✓ Insights
```

UI nên có:

```text
Syncing Facebook data...
```

Không chuyển user sang dashboard rỗng mà không giải thích.

---

# 8. Campaign Overview

Mục tiêu:

> User nhìn nhanh campaign nào đang tốt, campaign nào cần chú ý.

Primary columns:

```text
Campaign
Status
Spend
Results
Cost / Result
ROAS
AI Status
```

Optional/custom columns:

```text
Budget
Reach
Impressions
Frequency
CTR
CPC
CPM
CPA
```

AI Status:

```text
NOT_ANALYZED
GOOD
WATCH
NEEDS_ATTENTION
PAUSED
```

`NOT_ANALYZED`: campaign chưa được AI phân tích (mới sync, chưa có analysis). Phân biệt rõ với `GOOD`.

Không nhét tất cả metrics lên table mặc định.

---

# 9. Objective-Aware Metrics

Không dùng cùng KPI cho mọi campaign.

## SALES

Primary:

```text
Purchases
Revenue
ROAS
CPA
Spend
```

Secondary:

```text
CTR
CPC
CPM
CVR
Frequency
```

## LEADS

Primary:

```text
Leads
CPL
Spend
Conversion Rate
```

## TRAFFIC

Primary:

```text
Landing Page Views
Clicks
CTR
CPC
Spend
```

## MESSAGES

Primary:

```text
Conversations
Cost / Conversation
Spend
```

Nếu metric không tồn tại:

```text
—
N/A
```

Không fabricate.

## Results Mapping Rule

Meta Insights trả nhiều `action_type`. Agent **không được** lấy bừa action đầu tiên rồi gọi là `Results`. Mapping bắt buộc:

```text
SALES    → configured purchase/conversion action (e.g. offsite_conversion.fb_pixel_purchase)
LEADS    → lead action (e.g. onsite_conversion.lead_grouped)
TRAFFIC  → landing_page_view hoặc configured traffic result
MESSAGES → onsite_conversion.messaging_conversation_started_7d
```

Nếu không map được action type cho objective hiện tại thì `Results = N/A`, không đoán.

---

# 10. Campaign Detail

User click Campaign.

Detail hierarchy:

```text
Campaign
   ↓
Ad Sets
   ↓
Ads
   ↓
Creatives
```

Suggested tabs:

```text
Overview
Ads
Ad Sets
Creatives
Placements
AI Analysis
```

Quan trọng:

> Không kết luận toàn campaign nếu vấn đề thật sự nằm ở 1 Ad / Creative.

Ví dụ:

```text
Campaign ROAS = 2.1

Ad #1 ROAS = 5.8
Ad #2 ROAS = 3.4
Ad #3 ROAS = 0.4
```

AI nên nói:

```text
"Campaign underperformance is mainly driven by Ad #3"
```

không mặc định:

```text
"Pause Campaign"
```

---

# 11. Data to Sync

Entity hierarchy:

```text
Ad Account
  ↓
Campaign
  ↓
Ad Set
  ↓
Ad
  ↓
Creative
```

Minimum normalized fields:

## Ad Account

```text
id
account_id
name
currency
timezone
status
```

The selected Ad Account's `currency` and `timezone` are required for display,
window boundaries, and metric comparison. Never interpret Meta day boundaries
in server time.

## Campaign

```text
id
name
objective
status
effective_status
created_time
updated_time
```

## Ad Set

```text
id
campaign_id
name
status
budget
optimization_goal
targeting summary if useful
```

## Ad

```text
id
campaign_id
adset_id
name
status
creative_id
```

## Creative

Khi có thể:

```text
creative id
image / thumbnail
video
primary text
headline
description
CTA
destination URL
Page identity
```

## Metrics

Normalize:

```text
date
budget
spend
results

impressions
reach
frequency

clicks
ctr
cpc
cpm

conversions
revenue
cpa
roas
```

### Sync data contract — REQUIRED

Persist raw Meta insight payloads alongside normalized metrics. Define and test
the data grain explicitly: daily insights at campaign, ad set, and ad level;
creative is joined through its ad rather than treated as an independently
measured object. Each fetch stores the requested fields, date range, level,
breakdown, account timezone, attribution setting, and fetch timestamp.

The objective-to-`action_type` mapping is application code with fixture tests,
not an LLM decision. Unsupported or absent action types yield `N/A` plus a
machine-readable reason. Do not silently fall back to a generic conversion
count.

---

# 12. AI Strategy — FINAL DECISION

MVP **không xây AI system quá phức tạp**.

Không cần:

```text
custom ML model
industry benchmark engine
5 AI agents
complex statistical pipeline
```

Core flow:

```text
Meta Ads Data
      ↓
Product Marketing Context
      ↓
ads skill
      ↓
GOOD / WATCH / NEEDS_ATTENTION
      ↓
Nếu vấn đề liên quan creative
      ↓
ad-creative skill
      ↓
Recommendation
      ↓
Change Set
      ↓
User Approve
      ↓
Apply
```

---

# 13. Marketing Skill Repository Integration

Sử dụng / adapt knowledge từ package `@1person/core`:

```text
packages/core/src/knowledge/marketing-skills/
```

Mục đích:

> Dùng làm marketing knowledge / skill layer (Corey Haines MIT) thông qua helper `renderSkillKnowledge()` trong `@1person/core`.

Core skills cho MVP:

```text
1. product-marketing  (renderSkillKnowledge('product-marketing'))
2. ads                (renderSkillKnowledge('ads'))
3. ad-creative        (renderSkillKnowledge('ad-creative'))
```

Optional / on-demand:

```text
analytics
attribution
```

---

# 13b. LLM Invocation & Skill Resolution

## 1. Vị trí lưu trữ Marketing Skills trong repo

- **Folder Markdown nguồn:** `packages/core/src/knowledge/marketing-skills/<skill-name>/SKILL.md`
- **Tệp Codegen TypeScript:** `packages/core/src/knowledge/skill-knowledge.generated.ts`
- **Helper Function:**
  ```typescript
  import { renderSkillKnowledge } from '@1person/core';
  const adsSkillPrompt = renderSkillKnowledge('ads');
  const adCreativeSkillPrompt = renderSkillKnowledge('ad-creative');
  const productMarketingPrompt = renderSkillKnowledge('product-marketing');
  ```

## 2. Cách gọi LLM — use the existing provider-agnostic router

Không khởi tạo OpenAI/Anthropic client riêng trong Ads feature và không hard-code
`OPENAI_API_KEY` hay model. Dùng `llmGenerate()` tại `apps/api/src/lib/llm.ts`
với một feature key mới, ví dụ `facebook_ads_analysis` và
`facebook_ads_creative`. Cách này giữ được admin model mapping, credit cost,
Langfuse trace và fallback provider của sản phẩm.

```typescript
import { llmGenerate } from '../lib/llm';
import { renderSkillKnowledge } from '@1person/core';

const response = await llmGenerate(
  [
    { role: 'system', content: adsSystemPrompt },
    { role: 'user', content: JSON.stringify(contextData) },
  ],
  {
    featureKey: 'facebook_ads_analysis',
    json: true,
    traceName: 'facebook-ads.analysis',
    metadata: { companyId, campaignId, analysisVersion },
  },
);
```

Validate parsed output with Zod before persisting it. An invalid enum, missing
evidence, or a proposed mutation outside the supported action set is a failed
analysis, not a value to display or apply.

## 3. `renderSkillKnowledge()` ≠ Business Context

`renderSkillKnowledge('ads')` chỉ trả về **skill instructions** (framework/playbook chung). Nó **KHÔNG** chứa context thực tế của khách hàng.

Mỗi lần gọi LLM, phải assemble đầy đủ:

```text
skill instructions          ← renderSkillKnowledge('ads')
+ Brand IQ của company       ← packages/core/src/db/schema/brand-iq.ts
+ campaign objective/targets  ← adCampaigns table
+ current metrics (14d)       ← adPerformance table
+ previous metrics (14d)      ← adPerformance table
+ campaign/ad/creative context ← ads, adSets tables
```

`product-marketing` skill là knowledge về **cách sử dụng** context. **Brand IQ mới là context thực tế** của customer. Không nhầm lẫn hai thứ này.

---

# 14. `product-marketing` Skill

Vai trò:

> Shared marketing context cho từng doanh nghiệp.

Thông tin context:

```text
Product
Offer
ICP
Audience
Pain points
Use cases
Differentiation
Customer language
Brand voice
Proof points
Goals
Primary conversion
Target CPA / ROAS nếu có
```

Conceptually tương đương:

```text
Company Marketing Profile / Brand IQ (đã có trong schema brand-iq.ts)
```

Ví dụ:

```text
Product:
English course for kids

Audience:
Parents with children 6–12

Pain:
Child is afraid to speak English

Offer:
Free trial

Brand Voice:
Friendly / educational

Target CPL:
200,000 VND
```

Shared context này được dùng bởi `ads` và `ad-creative`.

Tái sử dụng Brand IQ context hiện có trong `packages/core/src/db/schema/brand-iq.ts`, không tạo duplicate structure.

---

# 15. `ads` Skill

Đây là skill chính để đánh giá Campaign / Ad performance.

Input concept:

```text
Campaign objective
Target CPA / ROAS nếu có
Budget
Offer
Audience context
Current metrics
Historical metrics
Campaign / Ad Set / Ad hierarchy
```

Ví dụ:

```text
Campaign:
Summer English Campaign

Objective:
Leads

Target CPL:
200K

Last 14 days:
Spend       5.2M
Leads       17
CPL         306K
CTR         0.82%
CPC         9.8K
CPM         81K
Frequency   4.3

Previous 14 days:
CPL         190K
CTR         1.31%
Frequency   2.6
```

Expected structured result:

```text
Status:
NEEDS_ATTENTION

Problem:
Lead cost increased significantly

Evidence:
CPL 190K → 306K
CTR 1.31% → 0.82%
Frequency 2.6 → 4.3

Possible Cause:
Creative fatigue

Priority:
HIGH

Suggested Action:
Refresh creative
```

---

# 16. Meta Decision Knowledge

Trong `ads` skill có Meta-specific playbook / decision system dùng cho các quyết định:

```text
kill
keep
scale
fatigue
testing
budget progression
```

Quan trọng:

> Không copy mọi threshold cứng sang mọi loại business.

Một số playbook Meta trong repository có định hướng B2B / TCPL.

Vì vậy:

```text
B2B Lead Gen
→ dùng rất sát

Ecommerce Sales
→ dùng principles + target ROAS/CPA
→ không bê nguyên TCPL logic
```

Nguyên tắc MVP:

```text
Objective
+
User target
+
Current performance
+
Historical performance
```

là đủ để đưa ra đánh giá.

---

# 17. `ad-creative` Skill

Dùng khi AI analysis cho rằng vấn đề có liên quan đến:

```text
creative
hook
headline
primary text
CTA
message
angle
visual
video concept
```

Skill này làm:

```text
Pull performance data
      ↓
Identify winning / losing creative patterns
      ↓
Generate new variations
      ↓
Validate
      ↓
Proposal
```

Input:

```text
Current creative
Current copy
Headline
CTA
Performance data
Product context
Audience context
Winning historical creatives
```

Output:

```text
Suggested creative
Suggested copy
Suggested angle
Suggested hook
```

---

# 18. Grounded Creative Principle

Không cho AI tạo ad creative hoàn toàn thiếu context.

Ưu tiên grounding bằng:

```text
winning ads
historical creatives
customer reviews
comments
brand assets
brand voice
product context
performance history
```

Không invent:

```text
fake testimonials
fake stats
fake claims
fake customer quotes
```

---

# 19. `analytics` Skill

Không nằm trong core loop.

Chỉ dùng khi:

```text
tracking missing
conversion tracking suspect
GA / pixel setup issue
event tracking problem
```

Ví dụ:

```text
"Meta có conversion nhưng app/backend không có"
```

hoặc:

```text
"Không có conversion events"
```

Main ads optimization flow không phải gọi analytics mỗi lần.

---

# 20. `attribution` Skill

Không nằm trong core loop MVP.

Chỉ dùng khi:

```text
Meta says X
Google says Y
GA says Z
CRM says W
```

hoặc khi user cần trả lời:

```text
Channel nào thực sự tạo revenue?
```

Attribution là future / on-demand.

---

# 21. AI Analysis Output

UI không nên render một đoạn chatbot dài.

AI output tối thiểu:

```text
Problem
Evidence
Possible Cause
Priority
Recommended Action
```

Example:

```text
PROBLEM
CTR dropped significantly

EVIDENCE
CTR 1.31% → 0.82%
Frequency 2.6 → 4.3
CPA increased

POSSIBLE CAUSE
Creative fatigue

PRIORITY
HIGH

RECOMMENDATION
Replace or refresh creative
```

Phải phân biệt:

```text
Evidence = facts from data
Possible Cause = AI inference
```

Không nói inference như fact chắc chắn.

---

# 22. AI Analysis vs AI Recommendation

Phải tách hai concept.

## Analysis

Trả lời:

```text
What happened?
Why might it be happening?
How serious is it?
```

## Recommendation

Trả lời:

```text
What should we change?
```

Examples:

```text
KEEP
WATCH
PAUSE
REPLACE_CREATIVE
IMPROVE_COPY
INCREASE_BUDGET
DECREASE_BUDGET
```

---

# 23. Simple Decision Logic

MVP không cần machine learning riêng.

Ví dụ:

```text
ROAS >= target
        ↓
GOOD / KEEP
```

```text
ROAS < target
+ enough spend
        ↓
NEEDS ATTENTION
```

```text
CTR ↓
+ Frequency ↑
        ↓
POSSIBLE CREATIVE FATIGUE
        ↓
Run ad-creative
```

```text
CPA better than target
+ enough conversions
+ stable
        ↓
SCALE CANDIDATE
        ↓
Recommend controlled budget increase
```

AI giải thích và đề xuất; không phải nơi duy nhất tính toán numerical facts.

### Deterministic eligibility gate — REQUIRED

Application code computes all numerical facts before the LLM is called. The LLM
may interpret the evidence, but may not invent, recalculate, or override it.
Every analysis input must include:

```text
objective + primary KPI
account timezone + attribution setting
current 14d aggregate + previous 14d aggregate
target CPA/ROAS (when configured)
minimum-data evaluation result
active overlapping changes
```

Define the minimum-data rule in versioned configuration per objective before
shipping (minimum age, spend, impressions/clicks, and primary conversions where
applicable). Until the rule is met the only permitted status is
`INSUFFICIENT_DATA` / `NOT_ANALYZED`; the system must not recommend pause,
budget change, or scale. The rule and its version are persisted with each
analysis so outcomes remain explainable when thresholds change later.

When no target exists, compare the current and previous windows and account
internal peers only. Do not use an industry benchmark as a hidden source of
truth. Any target CPA/ROAS used by the decision engine must be stored explicitly
in product data; it is not inferred from unstructured Brand IQ text.

---

# 24. Recommendation

Recommendation phải có:

```text
Target
Problem
Reason
Priority
Proposed Change
Current value/content
Suggested value/content
```

Example:

```text
Target:
Ad #123

Action:
Replace Creative

Reason:
CTR down 31%
Frequency increased
CPA deteriorated

Current:
creative_a.jpg

Suggested:
creative_variant_03.jpg
```

---

# 25. Recommendation disposition — MVP

A recommendation never mutates Meta in V1.

```text
AI Recommendation
        ↓
User reads evidence and suggested next step
        ↓
Save / Reject / Mark handled manually
```

Example:

```text
RECOMMENDATION #184
Campaign: Summer Campaign
Problem: Creative fatigue suspected
Evidence: CTR decreased while frequency increased
Suggested next step: Refresh the creative in Meta Ads Manager
Disposition: SAVED | REJECTED | HANDLED_MANUALLY
```

---

# 26. User control — MVP

```text
AI detects → AI recommends → user reviews evidence → user decides
```

No Meta mutation, automatic spend change, asset generation, ad launch, or
creative upload in V1.

---

# 27. Recommendation review UX

For creative/copy recommendations, show the current summary, evidence, and a
suggested angle or refresh brief. For budget recommendations, show the current
budget, evidence, and a suggested direction. Do not promise a forecast.

Actions:

```text
Save for later
Mark handled manually
Reject
```

---

# 28. Recommendation list

Display suggested next actions such as:

```text
• Refresh creative
• Review ad copy
• Consider a controlled budget adjustment
```

---

# 29. Meta apply — Phase 2+ only

Do not implement Meta apply, ad creation, ad variation creation, copy/creative
upload, budget changes, or pause/resume as part of V1. Revisit a Change Set,
approval, audit, and idempotent apply flow only after V1 validates demand for
in-product execution.

---

# 30. Recommendation lifecycle — MVP

```text
DETECTED → RECOMMENDED → SAVED | REJECTED | HANDLED_MANUALLY
```

`INSUFFICIENT_DATA` is an analysis result, not a recommendation disposition.

---

# 31. Track & Learn — Phase 2+ only

V1 records recommendation disposition only. Before/after measurement starts
only when 1Person itself can identify one applied Meta change safely in Phase 2.

---

# 32. Track & Learn Purpose

Không cần custom ML learning ở MVP.

Mục tiêu đầu:

```text
record what was recommended
record what was applied
record before metrics
record after metrics
record outcome
```

Sau này data này có thể dùng để:

```text
improve AI context
rank recommendation types
learn account-specific patterns
```

---

# 33. Campaign History / AI Activity

Campaign detail nên có timeline:

```text
Aug 10
Creative fatigue detected

Aug 10
Replace Creative recommended

Aug 11
User approved

Aug 11
Creative applied

Aug 18
Outcome measured

CTR +38%
CPA -21%

Recommendation:
Successful
```

---

# 34. Product-Level Entities & Repo Drizzle Schema Mapping

**V1 database boundary:** only `ad_recommendations` is in scope, with a user
disposition of `SAVED`, `REJECTED`, or `HANDLED_MANUALLY`. `ad_change_sets`,
`ad_change_set_items`, and `ad_recommendation_measurements` are Phase 2+
designs and must not be migrated or implemented for V1.

Agent **phải tái sử dụng file schema có sẵn** tại `packages/core/src/db/schema/ads.ts`:

## Các bảng ĐÃ CÓ trong `packages/core/src/db/schema/ads.ts`:

1. `ad_connections` (`adConnections`) — OAuth tokens, platformAccountId, platformBusinessId, permissions.
2. `ad_campaigns` (`adCampaigns`) — Campaign metadata, status, budget, platformCampaignId, metrics.
3. `ad_sets` (`adSets`) — Ad set metadata, targeting, placements, platformAdSetId.
4. `ads` (`ads`) — Ad creative, primary text, headline, imageUrl, videoUrl, platformAdId.
5. `ad_performance` (`adPerformance`) — Snapshot metrics theo ngày/giờ.

## Các bảng CẦN BỔ SUNG vào `packages/core/src/db/schema/ads.ts`:

```typescript
// 1. ad_recommendations
// Recommendation lifecycle: DETECTED → RECOMMENDED → APPROVED → REJECTED → APPLIED
// Recommendation dừng ở APPLIED. Outcome (SUCCESS/NEUTRAL/FAILED) nằm trong
// adRecommendationMeasurements — lifecycle riêng, không mirror lên recommendation.
export const adRecommendations = pgTable('ad_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // Explicit target FKs. A DB check constraint requires exactly one target.
  // Do not claim a polymorphic `targetId` is a real FK: PostgreSQL cannot
  // reference a table selected by `targetType`.
  campaignId: uuid('campaign_id').references(() => adCampaigns.id, { onDelete: 'cascade' }),
  adSetId: uuid('ad_set_id').references(() => adSets.id, { onDelete: 'cascade' }),
  adId: uuid('ad_id').references(() => ads.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(), // CAMPAIGN, ADSET, AD, CREATIVE
  targetPlatformId: text('target_platform_id').notNull(),
  type: text('type').notNull(), // REPLACE_CREATIVE, IMPROVE_COPY, OPTIMIZE_BUDGET, PAUSE, KEEP
  status: text('status').notNull().default('RECOMMENDED'), // DETECTED, RECOMMENDED, APPROVED, REJECTED, APPLIED
  priority: text('priority').default('HIGH'), // HIGH, MEDIUM, LOW
  problem: text('problem').notNull(),
  evidence: jsonb('evidence').$type<Record<string, unknown>>(),
  possibleCause: text('possible_cause'),
  suggestedAction: jsonb('suggested_action').$type<Record<string, unknown>>(),
  analysisInput: jsonb('analysis_input').$type<Record<string, unknown>>().notNull(), // normalized facts + window boundaries
  analysisVersion: text('analysis_version').notNull(),
  modelTraceId: text('model_trace_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  companyStatusIdx: index('ad_recommendations_company_status_idx').on(table.companyId, table.status),
  campaignCreatedIdx: index('ad_recommendations_campaign_created_idx').on(table.campaignId, table.createdAt),
}));

// 2. ad_change_sets & ad_change_set_items
export const adChangeSets = pgTable('ad_change_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => adCampaigns.id),
  status: text('status').notNull().default('DRAFT'), // DRAFT, REVIEWING, APPROVED, APPLIED, PARTIAL_FAILED
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  reviewSnapshot: jsonb('review_snapshot').$type<Record<string, unknown>>(), // immutable values user reviewed
  appliedAt: timestamp('applied_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const adChangeSetItems = pgTable('ad_change_set_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  changeSetId: uuid('change_set_id').notNull().references(() => adChangeSets.id, { onDelete: 'cascade' }),
  recommendationId: uuid('recommendation_id').references(() => adRecommendations.id),
  targetType: text('target_type').notNull(), // ad, adset, campaign
  targetPlatformId: text('target_platform_id').notNull(),
  actionType: text('action_type').notNull(), // UPDATE_COPY, UPDATE_CREATIVE, UPDATE_BUDGET, PAUSE
  currentValue: jsonb('current_value'),
  proposedValue: jsonb('proposed_value'),
  approved: boolean('approved').notNull().default(false), // Human-in-the-loop: default FALSE, chỉ true sau explicit user action
  applyStatus: text('apply_status').default('PENDING'), // PENDING, SUCCESS, FAILED
  applyError: text('apply_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 3. ad_recommendation_measurements (Track & Learn)
// Lifecycle riêng: MEASURING → SUCCESS | NEUTRAL | FAILED | INSUFFICIENT_DATA
// Measurement window: 7d before change vs 7d after change (khác với dashboard 14d window)
export const adRecommendationMeasurements = pgTable('ad_recommendation_measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  recommendationId: uuid('recommendation_id').notNull().references(() => adRecommendations.id, { onDelete: 'cascade' }),
  changeSetId: uuid('change_set_id').references(() => adChangeSets.id),
  baselineMetrics: jsonb('baseline_metrics').notNull(), // 7d before change
  postMetrics: jsonb('post_metrics'),                    // 7d after change
  primaryKpi: text('primary_kpi').notNull(),
  evaluationConfig: jsonb('evaluation_config').$type<Record<string, unknown>>().notNull(),
  accountTimezone: text('account_timezone').notNull(),
  attributionSetting: text('attribution_setting'),
  overlappingChangeSetIds: jsonb('overlapping_change_set_ids').$type<string[]>().default([]),
  evaluationStatus: text('evaluation_status').default('MEASURING'), // MEASURING, SUCCESS, NEUTRAL, FAILED, INSUFFICIENT_DATA
  evaluatedAt: timestamp('evaluated_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

# 35. Meta Integration & Backend Architecture Boundary

Tái sử dụng service layer và provider pattern hiện có:

```text
Product Logic / API Routes
      ↓
apps/api/src/services/ads-engine.ts  (AdsEngine)
      ↓
apps/api/src/services/platforms/     (PlatformRegistry & FacebookAdProvider)
      ↓
Meta Graph API / Marketing API
```

Mounted Routers trong `apps/api/src/index.ts`:

```typescript
api.route('/ads', adsRouter);           // apps/api/src/routes/ads.ts
api.route('/campaigns', campaignsRouter); // apps/api/src/routes/campaigns.ts
```

---

# 36. Connection States

UI states:

```text
NOT_CONNECTED
CONNECTING
SYNCING
CONNECTED
ERROR
REAUTH_REQUIRED
```

Handle:

```text
expired token
revoked permission
Page inaccessible
Ad Account inaccessible
Ad Account disabled
re-auth required
```

---

# 37. Sync Model & BullMQ Background Queue Integration

> **V1 decision (approved):** use an explicit **Sync now** action only. Do not
> add BullMQ, cron, retry/backoff, per-account rate limiting, or automatic
> initial sync in V1. Show `lastSyncedAt` and ask the user to sync again when
> data is stale. Revisit background sync after validated usage demand.

Các tác vụ định kỳ và ngầm phải dùng **một** BullMQ ownership path được chọn
trong lúc implementation. Repo hiện có queue/worker ở cả API và `@1person/worker`;
không đăng ký cùng cron ở cả hai. Quyết định owner, queue name, deployment command,
job payload version và observability phải được ghi vào implementation PR.

Jobs require a stable idempotency key, retry/backoff for transient Meta errors,
per-account rate limiting, and a persisted `lastSuccessfulSyncAt`. A failed sync
must never overwrite a previously successful snapshot with empty data.

## Initial Sync Job (`facebook:sync-initial`)

- Trigger: Sau khi user kết nối Facebook OAuth thành công.
- Tác vụ: Pull Campaigns, Ad Sets, Ads, Creatives, Recent Insights.

## Incremental Sync Job (`facebook:sync-metrics-cron`)

- Trigger: Cron job mỗi 1–6 giờ.
- Tác vụ: Pull status changes và performance metrics mới nhất.

## Track & Learn Evaluation Job (`facebook:evaluate-measurement-cron`) — Phase 2+

- Trigger: Cron job ngầm chạy định kỳ kiểm tra các `adRecommendationMeasurements` đang ở trạng thái `MEASURING` sau 7 ngày apply.

---

# 38. Security & Secret Storage

Configuration từ `.env`:

```env
FACEBOOK_APP_ID=<from .env>
FACEBOOK_APP_SECRET=<secret — rotate if ever exposed>
```

> ⚠️ **NEVER** đưa giá trị thật của `FACEBOOK_APP_SECRET` vào tài liệu, chat, hoặc code. Nếu lộ, rotate ngay trong Meta Developer Dashboard.

Never expose:

```text
META_APP_SECRET
META_ACCESS_TOKEN
long-lived tokens
refresh-like credentials
```

Never:

```text
console.log secrets
send tokens to frontend
store secret in localStorage
commit .env
```

Use encrypted-at-rest storage for credentials. `ad_connections.accessToken` phải được mã hóa trước khi lưu vào PostgreSQL (sử dụng existing credential encryption mechanism hoặc application-level encryption). Không lưu raw token.

### Required migration

The current `ad_connections` implementation may contain legacy plaintext
credentials. Before enabling Ads OAuth or mutation:

1. encrypt all newly written access/refresh tokens with the existing versioned
   encryption helper;
2. make all Meta-provider reads decrypt only at the last possible moment;
3. run a one-time, resumable migration for legacy plaintext rows and record
   completion without logging token values;
4. reject/mark `REAUTH_REQUIRED` rows that cannot be decrypted or refreshed;
5. redact credentials from errors, audit records, queue payloads and API output.

---

# 39. Audit

Every Meta mutation must record to `audit.ts` table:

```text
who
when
organization
target asset
action
before
after
recommendation id
change set id
result
error
```

No silent changes.

---

# 40. Error Handling

Handle conceptually:

```text
auth expired
missing permission
asset inaccessible
rate limit
invalid parameter
temporary Meta failure
creative rejected
ad/account restricted
partial mutation failure
```

UI should produce actionable states, not raw Graph API dumps.

---

# 41. MVP Scope — IN

```text
Connect Facebook
Discover Page + Ad Account

Sync:
Campaign
Ad Set
Ad
Creative
Metrics

Campaign Overview
Campaign Detail
Ad / Ad Set drilldown

AI Analysis using ads skill
Creative/copy direction using ad-creative skill (text-only recommendation)
Shared context using product-marketing skill

Recommendation
Save / Reject / Mark handled manually
Recommendation history
```

---

# 42. MVP Scope — OUT

Not required initially:

```text
Full Meta Ads Manager clone

AI image/video generation, asset storage, asset editor, or asset library
Creating or uploading Meta creative/ad variations
Applying Meta copy, creative, budget, pause/resume, or status changes
Before/after causal measurement of a change handled outside 1Person

Full campaign creation wizard
Advanced audience builder
Complex targeting UI
Bulk editor

Google Ads
TikTok Ads

Advanced attribution
MMM
Incrementality

Automatic budget optimizer
Automatic pause
Automation rule engine
Fully autonomous ads agent

Business Portfolio management UI
System User management UI
```

---

# 43. Campaign Creation Priority

Original research considered:

```text
Create Campaign
Create Ad Set
Create Ad
```

However the current feature priority is:

```text
Connect existing Meta Ads
      ↓
Analyze
      ↓
Recommend
      ↓
Improve existing ads
```

Full campaign creation can be Phase 2+.

Do not let campaign creation block this MVP.

---

# 44. UX Principle

The app should think:

```text
"What can this user do?"
```

not:

```text
"Does the user have every Meta object?"
```

Capability-oriented:

```text
Can read Ad Account?
Can read campaign?
Can access selected Page?
Can update this Ad?
Can update budget?
```

Only block operation when its required capability is missing.

---

# 45. Product Principle

Do not build a reporting dashboard with AI chat added.

Every important screen should answer:

```text
What is happening?
Why?
What should I do?
What evidence supports that suggestion?
```

---

# 46. Suggested Screen Map

```text
Campaigns (/campaigns)
│
├── Not Connected
│    └── Connect Facebook
│
├── Connected Overview
│    ├── Connection summary
│    ├── Ads overview
│    └── AI status summary
│
├── Campaign List
│
└── Campaign Detail
     ├── Overview
     ├── Ads
     ├── Ad Sets
     ├── Creatives
     ├── Placements
     ├── AI Analysis
     ├── Recommendations
     │    ├── Replace Creative
     │    ├── Improve Copy
     │    ├── Optimize Budget
     │    ├── Pause / Keep / Scale
     │    └── Watch
     │
     └── Recommendation History
```

---

# 47. Mockup Decisions to Preserve

Mockup got these right:

```text
✓ Connect CTA inside Campaigns
✓ Facebook permission explanation
✓ Page + Ad Account selection
✓ Connected success
✓ Syncing state
✓ Campaign performance table
✓ Campaign detail
✓ AI Analysis separated from Recommendation
✓ Impact / priority
✓ Current creative/copy/budget summary with evidence
✓ Concrete suggested next action
✓ Save / reject / manually handled disposition
```

Important refinements:

```text
1. Metrics are objective-aware.
2. AI evidence and AI hypothesis are separate.
3. Analysis works at Campaign / Ad Set / Ad / Creative levels.
4. No guaranteed forecast claims.
5. Handle insufficient data.
6. Business Portfolio stays invisible/optional.
```

---

# 48. Approved Phased Delivery Plan

The V1 screen contract lives in
[`docs/screen-specs/facebook-ads-ai.md`](../screen-specs/facebook-ads-ai.md).
Do not start a later phase until the acceptance criteria of the prior phase pass
against the Meta test account.

## Phase 0 — Foundation

```text
Separate Page and Ad Account discovery + selection
Normalize canonical Ad Account IDs
Minimize Ads OAuth scopes and record granted capabilities
Encrypt and migrate ad connection credentials
Do not enable existing paid-ads mutations in V1
Define one queue owner, retry/rate-limit policy
Define insight fields, data grain, account timezone, attribution setting,
objective-action mapping, and target CPA/ROAS storage
```

Acceptance: a selected test Ad Account is stored as an Ad Account (never a Page),
and tokens are unreadable in the database/API.

## Phase 1 — Read-only Ads

```text
Connect
Discover Page
Discover Ad Account
Sync campaigns
Sync ad sets
Sync ads
Sync creative
Sync metrics
Render overview/detail
```

No mutations.

Acceptance: a user can connect one Ad Account, see an explained sync state, and
view its campaign/ad set/ad hierarchy and objective-aware metrics. No AI is
required yet.

### Explicitly deferred from V1

```text
Background/periodic sync and queue ownership
Multiple Ad Accounts per company
Daily raw insight history and demographic/placement breakdowns
Attribution-window, revenue, CPA and ROAS normalization
Creative asset lifecycle or any Meta mutation
```

---

## Phase 2 — AI Copilot

**Mockup traceability:** the approved 13-screen reference is mapped to delivery
status in [Facebook Ads AI screen spec](../screen-specs/facebook-ads-ai.md#reference-mockup-implementation-map-approved).
Screens 1–6 inform the connected/read-only flow; screens 7–8 and 12 are the
remaining Phase 2 recommendation work; screens 9–11 and 13 are Phase 3+ only.
The sidebar entry point is `Campaigns`, not a separate `Meta Ads` menu item or
`/ads` route. Facebook Ads performance is a view inside the existing
`/{companyId}/campaigns` route; the legacy AI campaign-creation view remains
the default.

### Evidence contract (approved)

Phase 2A starts with evidence before an AI recommendation. An analysis compares
two explicitly selected Meta Insights windows on demand (initial default: the
latest 7 days versus the preceding 7 days). This preserves the V1 decision not
to run a cron or retain daily raw history.

Every displayed finding must carry:

```text
metric
baseline value and current value
absolute and percentage delta
both date windows and the Ad Account timezone
Meta Insights as source
data-sufficiency state
```

`Spend increased` and `daily budget increased` are separate facts. The latter
may be shown only when two actual daily-budget snapshots are available; spend
alone must never be worded as a budget change. Possible causes (for example,
creative fatigue) are AI inferences and must be visibly labeled as such.

When a budget change and spend change describe the same event, render one
primary budget finding with spend as a related impact — never two independent
high-priority alerts. The recommendation prompt may use only metrics supplied
in evidence. It must not introduce bounce rate, revenue, CPA, ROAS, conversion
quality, or targeting problems without corresponding data. A creative brief,
when relevant, must include a testable angle, concrete hook, concrete
visual/video scene, copy direction, and CTA.

The structured evidence and detected negative signals become input to Brand IQ
and the `ads`, `product-marketing`, and `ad-creative` knowledge. The output in
this phase is a bounded text/copy/creative brief explaining what to test or
refresh. It does not edit, generate, upload, or apply image/video assets.

**Brief context boundary:** Brand IQ supplies brand voice, audience and visual
rules; the marketing skills supply decision/creative frameworks; the synced
campaign objective, current Ad Set context, and current copy/creative metadata
make a proposed test concrete. Only structured evidence may support a
performance claim or possible cause. Campaign/creative context must never be
treated as proof that a particular audience, delivery setting, or creative
caused the result.

### Analysis

```text
Product context
ads skill
Structured findings
Campaign/Ad/Creative problem localization
```

### Recommendations

```text
ads recommendation
ad-creative direction when relevant
evidence, current summary, and suggested next step
Save / Reject / Mark handled manually
```

No Meta mutation in V1.

Acceptance: every recommendation has a target, objective-aware evidence,
possible cause labeled as inference, suggested next step, and a persisted user
disposition (`SAVED`, `REJECTED`, or `HANDLED_MANUALLY`).

---

## Phase 3 — In-product execution (post-MVP)

Only start this phase after validating that V1 users repeatedly want to execute
recommendations without leaving 1Person.

### Meta Apply

First useful mutation types:

```text
copy
creative
budget
pause/resume
```

Not part of V1. Revisit only after V1 validates demand for in-product execution.

### Track & Learn

```text
baseline
post-change data
before/after
outcome
history
```

Acceptance: an approved in-product change is auditable, idempotent, and can be
measured without overlapping changes before any automatic optimization is
considered.

---

# 49. Development Acceptance Criteria

Current Meta connection should eventually discover:

```text
Page:
1334266003093993

Ad Account:
act_266601327407628
```

Diagnostic concept:

```text
Meta Authentication      PASS
Ad Account Discovery     PASS
Page Discovery           PASS
```

Never print access tokens.

---

# 50. Product Acceptance Criteria — MVP

Feature is successful when user can:

```text
1. Open Campaigns.
2. See Facebook not connected.
3. Connect Facebook.
4. Select accessible Page + Ad Account.
5. See campaigns and performance data.
6. Open a campaign.
7. Drill down to problematic Ad / Creative.
8. Read structured AI analysis.
9. See concrete recommendation.
10. Read a concrete, evidence-backed suggested next action.
11. Save, reject, or mark the recommendation handled manually.
12. Return later and see the recommendation history.
```

---

# 51. Agent CLI Instructions

Agent must:

```text
1. Inspect repo before coding.
2. Preserve existing framework and conventions.
3. Reuse existing auth, DB (packages/core/src/db/schema/ads.ts), API (apps/api/src/routes/ads.ts), UI and AI abstractions (renderSkillKnowledge).
4. Integrate as a feature, not a parallel app.
5. Keep Meta-specific logic isolated in apps/api/src/services/platforms/.
6. Keep business_id optional.
7. Never expose secrets (FACEBOOK_APP_SECRET).
8. Keep all V1 Meta operations read-only; record user disposition on recommendations.
9. Integrate/adapt marketingskills as knowledge/skill layer (@1person/core).
10. Use product-marketing, ads and ad-creative as core MVP skills.
11. Treat analytics/attribution as optional/on-demand.
12. Use one BullMQ worker owner for background sync; Track & Learn is Phase 2+.
13. Avoid unrelated refactors.
14. Add tests around asset discovery, objective/action mappings, token encryption, and recommendation disposition.
15. Preserve existing product behavior.
```

This document defines:

```text
product requirements
UX intent
AI knowledge flow
Meta boundaries
approval model
MVP scope
```

It does NOT force exact:

```text
filenames
framework
DB schema names
folder layout
AI provider
job queue technology
```

Agent chooses implementation based on existing repository.

---

# 52. FINAL AI FLOW — MVP

This is the final agreed AI workflow:

```text
                 META
                  ↓
        Campaign / Ads / Metrics
                  ↓
       Product Marketing Context
                  ↓
                 ads
                  ↓
        ┌─────────┼─────────┐
        ↓         ↓         ↓
      GOOD      WATCH    PROBLEM
                            ↓
               Is problem creative-related?
                     ↓              ↓
                    YES             NO
                     ↓               ↓
               ad-creative      ads recommendation
                     ↓               ↓
                     └──────┬────────┘
                            ↓
                     Recommendation
                            ↓
          Save / Reject / Handled manually
```

---

# 53. Final Non-Negotiables

```text
Customer owns advertising assets.

Business Portfolio ID is optional.

Use official Meta API only.

No secret exposure.

No Meta mutation in V1.

No fake forecast certainty.

No fake claims/testimonials.

AI findings must show evidence.

AI possible causes must be labeled as inference.

Do not judge an entire campaign when lower-level data identifies the issue.

Use product-marketing → ads → ad-creative as the core skill chain.

Use analytics / attribution only when needed.

MVP is a read-only analyst/copilot, not a full Meta Ads Manager clone.
```

---

# 54. One-Sentence Final Product Definition

> **Connect existing Facebook Ads, understand what is underperforming and why, and use marketing skills + AI to propose concrete, evidence-backed next actions for the user to handle.**

---

# 55. MVP Defaults & Ambiguity Resolutions

Để đảm bảo Agent CLI triển khai chính xác 100% không tự diễn giải khác ý sản phẩm, các quy tắc chốt mặc định dưới đây là bắt buộc:

```text
1. Analysis trigger:
   Initial sync xong + explicit user "Re-analyze" + meaningful metric refresh ngầm từ BullMQ.
   (KHÔNG tự động gọi LLM AI mỗi khi user mở/refresh trang).

2. Scope of Analysis:
   Overview: Hiển thị status nhẹ nhàng (NOT_ANALYZED / GOOD / WATCH / NEEDS_ATTENTION).
   Detail: Chạy AI phân tích sâu từng tầng Campaign → Ad Set → Ad → Creative.

3. Date Window cho dashboard analysis:

   Dashboard Analysis:
   Current Window: 14 ngày gần nhất (last 14 days).
   Comparison: 14 ngày trước đó (previous 14 days).
   (Nếu campaign < 14 ngày: lấy từ start date & cờ INSUFFICIENT_DATA).

4. Fallback khi thiếu Target CPA/ROAS:
   Không block feature.
   CÓ target → Đánh giá target + historical comparison.
   KHÔNG target → Đánh giá Current vs Previous period + So sánh tương quan nội bộ account.
   Không dùng benchmark ngành cứng làm nguồn chân lý.

5. Vai trò của marketingskills:
   marketingskills = Knowledge/Skill Layer (Recommend ONLY).
   App Code = compute facts, validate output, and persist user disposition.
   "Replace Creative" / "Improve Copy" = text-only suggested direction; user
   executes the change outside 1Person in V1.

6. Recommendation lifecycle:
   DETECTED → RECOMMENDED → SAVED | REJECTED | HANDLED_MANUALLY.

7. NOT_ANALYZED status:
   Campaign mới sync hoặc chưa được AI phân tích lần nào = NOT_ANALYZED.
   Chỉ chuyển sang GOOD/WATCH/NEEDS_ATTENTION sau khi AI analysis hoàn tất.
   Agent KHÔNG được hiển thị GOOD cho campaign chưa phân tích.
```
