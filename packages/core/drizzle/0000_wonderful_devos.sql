CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('setup', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('ceo', 'marketing_manager', 'sales_manager', 'content_creator', 'ads_specialist', 'analyst', 'support', 'developer', 'custom');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('created', 'active', 'ready', 'running', 'idle', 'paused', 'waiting', 'error', 'archived', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'queued', 'in_progress', 'waiting_approval', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('task_assignment', 'task_update', 'question', 'answer', 'report', 'alert', 'chat', 'system');--> statement-breakpoint
CREATE TYPE "public"."memory_importance" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."memory_type" AS ENUM('task_result', 'strategy', 'failure_lesson', 'customer_insight', 'skill_knowledge', 'collaboration', 'decision', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."agent_message_type" AS ENUM('task_delegation', 'task_update', 'task_completion', 'request_help', 'provide_help', 'information_share', 'collaboration_invite', 'feedback', 'escalation', 'decision_request', 'decision_response', 'status_report', 'handoff');--> statement-breakpoint
CREATE TYPE "public"."agent_message_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."event_trigger_type" AS ENUM('health_threshold', 'budget_threshold', 'task_failure_rate', 'agent_performance', 'milestone_achieved', 'deadline_approaching', 'external_event', 'schedule', 'state_change');--> statement-breakpoint
CREATE TYPE "public"."strategy_horizon" AS ENUM('quarterly', 'weekly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."strategy_status" AS ENUM('draft', 'active', 'completed', 'revised', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ceo_event_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."ceo_event_status" AS ENUM('unread', 'read', 'action_taken', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ceo_event_type" AS ENUM('decision_required', 'system_alert', 'success_event', 'budget_alert', 'risk_alert', 'agent_escalation', 'task_blocked', 'strategy_update', 'info');--> statement-breakpoint
CREATE TYPE "public"."conflict_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."conflict_status" AS ENUM('detected', 'acknowledged', 'investigating', 'escalated', 'awaiting_input', 'resolved', 'dismissed', 'auto_resolved');--> statement-breakpoint
CREATE TYPE "public"."conflict_type" AS ENUM('resource', 'task', 'budget', 'priority', 'data', 'schedule', 'dependency', 'authority');--> statement-breakpoint
CREATE TYPE "public"."resolution_strategy" AS ENUM('priority_based', 'first_come', 'round_robin', 'quota_based', 'human_decision', 'ceo_decision', 'negotiation', 'merge', 'defer', 'cancel');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('api_calls', 'compute', 'storage', 'bandwidth', 'tokens', 'tools', 'external_api');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('allocation', 'usage', 'bonus', 'transfer', 'refund', 'reset', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('communication', 'analysis', 'content', 'marketing', 'sales', 'engineering', 'design', 'operations', 'finance', 'hr', 'legal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."skill_status" AS ENUM('draft', 'testing', 'published', 'deprecated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."simulation_status" AS ENUM('draft', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."simulation_type" AS ENUM('scenario', 'stress_test', 'forecast', 'optimization', 'training');--> statement-breakpoint
CREATE TYPE "public"."audience_type" AS ENUM('b2b', 'b2c', 'creator', 'smb', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."business_model" AS ENUM('subscription', 'transaction', 'service', 'advertising', 'freemium');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('saas', 'ecommerce', 'agency', 'creator', 'local_service', 'marketplace');--> statement-breakpoint
CREATE TYPE "public"."playbook_stage" AS ENUM('idea', 'mvp', 'launch', 'growth', 'optimize');--> statement-breakpoint
CREATE TYPE "public"."playbook_status" AS ENUM('active', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."guidance_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."guidance_status" AS ENUM('pending', 'shown', 'completed', 'dismissed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."guidance_type" AS ENUM('setup_task', 'milestone', 'recommendation', 'tutorial', 'insight');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('hero_image', 'feature_icon', 'banner', 'logo', 'background', 'social_preview', 'favicon', 'image', 'video', 'audio', 'document');--> statement-breakpoint
CREATE TYPE "public"."deployment_provider" AS ENUM('vercel', 'cloudflare', 'netlify', 'custom');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'building', 'deploying', 'live', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."landing_page_status" AS ENUM('draft', 'generating', 'ready', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."landing_page_style" AS ENUM('minimal', 'modern', 'bold', 'professional', 'playful', 'elegant');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."section_type" AS ENUM('hero', 'problem', 'solution', 'features', 'pricing', 'testimonials', 'faq', 'cta', 'footer', 'custom');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('ceo', 'marketing', 'sales', 'support', 'content', 'landing_page', 'custom');--> statement-breakpoint
CREATE TYPE "public"."tool_auth_method" AS ENUM('api_key', 'oauth2', 'bearer_token', 'basic_auth', 'none');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."tool_type" AS ENUM('image_generation', 'video_generation', 'text_generation', 'social_post', 'email', 'storage', 'analytics', 'calendar', 'crm', 'webhook', 'custom');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('planned', 'generating', 'ready', 'launching', 'live', 'optimizing', 'draft', 'active', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('social_organic', 'social_paid', 'email', 'content', 'ads');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('connected', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('resend', 'sendgrid', 'mailgun', 'ses', 'smtp');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('landing_page', 'form_submission', 'import', 'linkedin', 'referral', 'cold_outreach', 'ad_campaign', 'organic');--> statement-breakpoint
CREATE TYPE "public"."outreach_lead_status" AS ENUM('new', 'contacted', 'engaged', 'qualified', 'meeting_scheduled', 'proposal_sent', 'won', 'lost', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."sequence_status" AS ENUM('draft', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ad_campaign_objective" AS ENUM('awareness', 'traffic', 'engagement', 'leads', 'app_promotion', 'sales', 'conversions');--> statement-breakpoint
CREATE TYPE "public"."ad_campaign_status" AS ENUM('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ad_connection_status" AS ENUM('connected', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."ad_platform" AS ENUM('facebook', 'instagram', 'google', 'linkedin', 'tiktok');--> statement-breakpoint
CREATE TYPE "public"."ad_set_status" AS ENUM('draft', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ad_status" AS ENUM('draft', 'pending_review', 'active', 'paused', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ad_type" AS ENUM('image', 'video', 'carousel', 'collection', 'stories', 'text');--> statement-breakpoint
CREATE TYPE "public"."conversion_type" AS ENUM('lead', 'signup', 'purchase', 'download', 'contact', 'demo_request', 'newsletter', 'custom');--> statement-breakpoint
CREATE TYPE "public"."tracking_event_type" AS ENUM('page_view', 'page_exit', 'click', 'scroll', 'form_start', 'form_submit', 'form_abandon', 'button_click', 'link_click', 'video_play', 'video_complete', 'download', 'share', 'signup', 'login', 'purchase', 'custom');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploading', 'processing', 'extracted', 'approved', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('pdf', 'url', 'text', 'image', 'audio', 'doc');--> statement-breakpoint
CREATE TYPE "public"."document_visibility" AS ENUM('public', 'internal', 'confidential');--> statement-breakpoint
CREATE TYPE "public"."chat_channel" AS ENUM('widget', 'web');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('visitor', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."chatbot_access_level" AS ENUM('public', 'internal', 'admin');--> statement-breakpoint
CREATE TYPE "public"."chatbot_mode" AS ENUM('sales', 'support', 'both');--> statement-breakpoint
CREATE TYPE "public"."chatbot_tone" AS ENUM('professional', 'friendly', 'bold');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('uploading', 'transcribing', 'analyzed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."banner_status" AS ENUM('generating', 'draft', 'approved', 'rejected', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."campaign_goal" AS ENUM('traffic', 'leads', 'conversions', 'awareness', 'sales');--> statement-breakpoint
CREATE TYPE "public"."campaign_platform" AS ENUM('google', 'meta', 'linkedin', 'manual');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('generating', 'draft', 'scheduled', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."video_aspect" AS ENUM('9:16', '16:9', '1:1');--> statement-breakpoint
CREATE TYPE "public"."video_format" AS ENUM('15s', '30s', '60s');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('script', 'scenes', 'rendering', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('upload', 'stock', 'ai_generated');--> statement-breakpoint
CREATE TYPE "public"."library_asset_type" AS ENUM('image', 'video', 'icon', 'logo');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(500) NOT NULL,
	"refresh_token" varchar(500),
	"user_agent" text,
	"ip_address" varchar(45),
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"name" varchar(255) NOT NULL,
	"avatar_url" varchar(500),
	"provider" varchar(50),
	"provider_id" varchar(255),
	"preferences" jsonb DEFAULT '{"theme":"system","language":"en","notifications":{"email":true,"push":true,"dailyReport":true}}'::jsonb,
	"timezone" varchar(50) DEFAULT 'UTC',
	"role" varchar(20) DEFAULT 'user',
	"email_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"approval_status" varchar(20) DEFAULT 'pending',
	"onboarding_completed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"logo" varchar(500),
	"industry" varchar(100),
	"business_type" varchar(100),
	"status" "company_status" DEFAULT 'setup' NOT NULL,
	"settings" jsonb DEFAULT '{"timezone":"UTC","currency":"USD","language":"en","approvalThresholds":{"spending":1000,"majorDecision":true}}'::jsonb,
	"goals" jsonb,
	"business_plan" jsonb,
	"total_budget" numeric(12, 2) DEFAULT '0',
	"budget_spent" numeric(12, 2) DEFAULT '0',
	"monthly_budget" numeric(12, 2) DEFAULT '1000',
	"max_agents" integer DEFAULT 10,
	"auto_spawn_enabled" integer DEFAULT 0,
	"auto_approve_spawn" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"launched_at" timestamp,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#6366f1',
	"icon" varchar(50) DEFAULT 'building',
	"parent_id" uuid,
	"budget_allocated" numeric(12, 2) DEFAULT '0',
	"budget_spent" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"department_id" uuid,
	"name" varchar(100) NOT NULL,
	"role" "agent_role" NOT NULL,
	"title" varchar(100),
	"description" text,
	"avatar_url" varchar(500),
	"color" varchar(7) DEFAULT '#6366f1',
	"supervisor_id" uuid,
	"level" integer DEFAULT 0,
	"status" "agent_status" DEFAULT 'created' NOT NULL,
	"status_message" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"tools" jsonb DEFAULT '[]'::jsonb,
	"kpi_targets" jsonb DEFAULT '[]'::jsonb,
	"config" jsonb DEFAULT '{"model":"claude-3-5-sonnet-20241022","temperature":0.7,"maxTokens":4096,"tools":[]}'::jsonb,
	"system_prompt" text,
	"budget_limit" numeric(12, 2),
	"budget_spent" numeric(12, 2) DEFAULT '0',
	"performance_score" numeric(5, 2),
	"tasks_completed" integer DEFAULT 0,
	"tasks_failed" integer DEFAULT 0,
	"is_auto_spawned" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(100) NOT NULL,
	"role" "agent_role",
	"version" integer DEFAULT 1 NOT NULL,
	"system_prompt" text NOT NULL,
	"context_template" text,
	"examples" jsonb,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"type" varchar(20) DEFAULT 'finish_to_start',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"assigned_agent_id" uuid,
	"created_by_agent_id" uuid,
	"created_by_user_id" uuid,
	"parent_task_id" uuid,
	"root_task_id" uuid,
	"depth" integer DEFAULT 0,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"progress" integer DEFAULT 0,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"deadline" timestamp,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"error_message" text,
	"error_details" jsonb,
	"estimated_cost" numeric(10, 4),
	"actual_cost" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sender_agent_id" uuid,
	"sender_user_id" uuid,
	"receiver_agent_id" uuid,
	"receiver_user_id" uuid,
	"type" "message_type" NOT NULL,
	"subject" varchar(255),
	"content" text NOT NULL,
	"metadata" jsonb,
	"task_id" uuid,
	"thread_id" uuid,
	"reply_to_id" uuid,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"period_type" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"overall_score" numeric(5, 2),
	"kpi_scores" jsonb DEFAULT '[]'::jsonb,
	"tasks_completed" integer DEFAULT 0,
	"tasks_failed" integer DEFAULT 0,
	"average_task_time" integer,
	"budget_utilization" numeric(5, 2),
	"tokens_used" integer DEFAULT 0,
	"cost_incurred" numeric(10, 4),
	"roi_metrics" jsonb,
	"quality_metrics" jsonb,
	"efficiency_metrics" jsonb,
	"revenue_generated" numeric(15, 2) DEFAULT '0',
	"value_delivered" numeric(15, 2) DEFAULT '0',
	"roi" numeric(10, 2),
	"insights" jsonb DEFAULT '[]'::jsonb,
	"recommendations" jsonb DEFAULT '[]'::jsonb,
	"rank_in_company" integer,
	"percentile_score" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"value" numeric(15, 4) NOT NULL,
	"unit" varchar(20),
	"timestamp" timestamp NOT NULL,
	"granularity" varchar(20) DEFAULT 'hour',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"task_id" uuid,
	"tool_name" varchar(100) NOT NULL,
	"action" varchar(100) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"tokens_used" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"cost" numeric(10, 6),
	"latency_ms" integer,
	"status" varchar(20) NOT NULL,
	"error_type" varchar(100),
	"error_message" text,
	"trace_id" varchar(100),
	"span_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_name" varchar(100),
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" uuid,
	"description" text,
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"request_id" varchar(100),
	"status" varchar(20) DEFAULT 'success',
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" "memory_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"embedding" vector(1536),
	"importance" "memory_importance" DEFAULT 'medium',
	"relevance_score" real DEFAULT 1,
	"access_count" integer DEFAULT 0,
	"last_accessed_at" timestamp,
	"source_task_id" uuid,
	"metadata" jsonb,
	"expires_at" timestamp,
	"is_archived" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"source" varchar(100),
	"confidence" real DEFAULT 1,
	"verified_by_user_id" uuid,
	"visibility" varchar(20) DEFAULT 'internal' NOT NULL,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"associated_memory_id" uuid NOT NULL,
	"association_type" varchar(50) DEFAULT 'related',
	"strength" real DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"current_strategy" jsonb,
	"budget_state" jsonb,
	"agent_state" jsonb,
	"task_state" jsonb,
	"department_metrics" jsonb,
	"health_score" real DEFAULT 100,
	"health_indicators" jsonb,
	"active_alerts" jsonb,
	"recent_events" jsonb,
	"risk_assessment" jsonb,
	"last_computed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_state_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "company_state_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"snapshot_at" timestamp NOT NULL,
	"snapshot_type" varchar(20) NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"parent_objective_id" uuid,
	"level" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active',
	"progress" integer DEFAULT 0,
	"key_results" jsonb,
	"start_date" timestamp,
	"target_date" timestamp,
	"achieved_date" timestamp,
	"owner_agent_id" uuid,
	"contributing_agent_ids" jsonb,
	"department_id" uuid,
	"task_graph_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sender_agent_id" uuid,
	"receiver_agent_id" uuid,
	"receiver_department_id" uuid,
	"message_type" "agent_message_type" NOT NULL,
	"priority" "agent_message_priority" DEFAULT 'normal' NOT NULL,
	"goal" text NOT NULL,
	"context" jsonb,
	"constraints" jsonb,
	"expected_output" jsonb,
	"content" jsonb NOT NULL,
	"requires_response" integer DEFAULT 1,
	"response_deadline" timestamp,
	"response_message_id" uuid,
	"thread_id" uuid,
	"parent_message_id" uuid,
	"status" varchar(20) DEFAULT 'sent',
	"read_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_a_id" uuid NOT NULL,
	"agent_b_id" uuid NOT NULL,
	"relationship_type" varchar(50) NOT NULL,
	"collaboration_count" integer DEFAULT 0,
	"successful_collaborations" integer DEFAULT 0,
	"communication_frequency" integer DEFAULT 0,
	"trust_score" integer DEFAULT 50,
	"compatibility_score" integer DEFAULT 50,
	"strengths" jsonb,
	"challenges" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaboration_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"purpose" text NOT NULL,
	"initiator_agent_id" uuid,
	"participant_agent_ids" jsonb NOT NULL,
	"objective_id" uuid,
	"task_ids" jsonb,
	"status" varchar(20) DEFAULT 'active',
	"outcomes" jsonb,
	"message_ids" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_trigger_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"trigger_type" "event_trigger_type" NOT NULL,
	"triggered_value" real,
	"threshold_value" real,
	"trigger_reason" text,
	"actions_executed" jsonb,
	"result_summary" text,
	"success" integer DEFAULT 1,
	"reasoning_cycle_id" varchar(100),
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "event_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger_type" "event_trigger_type" NOT NULL,
	"enabled" integer DEFAULT 1,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"cooldown_minutes" integer DEFAULT 60,
	"max_triggers_per_day" integer DEFAULT 10,
	"trigger_count" integer DEFAULT 0,
	"last_triggered_at" timestamp,
	"last_triggered_value" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_alignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quarterly_horizon_id" uuid,
	"weekly_horizon_id" uuid,
	"daily_horizon_id" uuid,
	"quarterly_to_weekly_score" real,
	"weekly_to_daily_score" real,
	"overall_alignment_score" real,
	"alignment_issues" jsonb,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_horizons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"horizon" "strategy_horizon" NOT NULL,
	"status" "strategy_status" DEFAULT 'draft' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"vision" text,
	"mission" text,
	"theme" varchar(255),
	"objectives" jsonb,
	"priorities" jsonb,
	"resource_allocation" jsonb,
	"constraints" jsonb,
	"success_metrics" jsonb,
	"overall_progress" integer DEFAULT 0,
	"health_score" real DEFAULT 100,
	"parent_horizon_id" uuid,
	"created_by" varchar(50) DEFAULT 'system',
	"approved_by" uuid,
	"approved_at" timestamp,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ceo_inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" "ceo_event_type" NOT NULL,
	"severity" "ceo_event_severity" NOT NULL,
	"status" "ceo_event_status" DEFAULT 'unread' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"details" jsonb,
	"source_type" varchar(50),
	"source_id" uuid,
	"source_agent_id" uuid,
	"related_task_id" uuid,
	"related_agent_id" uuid,
	"requires_decision" integer DEFAULT 0,
	"decision_options" jsonb,
	"decision_deadline" timestamp,
	"decision_made" varchar(100),
	"decision_made_at" timestamp,
	"decision_made_by" uuid,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"action_taken_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conflict_type" "conflict_type" NOT NULL,
	"severity" "conflict_severity" DEFAULT 'medium' NOT NULL,
	"status" "conflict_status" DEFAULT 'detected' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"involved_agent_ids" uuid[] NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"task_ids" uuid[],
	"conflict_details" jsonb,
	"resolution_strategy" "resolution_strategy",
	"resolved_by" text,
	"resolution" jsonb,
	"resolved_at" timestamp,
	"escalation_level" integer DEFAULT 0,
	"escalated_at" timestamp,
	"escalation_reason" text,
	"auto_resolution_attempts" integer DEFAULT 0,
	"last_auto_resolution_at" timestamp,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"acknowledged_by" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conflict_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"description" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_resolution_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"conflict_types" "conflict_type"[],
	"severities" "conflict_severity"[],
	"agent_roles" text[],
	"resource_types" text[],
	"strategy" "resolution_strategy" NOT NULL,
	"auto_resolve" boolean DEFAULT false NOT NULL,
	"escalate_after_minutes" integer,
	"escalate_to" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"api_calls_balance" integer DEFAULT 0 NOT NULL,
	"api_calls_used" integer DEFAULT 0 NOT NULL,
	"tokens_balance" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"tools_balance" integer DEFAULT 0 NOT NULL,
	"tools_used" integer DEFAULT 0 NOT NULL,
	"external_api_balance" integer DEFAULT 0 NOT NULL,
	"external_api_used" integer DEFAULT 0 NOT NULL,
	"monthly_api_calls_limit" integer DEFAULT 10000 NOT NULL,
	"monthly_tokens_limit" integer DEFAULT 1000000 NOT NULL,
	"monthly_tools_limit" integer DEFAULT 5000 NOT NULL,
	"monthly_external_api_limit" integer DEFAULT 1000 NOT NULL,
	"budget_allocation" real DEFAULT 0 NOT NULL,
	"budget_spent" real DEFAULT 0 NOT NULL,
	"performance_multiplier" real DEFAULT 1 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_performance_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"efficiency_score" integer DEFAULT 50 NOT NULL,
	"quality_score" integer DEFAULT 50 NOT NULL,
	"speed_score" integer DEFAULT 50 NOT NULL,
	"collaboration_score" integer DEFAULT 50 NOT NULL,
	"overall_score" integer DEFAULT 50 NOT NULL,
	"calculated_multiplier" real DEFAULT 1 NOT NULL,
	"metrics" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"cost_usd" real,
	"reference_type" text,
	"reference_id" text,
	"description" text,
	"counterparty_agent_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_agent_id" uuid NOT NULL,
	"to_agent_id" uuid NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"response_reason" text,
	"approved_by" text,
	"approved_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"name" text NOT NULL,
	"price_per_unit" real NOT NULL,
	"unit_name" text NOT NULL,
	"model_pricing" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"custom_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"success_rate" real,
	"avg_execution_time" real,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"installed_by" text
);
--> statement-breakpoint
CREATE TABLE "skill_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text,
	"reviewer_id" text NOT NULL,
	"reviewer_name" text,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"task_id" uuid,
	"input" jsonb,
	"output" jsonb,
	"success" boolean NOT NULL,
	"error_message" text,
	"execution_time_ms" integer,
	"tokens_used" integer,
	"cost_usd" real,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"short_description" text,
	"category" "skill_category" NOT NULL,
	"status" "skill_status" DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text,
	"definition" jsonb NOT NULL,
	"required_capabilities" text[],
	"min_agent_level" integer DEFAULT 0,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"rating" real,
	"review_count" integer DEFAULT 0 NOT NULL,
	"tags" text[],
	"is_premium" boolean DEFAULT false NOT NULL,
	"credit_cost" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"simulation_id" uuid NOT NULL,
	"simulation_time" timestamp NOT NULL,
	"company_state" jsonb,
	"agent_states" jsonb,
	"metrics" jsonb,
	"events" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"type" "simulation_type" NOT NULL,
	"config" jsonb NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"author_id" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "simulation_type" NOT NULL,
	"status" "simulation_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"results" jsonb,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"estimated_completion" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"created_by" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'building',
	"color" varchar(7) DEFAULT '#6366f1',
	"category" "template_category" NOT NULL,
	"business_model" "business_model",
	"audience" "audience_type",
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"agents" jsonb NOT NULL,
	"departments" jsonb DEFAULT '[]'::jsonb,
	"default_strategy" jsonb,
	"detected_info" jsonb,
	"estimated_setup_minutes" integer DEFAULT 5,
	"complexity" varchar(20) DEFAULT 'medium',
	"is_active" integer DEFAULT 1,
	"is_system" integer DEFAULT 1,
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_playbook_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"playbook_id" uuid NOT NULL,
	"current_stage" "playbook_stage" DEFAULT 'idea' NOT NULL,
	"stage_started_at" timestamp DEFAULT now() NOT NULL,
	"stage_progress" jsonb DEFAULT '{}'::jsonb,
	"overall_progress" integer DEFAULT 0,
	"status" "playbook_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"stages" jsonb NOT NULL,
	"target_business_type" varchar(100),
	"target_industry" varchar(100),
	"is_active" integer DEFAULT 1,
	"is_system" integer DEFAULT 1,
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playbooks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "onboarding_guidance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "guidance_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"action_url" varchar(500),
	"action_label" varchar(100),
	"action_type" varchar(50),
	"icon" varchar(50),
	"color" varchar(7),
	"sequence" integer DEFAULT 0,
	"priority" "guidance_priority" DEFAULT 'medium',
	"show_conditions" jsonb,
	"status" "guidance_status" DEFAULT 'pending',
	"completed_at" timestamp,
	"dismissed_at" timestamp,
	"shown_at" timestamp,
	"source_type" varchar(50),
	"source_id" uuid,
	"stage_id" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"total_steps" integer DEFAULT 0,
	"completed_steps" integer DEFAULT 0,
	"current_step_number" integer DEFAULT 1,
	"percent_complete" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'in_progress',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"last_activity_at" timestamp DEFAULT now(),
	"skipped_items" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "landing_page_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"hour" integer,
	"page_views" integer DEFAULT 0,
	"unique_visitors" integer DEFAULT 0,
	"bounce_rate" numeric(5, 2),
	"avg_time_on_page" integer,
	"form_views" integer DEFAULT 0,
	"form_submissions" integer DEFAULT 0,
	"conversion_rate" numeric(5, 2),
	"source_breakdown" jsonb,
	"device_breakdown" jsonb,
	"country_breakdown" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_page_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"section_id" uuid,
	"type" "asset_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(1000) NOT NULL,
	"storage_provider" varchar(50),
	"storage_key" varchar(500),
	"mime_type" varchar(100),
	"file_size" integer,
	"width" integer,
	"height" integer,
	"alt_text" varchar(255),
	"generation_prompt" text,
	"generation_model" varchar(100),
	"is_ai_generated" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_page_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version_id" uuid,
	"provider" "deployment_provider" NOT NULL,
	"subdomain" varchar(100),
	"custom_domain" varchar(255),
	"url" varchar(500),
	"status" "deployment_status" DEFAULT 'pending',
	"build_logs" text,
	"error_message" text,
	"ssl_status" varchar(50),
	"ssl_expires_at" timestamp,
	"external_deployment_id" varchar(100),
	"external_project_id" varchar(100),
	"deployed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_page_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"phone" varchar(50),
	"company" varchar(255),
	"message" text,
	"custom_fields" jsonb,
	"source" varchar(100),
	"medium" varchar(100),
	"campaign" varchar(100),
	"referrer" varchar(500),
	"user_agent" text,
	"ip_address" varchar(45),
	"country" varchar(2),
	"city" varchar(100),
	"status" "lead_status" DEFAULT 'new',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"contacted_at" timestamp,
	"converted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "landing_page_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"type" "section_type" NOT NULL,
	"name" varchar(100),
	"order" integer DEFAULT 0 NOT NULL,
	"is_visible" integer DEFAULT 1,
	"content" jsonb,
	"background_color" varchar(7),
	"custom_styles" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(100),
	"description" text,
	"sections_snapshot" jsonb,
	"page_settings_snapshot" jsonb,
	"published_at" timestamp,
	"published_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"original_prompt" text,
	"business_context" jsonb,
	"style" "landing_page_style" DEFAULT 'modern',
	"primary_color" varchar(7) DEFAULT '#3b82f6',
	"secondary_color" varchar(7),
	"font_family" varchar(100) DEFAULT 'Inter',
	"content" jsonb,
	"seo" jsonb,
	"status" "landing_page_status" DEFAULT 'draft',
	"published_url" varchar(500),
	"custom_domain" varchar(255),
	"deployment_provider" varchar(50),
	"deployment_id" varchar(100),
	"analytics_config" jsonb,
	"is_variant" integer DEFAULT 0,
	"parent_page_id" uuid,
	"variant_name" varchar(100),
	"traffic_allocation" integer DEFAULT 100,
	"total_visitors" integer DEFAULT 0,
	"total_leads" integer DEFAULT 0,
	"conversion_rate" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "brand_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"logo_url" varchar(500),
	"logo_light_url" varchar(500),
	"favicon_url" varchar(500),
	"colors" jsonb DEFAULT '{"primary":"#3B82F6"}'::jsonb,
	"typography" jsonb DEFAULT '{}'::jsonb,
	"voice" jsonb DEFAULT '{"tone":["professional"],"personality":[],"keywords":[],"avoidWords":[]}'::jsonb,
	"style_keywords" jsonb DEFAULT '[]'::jsonb,
	"visual_style" varchar(50) DEFAULT 'modern',
	"extracted_from_url" varchar(500),
	"extracted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_identities_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "company_tool_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"credentials" jsonb NOT NULL,
	"config_override" jsonb,
	"is_enabled" boolean DEFAULT true,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"agent_type" "agent_type" NOT NULL,
	"skill_id" uuid,
	"skill_slug" varchar(100) NOT NULL,
	"task_type" varchar(100) NOT NULL,
	"task_payload" jsonb NOT NULL,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 5,
	"queued_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"result" jsonb,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"last_error" text,
	"estimated_cost" numeric(10, 6),
	"actual_cost" numeric(10, 6),
	"parent_task_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"type" "tool_type" NOT NULL,
	"provider" varchar(100),
	"api_endpoint" varchar(500),
	"auth_method" "tool_auth_method" DEFAULT 'api_key',
	"config" jsonb DEFAULT '{}'::jsonb,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"cost_per_call" numeric(10, 6) DEFAULT '0',
	"cost_unit" varchar(20) DEFAULT 'call',
	"is_active" boolean DEFAULT true,
	"is_built_in" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "execution_tools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "generated_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_agent_type" "agent_type",
	"created_by_task_id" uuid,
	"name" varchar(255),
	"asset_type" "asset_type" NOT NULL,
	"storage_provider" varchar(50) DEFAULT 'r2',
	"storage_url" varchar(1000) NOT NULL,
	"public_url" varchar(1000),
	"thumbnail_url" varchar(1000),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"generation_cost" numeric(10, 6),
	"is_public" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "campaign_type" NOT NULL,
	"campaign_status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"target_audience" text,
	"goals" jsonb DEFAULT '[]'::jsonb,
	"platforms" jsonb DEFAULT '[]'::jsonb,
	"budget" numeric(10, 2),
	"spent_amount" numeric(10, 2) DEFAULT '0',
	"start_date" timestamp,
	"end_date" timestamp,
	"total_posts" integer DEFAULT 0 NOT NULL,
	"total_impressions" integer DEFAULT 0 NOT NULL,
	"total_engagements" integer DEFAULT 0 NOT NULL,
	"total_clicks" integer DEFAULT 0 NOT NULL,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"created_by_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"video_views" integer DEFAULT 0,
	"video_watch_time" integer DEFAULT 0,
	"engagement_rate" numeric(5, 2),
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"raw_metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"created_by_agent_id" uuid,
	"platform" "social_platform" NOT NULL,
	"content_text" text NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"media_asset_ids" jsonb DEFAULT '[]'::jsonb,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"scheduled_for" timestamp NOT NULL,
	"published_at" timestamp,
	"status" "post_status" DEFAULT 'scheduled' NOT NULL,
	"platform_post_id" text,
	"platform_post_url" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"campaign_id" uuid,
	"campaign_name" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"status" "connection_status" DEFAULT 'connected' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"platform_user_id" text,
	"platform_page_id" text,
	"platform_account_name" text,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" "email_provider" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"api_key" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"reply_to_email" text,
	"domain" text,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_user" text,
	"smtp_password" text,
	"smtp_secure" boolean DEFAULT true,
	"daily_send_limit" integer DEFAULT 1000,
	"hourly_send_limit" integer DEFAULT 100,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"sent_this_hour" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "sequence_status" DEFAULT 'draft' NOT NULL,
	"trigger_type" text DEFAULT 'manual' NOT NULL,
	"trigger_conditions" jsonb DEFAULT '{}'::jsonb,
	"total_enrolled" integer DEFAULT 0 NOT NULL,
	"total_completed" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"created_by_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"company" text,
	"job_title" text,
	"linkedin_url" text,
	"website" text,
	"source" "lead_source" DEFAULT 'organic' NOT NULL,
	"status" "outreach_lead_status" DEFAULT 'new' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"last_contacted_at" timestamp,
	"last_responded_at" timestamp,
	"total_emails_sent" integer DEFAULT 0 NOT NULL,
	"total_emails_opened" integer DEFAULT 0 NOT NULL,
	"total_emails_clicked" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"source_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"sequence_id" uuid,
	"enrollment_id" uuid,
	"step_number" integer,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"replied_at" timestamp,
	"bounced_at" timestamp,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"provider_response" jsonb,
	"last_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_by_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"next_step_at" timestamp,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"paused_at" timestamp,
	"pause_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"delay_hours" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"skip_conditions" jsonb DEFAULT '{}'::jsonb,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_opened" integer DEFAULT 0 NOT NULL,
	"total_clicked" integer DEFAULT 0 NOT NULL,
	"total_replied" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"platform" "ad_platform" NOT NULL,
	"objective" "ad_campaign_objective" NOT NULL,
	"status" "ad_campaign_status" DEFAULT 'draft' NOT NULL,
	"daily_budget" numeric(10, 2),
	"total_budget" numeric(10, 2),
	"spent_amount" numeric(10, 2) DEFAULT '0',
	"start_date" timestamp,
	"end_date" timestamp,
	"target_audience" jsonb DEFAULT '{}'::jsonb,
	"platform_campaign_id" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"ctr" numeric(5, 2),
	"cpc" numeric(10, 2),
	"cpm" numeric(10, 2),
	"cpa" numeric(10, 2),
	"roas" numeric(10, 2),
	"created_by_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"status" "ad_connection_status" DEFAULT 'connected' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"platform_account_id" text,
	"platform_account_name" text,
	"platform_business_id" text,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"hour" integer,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"spend" numeric(10, 2) DEFAULT '0' NOT NULL,
	"ctr" numeric(5, 4),
	"cpc" numeric(10, 4),
	"cpm" numeric(10, 4),
	"conversion_rate" numeric(5, 4),
	"age_range" text,
	"gender" text,
	"location" text,
	"device" text,
	"placement" text,
	"raw_metrics" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "ad_set_status" DEFAULT 'draft' NOT NULL,
	"daily_budget" numeric(10, 2),
	"bid_amount" numeric(10, 2),
	"bid_strategy" text DEFAULT 'lowest_cost',
	"target_audience" jsonb,
	"placements" jsonb DEFAULT '[]'::jsonb,
	"platform_ad_set_id" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"spent_amount" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_set_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "ad_type" DEFAULT 'image' NOT NULL,
	"status" "ad_status" DEFAULT 'draft' NOT NULL,
	"headline" text,
	"primary_text" text,
	"description" text,
	"call_to_action" text DEFAULT 'Learn More',
	"destination_url" text,
	"image_url" text,
	"video_url" text,
	"thumbnail_url" text,
	"asset_id" uuid,
	"carousel_items" jsonb,
	"platform_ad_id" text,
	"platform_creative_id" text,
	"review_status" text,
	"rejection_reason" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"spent_amount" numeric(10, 2) DEFAULT '0',
	"ctr" numeric(5, 2),
	"created_by_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid,
	"lead_id" uuid,
	"type" "conversion_type" NOT NULL,
	"name" varchar(255),
	"value" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"campaign_id" uuid,
	"creative_id" uuid,
	"channel" varchar(50),
	"revenue" numeric(10, 2) DEFAULT '0',
	"cost" numeric(10, 2) DEFAULT '0',
	"source" varchar(255),
	"medium" varchar(255),
	"campaign" varchar(255),
	"content" varchar(255),
	"term" varchar(255),
	"landing_page" text,
	"referrer" text,
	"attribution_model" varchar(50) DEFAULT 'last_click',
	"touchpoints" jsonb,
	"properties" jsonb,
	"converted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_tracking_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"sessions" integer DEFAULT 0,
	"unique_visitors" integer DEFAULT 0,
	"page_views" integer DEFAULT 0,
	"avg_session_duration" integer DEFAULT 0,
	"bounce_rate" numeric(5, 2),
	"total_events" integer DEFAULT 0,
	"avg_pages_per_session" numeric(5, 2),
	"avg_scroll_depth" numeric(5, 2),
	"total_conversions" integer DEFAULT 0,
	"conversion_rate" numeric(5, 2),
	"conversion_value" numeric(12, 2) DEFAULT '0',
	"top_sources" jsonb,
	"top_pages" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"url" text NOT NULL,
	"path" varchar(500),
	"title" varchar(500),
	"page_type" varchar(100),
	"resource_id" uuid,
	"load_time" integer,
	"time_on_page" integer,
	"scroll_depth" integer,
	"interactions" integer DEFAULT 0,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"exited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tracking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"page_view_id" uuid,
	"event_type" "tracking_event_type" NOT NULL,
	"event_name" varchar(255) NOT NULL,
	"event_category" varchar(100),
	"event_label" varchar(255),
	"event_value" numeric(12, 2),
	"element_id" varchar(255),
	"element_class" varchar(500),
	"element_text" varchar(500),
	"element_tag" varchar(50),
	"properties" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"visitor_id" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"lead_id" uuid,
	"user_agent" text,
	"device_type" varchar(50),
	"browser" varchar(100),
	"browser_version" varchar(50),
	"os" varchar(100),
	"os_version" varchar(50),
	"screen_resolution" varchar(50),
	"ip_address" varchar(45),
	"country" varchar(100),
	"region" varchar(100),
	"city" varchar(100),
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(255),
	"utm_content" varchar(255),
	"utm_term" varchar(255),
	"campaign_id" uuid,
	"creative_id" uuid,
	"referrer" text,
	"referrer_domain" varchar(255),
	"landing_page" text,
	"exit_page" text,
	"page_views" integer DEFAULT 0,
	"event_count" integer DEFAULT 0,
	"duration" integer,
	"is_returning" boolean DEFAULT false,
	"is_bounce" boolean DEFAULT false,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now(),
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "document_type" NOT NULL,
	"source_url" text,
	"file_url" text,
	"file_size" integer,
	"status" "document_status" DEFAULT 'uploading' NOT NULL,
	"raw_content" text,
	"extracted_content" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"visibility" "document_visibility" DEFAULT 'internal' NOT NULL,
	"error_message" text,
	"approved_at" timestamp,
	"approved_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"visitor_id" varchar(255),
	"visitor_name" varchar(255),
	"visitor_email" varchar(255),
	"status" "chat_status" DEFAULT 'active' NOT NULL,
	"channel" "chat_channel" DEFAULT 'web' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) DEFAULT 'AI Assistant' NOT NULL,
	"greeting" text DEFAULT 'Hi! How can I help you today?' NOT NULL,
	"tone" "chatbot_tone" DEFAULT 'friendly' NOT NULL,
	"mode" "chatbot_mode" DEFAULT 'both' NOT NULL,
	"primary_color" varchar(7) DEFAULT '#6366f1',
	"access_level" "chatbot_access_level" DEFAULT 'internal' NOT NULL,
	"embed_enabled" boolean DEFAULT false NOT NULL,
	"embed_allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chatbot_config_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"audio_url" text,
	"transcript" text,
	"status" "meeting_status" DEFAULT 'uploading' NOT NULL,
	"insights" jsonb,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" varchar(255) NOT NULL,
	"size" varchar(20) NOT NULL,
	"status" "banner_status" DEFAULT 'draft' NOT NULL,
	"copy" jsonb,
	"concept" varchar(255),
	"angle" varchar(50),
	"design" jsonb,
	"image_url" text,
	"strategy_tag" varchar(50),
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"slug" varchar(500) NOT NULL,
	"meta_description" text,
	"content" text NOT NULL,
	"excerpt" text,
	"keyword" varchar(255),
	"search_intent" varchar(50),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"faq" jsonb DEFAULT '[]'::jsonb,
	"schema_markup" jsonb,
	"word_count" integer,
	"language" varchar(10) DEFAULT 'en',
	"status" varchar(20) DEFAULT 'draft',
	"cms_post_id" integer,
	"cms_post_url" text,
	"seo_job_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"goal" "campaign_goal" DEFAULT 'traffic' NOT NULL,
	"platform" "campaign_platform" DEFAULT 'manual' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"budget_daily" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'USD',
	"targeting" jsonb,
	"landing_page_url" text,
	"revenue" numeric(10, 2) DEFAULT '0',
	"cost" numeric(10, 2) DEFAULT '0',
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"start_date" timestamp,
	"end_date" timestamp,
	"launch_error" text,
	"ai_mode" boolean DEFAULT false NOT NULL,
	"ai_decisions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"url" text,
	"category" varchar(100),
	"keywords" jsonb DEFAULT '[]'::jsonb,
	"seo_status" varchar(20) DEFAULT 'pending',
	"generated_pages" jsonb DEFAULT '[]'::jsonb,
	"generated_blogs" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid,
	"platform" varchar(20) NOT NULL,
	"status" "social_post_status" DEFAULT 'draft' NOT NULL,
	"content" text NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" uuid,
	"title" varchar(255) NOT NULL,
	"format" "video_format" NOT NULL,
	"aspect_ratio" "video_aspect" NOT NULL,
	"status" "video_status" DEFAULT 'script' NOT NULL,
	"script" jsonb,
	"scenes" jsonb DEFAULT '[]'::jsonb,
	"output_url" text,
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "library_asset_type" NOT NULL,
	"source" "asset_source" DEFAULT 'upload' NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"file_size" integer,
	"mime_type" varchar(50) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"campaign_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" varchar(50) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"content" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_config_section_locale_unique" UNIQUE("section","locale")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_agent_id_agents_id_fk" FOREIGN KEY ("receiver_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiver_user_id_users_id_fk" FOREIGN KEY ("receiver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_associations" ADD CONSTRAINT "memory_associations_memory_id_agent_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."agent_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_associations" ADD CONSTRAINT "memory_associations_associated_memory_id_agent_memories_id_fk" FOREIGN KEY ("associated_memory_id") REFERENCES "public"."agent_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_state" ADD CONSTRAINT "company_state_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_state_history" ADD CONSTRAINT "company_state_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_objectives" ADD CONSTRAINT "strategic_objectives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_receiver_agent_id_agents_id_fk" FOREIGN KEY ("receiver_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_agent_a_id_agents_id_fk" FOREIGN KEY ("agent_a_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_agent_b_id_agents_id_fk" FOREIGN KEY ("agent_b_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_sessions" ADD CONSTRAINT "collaboration_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_sessions" ADD CONSTRAINT "collaboration_sessions_initiator_agent_id_agents_id_fk" FOREIGN KEY ("initiator_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_trigger_history" ADD CONSTRAINT "event_trigger_history_trigger_id_event_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."event_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_trigger_history" ADD CONSTRAINT "event_trigger_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_triggers" ADD CONSTRAINT "event_triggers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_alignment" ADD CONSTRAINT "strategy_alignment_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_alignment" ADD CONSTRAINT "strategy_alignment_quarterly_horizon_id_strategy_horizons_id_fk" FOREIGN KEY ("quarterly_horizon_id") REFERENCES "public"."strategy_horizons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_alignment" ADD CONSTRAINT "strategy_alignment_weekly_horizon_id_strategy_horizons_id_fk" FOREIGN KEY ("weekly_horizon_id") REFERENCES "public"."strategy_horizons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_alignment" ADD CONSTRAINT "strategy_alignment_daily_horizon_id_strategy_horizons_id_fk" FOREIGN KEY ("daily_horizon_id") REFERENCES "public"."strategy_horizons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_horizons" ADD CONSTRAINT "strategy_horizons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceo_inbox_events" ADD CONSTRAINT "ceo_inbox_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceo_inbox_events" ADD CONSTRAINT "ceo_inbox_events_source_agent_id_agents_id_fk" FOREIGN KEY ("source_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceo_inbox_events" ADD CONSTRAINT "ceo_inbox_events_related_task_id_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceo_inbox_events" ADD CONSTRAINT "ceo_inbox_events_related_agent_id_agents_id_fk" FOREIGN KEY ("related_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conflicts" ADD CONSTRAINT "agent_conflicts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_events" ADD CONSTRAINT "conflict_events_conflict_id_agent_conflicts_id_fk" FOREIGN KEY ("conflict_id") REFERENCES "public"."agent_conflicts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_resolution_rules" ADD CONSTRAINT "conflict_resolution_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credits" ADD CONSTRAINT "agent_credits_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credits" ADD CONSTRAINT "agent_credits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_performance_scores" ADD CONSTRAINT "agent_performance_scores_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_performance_scores" ADD CONSTRAINT "agent_performance_scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transfer_requests" ADD CONSTRAINT "credit_transfer_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transfer_requests" ADD CONSTRAINT "credit_transfer_requests_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transfer_requests" ADD CONSTRAINT "credit_transfer_requests_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_pricing" ADD CONSTRAINT "resource_pricing_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_reviews" ADD CONSTRAINT "skill_reviews_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_reviews" ADD CONSTRAINT "skill_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usage_logs" ADD CONSTRAINT "skill_usage_logs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usage_logs" ADD CONSTRAINT "skill_usage_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_usage_logs" ADD CONSTRAINT "skill_usage_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_snapshots" ADD CONSTRAINT "simulation_snapshots_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_templates" ADD CONSTRAINT "simulation_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_playbook_progress" ADD CONSTRAINT "company_playbook_progress_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_playbook_progress" ADD CONSTRAINT "company_playbook_progress_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_guidance" ADD CONSTRAINT "onboarding_guidance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_analytics" ADD CONSTRAINT "landing_page_analytics_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_assets" ADD CONSTRAINT "landing_page_assets_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_assets" ADD CONSTRAINT "landing_page_assets_section_id_landing_page_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."landing_page_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_deployments" ADD CONSTRAINT "landing_page_deployments_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_deployments" ADD CONSTRAINT "landing_page_deployments_version_id_landing_page_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."landing_page_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_leads" ADD CONSTRAINT "landing_page_leads_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_leads" ADD CONSTRAINT "landing_page_leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_sections" ADD CONSTRAINT "landing_page_sections_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_versions" ADD CONSTRAINT "landing_page_versions_page_id_landing_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_identities" ADD CONSTRAINT "brand_identities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tool_credentials" ADD CONSTRAINT "company_tool_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tool_credentials" ADD CONSTRAINT "company_tool_credentials_tool_id_execution_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."execution_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_assets" ADD CONSTRAINT "generated_assets_created_by_task_id_execution_tasks_id_fk" FOREIGN KEY ("created_by_task_id") REFERENCES "public"."execution_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_engagements" ADD CONSTRAINT "post_engagements_post_id_scheduled_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_engagements" ADD CONSTRAINT "post_engagements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_connection_id_social_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."social_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sequences" ADD CONSTRAINT "email_sequences_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_connection_id_ad_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ad_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_connections" ADD CONSTRAINT "ad_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_performance" ADD CONSTRAINT "ad_performance_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_performance" ADD CONSTRAINT "ad_performance_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_performance" ADD CONSTRAINT "ad_performance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_session_id_visitor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_creative_id_banners_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."banners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tracking_metrics" ADD CONSTRAINT "daily_tracking_metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_session_id_visitor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_session_id_visitor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_page_view_id_page_views_id_fk" FOREIGN KEY ("page_view_id") REFERENCES "public"."page_views"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_creative_id_banners_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."banners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot_config" ADD CONSTRAINT "chatbot_config_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_catalog" ADD CONSTRAINT "product_catalog_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_library" ADD CONSTRAINT "asset_library_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_config" ADD CONSTRAINT "site_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "companies" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "departments_company_idx" ON "departments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agents_company_idx" ON "agents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_supervisor_idx" ON "agents" USING btree ("supervisor_id");--> statement-breakpoint
CREATE INDEX "agents_role_idx" ON "agents" USING btree ("role");--> statement-breakpoint
CREATE INDEX "tasks_company_status_idx" ON "tasks" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "tasks_assigned_idx" ON "tasks" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_priority_idx" ON "tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "messages_company_idx" ON "messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_receiver_agent_idx" ON "messages" USING btree ("receiver_agent_id");--> statement-breakpoint
CREATE INDEX "evaluations_agent_period_idx" ON "evaluations" USING btree ("agent_id","period_start");--> statement-breakpoint
CREATE INDEX "evaluations_company_period_idx" ON "evaluations" USING btree ("company_id","period_start");--> statement-breakpoint
CREATE INDEX "metrics_company_metric_idx" ON "metrics" USING btree ("company_id","name","timestamp");--> statement-breakpoint
CREATE INDEX "metrics_agent_metric_idx" ON "metrics" USING btree ("agent_id","name");--> statement-breakpoint
CREATE INDEX "action_agent_tool_idx" ON "action_logs" USING btree ("agent_id","tool_name");--> statement-breakpoint
CREATE INDEX "action_trace_idx" ON "action_logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "action_task_idx" ON "action_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "audit_company_action_idx" ON "audit_logs" USING btree ("company_id","action","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "memories_agent_idx" ON "agent_memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "memories_company_idx" ON "agent_memories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "memories_type_idx" ON "agent_memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "memories_importance_idx" ON "agent_memories" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "knowledge_company_idx" ON "knowledge_base" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "knowledge_category_idx" ON "knowledge_base" USING btree ("category");--> statement-breakpoint
CREATE INDEX "associations_memory_idx" ON "memory_associations" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "company_state_company_idx" ON "company_state" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "state_history_company_snapshot_idx" ON "company_state_history" USING btree ("company_id","snapshot_at");--> statement-breakpoint
CREATE INDEX "objectives_company_idx" ON "strategic_objectives" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "objectives_status_idx" ON "strategic_objectives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "objectives_parent_idx" ON "strategic_objectives" USING btree ("parent_objective_id");--> statement-breakpoint
CREATE INDEX "agent_msg_sender_idx" ON "agent_messages" USING btree ("sender_agent_id");--> statement-breakpoint
CREATE INDEX "agent_msg_receiver_idx" ON "agent_messages" USING btree ("receiver_agent_id");--> statement-breakpoint
CREATE INDEX "agent_msg_thread_idx" ON "agent_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "agent_msg_type_idx" ON "agent_messages" USING btree ("message_type");--> statement-breakpoint
CREATE INDEX "agent_msg_status_idx" ON "agent_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_msg_company_idx" ON "agent_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "rel_company_idx" ON "agent_relationships" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "rel_agent_a_idx" ON "agent_relationships" USING btree ("agent_a_id");--> statement-breakpoint
CREATE INDEX "rel_agent_b_idx" ON "agent_relationships" USING btree ("agent_b_id");--> statement-breakpoint
CREATE INDEX "collab_company_idx" ON "collaboration_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "collab_initiator_idx" ON "collaboration_sessions" USING btree ("initiator_agent_id");--> statement-breakpoint
CREATE INDEX "collab_status_idx" ON "collaboration_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ceo_inbox_company_status_idx" ON "ceo_inbox_events" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "ceo_inbox_company_severity_idx" ON "ceo_inbox_events" USING btree ("company_id","severity");--> statement-breakpoint
CREATE INDEX "ceo_inbox_created_at_idx" ON "ceo_inbox_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "templates_category_idx" ON "templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "templates_active_idx" ON "templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "templates_slug_idx" ON "templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "playbook_progress_company_idx" ON "company_playbook_progress" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "playbook_progress_playbook_idx" ON "company_playbook_progress" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbook_progress_status_idx" ON "company_playbook_progress" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playbook_progress_company_playbook_idx" ON "company_playbook_progress" USING btree ("company_id","playbook_id");--> statement-breakpoint
CREATE INDEX "playbooks_template_idx" ON "playbooks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "playbooks_active_idx" ON "playbooks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "playbooks_slug_idx" ON "playbooks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "guidance_company_idx" ON "onboarding_guidance" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "guidance_company_status_idx" ON "onboarding_guidance" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "guidance_company_sequence_idx" ON "onboarding_guidance" USING btree ("company_id","sequence");--> statement-breakpoint
CREATE INDEX "guidance_status_idx" ON "onboarding_guidance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "guidance_type_idx" ON "onboarding_guidance" USING btree ("type");--> statement-breakpoint
CREATE INDEX "onboarding_progress_company_idx" ON "onboarding_progress" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "onboarding_progress_status_idx" ON "onboarding_progress" USING btree ("status");--> statement-breakpoint
CREATE INDEX "analytics_page_idx" ON "landing_page_analytics" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "analytics_date_idx" ON "landing_page_analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "analytics_page_date_idx" ON "landing_page_analytics" USING btree ("page_id","date");--> statement-breakpoint
CREATE INDEX "assets_page_idx" ON "landing_page_assets" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "assets_type_idx" ON "landing_page_assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "deployments_page_idx" ON "landing_page_deployments" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "deployments_status_idx" ON "landing_page_deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deployments_subdomain_idx" ON "landing_page_deployments" USING btree ("subdomain");--> statement-breakpoint
CREATE INDEX "leads_page_idx" ON "landing_page_leads" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "leads_company_idx" ON "landing_page_leads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "landing_page_leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "landing_page_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "landing_page_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sections_page_idx" ON "landing_page_sections" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "sections_order_idx" ON "landing_page_sections" USING btree ("page_id","order");--> statement-breakpoint
CREATE INDEX "versions_page_idx" ON "landing_page_versions" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "versions_version_idx" ON "landing_page_versions" USING btree ("page_id","version");--> statement-breakpoint
CREATE INDEX "landing_pages_company_idx" ON "landing_pages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "landing_pages_status_idx" ON "landing_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "landing_pages_slug_idx" ON "landing_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "landing_pages_url_idx" ON "landing_pages" USING btree ("published_url");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_company_idx" ON "brand_identities" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_tool_idx" ON "company_tool_credentials" USING btree ("company_id","tool_id");--> statement-breakpoint
CREATE INDEX "exec_tasks_company_idx" ON "execution_tasks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "exec_tasks_status_idx" ON "execution_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exec_tasks_agent_type_idx" ON "execution_tasks" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "exec_tasks_created_idx" ON "execution_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "exec_tasks_parent_idx" ON "execution_tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_slug_idx" ON "execution_tools" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tools_type_idx" ON "execution_tools" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tools_provider_idx" ON "execution_tools" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "gen_assets_company_idx" ON "generated_assets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "gen_assets_type_idx" ON "generated_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "gen_assets_agent_idx" ON "generated_assets" USING btree ("created_by_agent_id");--> statement-breakpoint
CREATE INDEX "gen_assets_created_idx" ON "generated_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conv_company_idx" ON "conversions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "conv_type_idx" ON "conversions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "conv_converted_at_idx" ON "conversions" USING btree ("converted_at");--> statement-breakpoint
CREATE INDEX "conv_campaign_idx" ON "conversions" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "dm_company_date_idx" ON "daily_tracking_metrics" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "pv_company_idx" ON "page_views" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "pv_session_idx" ON "page_views" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pv_path_idx" ON "page_views" USING btree ("path");--> statement-breakpoint
CREATE INDEX "pv_viewed_at_idx" ON "page_views" USING btree ("viewed_at");--> statement-breakpoint
CREATE INDEX "te_company_idx" ON "tracking_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "te_session_idx" ON "tracking_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "te_event_type_idx" ON "tracking_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "te_event_name_idx" ON "tracking_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "te_occurred_at_idx" ON "tracking_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "vs_company_idx" ON "visitor_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "vs_visitor_idx" ON "visitor_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "vs_session_idx" ON "visitor_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "vs_started_at_idx" ON "visitor_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "documents_company_idx" ON "documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_conversations_company_idx" ON "chat_conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_visitor_idx" ON "chat_conversations" USING btree ("visitor_email");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "meetings_company_idx" ON "meetings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "banners_company_idx" ON "banners" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "banners_campaign_idx" ON "banners" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "blog_posts_company_idx" ON "blog_posts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "blog_posts_keyword_idx" ON "blog_posts" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "blog_posts_status_idx" ON "blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_company_idx" ON "campaigns" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_catalog_company_idx" ON "product_catalog" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "product_catalog_seo_status_idx" ON "product_catalog" USING btree ("seo_status");--> statement-breakpoint
CREATE INDEX "social_posts_company_idx" ON "social_posts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "social_posts_campaign_idx" ON "social_posts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "video_projects_company_idx" ON "video_projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "video_projects_campaign_idx" ON "video_projects" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "asset_library_company_idx" ON "asset_library" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "asset_library_type_idx" ON "asset_library" USING btree ("type");--> statement-breakpoint
CREATE INDEX "asset_library_source_idx" ON "asset_library" USING btree ("source");--> statement-breakpoint
CREATE INDEX "asset_library_campaign_idx" ON "asset_library" USING btree ("campaign_id");
