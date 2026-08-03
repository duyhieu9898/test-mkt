# AI Work Outputs

## Purpose

AI Work Outputs turn grounded recommendations into reviewable business work.
The feature sits between intelligence and execution:

```text
Knowledge + Brand IQ + Market + Company activity
                     |
                     v
                CEO Advisor
                     |
                     v
          Task (work order) + Deliverable
                     |
                     v
             Human review / approval
                     |
                     v
       Campaign, content, report, or decision
```

This keeps onboarding and Advisor flows value-oriented. Users provide business
knowledge once, then the system produces concrete outputs instead of repeatedly
asking for the same context.

## Data Model

`tasks` remains the source of execution ownership, status, and assignment. An
Advisor recommendation creates a task with type `advisor_work_order`.

`deliverables` stores the reviewable result:

- Type: decision memo, campaign brief, content plan, market report, or executive report.
- Grounding: issue, evidence, recommendation, expected impact, and owner.
- Lifecycle: `draft -> ready_for_review -> approved -> archived`.
- Source: the originating brief and action index.
- Version and metadata for future rendering and regeneration.

Do not duplicate task scheduling fields inside a deliverable. The deliverable
describes the output; the task describes who owns the work.

## Materialization Rules

`syncAdvisorDeliverables()` in
`apps/api/src/services/deliverables.ts` materializes CEO Advisor actions.

The sync is deterministic and does not call an LLM:

1. CEO Advisor already produces grounded structured actions.
2. Each action is mapped to an output type.
3. One task and one deliverable are created in a transaction.
4. `source_key = ceo_advisor:<briefId>:<actionIndex>` prevents duplicates.
5. Concurrent Dashboard and Advisor requests re-read the same unique output.

This operation has no additional credit charge. Credits are charged when the
Advisor intelligence is generated, not when its structured result is persisted.

Existing Advisor briefs are backfilled when their latest brief is opened. New
briefs are materialized immediately after a successful refresh.

## API

Base route: `/api/v1/deliverables`

- `GET /company/:companyId`: list company outputs; accepts `status` and `limit`.
- `GET /:id`: read one output.
- `PATCH /:id/status`: mark an output ready, approved, or archived.

Company access is always checked by the API:

- `deliverable.view`: roles that can read company work.
- `deliverable.review`: Owner, Admin, and Marketing Lead.

The frontend must hide actions based on permissions, but API authorization is
the final enforcement layer.

## Product Surfaces

- Dashboard `Ready outputs`: shows the most recent work waiting for review.
- CEO Advisor: links each recommendation to its generated output.
- `/outputs`: lists ready, approved, and archived outputs and shows evidence.

The UI intentionally uses one primary review action. A non-technical user should
see what AI prepared, why it prepared it, who owns it, and what happens next.

## Extension Guide

Add future output sources through source-specific adapters that create the same
task and deliverable contract. Do not add source-specific columns to the table.

Examples:

- Knowledge approval -> meeting summary or decision memo.
- Market scan -> market report.
- Growth Plan -> content plan or campaign brief.
- Campaign performance -> executive report.

PDF, DOCX, and PPTX should be renderers over `deliverables.content` and
`deliverables.evidence`. Store rendered file metadata in `metadata` or a
dedicated artifact table when multiple files per deliverable are required.

When regeneration is added, create a new version while keeping the stable
source relationship and approval history.

## Deployment

Apply `packages/core/drizzle/0020_deliverables.sql` before deploying API code
that mounts the deliverables routes.

