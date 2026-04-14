CREATE TABLE IF NOT EXISTS "trustai_deployment_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mode" varchar(20) NOT NULL,
	"vllm_url" text,
	"vllm_model" varchar(255),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trustai_deployment_modes" ADD CONSTRAINT "trustai_deployment_modes_tenant_id_trustai_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."trustai_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trustai_deployment_modes_tenant_idx" ON "trustai_deployment_modes" USING btree ("tenant_id");