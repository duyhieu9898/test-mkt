-- P8: Content Autopilot — daily auto-blog to WordPress (draft) + GEO seed.

ALTER TABLE "campaign_launches" ADD COLUMN IF NOT EXISTS "source" varchar(16) DEFAULT 'manual' NOT NULL;

CREATE TABLE IF NOT EXISTS "content_autopilot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL UNIQUE REFERENCES "companies"("id") ON DELETE cascade,
  "enabled" boolean DEFAULT false NOT NULL,
  "posts_per_day" integer DEFAULT 1 NOT NULL,
  "targets" jsonb DEFAULT '{"wordpress":true,"facebook":false,"linkedin":false,"instagram":false}'::jsonb NOT NULL,
  "mode" varchar(16) DEFAULT 'draft' NOT NULL,
  "keyword_queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "used_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "content_autopilot_company_idx" ON "content_autopilot" ("company_id");
CREATE INDEX IF NOT EXISTS "content_autopilot_due_idx" ON "content_autopilot" ("enabled", "next_run_at");
