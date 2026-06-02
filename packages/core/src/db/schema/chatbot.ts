/**
 * Chatbot Engine Schema
 *
 * Conversations, messages, and chatbot configuration.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  index,
  real,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// Enums
export const chatStatusEnum = pgEnum('chat_status', ['active', 'closed']);
export const chatChannelEnum = pgEnum('chat_channel', ['widget', 'web']);
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['visitor', 'assistant', 'system']);
export const chatbotToneEnum = pgEnum('chatbot_tone', ['professional', 'friendly', 'bold']);
export const chatbotModeEnum = pgEnum('chatbot_mode', ['sales', 'support', 'both']);

/**
 * Chatbot access level — controls which knowledge visibility levels
 * the chatbot can query. Maps to document/knowledge visibility:
 *
 *   'public'   — only query public docs (embed widget on customer website)
 *   'internal' — query public + internal (logged-in team dashboard chat)
 *   'admin'    — query all including confidential (owner/admin)
 */
export const chatbotAccessLevelEnum = pgEnum('chatbot_access_level', [
  'public', 'internal', 'admin',
]);

// Chat Conversations
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    // B3: added botId for multi-bot support
    botId: uuid('bot_id'),
    visitorId: varchar('visitor_id', { length: 255 }),
    visitorName: varchar('visitor_name', { length: 255 }),
    visitorEmail: varchar('visitor_email', { length: 255 }),
    visitorPhone: varchar('visitor_phone', { length: 30 }),
    status: chatStatusEnum('status').default('active').notNull(),
    channel: chatChannelEnum('channel').default('web').notNull(),
    // C3: handoff fields
    handoffAt: timestamp('handoff_at'),
    handoffStaffId: uuid('handoff_staff_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('chat_conversations_company_idx').on(table.companyId),
    botIdx: index('chat_conversations_bot_idx').on(table.botId),
    visitorIdx: index('chat_conversations_visitor_idx').on(table.visitorEmail),
  })
);

// Chat Messages
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .references(() => chatConversations.id, { onDelete: 'cascade' })
      .notNull(),
    role: chatMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<{
      intent?: string;
      confidence?: number;
      sources?: string[];
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index('chat_messages_conversation_idx').on(table.conversationId),
  })
);

// Chatbot Config
// B3 fix (doc 11 §7): removed .unique() on companyId to allow multi-bot.
// Added knowledgeTags, logoUrl, avatarUrl, welcomeFlow, poweredByVisible
// for white-label + tag-based knowledge scoping.
export const chatbotConfig = pgTable('chatbot_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).default('AI Assistant').notNull(),
  greeting: text('greeting').default('Hi! How can I help you today?').notNull(),
  tone: chatbotToneEnum('tone').default('friendly').notNull(),
  mode: chatbotModeEnum('mode').default('both').notNull(),
  primaryColor: varchar('primary_color', { length: 7 }).default('#6366f1'),
  accessLevel: chatbotAccessLevelEnum('access_level').default('internal').notNull(),
  embedEnabled: boolean('embed_enabled').default(false).notNull(),
  embedAllowedDomains: jsonb('embed_allowed_domains').$type<string[]>().default([]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  // Multi-bot: tag-based knowledge scoping (doc 11 §2)
  // Empty array = bot reads ALL knowledge (backward-compat)
  knowledgeTags: jsonb('knowledge_tags').$type<string[]>().default([]).notNull(),
  // White-label branding (C15)
  logoUrl: varchar('logo_url', { length: 1000 }),
  avatarUrl: varchar('avatar_url', { length: 1000 }),
  welcomeFlow: jsonb('welcome_flow').$type<Array<{
    text: string;
    quickReplies?: Array<{ label: string; value: string }>;
  }>>(),
  poweredByVisible: boolean('powered_by_visible').default(true),
  // Handoff config (C3)
  handoffEnabled: boolean('handoff_enabled').default(false),
  handoffConfidenceThreshold: real('handoff_confidence_threshold').default(0.4),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Chatbot Channels — which platforms each bot is connected to (doc 11 §2)
export const chatbotChannels = pgTable(
  'chatbot_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    botId: uuid('bot_id')
      .references(() => chatbotConfig.id, { onDelete: 'cascade' })
      .notNull(),
    platform: varchar('platform', { length: 30 }).notNull(), // widget | messenger | zalo_oa | instagram
    isActive: boolean('is_active').default(true).notNull(),
    // Platform-specific config (page_id, access_token, webhook_secret, etc.)
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    connectedAt: timestamp('connected_at').defaultNow().notNull(),
    connectedBy: uuid('connected_by'),
  },
  (table) => ({
    botIdx: index('chatbot_channels_bot_idx').on(table.botId),
    platformIdx: index('chatbot_channels_platform_idx').on(table.platform),
  }),
);

// Relations
export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  company: one(companies, {
    fields: [chatConversations.companyId],
    references: [companies.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const chatbotConfigRelations = relations(chatbotConfig, ({ one }) => ({
  company: one(companies, {
    fields: [chatbotConfig.companyId],
    references: [companies.id],
  }),
}));
