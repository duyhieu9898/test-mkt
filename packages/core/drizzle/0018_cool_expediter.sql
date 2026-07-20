CREATE TYPE "public"."omni_channel" AS ENUM('fb_messenger', 'zalo', 'whatsapp', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."omni_connection_status" AS ENUM('active', 'paused', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."omni_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."omni_message_status" AS ENUM('received', 'replied', 'pending_human', 'failed');--> statement-breakpoint
ALTER TYPE "public"."section_type" ADD VALUE 'image' BEFORE 'footer';--> statement-breakpoint
CREATE TABLE "landing_page_blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landing_page_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(300) NOT NULL,
	"excerpt" text,
	"content" text,
	"cover_image_url" varchar(1000),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"seo" jsonb,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"platform" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"connected_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ceo_daily_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"date" date NOT NULL,
	"missions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"source_advisor_brief_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ceo_missions_company_date_uq" UNIQUE("company_id","date")
);
--> statement-breakpoint
CREATE TABLE "ceo_streaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"total_missions_completed" integer DEFAULT 0 NOT NULL,
	"weekly_completion_rates" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ceo_streaks_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "geo_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"response_text" text NOT NULL,
	"brand_mentioned" boolean DEFAULT false NOT NULL,
	"mention_position" integer,
	"competitors_mentioned" jsonb DEFAULT '[]'::jsonb,
	"sentiment" varchar(16) DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prompt_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geo_share_of_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"period_days" integer DEFAULT 7 NOT NULL,
	"sov_percent" real DEFAULT 0 NOT NULL,
	"brand_mentions_count" integer DEFAULT 0 NOT NULL,
	"total_mentions_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" "omni_channel" NOT NULL,
	"connection_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "omni_connection_status" DEFAULT 'active' NOT NULL,
	"ai_auto_reply" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp
);
--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE TABLE "brand_iq_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_url" text,
	"source_samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice" jsonb NOT NULL,
	"audience_personas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_guide" jsonb NOT NULL,
	"visual_identity" jsonb NOT NULL,
	"okrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"jtbd_forces" jsonb,
	"customer_language" jsonb,
	"anti_personas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tagline" text,
	"generated_by" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_personalities" (
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
CREATE TABLE "embedding_chunks" (
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
CREATE TABLE "employee_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_slug" varchar(50) NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"status" varchar(30) DEFAULT 'connected' NOT NULL,
	"provider_account_id" text,
	"provider_account_name" text,
	"provider_account_email" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"brief" text,
	"targets" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"blog_post_id" uuid,
	"hero_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_autopilot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"posts_per_day" integer DEFAULT 1 NOT NULL,
	"targets" jsonb DEFAULT '{"wordpress":true,"facebook":false,"linkedin":false,"instagram":false}'::jsonb NOT NULL,
	"mode" varchar(16) DEFAULT 'draft' NOT NULL,
	"keyword_queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"used_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "content_autopilot_company_id_unique" UNIQUE("company_id")
);
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
CREATE TABLE "data_events" (
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
CREATE TABLE "data_sources" (
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
ALTER TABLE "chatbot_config" DROP CONSTRAINT "chatbot_config_company_id_unique";--> statement-breakpoint
ALTER TABLE "blog_posts" ALTER COLUMN "keyword" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "subdomain" varchar(100);--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "publish_approval_status" varchar(20) DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "publish_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "publish_approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "publish_approved_by" uuid;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "publish_reject_reason" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "bot_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "visitor_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "handoff_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "handoff_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "knowledge_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "logo_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "avatar_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "welcome_flow" jsonb;--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "powered_by_visible" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "handoff_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD COLUMN "handoff_confidence_threshold" real DEFAULT 0.4;--> statement-breakpoint
ALTER TABLE "landing_page_blog_posts" ADD CONSTRAINT "landing_page_blog_posts_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_blog_posts" ADD CONSTRAINT "landing_page_blog_posts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_channels" ADD CONSTRAINT "chatbot_channels_bot_id_chatbot_config_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."chatbot_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceo_daily_missions" ADD CONSTRAINT "ceo_daily_missions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceo_streaks" ADD CONSTRAINT "ceo_streaks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_mentions" ADD CONSTRAINT "geo_mentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_mentions" ADD CONSTRAINT "geo_mentions_prompt_id_geo_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."geo_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_prompts" ADD CONSTRAINT "geo_prompts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_share_of_voice" ADD CONSTRAINT "geo_share_of_voice_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_grades" ADD CONSTRAINT "content_grades_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omnichannel_messages" ADD CONSTRAINT "omnichannel_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omnichannel_messages" ADD CONSTRAINT "omnichannel_messages_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_iq_profiles" ADD CONSTRAINT "brand_iq_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_personalities" ADD CONSTRAINT "agent_personalities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_chunks" ADD CONSTRAINT "embedding_chunks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_chats" ADD CONSTRAINT "employee_chats_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_integrations" ADD CONSTRAINT "oauth_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_integrations" ADD CONSTRAINT "oauth_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_launches" ADD CONSTRAINT "campaign_launches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_autopilot" ADD CONSTRAINT "content_autopilot_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_reactions" ADD CONSTRAINT "brain_reactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_reactions" ADD CONSTRAINT "brain_reactions_watcher_id_brain_watchers_id_fk" FOREIGN KEY ("watcher_id") REFERENCES "public"."brain_watchers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_watchers" ADD CONSTRAINT "brain_watchers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_events" ADD CONSTRAINT "data_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_events" ADD CONSTRAINT "data_events_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "landing_blog_posts_page_idx" ON "landing_page_blog_posts" USING btree ("landing_page_id");--> statement-breakpoint
CREATE INDEX "landing_blog_posts_company_idx" ON "landing_page_blog_posts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "landing_blog_posts_slug_idx" ON "landing_page_blog_posts" USING btree ("landing_page_id","slug");--> statement-breakpoint
CREATE INDEX "landing_blog_posts_status_idx" ON "landing_page_blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chatbot_channels_bot_idx" ON "chatbot_channels" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "chatbot_channels_platform_idx" ON "chatbot_channels" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ceo_missions_company_date_idx" ON "ceo_daily_missions" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "ceo_streaks_company_idx" ON "ceo_streaks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_mentions_company_idx" ON "geo_mentions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_mentions_prompt_idx" ON "geo_mentions" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "geo_mentions_run_at_idx" ON "geo_mentions" USING btree ("run_at");--> statement-breakpoint
CREATE INDEX "geo_prompts_company_idx" ON "geo_prompts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_sov_company_idx" ON "geo_share_of_voice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "geo_sov_computed_at_idx" ON "geo_share_of_voice" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "content_grades_company_created_idx" ON "content_grades" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "channel_connections_company_idx" ON "channel_connections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "channel_connections_channel_idx" ON "channel_connections" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "omnichannel_messages_company_idx" ON "omnichannel_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "omnichannel_messages_connection_idx" ON "omnichannel_messages" USING btree ("channel_connection_id");--> statement-breakpoint
CREATE INDEX "omnichannel_messages_thread_idx" ON "omnichannel_messages" USING btree ("external_thread_id");--> statement-breakpoint
CREATE INDEX "brand_iq_company_idx" ON "brand_iq_profiles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "brand_iq_active_idx" ON "brand_iq_profiles" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "agent_personalities_company_idx" ON "agent_personalities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_personalities_slug_idx" ON "agent_personalities" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "embedding_chunks_company_idx" ON "embedding_chunks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "embedding_chunks_source_idx" ON "embedding_chunks" USING btree ("company_id","source_type");--> statement-breakpoint
CREATE INDEX "embedding_chunks_source_id_idx" ON "embedding_chunks" USING btree ("company_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "employee_chats_company_idx" ON "employee_chats" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employee_chats_thread_idx" ON "employee_chats" USING btree ("company_id","employee_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_integrations_company_user_provider_uidx" ON "oauth_integrations" USING btree ("company_id","user_id","provider");--> statement-breakpoint
CREATE INDEX "oauth_integrations_company_provider_idx" ON "oauth_integrations" USING btree ("company_id","provider");--> statement-breakpoint
CREATE INDEX "oauth_integrations_user_provider_idx" ON "oauth_integrations" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "oauth_integrations_status_idx" ON "oauth_integrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_launches_company_idx" ON "campaign_launches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "campaign_launches_status_idx" ON "campaign_launches" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "content_autopilot_company_idx" ON "content_autopilot" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "content_autopilot_due_idx" ON "content_autopilot" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "brain_reactions_company_idx" ON "brain_reactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "brain_reactions_watcher_idx" ON "brain_reactions" USING btree ("company_id","watcher_id");--> statement-breakpoint
CREATE INDEX "brain_reactions_status_idx" ON "brain_reactions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "brain_reactions_fired_idx" ON "brain_reactions" USING btree ("company_id","fired_at");--> statement-breakpoint
CREATE INDEX "brain_reactions_groupkey_idx" ON "brain_reactions" USING btree ("company_id","watcher_id","group_key");--> statement-breakpoint
CREATE INDEX "brain_watchers_company_idx" ON "brain_watchers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "brain_watchers_slug_idx" ON "brain_watchers" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "brain_watchers_status_idx" ON "brain_watchers" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "data_events_company_idx" ON "data_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "data_events_source_idx" ON "data_events" USING btree ("company_id","source_id");--> statement-breakpoint
CREATE INDEX "data_events_type_idx" ON "data_events" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "data_events_occurred_idx" ON "data_events" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "data_events_sentiment_idx" ON "data_events" USING btree ("company_id","sentiment");--> statement-breakpoint
CREATE INDEX "data_sources_company_idx" ON "data_sources" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "data_sources_type_idx" ON "data_sources" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "data_sources_status_idx" ON "data_sources" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "landing_pages_subdomain_idx" ON "landing_pages" USING btree ("subdomain");--> statement-breakpoint
CREATE INDEX "landing_pages_publish_status_idx" ON "landing_pages" USING btree ("publish_approval_status");--> statement-breakpoint
CREATE INDEX "chat_conversations_bot_idx" ON "chat_conversations" USING btree ("bot_id");--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_subdomain_unique" UNIQUE("subdomain");