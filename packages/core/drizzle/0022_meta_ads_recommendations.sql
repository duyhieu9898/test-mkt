CREATE TABLE IF NOT EXISTS "ad_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"status" text DEFAULT 'recommended' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"type" text NOT NULL,
	"problem" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"possible_cause" text,
	"suggested_action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analysis_input" jsonb NOT NULL,
	"analysis_version" text DEFAULT 'meta-ads-v1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ad_recommendations" ADD CONSTRAINT "ad_recommendations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ad_recommendations" ADD CONSTRAINT "ad_recommendations_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_recommendations_company_status_idx" ON "ad_recommendations" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_recommendations_campaign_created_idx" ON "ad_recommendations" USING btree ("campaign_id","created_at");
