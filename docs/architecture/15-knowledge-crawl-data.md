# Knowledge Crawl Data

Status: implemented. Last verified against code on 2026-08-03.

## Purpose

Crawl Data helps a non-technical user find trustworthy public information about
their company or a topic, review the sources, and import only useful items into
Knowledge Hub.

Discovery and import are deliberately separate:

```text
Describe scope -> discover and verify sources -> user selects sources
               -> import selected sources -> review extracted knowledge
               -> approve through the normal Knowledge lifecycle
```

The feature does not use SERPAPI.

## Discovery Modes

The UI has two optional inputs:

- **Website link**: when present, discovery stays inside that website.
- **What do you want to crawl?**: narrows discovery to the user's intent.

The resulting modes are:

| Website | Topic | Behavior |
|---|---|---|
| Present | Present | Find topic-relevant pages inside that website. |
| Present | Empty | Discover important pages inside that website. |
| Empty | Present | Find public sources about the topic in the context of the current company. |
| Empty | Empty | Find public information about the current company. |

When no website is entered, the saved company website can be resolved from
company settings, WordPress connection, Brand IQ, Brand Identity, or previous
URL documents. This prevents a locale switch or missing form value from making
the company look unconfigured.

## How Discovery Works

`discoverKnowledgeCrawlData()` follows a guarded pipeline:

1. Resolve company identity, saved website, domain, language, and user topic.
2. Use AI to expand a public-search topic into intent, keywords, phrases,
   slugs, and likely paths when needed.
3. In website mode, inspect the supplied site and its discoverable pages.
4. In public mode, combine the official site, Google News discovery, social
   profile queries, articles/blog queries, and general public web discovery.
5. Normalize and de-duplicate URLs.
6. Reject Google utility URLs and low-value candidates.
7. Verify external candidates against company/domain/topic identity; fetch page
   text when the search result alone is not strong enough.
8. Remove weak or irrelevant results, rank by confidence, and return at most 24
   reviewable sources.
9. Localize user-facing result titles and snippets to English, Vietnamese, or
   Japanese without changing URLs or facts.

Every returned source includes type, source label, confidence, and whether the
URL was already imported. Nothing is selected by default.

This pipeline reduces fabricated paths and 404 pages: candidate URLs must come
from discovery and pass URL/content checks instead of being created only from
AI-suggested slugs.

## Import Lifecycle

The user selects sources explicitly. The frontend sends groups of at most 8,
matching backend validation.

For each selected source the API:

1. Normalizes the URL and skips a URL already stored for the company.
2. Creates a `documents` row with `status=processing`, source type `url`, and
   tags `crawl-data` plus the discovery type.
3. Fetches readable content through the shared Knowledge extraction service.
4. Combines the verified search snippet and extracted page content.
5. Structures the content into Knowledge entries.
6. Marks the document `extracted` and ready for user review.
7. Marks an unreadable source as `failed` with an error message.

Imported data does not bypass review or become trusted Brain knowledge
automatically. It uses the existing Document approval lifecycle.

## Credits And Authorization

Discovery costs **20 company credits** because it performs AI topic analysis,
public discovery, verification, and optional localization.

- Credits are checked and charged on `crawl/discover`.
- Import has no additional credit charge.
- Both discovery and import require `knowledge.upload`.
- Discovery also requires `credits.spend`.
- The credit ledger attributes usage to the current company member.

Do not move the charge to Import. A user can inspect results without importing,
but the paid AI/public discovery work has already happened.

## API Contract

Base route: `/api/v1/knowledge`

- `GET /company/:companyId/crawl/discover`
  - Query: `websiteUrl`, `q`, `language`.
  - Returns company identity, search mode, sources, warnings, and timestamp.
- `POST /company/:companyId/crawl/import`
  - Body: `visibility` and 1-8 selected sources.
  - Returns per-source `imported`, `skipped`, or `failed` results.

## Multilingual Behavior

- Fixed UI copy follows the current application language.
- Topic analysis receives the current language.
- Result cards are localized after discovery while proper nouns and URLs stay
  unchanged.
- Existing imported Knowledge remains in its original language. Changing the
  UI language only affects new discovery output.

## Current Limits

- Public search coverage depends on accessible public indexes and pages.
- Login-protected pages and heavily client-rendered pages may not yield readable
  text.
- Confidence is relevance filtering, not a factual truth score.
- Discovery verifies URLs and identity but does not guarantee that every claim
  on a third-party page is true.
- Import is intentionally capped at 8 sources per request to bound extraction
  time and LLM context size.

## Key Files

- `apps/api/src/services/knowledge-crawl-discovery.ts`
- `apps/api/src/services/public-discovery.ts`
- `apps/api/src/routes/knowledge.ts`
- `apps/api/src/services/knowledge-extraction.ts`
- `apps/api/src/lib/credit-costs.ts`
- `apps/web/src/app/(dashboard)/[companyId]/knowledge/crawl/page.tsx`
- `apps/web/src/components/knowledge/knowledge-tabs.tsx`
