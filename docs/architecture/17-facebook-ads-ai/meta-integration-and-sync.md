# Meta integration & sync

## Flow

```text
Existing Facebook OAuth → discover accessible Ad Accounts → select one
→ persist numeric account ID/currency/timezone → Sync now → read-only Graph pulls
```

The generic Facebook connection retains its legacy scopes. Do not remove or
globally narrow them to fix a Meta permission warning; introduce a dedicated
OAuth flow only if a future Page-publishing requirement genuinely conflicts.

## Sync contract

- Uses the selected Ad Account only.
- Imports Campaigns, Ad Sets, Ads, basic creative metadata, and aggregate
  Insights.
- Is idempotent by Meta platform ID.
- Never calls a Meta mutation endpoint.
- Preserves an empty Ad Account as a valid empty state.

## Manual validation

Create a real Campaign → Ad Set → Ad in Meta Ads Manager and pause it. Sync it
twice and confirm hierarchy, IDs, metrics, and no duplicates. A campaign needs
roughly 14 days of history before the default analysis comparison is useful.
