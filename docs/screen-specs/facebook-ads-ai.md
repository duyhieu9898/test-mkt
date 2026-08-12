# Facebook Ads AI — V1 Screen Spec

> Scope: read-only Meta Ads analysis and recommendations. V1 never creates
> creative, launches ads, or changes any Meta setting.
>
> Architecture and phased delivery: [Facebook Ads AI handoff](../architecture/17-facebook-ads-ai/README.md).

**Navigation decision:** this flow is reached through the single sidebar item
`Campaigns`; it is not a separate `Meta Ads` menu item or `/ads` route. The
existing AI campaign-creation list stays as the default Campaigns view. The
read-only performance flow is the `Facebook Ads` view inside that same route
(`/{companyId}/campaigns?view=facebook-ads`).

## Reference-mockup implementation map (approved)

The 13 supplied mockups are a **flow reference, not a visual-spec source**.
Use this table when implementing or reviewing the feature; the mockup number is
the purple number in the supplied images, not this document's section number.

| Mockup | Product interpretation | Delivery status |
| --- | --- | --- |
| 1. Not connected | Campaigns empty/connection state | Implemented core; do not copy the mockup layout literally. |
| 2. Facebook OAuth | Existing integration connect flow and permission explanation | Implemented core. |
| 3. Select Page & Ad Account | Select exactly one **Ad Account**. Page selection is optional and not required for read-only analysis. | Ad Account selection implemented; do not require a Page. |
| 4. Sync success | Manual read-only sync, last-sync state, and overview | Implemented core; no background sync/progress queue. |
| 5. Campaign overview | Main `Campaigns` entry point, campaign list, sync state, and empty-account state | Implemented core; filters/AI status summary remain future refinement. |
| 6. Campaign detail / analysis | Hierarchy, explicit `Analyze 7d vs prior 7d`, evidence cards, then optional brief | Implemented in Phase 2A; tabs and lower-level diagnosis are not yet required. |
| 7. AI recommendations | Evidence-backed recommendation list | Next Phase 2 item; persist recommendations before presenting a list. |
| 8. Review & decision | Review a recommendation and set `SAVED`, `REJECTED`, or `HANDLED_MANUALLY` | Next Phase 2 item; never show `Approve` as a Meta apply action. |
| 9–10. Apply changes / success | Send changes to Meta | Explicitly deferred to Phase 3+. |
| 11. Tracking results | Measure an identified applied change | Explicitly deferred to Phase 3+. |
| 12. Recommendation status | Persisted recommendation history/dispositions | Next Phase 2 item; no applied/outcome status in V1. |
| 13. AI insights update | Automated learning/new recommendation loop | Deferred to Phase 3+; no cron in V1. |

The visual language, component layout, sample numbers, predicted performance,
and asset-generation previews in the mockups are non-binding. In particular,
V1 must not show generated-image/video previews, a prediction guarantee, or
any button that implies a Meta mutation.

### Development-only analysis fixture

When no historical Meta data is available, local development may use the
explicit `[DEV DEMO]` seed. It creates a clearly labeled local campaign/ad
set/ad and makes the analysis service return deterministic evidence (including
the $100 → $300 daily-budget example) without calling Meta. It refuses to run
in production and must never be presented as synced Meta data. Use real Meta
data for Sync verification; use this fixture only for the Analysis,
Recommendation, and disposition UI.

## Shared rules

- All screens are scoped to the active `companyId` and selected Ad Account.
- Page selection is optional in V1; Ad Account selection is required.
- Analysis status: `not_analyzed`, `insufficient_data`, `needs_review`, `no_issues_detected`.
- Recommendation disposition: `recommended`, `saved`, `rejected`, `handled_manually`.
- Show raw Meta errors only in server logs; UI gives an actionable message.

## 1. Campaigns — not connected

**Goal:** make the value and next action obvious.

**Content:** Facebook Ads is not connected; short explanation that the feature
syncs performance and creates recommendations without changing ads.

**Primary action:** `Connect Facebook`.

**States:** loading connection check; not connected; connection error; re-auth required.

**Acceptance:** no campaign data or token field is exposed before a connection exists.

## 2. Connect Facebook and select Ad Account

**Goal:** connect the user's Meta account without manual IDs or tokens.

**Flow:**

```text
Continue with Facebook → OAuth callback → asset picker → select one Ad Account → Connect
```

**Content:** Ad Account name, currency, timezone, accessibility/status; optional
Page selector labeled as not needed for analysis.

**Primary action:** `Connect selected Ad Account`.

**States:** OAuth opening; no accessible ad account; account disabled; missing permission; connect error.

**Rules:** never substitute a Page ID for an Ad Account ID; never display an access token.

**Acceptance:** selected account is persisted and initial read-only sync is enqueued.

## 3. Syncing / sync error

**Goal:** prevent an empty dashboard from looking broken.

**Content:** current sync step: campaigns, ad sets, ads, creative metadata, insights;
last successful sync time when available.

**Actions:** `Retry sync` after an error; `Back to Campaigns` after success.

**States:** queued; syncing; success; partial success with stale data; failed; re-auth required.

**Acceptance:** a failed sync preserves the last successful data and tells the user what to do next.

## 4. Campaign Overview and Opportunities

**Goal:** show where the user should look first.

**Content:**

- Ad Account selector and last-sync timestamp.
- Opportunity list ordered by priority.
- Campaign table: campaign, delivery status, spend, objective-specific result,
  cost/result, ROAS when applicable, and analysis status.

**Actions:** open campaign; filter by delivery/analysis status; `Re-analyze` only
when the campaign is eligible.

**States:** empty account; no active campaigns; metrics unavailable; stale sync;
all campaigns have insufficient data.

**Rules:** `PAUSED` is a delivery status, never an AI assessment. Show `N/A`
rather than guessing an unmapped result or ROAS.

**Acceptance:** user can identify a campaign needing attention without opening every row.

## 5. Campaign Detail

**Goal:** prove the recommendation with data and localize the problem.

**Content:** campaign header, objective/target if configured, current vs prior
window metrics, ad-set/ad hierarchy, creative metadata, and evidence cards.

**Tabs/Sections:** Overview (with current performance & findings), Ad Sets, Ads, Recommendation History.

**Actions:** open lower-level entity; `Re-analyze` when eligible; open a
recommendation.

**Phase 2A default:** `Analyze 7d vs prior 7d` runs only when the user clicks
it. Each evidence card shows the baseline/current value, delta, date windows,
Ad Account timezone, Meta Insights source, and data-sufficiency state. A
separate `Generate recommendation brief` action may use those cards plus Brand
IQ and marketing knowledge; it produces text/creative direction only and never
edits an image, video, copy, or Meta setting.

**Evidence rendering rules:** group a budget raise and its spend increase into
one finding, with spend displayed as a related impact. A development fixture
must use the source label `Development fixture — not Meta data`; it must never
be labeled `Meta Insights`. The generated brief may cite only displayed
evidence and must not introduce unsupported funnel metrics or targeting claims.

**States:** not analyzed; insufficient data; no mapped result; stale data;
analysis failed.

**Rules:** evidence is factual; possible cause is visibly labeled as inference.
The screen must identify a losing ad/creative rather than condemning an entire
campaign when lower-level data is available.

**Acceptance:** a user can see what changed, which asset is implicated, and why.

## 6. Recommendation detail and history

**Goal:** turn an insight into a durable, human-owned next step.

**Content:** target, problem, evidence, possible cause, priority, suggested next
step, source analysis timestamp/version, and current disposition.

**Actions:** `Save`, `Mark handled manually`, `Reject`.

**States:** new recommendation; saved; rejected; handled manually; stale because
source data refreshed materially.

If policy validation rejects an AI brief, show a recoverable message that no
safe recommendation could be generated and keep the evidence visible. Do not
create an empty recommendation-history record.

**Rules:** no `Approve & Apply`, asset generation, budget update, pause, or Meta
mutation in V1. A handled recommendation means only that the user reports it
was handled outside 1Person; it is not proof of outcome.

**Acceptance:** disposition persists, appears in recommendation history, and no
user action can mutate Meta.
