import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  pgEnum,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { users } from './users';
import { tasks } from './tasks';

// Enums
export const messageTypeEnum = pgEnum('message_type', [
  'task_assignment',
  'task_update',
  'question',
  'answer',
  'report',
  'alert',
  'chat',
  'system',
]);

// Types
export interface MessageMetadata {
  importance?: 'low' | 'medium' | 'high';
  tags?: string[];
  attachments?: Array<{
    name: string;
    type: string;
    url: string;
  }>;
}

// Messages table
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Participants
    senderAgentId: uuid('sender_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    senderUserId: uuid('sender_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    receiverAgentId: uuid('receiver_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    receiverUserId: uuid('receiver_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Content
    type: messageTypeEnum('type').notNull(),
    subject: varchar('subject', { length: 255 }),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<MessageMetadata>(),

    // Context
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    threadId: uuid('thread_id'),
    replyToId: uuid('reply_to_id'),

    // Status
    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('messages_company_idx').on(table.companyId),
    threadIdx: index('messages_thread_idx').on(table.threadId),
    receiverAgentIdx: index('messages_receiver_agent_idx').on(table.receiverAgentId),
  })
);

// Relations
export const messagesRelations = relations(messages, ({ one }) => ({
  company: one(companies, {
    fields: [messages.companyId],
    references: [companies.id],
  }),
  senderAgent: one(agents, {
    fields: [messages.senderAgentId],
    references: [agents.id],
  }),
  senderUser: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
  receiverAgent: one(agents, {
    fields: [messages.receiverAgentId],
    references: [agents.id],
  }),
  task: one(tasks, {
    fields: [messages.taskId],
    references: [tasks.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: 'messageReplies',
  }),
}));
