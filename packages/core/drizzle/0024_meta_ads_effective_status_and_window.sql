ALTER TABLE "ad_connections" ADD COLUMN IF NOT EXISTS "meta_ads_performance_window_days" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "effective_status" text;
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "effective_status" text;
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "effective_status" text;
