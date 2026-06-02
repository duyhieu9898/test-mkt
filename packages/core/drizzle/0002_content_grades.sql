CREATE TABLE "content_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"content_text" text NOT NULL,
	"target_keyword" varchar(255) NOT NULL,
	"score" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_grades" ADD CONSTRAINT "content_grades_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_grades_company_created_idx" ON "content_grades" USING btree ("company_id","created_at");
