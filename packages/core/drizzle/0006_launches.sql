-- Block 8: Campaign Launches. Each row tracks one keyword → blog →
-- images → WP/social orchestration. steps[] is updated as each step
-- runs so the UI can render progress.

CREATE TABLE "campaign_launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"brief" text,
	"targets" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blog_post_id" uuid,
	"hero_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_launches" ADD CONSTRAINT "campaign_launches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "campaign_launches_company_idx" ON "campaign_launches" ("company_id");
--> statement-breakpoint
CREATE INDEX "campaign_launches_status_idx" ON "campaign_launches" ("company_id","status");
