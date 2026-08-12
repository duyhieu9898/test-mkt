# Testing & fixtures

## Automated invariants

- Sync hierarchy is idempotent.
- A budget raise is never inferred from spend alone.
- Spend increases are observations; they do not alone create `needs_review`.
- Primary-result efficiency is evaluated only for supported objective/action mappings with sufficient result volume.
- CTR decline requires both the 1,000-impression delivery gate and at least 30 baseline clicks.
- A budget/spend event is grouped, not duplicated.
- Brief prompt carries evidence, Brand IQ, campaign/creative context, and does
  uses only evidence-allowed action types and synced creative IDs.
- A policy-rejected brief returns a recoverable error and is never persisted.
- Recommendation disposition is scoped to its company and is limited to
  `saved`, `rejected`, or `handled_manually`.
- Web typecheck passes.

## Development fixture matrix

| Scenario | Required behavior |
| --- | --- |
| Budget ↑ + Spend ↑ + CTR ↓ | One budget finding, spend related impact, correlation-only possible cause. |
| Budget stable + CTR ↓ | No budget/targeting claim; a creative test may be proposed as hypothesis. |
| Spend ↑, no historical budget | Say spend increased only. |
| Spend ↑ + stable cost/result | Observation only; no recommendation. |
| Cost/result ↑ with supported result KPI | Delivery review only; do not infer targeting, bid, or budget cause. |
| Unsupported or ambiguous result actions | No result-efficiency finding. |
| Stable delivery | No finding or recommendation when delivery is meaningful but no threshold is crossed. |
| CTR ↓, no synced creative | Do not offer a creative test; use delivery review only. |
| Insufficient data | No forced recommendation. |

All four scenarios are seeded today under `[DEV DEMO]`. Add scenarios only with
a matching test; fixtures must be local-only and clearly labeled.

## Commands

```bash
pnpm --filter @1person/api dev:seed-meta-ads -- --company=<company-id>
pnpm --filter @1person/api dev:test-meta-ads-brief -- --company=<company-id> --campaign=<campaign-id>
pnpm --filter @1person/api exec vitest run src/services/meta-ads-evidence.test.ts src/services/meta-ads-brief.test.ts src/services/meta-ads-sync.test.ts
```

The smoke test calls the configured LLM but does not persist a recommendation
or call Meta. Do not run it against production.
