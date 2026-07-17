ALTER TABLE "knowledge_base" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "bot_id" uuid;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "handoff_at" timestamp;
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "handoff_staff_id" uuid;
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "knowledge_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "logo_url" varchar(1000);
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(1000);
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "welcome_flow" jsonb;
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "powered_by_visible" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "handoff_enabled" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN IF NOT EXISTS "handoff_confidence_threshold" real DEFAULT 0.4;
--> statement-breakpoint
ALTER TABLE "chatbot_config" DROP CONSTRAINT IF EXISTS "chatbot_config_company_id_unique";
