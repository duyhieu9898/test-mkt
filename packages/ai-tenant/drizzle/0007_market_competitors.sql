CREATE TABLE IF NOT EXISTS "trustai_market_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(1024),
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"last_scan_at" timestamp,
	"latest_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_market_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"competitor_id" uuid,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_summary" text,
	"recommended_action" text,
	"error_message" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_market_competitors" ADD CONSTRAINT "trustai_market_competitors_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_market_scans" ADD CONSTRAINT "trustai_market_scans_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_market_scans" ADD CONSTRAINT "trustai_market_scans_competitor_id_trustai_market_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."trustai_market_competitors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_market_comp_tenant_idx" ON "trustai_market_competitors" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_market_scans_tenant_idx" ON "trustai_market_scans" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_market_scans_comp_idx" ON "trustai_market_scans" USING btree ("competitor_id");
