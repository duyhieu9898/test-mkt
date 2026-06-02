/**
 * Omnichannel Inbox Schema (Block 6 / Đợt 6)
 *
 * Unified inbox for messages from external chat platforms (FB Messenger first;
 * Zalo / WhatsApp / Instagram channels reserved in the enum but disabled until
 * their API approval lands).
 *
 * Distinct from `chatbot_channels` — that table attaches a deployed chatbot to a
 * surface (widget / OAuth-connected page). Omnichannel stores per-company
 * platform credentials and the raw inbound/outbound message log used by the
 * founder's unified inbox, regardless of whether AI auto-reply is enabled.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const omniChannelEnum = pgEnum('omni_channel', [
  'fb_messenger',
  'zalo',
  'whatsapp',
  'instagram',
]);

export const omniConnectionStatusEnum = pgEnum('omni_connection_status', [
  'active', 'paused', 'disconnected',
]);

export const omniMessageDirectionEnum = pgEnum('omni_message_direction', [
  'inbound', 'outbound',
]);

export const omniMessageStatusEnum = pgEnum('omni_message_status', [
  'received', 'replied', 'pending_human', 'failed',
]);

/**
 * Per-company channel connection. `connectionData` stores platform-specific
 * configuration — for FB Messenger:
 *   { pageId, pageName?, appId, encryptedPageAccessToken, verifyToken }
 * Page access tokens are encrypted at rest (see lib/crypto.ts).
 */
export const channelConnections = pgTable(
  'channel_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    channel: omniChannelEnum('channel').notNull(),
    connectionData: jsonb('connection_data').$type<Record<string, unknown>>().default({}).notNull(),
    status: omniConnectionStatusEnum('status').default('active').notNull(),
    /** Opt-in: AI auto-reply for this connection (default off — founder reviews manually). */
    aiAutoReply: boolean('ai_auto_reply').default(false).notNull(),
    connectedAt: timestamp('connected_at').defaultNow().notNull(),
    lastMessageAt: timestamp('last_message_at'),
  },
  (t) => ({
    companyIdx: index('channel_connections_company_idx').on(t.companyId),
    channelIdx: index('channel_connections_channel_idx').on(t.channel),
  }),
);

export const omnichannelMessages = pgTable(
  'omnichannel_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    channelConnectionId: uuid('channel_connection_id')
      .references(() => channelConnections.id, { onDelete: 'cascade' })
      .notNull(),
    channel: omniChannelEnum('channel').notNull(),
    externalThreadId: varchar('external_thread_id', { length: 255 }).notNull(),
    externalMessageId: varchar('external_message_id', { length: 255 }),
    direction: omniMessageDirectionEnum('direction').notNull(),
    senderExternalId: varchar('sender_external_id', { length: 255 }),
    senderName: varchar('sender_name', { length: 255 }),
    content: text('content').notNull(),
    attachments: jsonb('attachments').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    aiHandled: boolean('ai_handled').default(false).notNull(),
    agentId: uuid('agent_id'),
    receivedAt: timestamp('received_at'),
    sentAt: timestamp('sent_at'),
    status: omniMessageStatusEnum('status').default('received').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('omnichannel_messages_company_idx').on(t.companyId),
    connectionIdx: index('omnichannel_messages_connection_idx').on(t.channelConnectionId),
    threadIdx: index('omnichannel_messages_thread_idx').on(t.externalThreadId),
  }),
);

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type OmnichannelMessage = typeof omnichannelMessages.$inferSelect;
