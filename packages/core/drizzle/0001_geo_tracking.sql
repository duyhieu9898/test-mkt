CREATE TABLE "geo_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prompt_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"response_text" text NOT NULL,
	"brand_mentioned" boolean DEFAULT false NOT NULL,
	"mention_position" integer,
	"competitors_mentioned" jsonb DEFAULT '[]'::jsonb,
	"sentiment" varchar(16) DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_share_of_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"period_days" integer DEFAULT 7 NOT NULL,
	"sov_percent" real DEFAULT 0 NOT NULL,
	"brand_mentions_count" integer DEFAULT 0 NOT NULL,
	"total_mentions_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geo_prompts" ADD CONSTRAINT "geo_prompts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_mentions" ADD CONSTRAINT "geo_mentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_mentions" ADD CONSTRAINT "geo_mentions_prompt_id_geo_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."geo_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_share_of_voice" ADD CONSTRAINT "geo_share_of_voice_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_prompts_company_idx" ON "geo_prompts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_mentions_company_idx" ON "geo_mentions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_mentions_prompt_idx" ON "geo_mentions" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "geo_mentions_run_at_idx" ON "geo_mentions" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "geo_sov_company_idx" ON "geo_share_of_voice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_sov_computed_at_idx" ON "geo_share_of_voice" USING btree ("computed_at");
