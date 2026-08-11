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
| D16 | Cost per conversion uses strict math & weighted sum. | `conversions <= 0` returns `null` (`—`/`N/A`); aggregate CPA is `SUM(spend) / SUM(conversions)`. |
| D17 | Campaign Detail tabs use Server Component data fetching and URL tab state (`?tab=`). | Deep linking and refresh persistence work predictably without bundling client pages. |

## Change protocol

When accepting an improvement, append an ID, describe its invariant, and add
or amend a test scenario. Do not silently weaken an earlier decision.
