import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  decimal,
  pgEnum,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { users } from './users';

// Enums
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'queued',
  'in_progress',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

export const taskPriorityEnum = pgEnum('task_priority', ['critical', 'high', 'medium', 'low']);

// Types
export interface TaskInput {
  type: string;
  data: Record<string, unknown>;
  constraints?: Record<string, unknown>;
}

export interface TaskOutput {
  type: string;
  data: Record<string, unknown>;
  artifacts?: Array<{
    name: string;
    type: string;
    url?: string;
    content?: string;
  }>;
}

// Tasks table
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Task Info
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 50 }).notNull(),

    // Assignment
    assignedAgentId: uuid('assigned_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    createdByAgentId: uuid('created_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Hierarchy
    parentTaskId: uuid('parent_task_id'),
    rootTaskId: uuid('root_task_id'),
    depth: integer('depth').default(0),

    // Status
    status: taskStatusEnum('status').default('pending').notNull(),
    priority: taskPriorityEnum('priority').default('medium').notNull(),

    // Execution
    input: jsonb('input').$type<TaskInput>(),
    output: jsonb('output').$type<TaskOutput>(),
    progress: integer('progress').default(0),

    // Scheduling
    scheduledAt: timestamp('scheduled_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    deadline: timestamp('deadline'),

    // Dependencies
    dependencies: jsonb('dependencies').$type<string[]>().default([]),

    // Error handling
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),

    // Cost
    estimatedCost: decimal('estimated_cost', { precision: 10, scale: 4 }),
    actualCost: decimal('actual_cost', { precision: 10, scale: 4 }),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyStatusIdx: index('tasks_company_status_idx').on(table.companyId, table.status),
    assignedIdx: index('tasks_assigned_idx').on(table.assignedAgentId),
    parentIdx: index('tasks_parent_idx').on(table.parentTaskId),
    priorityIdx: index('tasks_priority_idx').on(table.priority),
  })
);

// Task dependencies
export const taskDependencies = pgTable('task_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id')
    .references(() => tasks.id, { onDelete: 'cascade' })
    .notNull(),
  dependsOnTaskId: uuid('depends_on_task_id')
    .references(() => tasks.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 20 }).default('finish_to_start'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  company: one(companies, {
    fields: [tasks.companyId],
    references: [companies.id],
  }),
  assignedAgent: one(agents, {
    fields: [tasks.assignedAgentId],
    references: [agents.id],
  }),
  createdByAgent: one(agents, {
    fields: [tasks.createdByAgentId],
    references: [agents.id],
  }),
  createdByUser: one(users, {
    fields: [tasks.createdByUserId],
    references: [users.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'taskHierarchy',
  }),
  subtasks: many(tasks, { relationName: 'taskHierarchy' }),
}));
