ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "subdomain" varchar(100);
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "publish_approval_status" varchar(20) DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "publish_submitted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "publish_approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "publish_approved_by" uuid;
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "publish_reject_reason" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "landing_pages_subdomain_unique" ON "landing_pages" ("subdomain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_pages_subdomain_idx" ON "landing_pages" ("subdomain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_pages_publish_status_idx" ON "landing_pages" ("publish_approval_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landing_page_blog_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "landing_page_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "slug" varchar(200) NOT NULL,
  "title" varchar(300) NOT NULL,
  "excerpt" text,
  "content" text,
  "cover_image_url" varchar(1000),
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "seo" jsonb,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "landing_page_blog_posts" ADD CONSTRAINT "landing_page_blog_posts_landing_page_id_landing_pages_id_fk"
  FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "landing_page_blog_posts" ADD CONSTRAINT "landing_page_blog_posts_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_blog_posts_page_idx" ON "landing_page_blog_posts" ("landing_page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_blog_posts_company_idx" ON "landing_page_blog_posts" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_blog_posts_slug_idx" ON "landing_page_blog_posts" ("landing_page_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "landing_blog_posts_status_idx" ON "landing_page_blog_posts" ("status");
