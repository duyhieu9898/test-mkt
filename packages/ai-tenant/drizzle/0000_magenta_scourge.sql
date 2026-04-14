CREATE TABLE IF NOT EXISTS "trustai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"actor" varchar(255) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_hash" varchar(64),
	"previous_entry_hash" varchar(64),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer,
	"embedding" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_query_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"retrieved_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"retrieval_time_ms" integer,
	"inference_time_ms" integer,
	"trace_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"system_prompt" text NOT NULL,
	"tone" varchar(20) DEFAULT 'professional' NOT NULL,
	"temperature" real DEFAULT 0.7 NOT NULL,
	"max_context_chunks" integer DEFAULT 5 NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer,
	"file_hash" varchar(64) NOT NULL,
	"file_path" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'uploading' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trustai_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trustai_tenants_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_audit_log" ADD CONSTRAINT "trustai_audit_log_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_document_chunks" ADD CONSTRAINT "trustai_document_chunks_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_document_chunks" ADD CONSTRAINT "trustai_document_chunks_document_id_trustai_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."trustai_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_query_history" ADD CONSTRAINT "trustai_query_history_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_query_history" ADD CONSTRAINT "trustai_query_history_agent_id_trustai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."trustai_agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_agents" ADD CONSTRAINT "trustai_agents_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_documents" ADD CONSTRAINT "trustai_documents_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_audit_tenant_idx" ON "trustai_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_audit_action_idx" ON "trustai_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_audit_timestamp_idx" ON "trustai_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_chunks_tenant_idx" ON "trustai_document_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_chunks_doc_idx" ON "trustai_document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_queries_tenant_idx" ON "trustai_query_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_agents_tenant_idx" ON "trustai_agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trustai_docs_tenant_idx" ON "trustai_documents" USING btree ("tenant_id");