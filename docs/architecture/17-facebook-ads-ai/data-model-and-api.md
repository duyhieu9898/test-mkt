# Data model & API

## Persisted data

- `ad_connections`: selected Meta Ad Account, performance date preset, reporting windows, and encrypted token.
- `ad_campaigns`, `ad_sets`, `ads`: imported read-only hierarchy tagged with `sourceAccountId` provenance and `origin`.
- `ad_campaign_analyses`: immutable audit records of analysis runs storing baseline/current snapshots, window definitions, `sourceAccountId`, analysis status, and findings.
- `oauth_states`: single-use, company-bound nonces with `expires_at` and `consumed_at` timestamps for OAuth CSRF protection.
- `ad_recommendations`: campaign target, `analysisId` reference, evidence, normalized analysis input, bounded brief, priority, and human disposition status (`recommended`, `saved`, `rejected`, `handled_manually`).

## Browser API surface

All routes are company-authorized and redact credentials from responses.

```text
GET   /ads/company/:companyId/facebook/overview
POST  /ads/company/:companyId/facebook/sync
GET   /ads/company/:companyId/facebook/campaigns/:campaignId
GET   /ads/company/:companyId/facebook/campaigns/:campaignId/ads/:adId
POST  /ads/company/:companyId/facebook/campaigns/:campaignId/analyze
POST  /ads/company/:companyId/facebook/campaigns/:campaignId/recommendation-brief
GET   /ads/company/:companyId/facebook/campaigns/:campaignId/recommendations
GET   /ads/company/:companyId/facebook/recommendations
PATCH /ads/company/:companyId/facebook/recommendations/:recommendationId
```

The `/ads` prefix above is an internal API namespace. The browser navigation is
`/{companyId}/campaigns?view=facebook-ads`, not `/ads`.
