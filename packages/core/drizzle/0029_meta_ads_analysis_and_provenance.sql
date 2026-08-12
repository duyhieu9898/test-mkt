ALTER TABLE "ad_campaigns" ADD COLUMN "source_account_id" text;
--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD COLUMN "origin" text NOT NULL DEFAULT 'managed';
--> statement-breakpoint
ALTER TABLE "ad_sets" ADD COLUMN "source_account_id" text;
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "source_account_id" text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ad_campaign_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"campaign_id" uuid NOT NULL REFERENCES "ad_campaigns"("id") ON DELETE cascade,
	"connection_id" uuid NOT NULL REFERENCES "ad_connections"("id") ON DELETE cascade,
	"source_account_id" text NOT NULL,
	"status" text NOT NULL,
	"baseline_window" jsonb NOT NULL,
	"current_window" jsonb NOT NULL,
	"baseline_snapshot" jsonb NOT NULL,
	"current_snapshot" jsonb NOT NULL,
	"findings" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"analysis_version" text DEFAULT 'meta-ads-v1' NOT NULL,
	"analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL UNIQUE,
	"user_id" text NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"platform" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_recommendations" ADD COLUMN "analysis_id" uuid REFERENCES "ad_campaign_analyses"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_campaign_analyses_company_campaign_idx" ON "ad_campaign_analyses" ("company_id", "campaign_id", "analyzed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_nonce_idx" ON "oauth_states" ("nonce");
