# Phases

## Phase 1 — Read-only data foundation — delivered

- Facebook connection and one Ad Account selection.
- Encrypted server-side token storage.
- Manual Meta hierarchy sync: Campaign → Ad Set → Ad, creative metadata,
  configured and effective delivery statuses, and aggregate metrics for a
  selected Meta-style date preset: today, yesterday, today + yesterday, last
  7/30/90/360 days, this week, this month, or last month. Normal sync defaults
  to the last 30 days and calculates the range in the Ad Account timezone.
- Campaigns → Facebook Ads overview, detail, connection state, empty-account
  state, and idempotent sync test.
- Overview identifies the selected Ad Account by name and ID, with a direct
  link to change it in Settings.
- Facebook campaign overview is server-paginated at 25 rows per page and
  returns total count; headline metrics remain totals across all Meta
  campaigns, not only the visible page.
- Campaign, Ad Set, and Ad sync the universal delivery metrics: spend,
  impressions, reach, frequency, clicks, CTR, CPC, and CPM. Ads have a
  read-only detail page with hierarchy and creative context.

## Phase 2 — Evidence-backed copilot — delivered

- Explicit `Analyze 7d vs prior 7d` query.
- Facts with baseline/current values, delta, windows, timezone, source, and
  sufficiency.
- Brand IQ + `ads`, `product-marketing`, and `ad-creative` knowledge for a
  text-only brief.
- Recommendation persistence and `Save` / `Reject` / `Mark handled manually`.
- Development-only fixture and real-LLM smoke test.

## Validation status — delivered without a live ad

- Six local-only scenarios cover: budget + CTR decline, CTR decline with a
  synced creative, spend-only, stable delivery, CTR decline with no synced
  creative, and insufficient delivery.
- Ads Manager drafts are correctly explained as absent from Graph sync; no real
  ad needs to be created or published for V1 validation.
- A future comparison against real Insights is optional when the account has
  legitimate delivery. It is not a release blocker and is not an E2E
  requirement for V1.

## V1 usability backlog — not started

These items fit the existing read-only model. They are not part of the
delivered scope until explicitly accepted.

- [x] **Separate development fixtures from the live Meta overview — Delivered.**
  Fixtures are excluded from the connected account's totals and current Meta
  hierarchy, and are rendered in a visibly separate local-scenarios section.
- [x] **Show a sync summary — Delivered.** After each Sync, display the
  returned Campaign / Ad Set / Ad counts and explain the zero-object result.
- [ ] **Show a factual per-campaign data status — Chưa làm.** Surface only
  `Needs review`, `Insufficient data`, or `No supported trend` after an
  analysis. Do not invent an AI confidence or health score.
- [ ] **Company-level recommendation list — Chưa làm.** Add filtering by the
  existing human disposition status across campaigns when recommendation volume
  makes per-campaign history insufficient.
- [ ] **Optional hierarchy tabs — Chưa làm.** Ad Set, Ad, and synced-creative
  tabs are possible with the existing imported data, but the current inline
  hierarchy remains adequate until accounts have enough rows to need them.
- [ ] **Optional factual derived metrics — Chưa làm.** Frequency can be
  calculated from synced impressions/reach. Cost per tracked conversion can be
  calculated only with that exact label; it must not be called lead or purchase
  cost without action-type normalization.

## Requires a data-model expansion — not started

> **V2 implementation gate — locked.** Do not implement the data-driven items
> below until a read-only Meta Ad Account with existing campaign history is
> available for one live contract check. Develop and regression-test from a
> sanitized versioned fixture captured from that account; do not create or run
> a new ad solely for this purpose.

- [ ] **Placement or creative performance breakdown — Chưa làm.** Existing
  placements and creative fields are context, not performance evidence. This
  needs additional Insights breakdown ingestion and evidence rules.
- [ ] **ROAS — Chưa làm.** This needs normalized purchase value/action-value
  ingestion; spend and generic conversion counts are insufficient.
- [ ] **Creative preview/variant drafting beyond the current text brief — Chưa
  làm.** Synced creative context can be displayed, but generated copy/assets,
  predicted outcomes, and asset lifecycle need a separate approved scope.

## Explicitly deferred

- Background sync, queues, retries, rate limiting, and multiple accounts.
- Daily raw insight/demographic/placement history and attribution normalization.
- Meta changes, creative generation/upload, asset lifecycle, and before/after
  change measurement.
- Apply/track/learn loops from reference mockups 9–13.
- Objective-specific Results and Cost per Result: Meta returns action-specific
  results, so a universal conversion value can mix or double-count actions.
- Purchase value/ROAS: require verified purchase action and value sources.
- Video/watch metrics: apply only when a video creative exposes those fields.
- Quality, engagement, and conversion rankings: not reliably available for
  every account/objective and must not become a generic health score.

The reference mockups are useful for the compact flow
`Connect → Sync → Analyze → Recommend → Decide`. V1 deliberately stops at
human decision: it has no `Approve`, `Apply to Facebook`, predicted result, or
post-apply success claim.
