CREATE TABLE IF NOT EXISTS "trustai_system_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(30) NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(255),
	"description" text,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'unknown' NOT NULL,
	"status_message" text,
	"status_checked_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trustai_system_configs_cat_key_idx" ON "trustai_system_configs" USING btree ("category","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_system_configs_category_idx" ON "trustai_system_configs" USING btree ("category");