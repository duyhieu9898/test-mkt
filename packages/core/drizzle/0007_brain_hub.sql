-- Brain Hub Phase A — source-agnostic data plane.
-- Two tables: data_sources (registry) + data_events (the stream).
-- Reuses pgvector extension already enabled in 0005_team.sql.

CREATE TABLE IF NOT EXISTS "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(32) NOT NULL,
	"subtype" varchar(64),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"last_error" text,
	"event_count" jsonb DEFAULT '{"total":0,"last7d":0}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_sources_company_idx" ON "data_sources" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_sources_type_idx" ON "data_sources" ("company_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_sources_status_idx" ON "data_sources" ("company_id","status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "data_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"topic_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" varchar(20),
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_events" ADD CONSTRAINT "data_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_events" ADD CONSTRAINT "data_events_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_events_company_idx" ON "data_events" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_events_source_idx" ON "data_events" ("company_id","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_events_type_idx" ON "data_events" ("company_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_events_occurred_idx" ON "data_events" ("company_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_events_sentiment_idx" ON "data_events" ("company_id","sentiment");
--> statement-breakpoint
-- ivfflat cosine index for semantic search across the event stream.
CREATE INDEX IF NOT EXISTS "data_events_vector_idx" ON "data_events" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
