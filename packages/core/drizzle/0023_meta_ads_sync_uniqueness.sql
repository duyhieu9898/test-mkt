CREATE UNIQUE INDEX IF NOT EXISTS "ad_campaigns_connection_platform_campaign_unique"
  ON "ad_campaigns" ("connection_id", "platform_campaign_id")
  WHERE "platform_campaign_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ad_sets_company_platform_ad_set_unique"
  ON "ad_sets" ("company_id", "platform_ad_set_id")
  WHERE "platform_ad_set_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ads_company_platform_ad_unique"
  ON "ads" ("company_id", "platform_ad_id")
  WHERE "platform_ad_id" IS NOT NULL;
