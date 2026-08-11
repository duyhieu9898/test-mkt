# Data model & API

## Persisted data

- `ad_connections`: selected Meta Ad Account and encrypted token.
- `ad_campaigns`, `ad_sets`, `ads`: imported read-only hierarchy.
- `ad_recommendations`: company/campaign target, evidence, normalized analysis
  input, bounded brief, priority, and user disposition.

`ad_recommendations` is the only new recommendation entity in V1. Change sets,
Meta mutations, and measurements remain out of scope.

## Browser API surface

All routes are company-authorized and redact credentials from responses.

```text
GET   /ads/company/:companyId/facebook/overview
POST  /ads/company/:companyId/facebook/sync
GET   /ads/company/:companyId/facebook/campaigns/:campaignId
POST  /ads/company/:companyId/facebook/campaigns/:campaignId/analyze
POST  /ads/company/:companyId/facebook/campaigns/:campaignId/recommendation-brief
GET   /ads/company/:companyId/facebook/campaigns/:campaignId/recommendations
PATCH /ads/company/:companyId/facebook/recommendations/:recommendationId
```

The `/ads` prefix above is an internal API namespace. The browser navigation is
`/{companyId}/campaigns?view=facebook-ads`, not `/ads`.
