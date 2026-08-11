ALTER TABLE "ad_campaigns" ADD COLUMN IF NOT EXISTS "frequency" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "reach" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "ctr" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "cpc" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "cpm" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN IF NOT EXISTS "frequency" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "reach" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "cpc" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "cpm" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "frequency" numeric(10, 2);
