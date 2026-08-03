# CEO Advisor Intelligence

Status: implemented. Last verified against code on 2026-08-03.

## Purpose

CEO Advisor is a company-level decision brief for the CEO. It is not a generic
task list and not a separate recommendation page for every department.

Each recommendation must answer:

1. What issue or opportunity was detected?
2. What company or market evidence supports it?
3. What should the CEO decide or initiate?
4. What impact is expected?
5. How urgent is it?
6. What should happen today and over the next seven days?
7. Which team or department should execute the decision?

Departments are execution owners. The recommendation itself remains a CEO-level
decision.

## Intelligence Context

`buildAdvisorContext()` loads sources independently so one unavailable source
does not discard the whole brief. Each source reports `ok`, `empty`, or
`unavailable` in `sourceHealth`.

The current context includes:

- Company profile and Growth Plan priorities.
- Brain/Brand data: voice, personas, products, market position, marketing
  strategy, and recent learnings.
- Knowledge Hub facts, including user-approved company knowledge.
- Brain Hub sources and recent indexed events.
- Campaigns, banners, social posts, generated videos, status, and metrics.
- Blogs and publication state.
- Landing pages and publication/performance state.
- Market competitors and completed scans.
- Sales pipeline, stalled deals, and high-value active deals.
- Your AI Team roles, departments, and capabilities.
- Coverage gaps such as no campaign, no published blog, no recent market scan,
  no measurable performance, or missing product/persona/strategy data.

Bounded reads keep prompts maintainable. Notable caps include 20 recent
Knowledge entries, 50 market scan records loaded, up to 25 completed scans used
for signals, and up to 6 signals per scan.

## Evidence Catalog

Raw context is converted into a compact evidence catalog. Every item has a
stable ID, source type, label, detail, optional source link, and timestamp.

Supported source types:

```text
business, brain, campaign, blog, landing_page, learning,
market, sales, coverage, knowledge
```

Market evidence is enriched before prompting with:

- Competitor name and source URL.
- Threat level and strategic category.
- Affected products and audiences.
- Recommended counter-move.

The LLM must cite 1-4 IDs that exist in this catalog for each action. Returned
IDs are de-duplicated and checked against the catalog. When evidence exists but
an action cites none, the action is rejected. Metrics must not be invented.

This contract makes the UI's Evidence and Sources sections traceable instead of
showing free-form AI reasoning.

## Recommendation Contract

A generated brief contains:

- Headline and executive summary.
- Today's market pulse: the newest external or internal signals the CEO should
  know now.
- Up to five prioritized actions.
- Weekly actions ordered across day 1-7.
- Wins, alerts, source health, and context counts.

Each top action contains:

- Issue, evidence summary, recommendation, and expected impact.
- Priority: `urgent`, `high`, `medium`, or `low`.
- Confidence and severity.
- `todayMove` and `next7DaysMove`.
- Valid evidence IDs and resolved evidence cards.
- Responsible departments/agents from Your AI Team.
- Optional strategic gap and suggested assets.
- Optional campaign proposal for a supported campaign action.

Suggested assets can include blog, landing page, social posts, banner images,
video, market scan, and sales enablement.

The service sorts stronger evidence and higher priority first. High/critical
product, pricing, or positioning signals can produce a counter-campaign only
when the affected audience/product and evidence support it.

## Strategic Gap Logic

Before and after the LLM call, deterministic helpers compare external movement
with internal execution coverage. Examples:

- A competitor launches an offer, but the company has no comparison article or
  campaign response.
- Knowledge Hub contains a valuable customer insight that has never become
  customer-facing content.
- The company has no recent Market scan, so Advisor recommends collecting fresh
  evidence before changing strategy.
- Growth Plan evidence is newer than the current plan, so Advisor recommends an
  updated draft.
- A campaign is ready but still needs review or measurable follow-through.

These helpers provide useful fallbacks when the model omits a critical market
response and prevent a sparse brief from becoming generic advice.

## Weekly Actions

Weekly Actions use the same evidence catalog and context as Top Actions. They
are not generated from a separate prompt or stale schedule.

- Five to seven practical actions are ordered from day 1 to day 7.
- Urgent/high market responses are placed earlier.
- Validation and measurement are placed later.
- New Crawl Data, Knowledge approvals, campaign activity, or market scans affect
  the next refreshed brief naturally because the context is rebuilt.

## Campaign And Output Bridges

CEO Advisor does not auto-publish work.

- A supported `campaign` action includes a structured `campaignProposal`.
- The UI can pass that proposal into Campaign creation for human review.
- Campaign generation has its own credit cost and permission checks.
- `syncAdvisorDeliverables()` materializes actions into reviewable tasks and AI
  Work Outputs without another LLM call or another credit charge.
- `source_key = ceo_advisor:<briefId>:<actionIndex>` keeps output creation
  idempotent.

See [13-ai-work-outputs.md](./13-ai-work-outputs.md) for the output lifecycle.

## API, Credits, And Access

Base route: `/api/v1/insights`

- `GET /:companyId/advisor/latest`: read the latest saved brief, attach current
  team assignments and campaign-review actions, and sync output links.
- `POST /:companyId/advisor/refresh`: rebuild context, generate a new brief,
  save it, and materialize outputs.

Rules:

- Advisor view follows `ceo_advisor.view`.
- Only Owner and Admin have `ceo_advisor.refresh`.
- A successful refresh costs **10 company credits**.
- Credit usage is attributed to the member who refreshed the brief.
- The first visit can generate the initial brief; later visits show Refresh.
- The requested app language controls newly generated output. Existing briefs
  keep the language in which they were created.

## Validation And Failure Behavior

- Optional source reads are best-effort and surfaced through `sourceHealth`.
- Invalid evidence references are removed.
- Actions missing core decision fields are rejected.
- A campaign action without a valid campaign proposal is rejected.
- Deterministic fallback actions cover important market, Growth Plan, and
  campaign-review cases.
- Deliverable synchronization is non-blocking; a saved brief remains available
  if output materialization fails and the error is logged.

## Current Limits

- Advisor reads stored/internal metrics; it cannot infer real revenue, ROI, or
  conversion data when no integration has collected it.
- External freshness depends on users running Crawl Data and Market scans.
- Evidence proves where the recommendation came from, not that a third-party
  claim is independently audited.
- Department responsibility is advisory until task assignment and product RBAC
  evolve into a complete execution workflow.
- Refresh is on demand; there is no separate always-on daily generation cron in
  this implementation.

## Key Files

- `apps/api/src/services/advisor-context-builder.ts`
- `apps/api/src/services/ceo-advisor.ts`
- `apps/api/src/routes/insights.ts`
- `apps/api/src/services/deliverables.ts`
- `apps/api/src/services/growth-plan-intelligence.ts`
- `apps/api/src/services/market-intelligence.ts`
- `packages/ai-tenant/src/ceo-advisor-store.ts`
- `apps/web/src/app/(dashboard)/[companyId]/insights/page.tsx`
