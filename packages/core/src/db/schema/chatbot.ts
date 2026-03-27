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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// Enums
export const chatStatusEnum = pgEnum('chat_status', ['active', 'closed']);
export const chatChannelEnum = pgEnum('chat_channel', ['widget', 'web']);
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['visitor', 'assistant', 'system']);
export const chatbotToneEnum = pgEnum('chatbot_tone', ['professional', 'friendly', 'bold']);
export const chatbotModeEnum = pgEnum('chatbot_mode', ['sales', 'support', 'both']);

// Chat Conversations
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    visitorId: varchar('visitor_id', { length: 255 }),
    visitorName: varchar('visitor_name', { length: 255 }),
    visitorEmail: varchar('visitor_email', { length: 255 }),
    status: chatStatusEnum('status').default('active').notNull(),
    channel: chatChannelEnum('channel').default('web').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('chat_conversations_company_idx').on(table.companyId),
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
export const chatbotConfig = pgTable('chatbot_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .references(() => companies.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  name: varchar('name', { length: 255 }).default('AI Assistant').notNull(),
  greeting: text('greeting').default('Hi! How can I help you today?').notNull(),
  tone: chatbotToneEnum('tone').default('friendly').notNull(),
  mode: chatbotModeEnum('mode').default('both').notNull(),
  primaryColor: varchar('primary_color', { length: 7 }).default('#6366f1'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
