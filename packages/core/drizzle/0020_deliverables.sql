CREATE TABLE IF NOT EXISTS "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid,
	"owner_agent_id" uuid,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"type" varchar(40) NOT NULL,
	"status" varchar(40) DEFAULT 'ready_for_review' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"title" varchar(300) NOT NULL,
	"summary" text,
	"content" jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_department" varchar(120),
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"source_type" varchar(60) NOT NULL,
	"source_id" varchar(255) NOT NULL,
	"source_action_index" integer,
	"source_key" varchar(400) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_company_status_idx" ON "deliverables" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_company_type_idx" ON "deliverables" USING btree ("company_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_task_idx" ON "deliverables" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_owner_agent_idx" ON "deliverables" USING btree ("owner_agent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deliverables_company_source_uidx" ON "deliverables" USING btree ("company_id","source_key");
