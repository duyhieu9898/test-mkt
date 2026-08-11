ALTER TABLE "ad_connections" ALTER COLUMN "meta_ads_performance_date_preset" SET DEFAULT 'last_30d';
--> statement-breakpoint
UPDATE "ad_connections"
SET "meta_ads_performance_date_preset" = 'last_30d'
WHERE "meta_ads_performance_date_preset" IS NULL
   OR "meta_ads_performance_date_preset" NOT IN ('today', 'yesterday', 'today_and_yesterday', 'last_7d', 'last_30d', 'last_90d', 'last_360d', 'this_week', 'this_month', 'last_month');
