CREATE TABLE IF NOT EXISTS "trustai_credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan" varchar(30) DEFAULT 'free' NOT NULL,
	"monthly_grant" integer DEFAULT 100 NOT NULL,
	"monthly_balance" integer DEFAULT 100 NOT NULL,
	"topup_balance" integer DEFAULT 0 NOT NULL,
	"rollover_balance" integer DEFAULT 0 NOT NULL,
	"billing_period_start" timestamp DEFAULT now() NOT NULL,
	"billing_period_end" timestamp NOT NULL,
	"byo_key_discount" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" varchar(100),
	"stripe_subscription_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_credit_plans" (
	"key" varchar(30) PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text,
	"monthly_price_cents" integer DEFAULT 0 NOT NULL,
	"yearly_price_cents" integer DEFAULT 0 NOT NULL,
	"monthly_grant" integer DEFAULT 0 NOT NULL,
	"rollover_months" integer DEFAULT 1 NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"byo_key_discount_pct" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_price_id_monthly" varchar(100),
	"stripe_price_id_yearly" varchar(100),
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"feature_key" varchar(100),
	"tier" varchar(20),
	"ref_kind" varchar(30),
	"ref_id" varchar(100),
	"actor" varchar(255),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_credit_balances" ADD CONSTRAINT "trustai_credit_balances_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_credit_transactions" ADD CONSTRAINT "trustai_credit_transactions_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trustai_credit_balances_tenant_idx" ON "trustai_credit_balances" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_credit_tx_tenant_idx" ON "trustai_credit_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_credit_tx_created_idx" ON "trustai_credit_transactions" USING btree ("created_at");