ALTER TABLE "ad_connections" ADD COLUMN IF NOT EXISTS "meta_ads_performance_date_preset" text DEFAULT 'last_7d' NOT NULL;
--> statement-breakpoint
UPDATE "ad_connections"
SET "meta_ads_performance_date_preset" = CASE "meta_ads_performance_window_days"
  WHEN 30 THEN 'last_30d'
  WHEN 90 THEN 'last_90d'
  WHEN 365 THEN 'last_360d'
  WHEN 1095 THEN 'last_3y'
  ELSE 'last_7d'
END;
