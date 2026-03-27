import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  pgEnum,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { tasks } from './tasks';

// Message types for structured communication
export const agentMessageTypeEnum = pgEnum('agent_message_type', [
  'task_delegation',      // Delegating a task to another agent
  'task_update',          // Progress update on a task
  'task_completion',      // Task completed notification
  'request_help',         // Asking for assistance
  'provide_help',         // Responding to help request
  'information_share',    // Sharing relevant information
  'collaboration_invite', // Inviting to collaborate
  'feedback',            // Performance feedback
  'escalation',          // Escalating an issue
  'decision_request',    // Requesting a decision
  'decision_response',   // Responding to decision request
  'status_report',       // Regular status update
  'handoff',             // Handing off work to another agent
]);

// Priority levels for agent messages
export const messagePriorityEnum = pgEnum('agent_message_priority', [
  'critical',   // Requires immediate attention
  'high',       // Important, respond soon
  'normal',     // Standard priority
  'low',        // Can be addressed when convenient
]);

// Agent Communication Protocol - Structured messages between agents
export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Sender & Receiver
    senderAgentId: uuid('sender_agent_id')
      .references(() => agents.id, { onDelete: 'set null' }),
    receiverAgentId: uuid('receiver_agent_id')
      .references(() => agents.id, { onDelete: 'set null' }),
    receiverDepartmentId: uuid('receiver_department_id'), // For broadcast to department

    // Message Type & Priority
    messageType: agentMessageTypeEnum('message_type').notNull(),
    priority: messagePriorityEnum('priority').default('normal').notNull(),

    // Structured Content (NOT free text)
    goal: text('goal').notNull(), // What the sender wants to achieve
    context: jsonb('context').$type<{
      // Background information
      taskId?: string;
      taskTitle?: string;
      objectiveId?: string;
      objectiveTitle?: string;
      previousMessages?: string[]; // Thread context
      relevantData?: Record<string, unknown>;
      situation?: string; // Current situation description
    }>(),

    constraints: jsonb('constraints').$type<{
      // Limitations and requirements
      deadline?: string;
      budget?: number;
      requiredCapabilities?: string[];
      qualityStandards?: string[];
      dependencies?: string[];
      restrictions?: string[];
    }>(),

    expectedOutput: jsonb('expected_output').$type<{
      // What the sender expects back
      format: 'task_result' | 'decision' | 'information' | 'confirmation' | 'plan' | 'feedback';
      description: string;
      schema?: Record<string, unknown>; // Expected data structure
      deadline?: string;
    }>(),

    // Actual message content (structured)
    content: jsonb('content').$type<{
      summary: string; // Brief summary (required)
      details?: string; // Detailed explanation
      attachments?: Array<{
        type: 'data' | 'document' | 'analysis' | 'report';
        title: string;
        content: string | Record<string, unknown>;
      }>;
      actions?: Array<{
        action: string;
        reason: string;
        status?: 'pending' | 'completed' | 'blocked';
      }>;
      questions?: string[]; // Clarifying questions
      recommendations?: string[];
    }>().notNull(),

    // Response tracking
    requiresResponse: integer('requires_response').default(1), // 0 = no, 1 = yes
    responseDeadline: timestamp('response_deadline'),
    responseMessageId: uuid('response_message_id'), // Link to response

    // Thread management
    threadId: uuid('thread_id'), // Group related messages
    parentMessageId: uuid('parent_message_id'), // For threaded conversations

    // Status
    status: varchar('status', { length: 20 }).default('sent'), // sent, delivered, read, responded, expired
    readAt: timestamp('read_at'),

    // Metadata
    metadata: jsonb('metadata').$type<{
      processingTime?: number;
      llmTokensUsed?: number;
      confidenceScore?: number;
      tags?: string[];
    }>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    senderIdx: index('agent_msg_sender_idx').on(table.senderAgentId),
    receiverIdx: index('agent_msg_receiver_idx').on(table.receiverAgentId),
    threadIdx: index('agent_msg_thread_idx').on(table.threadId),
    typeIdx: index('agent_msg_type_idx').on(table.messageType),
    statusIdx: index('agent_msg_status_idx').on(table.status),
    companyIdx: index('agent_msg_company_idx').on(table.companyId),
  })
);

// Collaboration Sessions - When agents work together
export const collaborationSessions = pgTable(
  'collaboration_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Session details
    title: varchar('title', { length: 255 }).notNull(),
    purpose: text('purpose').notNull(),

    // Participants
    initiatorAgentId: uuid('initiator_agent_id')
      .references(() => agents.id, { onDelete: 'set null' }),
    participantAgentIds: jsonb('participant_agent_ids').$type<string[]>().notNull(),

    // Related work
    objectiveId: uuid('objective_id'),
    taskIds: jsonb('task_ids').$type<string[]>(),

    // Session state
    status: varchar('status', { length: 20 }).default('active'), // active, paused, completed, cancelled

    // Outcomes
    outcomes: jsonb('outcomes').$type<{
      decisions: Array<{ decision: string; madeBy: string; timestamp: string }>;
      actionItems: Array<{ action: string; assignee: string; deadline?: string; status: string }>;
      insights: string[];
      documentsCreated: string[];
    }>(),

    // Communication log (message IDs in this session)
    messageIds: jsonb('message_ids').$type<string[]>(),

    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('collab_company_idx').on(table.companyId),
    initiatorIdx: index('collab_initiator_idx').on(table.initiatorAgentId),
    statusIdx: index('collab_status_idx').on(table.status),
  })
);

// Agent Relationships - Track working relationships
export const agentRelationships = pgTable(
  'agent_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // The two agents
    agentAId: uuid('agent_a_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    agentBId: uuid('agent_b_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),

    // Relationship type
    relationshipType: varchar('relationship_type', { length: 50 }).notNull(), // supervisor, peer, mentor, collaborator

    // Metrics
    collaborationCount: integer('collaboration_count').default(0),
    successfulCollaborations: integer('successful_collaborations').default(0),
    communicationFrequency: integer('communication_frequency').default(0), // messages per week

    // Quality scores
    trustScore: integer('trust_score').default(50), // 0-100
    compatibilityScore: integer('compatibility_score').default(50), // 0-100

    // Notes
    strengths: jsonb('strengths').$type<string[]>(),
    challenges: jsonb('challenges').$type<string[]>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('rel_company_idx').on(table.companyId),
    agentAIdx: index('rel_agent_a_idx').on(table.agentAId),
    agentBIdx: index('rel_agent_b_idx').on(table.agentBId),
  })
);

// Relations
export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  company: one(companies, {
    fields: [agentMessages.companyId],
    references: [companies.id],
  }),
  sender: one(agents, {
    fields: [agentMessages.senderAgentId],
    references: [agents.id],
    relationName: 'sentMessages',
  }),
  receiver: one(agents, {
    fields: [agentMessages.receiverAgentId],
    references: [agents.id],
    relationName: 'receivedMessages',
  }),
  parentMessage: one(agentMessages, {
    fields: [agentMessages.parentMessageId],
    references: [agentMessages.id],
    relationName: 'messageThread',
  }),
  responseMessage: one(agentMessages, {
    fields: [agentMessages.responseMessageId],
    references: [agentMessages.id],
    relationName: 'messageResponse',
  }),
}));

export const collaborationSessionsRelations = relations(collaborationSessions, ({ one }) => ({
  company: one(companies, {
    fields: [collaborationSessions.companyId],
    references: [companies.id],
  }),
  initiator: one(agents, {
    fields: [collaborationSessions.initiatorAgentId],
    references: [agents.id],
  }),
}));

export const agentRelationshipsRelations = relations(agentRelationships, ({ one }) => ({
  company: one(companies, {
    fields: [agentRelationships.companyId],
    references: [companies.id],
  }),
  agentA: one(agents, {
    fields: [agentRelationships.agentAId],
    references: [agents.id],
    relationName: 'relationshipsAsA',
  }),
  agentB: one(agents, {
    fields: [agentRelationships.agentBId],
    references: [agents.id],
    relationName: 'relationshipsAsB',
  }),
}));
