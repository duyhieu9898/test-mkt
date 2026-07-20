CREATE TABLE IF NOT EXISTS "oauth_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"status" varchar(30) DEFAULT 'connected' NOT NULL,
	"provider_account_id" text,
	"provider_account_name" text,
	"provider_account_email" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "oauth_integrations" ADD CONSTRAINT "oauth_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "oauth_integrations" ADD CONSTRAINT "oauth_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_integrations_company_user_provider_uidx" ON "oauth_integrations" USING btree ("company_id","user_id","provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_integrations_company_provider_idx" ON "oauth_integrations" USING btree ("company_id","provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_integrations_user_provider_idx" ON "oauth_integrations" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_integrations_status_idx" ON "oauth_integrations" USING btree ("status");
