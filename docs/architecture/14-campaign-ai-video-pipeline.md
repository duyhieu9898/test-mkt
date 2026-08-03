# Campaign AI Video Pipeline

Status: implemented. Last verified against code on 2026-08-03.

## Purpose

Campaign AI Video turns a reviewed campaign into one or more generated videos.
The primary user flow lives in Campaign Detail. Campaign Launcher currently
only tells the user that video can be created after the campaign is ready.

The feature is asynchronous because video providers can take several minutes.
The request returns a project and provider job ID quickly; a background poller
finishes the work without holding an HTTP request open.

## Product Flow

```text
Campaign Detail
  -> Create video
  -> choose format, aspect ratio, optional direction, optional image
  -> API creates video_projects row with status=rendering
  -> OpenRouter returns a job ID
  -> API responds immediately
  -> VideoRenderCron polls OpenRouter
  -> completed file is downloaded and stored in AWS S3
  -> video_projects becomes ready
  -> UI can apply the ready video to draft social posts
```

Users can generate another version with `forceNew` and optional creative notes.
An unchanged request may reuse the latest non-failed project to prevent
accidental duplicate generation.

## Creative Context

`createCampaignVideoProject()` builds the generation request from:

- Campaign goal, audience, offer, topic, angle, and expected outcome.
- Current business context and selected output language.
- Brand creative kit, including visual identity and brand guidance.
- Optional user direction entered in the create-video dialog.
- Optional reference image from Asset Library, Google Drive, or OneDrive.

Reference images are normalized into the Asset Library before submission.
Only JPEG and PNG are accepted. Drive files are inspected by MIME type and file
signature so a misleading extension cannot reach the video provider.

The provider/model is configuration, not business logic. The current provider
is OpenRouter and the default model is controlled by
`OPENROUTER_VIDEO_MODEL`.

## Async Job Lifecycle

`video_projects.status` uses this lifecycle:

```text
script -> scenes -> rendering -> ready
                            \-> failed
```

The rendered path normally starts at `rendering`. Provider metadata is stored
inside `video_projects.script.videoGeneration`, including job ID, polling URL,
model, status, usage, requested user, and storage key.

`VideoRenderCron`:

1. Starts with the API process when `OPENROUTER_API_KEY` is configured.
2. Waits 10 seconds before the initial cycle.
3. Selects the oldest rendering projects without an output URL.
4. Polls a bounded batch concurrently.
5. Marks pending jobs with their latest provider status.
6. Marks provider failures as `failed`.
7. Downloads completed output and saves it through `saveObject()`.

`VIDEO_RENDER_SYNC_INTERVAL_MS` controls polling frequency and
`VIDEO_RENDER_SYNC_BATCH_SIZE` controls how many projects one cycle checks.
The worker prevents overlapping cycles in the same API process.

## Storage And Credits

OpenRouter output is temporary. On completion, the API downloads the file and
stores the durable copy in AWS S3 through the shared object-storage service.
The application only persists the resulting public URL and storage metadata.

Video generation costs **50 company credits**.

- The API checks the company balance before submitting a paid render.
- Credits are charged only after a video is successfully stored and marked
  ready.
- A failed provider job does not consume credits.
- The credit ledger records the company, requesting user, and video project.
- If storage succeeds but the ledger write fails, the video remains ready and
  the server logs the credit failure for operational repair.

## API Contract

Base route: `/api/v1/marketing`

- `POST /company/:companyId/videos/generate`: create/reuse a script project or
  submit an AI render.
- `GET /company/:companyId/videos`: list company videos.
- `GET /company/:companyId/videos/:id`: get current job/project state.
- `PATCH /company/:companyId/videos/:id`: legacy script/scene update support.
- `DELETE /company/:companyId/videos/:id`: remove a failed project only.
- `PATCH /company/:companyId/campaigns/:campaignId/social-post-video`: apply,
  replace, or remove a ready campaign video on draft social posts.
- `POST /company/:companyId/videos/:id/imgly-export`: compatibility endpoint
  for a future video editor/export flow; it is not the primary creation path.

Rendered AI video currently supports `9:16` and `16:9`. The schema also keeps
`1:1` for legacy/script projects, but the render endpoint rejects it.

## Authorization And Social Rules

- Read endpoints require `campaign.view`.
- Generation requires `campaign.generate_ai` and company credit spending.
- Apply, remove, and delete actions require `campaign.edit`.
- A video must belong to the same company and campaign and have
  `status=ready` with an output URL before it can be applied.
- Published social posts are read-only. Applying or removing video only affects
  draft posts.
- Applying a new campaign video replaces the previous campaign video while
  preserving banner images and unrelated media.

## Configuration

Required:

- `OPENROUTER_API_KEY`
- AWS S3/object-storage configuration used by `saveObject()`

Optional:

- `OPENROUTER_VIDEO_MODEL`
- `OPENROUTER_VIDEO_DURATION_SECONDS`
- `OPENROUTER_VIDEO_RESOLUTION`
- `OPENROUTER_VIDEO_GENERATE_AUDIO`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_APP_NAME`
- `VIDEO_RENDER_SYNC_INTERVAL_MS`
- `VIDEO_RENDER_SYNC_BATCH_SIZE`

See `.env.example` for supported resolution values and development defaults.

## Current Limits

- No primary IMG.LY video editing UI yet.
- No social-specific video resize/transcode pipeline yet; the original aspect
  ratio is preserved.
- Provider progress is a state estimate, not frame-level render progress.
- Polling is process-local. A future high-volume deployment should move job
  synchronization to a dedicated queue worker with distributed locking.
- Failed projects can be deleted; ready videos are retained because they may be
  referenced by campaign posts and the credit ledger.

## Key Files

- `apps/api/src/services/campaign-video-creative.ts`
- `apps/api/src/workers/video-render-cron.ts`
- `apps/api/src/routes/marketing-engine.ts`
- `apps/api/src/services/object-storage.ts`
- `apps/api/src/lib/credit-costs.ts`
- `packages/core/src/db/schema/marketing.ts`
- `apps/web/src/app/(dashboard)/[companyId]/campaigns/[id]/page.tsx`
