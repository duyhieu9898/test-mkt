-- Brain Hub Phase B — Watchers + Reactions.
-- Builds on 0007_brain_hub.sql. No new extensions required.

CREATE TABLE "brain_watchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"condition" jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooldown_hours" jsonb DEFAULT '72'::jsonb NOT NULL,
	"auto_mode" varchar(24) DEFAULT 'review' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_fired_at" timestamp,
	"fire_count" jsonb DEFAULT '0'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brain_watchers" ADD CONSTRAINT "brain_watchers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "brain_watchers_company_idx" ON "brain_watchers" ("company_id");
--> statement-breakpoint
CREATE INDEX "brain_watchers_slug_idx" ON "brain_watchers" ("company_id","slug");
--> statement-breakpoint
CREATE INDEX "brain_watchers_status_idx" ON "brain_watchers" ("company_id","status");
--> statement-breakpoint

CREATE TABLE "brain_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"watcher_id" uuid NOT NULL,
	"group_key" varchar(200) NOT NULL,
	"headline" varchar(255) NOT NULL,
	"summary" text,
	"trigger_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"drafts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'suggested' NOT NULL,
	"fired_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "brain_reactions" ADD CONSTRAINT "brain_reactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brain_reactions" ADD CONSTRAINT "brain_reactions_watcher_id_brain_watchers_id_fk" FOREIGN KEY ("watcher_id") REFERENCES "public"."brain_watchers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "brain_reactions_company_idx" ON "brain_reactions" ("company_id");
--> statement-breakpoint
CREATE INDEX "brain_reactions_watcher_idx" ON "brain_reactions" ("company_id","watcher_id");
--> statement-breakpoint
CREATE INDEX "brain_reactions_status_idx" ON "brain_reactions" ("company_id","status");
--> statement-breakpoint
CREATE INDEX "brain_reactions_fired_idx" ON "brain_reactions" ("company_id","fired_at");
--> statement-breakpoint
CREATE INDEX "brain_reactions_groupkey_idx" ON "brain_reactions" ("company_id","watcher_id","group_key");
