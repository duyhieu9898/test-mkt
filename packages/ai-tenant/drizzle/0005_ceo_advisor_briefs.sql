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
DO $$ BEGIN
 ALTER TABLE "trustai_ceo_advisor_briefs" ADD CONSTRAINT "trustai_ceo_advisor_briefs_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_ceo_brief_tenant_idx" ON "trustai_ceo_advisor_briefs" USING btree ("tenant_id");
