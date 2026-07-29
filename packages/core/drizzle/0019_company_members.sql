CREATE TABLE IF NOT EXISTS "company_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(40) DEFAULT 'viewer' NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "company_members" ADD CONSTRAINT "company_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_members_company_user_uidx" ON "company_members" USING btree ("company_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_members_company_idx" ON "company_members" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_members_user_idx" ON "company_members" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_members_status_idx" ON "company_members" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_members_role_idx" ON "company_members" USING btree ("role");
