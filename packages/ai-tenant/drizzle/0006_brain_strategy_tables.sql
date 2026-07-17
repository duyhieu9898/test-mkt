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
DO $$ BEGIN
 ALTER TABLE "trustai_brain_market_position" ADD CONSTRAINT "trustai_brain_market_position_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "trustai_brain_marketing_strategy" ADD CONSTRAINT "trustai_brain_marketing_strategy_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_brain_market_pos_tenant_idx" ON "trustai_brain_market_position" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_brain_sales_pb_tenant_idx" ON "trustai_brain_sales_playbook" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_brain_mkt_strat_tenant_idx" ON "trustai_brain_marketing_strategy" USING btree ("tenant_id");
