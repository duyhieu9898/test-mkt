UPDATE "ad_campaigns"
SET "source_account_id" = REGEXP_REPLACE(ac."platform_account_id", '^act_', '')
FROM "ad_connections" ac
WHERE "ad_campaigns"."connection_id" = ac."id"
  AND "ad_campaigns"."source_account_id" IS NULL
  AND ac."platform_account_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "ad_sets"
SET "source_account_id" = c."source_account_id"
FROM "ad_campaigns" c
WHERE "ad_sets"."campaign_id" = c."id"
  AND "ad_sets"."source_account_id" IS NULL
  AND c."source_account_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "ads"
SET "source_account_id" = c."source_account_id"
FROM "ad_campaigns" c
WHERE "ads"."campaign_id" = c."id"
  AND "ads"."source_account_id" IS NULL
  AND c."source_account_id" IS NOT NULL;
