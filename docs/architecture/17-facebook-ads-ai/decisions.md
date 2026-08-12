# Decisions

Record every accepted behavior change here before implementing it. A change
needs a matching regression test or manual fixture in `testing-and-fixtures`.

| ID | Accepted decision | Guardrail |
| --- | --- | --- |
| D1 | V1 is read-only for Meta. | No Meta mutation endpoint or `Apply` UX. |
| D2 | Sync is manual (`Sync now`). | No cron, BullMQ ownership, retry loop, or autosync in V1. |
| D3 | One company selects one Ad Account. | A Page is optional; never substitute a Page ID for an Ad Account ID. |
| D4 | Facebook Ads is a view inside `Campaigns`. | No user-facing `/ads` route or separate sidebar item. |
| D5 | Evidence is factual; causes are hypotheses. | Display windows, values, delta, source, and data sufficiency. |
| D6 | Spend and daily budget are different metrics. | Only call budget change when two actual budget snapshots exist. |
| D7 | A shared budget/spend event is one finding. | Budget is primary; spend is related impact, never duplicate high alerts. |
| D8 | Brand IQ is company context; marketing skills are reasoning frameworks. | Neither is performance evidence. |
| D9 | Current objective, targeting, and creative/copy make a brief concrete. | They cannot prove a performance cause. |
| D10 | Recommendations are human dispositions. | Status is `recommended`, `saved`, `rejected`, or `handled_manually`; no `applied` in V1. |
| D11 | Local demo data is allowed for UX testing. | It is labeled `[DEV DEMO]` / `Development fixture — not Meta data`, never runs in production. |
| D12 | Analysis requires meaningful delivery in both windows. | Fewer than 1,000 impressions in either window is `INSUFFICIENT_DATA`, not an AI recommendation. |
| D13 | A creative test needs CTR-decline evidence and a synced creative. | Spend change alone, or a campaign without synced creative context, may only lead to delivery review. |
| D14 | Meaningful but stable delivery does not need a recommendation. | No finding means no brief; this is distinct from `INSUFFICIENT_DATA`. |
| D15 | `AnalysisStatus` is decoupled from disposition status. | Precedence: `not_analyzed` → `insufficient_data` (<1k window impressions) → `needs_review` (findings > 0) → `no_issues_detected`. |
| D16 | Cost-per-result math is strict and result-type scoped. | Result count `<= 0` returns `null`; cost/result is spend divided by a compatible result count, and heterogeneous results are never aggregated into one CPA. |
| D17 | Campaign Detail uses client-side data fetching and state hydration. | API endpoints return hydrated hierarchy and latest analysis; client manages reactive tab and session state. |
| D18 | OAuth state nonces are single-use and company-bound. | `oauth_states` table tracks `consumed_at` and `expires_at`; state nonces expire in 10m and cannot be reused. |
| D19 | Strict read-only Meta guard at both provider and service layer. | Both `FacebookAdProvider` and `AdsEngine` throw `MetaAdsReadOnlyError` on paid ad mutations. |
| D20 | Ad Account isolation via `sourceAccountId`. | All Meta data objects and recommendations are filtered by `sourceAccountId`. Switching accounts isolates views. |
| D21 | Sync separation of Phase A (Network) and Phase B (DB Transaction). | Graph API fetching occurs outside DB transaction; DB upserts/archives run in `db.transaction()`. |
| D22 | Analysis persistence in `ad_campaign_analyses`. | Every analysis run persists snapshots and findings, producing a permanent `analysisId`. |
| D23 | Brief generation consumes `analysisId` with ownership verification. | Zero findings or `insufficient_data` returns `{ brief: null, recommendation: null }` without LLM invocation. |
| D24 | Missing/unknown provenance fails closed. | Migration does not infer account ownership. NULL sourceAccountId fails closed (404/409) rather than acting as a wildcard. |
| D25 | Sync-based NULL-row reconciliation for legacy provenance. | Definitive legacy provenance is assigned only when Graph API confirms remote object membership during sync. Migrations do not guess ambiguous provenance. NULL-provenance rows remain hidden until reconciled. |
| D26 | Account-scoped recommendation status disposition. | PATCH recommendation status validates campaign ownership against selected account (`sourceAccountId`); cross-account recommendation writes fail closed (404). |
| D27 | Scoped AdSet and Ad reconciliation to candidate Meta campaigns. | Meta sync may reconcile/archive AdSets and Ads only inside candidate Meta campaign hierarchy (`inArray(campaignId, candidateCampaignIds)`). Meta sync never fetches, touches, or archives non-Meta or cross-platform ad sets/ads. |
| D28 | Primary Result requires current objective, Ad Set, and event context. | A live KPI is supported only when campaign objective, measurement-relevant Ad Set optimization context, and promoted-object event semantics where needed identify one result. Objective alone does not prove KPI. |
| D29 | Observations are not negative findings. | A spend increase is retained as an observation but never alone changes analysis status to `needs_review`. |
| D30 | Metric-specific sufficiency complements delivery sufficiency. | CTR needs at least 30 baseline clicks; cost-per-result needs at least 5 results in both windows, in addition to the 1,000-impression gate. |
| D31 | Recommendations bind to action-relevant evidence. | The persisted type/problem is selected deterministically for the chosen action, and grounding must cite evidence that permits that action. |
| D32 | Result aliases are not additive. | Equivalent Meta action representations are selected by explicit precedence, never summed as independent results. |
| D33 | Severe result collapse remains diagnosable. | A meaningful baseline result collapsing toward zero can create a finding even when current cost per result is undefined. |
| D34 | Heterogeneous results are not aggregated. | Lead, purchase, registration, link click, and other results are never combined into one account conversion or CPA. |
| D35 | Related evidence cannot authorize an action. | Related evidence can explain an event but cannot replace the primary evidence required to permit an action. |

## Change protocol

When accepting an improvement, append an ID, describe its invariant, and add
or amend a test scenario. Do not silently weaken an earlier decision.

Before first production deployment:
- migration history may still be cleaned while environments are disposable.

After first shared/prod deployment:
- treat applied migrations as immutable;
- use new migrations for corrective changes.
