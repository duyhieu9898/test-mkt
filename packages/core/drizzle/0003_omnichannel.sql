-- Block 6 / Đợt 6: Omnichannel Inbox MVP (FB Messenger first; Zalo/WhatsApp/IG
-- reserved in enum, no code until API approval).

CREATE TYPE "public"."omni_channel" AS ENUM('fb_messenger', 'zalo', 'whatsapp', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."omni_connection_status" AS ENUM('active', 'paused', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."omni_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."omni_message_status" AS ENUM('received', 'replied', 'pending_human', 'failed');--> statement-breakpoint

CREATE TABLE "channel_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "channel" "omni_channel" NOT NULL,
  "connection_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" "omni_connection_status" DEFAULT 'active' NOT NULL,
  "ai_auto_reply" boolean DEFAULT false NOT NULL,
  "connected_at" timestamp DEFAULT now() NOT NULL,
  "last_message_at" timestamp
);--> statement-breakpoint

CREATE TABLE "omnichannel_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "channel_connection_id" uuid NOT NULL,
  "channel" "omni_channel" NOT NULL,
  "external_thread_id" varchar(255) NOT NULL,
  "external_message_id" varchar(255),
  "direction" "omni_message_direction" NOT NULL,
  "sender_external_id" varchar(255),
  "sender_name" varchar(255),
  "content" text NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ai_handled" boolean DEFAULT false NOT NULL,
  "agent_id" uuid,
  "received_at" timestamp,
  "sent_at" timestamp,
  "status" "omni_message_status" DEFAULT 'received' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omnichannel_messages" ADD CONSTRAINT "omnichannel_messages_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omnichannel_messages" ADD CONSTRAINT "omnichannel_messages_channel_connection_id_channel_connections_id_fk"
  FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "channel_connections_company_idx" ON "channel_connections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "channel_connections_channel_idx" ON "channel_connections" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "omnichannel_messages_company_idx" ON "omnichannel_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "omnichannel_messages_connection_idx" ON "omnichannel_messages" USING btree ("channel_connection_id");--> statement-breakpoint
CREATE INDEX "omnichannel_messages_thread_idx" ON "omnichannel_messages" USING btree ("external_thread_id");
