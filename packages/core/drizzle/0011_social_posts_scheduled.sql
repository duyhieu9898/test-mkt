CREATE TABLE IF NOT EXISTS "social_posts_scheduled" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "content" text NOT NULL,
  "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scheduled_at" timestamp,
  "published_at" timestamp,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "platform_post_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ai_generated" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_posts_scheduled" ADD CONSTRAINT "social_posts_scheduled_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_scheduled_company_idx" ON "social_posts_scheduled" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_scheduled_status_idx" ON "social_posts_scheduled" USING btree ("status");
