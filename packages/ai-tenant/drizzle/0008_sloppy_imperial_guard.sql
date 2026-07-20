CREATE TABLE IF NOT EXISTS "trustai_brain_market_position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"swot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"differentiation" text,
	"positioning_statement" text,
	"target_market" text,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_brain_marketing_strategy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_budget" varchar(64),
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"funnel_stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_brain_sales_playbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"ideal_customer_profile" text,
	"qualification_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closing_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email_templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_ceo_advisor_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"headline" text,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" varchar(100),
	"trace_id" varchar(100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid,
	"title" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"company" varchar(255),
	"value" varchar(64),
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"stage" varchar(30) DEFAULT 'discovery' NOT NULL,
	"close_date" timestamp,
	"notes" text,
	"next_action" text,
	"next_action_due_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
 ALTER TABLE "trustai_brain_market_position" ADD CONSTRAINT "trustai_brain_market_position_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_brain_marketing_strategy" ADD CONSTRAINT "trustai_brain_marketing_strategy_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_brain_sales_playbook" ADD CONSTRAINT "trustai_brain_sales_playbook_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_ceo_advisor_briefs" ADD CONSTRAINT "trustai_ceo_advisor_briefs_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_deal_events" ADD CONSTRAINT "trustai_deal_events_deal_id_trustai_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."trustai_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_deals" ADD CONSTRAINT "trustai_deals_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
CREATE INDEX IF NOT EXISTS "trustai_brain_market_pos_tenant_idx" ON "trustai_brain_market_position" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_brain_mkt_strat_tenant_idx" ON "trustai_brain_marketing_strategy" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_brain_sales_pb_tenant_idx" ON "trustai_brain_sales_playbook" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_ceo_brief_tenant_idx" ON "trustai_ceo_advisor_briefs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_deal_events_deal_idx" ON "trustai_deal_events" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_deals_tenant_idx" ON "trustai_deals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_deals_stage_idx" ON "trustai_deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_market_comp_tenant_idx" ON "trustai_market_competitors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_market_scans_tenant_idx" ON "trustai_market_scans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_market_scans_comp_idx" ON "trustai_market_scans" USING btree ("competitor_id");