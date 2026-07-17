-- Block 2: Brand IQ Layer. Single per-company profile that every agent
-- reads before producing user-facing output. Versioned: latest row per
-- company has is_active = true.

CREATE TABLE IF NOT EXISTS "brand_iq_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_url" text,
	"source_samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice" jsonb NOT NULL,
	"audience_personas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_guide" jsonb NOT NULL,
	"visual_identity" jsonb NOT NULL,
	"okrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tagline" text,
	"generated_by" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brand_iq_profiles" ADD CONSTRAINT "brand_iq_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_iq_company_idx" ON "brand_iq_profiles" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_iq_active_idx" ON "brand_iq_profiles" ("company_id","is_active");
