# Facebook Ads AI

> Source of truth for the Facebook Ads AI feature. This folder supersedes the
> former monolithic `17-facebook-ads-ai.md` handoff.

## Current product boundary

1Person is a read-only Meta Ads performance analyst and media-buyer copilot:

```text
Connect → select one Ad Account → Sync now → Analyze → Recommendation → user disposition
```

It never creates, edits, uploads, pauses, launches, or spends through Meta in
V1. A user may only save, reject, or mark a recommendation handled manually.

## Reading order

1. [Decisions](./decisions.md) — non-negotiable product and safety choices.
2. [Phases](./phases.md) — delivered scope and deferred work.
3. [Meta integration & sync](./meta-integration-and-sync.md) — OAuth, Ad
   Account selection, and read-only data flow.
4. [Evidence & recommendations](./evidence-and-recommendations.md) — analysis
   contract, Brand IQ/skill use, and recommendation lifecycle.
5. [Data model & API](./data-model-and-api.md) — persisted entities and routes.
6. [Testing & fixtures](./testing-and-fixtures.md) — automated regression and
   manual E2E approach.

Screen behavior is specified separately in [Facebook Ads AI screen spec](../../screen-specs/facebook-ads-ai.md).

## Archive

[Reference legacy](./reference-legacy.md) preserves the old full handoff for
historical lookup only. It is not authoritative when it conflicts with files
above.
