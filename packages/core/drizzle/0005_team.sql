-- Block 3: AI Employees + Vector Memory. Requires pgvector extension
-- (already enabled in the 1person-postgres image).

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "embedding_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" text,
	"chunk_text" text NOT NULL,
	"chunk_order" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embedding_chunks" ADD CONSTRAINT "embedding_chunks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_chunks_company_idx" ON "embedding_chunks" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_chunks_source_idx" ON "embedding_chunks" ("company_id","source_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_chunks_source_id_idx" ON "embedding_chunks" ("company_id","source_type","source_id");
--> statement-breakpoint
-- IVFFlat cosine index. lists=100 is a fine default for up to ~1M rows
-- per company; we'll revisit when any tenant approaches that.
CREATE INDEX IF NOT EXISTS "embedding_chunks_vector_idx" ON "embedding_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_personalities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(80) NOT NULL,
	"role_title" varchar(120) NOT NULL,
	"department" varchar(32) NOT NULL,
	"avatar_emoji" varchar(8) NOT NULL,
	"accent_color" varchar(7) NOT NULL,
	"intro" text NOT NULL,
	"persona_prompt" text NOT NULL,
	"kpi_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_personalities" ADD CONSTRAINT "agent_personalities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_personalities_company_idx" ON "agent_personalities" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_personalities_slug_idx" ON "agent_personalities" ("company_id","slug");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "employee_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_slug" varchar(50) NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employee_chats" ADD CONSTRAINT "employee_chats_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_chats_company_idx" ON "employee_chats" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_chats_thread_idx" ON "employee_chats" ("company_id","employee_slug");
