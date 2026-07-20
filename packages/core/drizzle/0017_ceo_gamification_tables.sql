CREATE TABLE IF NOT EXISTS "ceo_daily_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"date" date NOT NULL,
	"missions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"source_advisor_brief_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ceo_streaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"total_missions_completed" integer DEFAULT 0 NOT NULL,
	"weekly_completion_rates" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ceo_daily_missions" ADD CONSTRAINT "ceo_daily_missions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ceo_streaks" ADD CONSTRAINT "ceo_streaks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ceo_missions_company_date_idx" ON "ceo_daily_missions" USING btree ("company_id","date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ceo_missions_company_date_uq" ON "ceo_daily_missions" USING btree ("company_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ceo_streaks_company_idx" ON "ceo_streaks" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ceo_streaks_company_id_uq" ON "ceo_streaks" USING btree ("company_id");
