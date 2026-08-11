ALTER TYPE "ad_connection_status" ADD VALUE IF NOT EXISTS 'pending';
--> statement-breakpoint
ALTER TABLE "ad_connections" ADD COLUMN IF NOT EXISTS "platform_page_id" text;
--> statement-breakpoint
ALTER TABLE "ad_connections" ADD COLUMN IF NOT EXISTS "platform_account_currency" text;
--> statement-breakpoint
ALTER TABLE "ad_connections" ADD COLUMN IF NOT EXISTS "platform_account_timezone" text;
