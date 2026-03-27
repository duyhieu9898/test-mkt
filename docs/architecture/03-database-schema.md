# Database Schema - AI Company OS

## Overview

Multi-tenant architecture with complete data isolation per company.
**Primary Database**: PostgreSQL 16+ with pgvector extension

---

## Core Tables (Drizzle ORM)

### Users & Auth
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  provider: varchar('provider', { length: 50 }),
  preferences: jsonb('preferences').$type<UserPreferences>(),
  emailVerified: boolean('email_verified').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Companies
```typescript
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  industry: varchar('industry', { length: 100 }),
  status: companyStatusEnum('status').default('setup').notNull(),
  settings: jsonb('settings').$type<CompanySettings>(),
  goals: jsonb('goals').$type<CompanyGoals>(),
  businessPlan: jsonb('business_plan').$type<BusinessPlan>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id').references(() => departments.id),
  budgetAllocated: decimal('budget_allocated', { precision: 12, scale: 2 }),
  budgetSpent: decimal('budget_spent', { precision: 12, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Agents
```typescript
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  departmentId: uuid('department_id').references(() => departments.id),
  name: varchar('name', { length: 100 }).notNull(),
  role: agentRoleEnum('role').notNull(), // ceo, marketing_manager, content_creator, etc.
  description: text('description'),
  supervisorId: uuid('supervisor_id').references(() => agents.id),
  level: integer('level').default(0), // 0 = CEO, 1 = Manager, 2 = Worker
  status: agentStatusEnum('status').default('created').notNull(),
  capabilities: jsonb('capabilities').$type<Capability[]>(),
  tools: jsonb('tools').$type<string[]>(),
  kpiTargets: jsonb('kpi_targets').$type<KPITarget[]>(),
  promptTemplateId: uuid('prompt_template_id'),
  genomeId: uuid('genome_id'),
  budgetLimit: decimal('budget_limit', { precision: 12, scale: 2 }),
  budgetSpent: decimal('budget_spent', { precision: 12, scale: 2 }).default('0'),
  performanceScore: decimal('performance_score', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at'),
});

export const agentGenomes = pgTable('agent_genomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id),
  version: integer('version').default(1).notNull(),
  parentGenomeId: uuid('parent_genome_id'),
  promptVersion: varchar('prompt_version', { length: 50 }),
  toolset: jsonb('toolset').$type<string[]>(),
  decisionRules: jsonb('decision_rules').$type<DecisionRule[]>(),
  strategies: jsonb('strategies').$type<Strategy[]>(),
  fitnessScore: decimal('fitness_score', { precision: 5, scale: 4 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Tasks
```typescript
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 50 }).notNull(),
  assignedAgentId: uuid('assigned_agent_id').references(() => agents.id),
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),
  parentTaskId: uuid('parent_task_id').references(() => tasks.id),
  status: taskStatusEnum('status').default('pending').notNull(),
  priority: taskPriorityEnum('priority').default('medium').notNull(),
  input: jsonb('input').$type<TaskInput>(),
  output: jsonb('output').$type<TaskOutput>(),
  scheduledAt: timestamp('scheduled_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  deadline: timestamp('deadline'),
  dependencies: jsonb('dependencies').$type<string[]>(),
  retryCount: integer('retry_count').default(0),
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 4 }),
  actualCost: decimal('actual_cost', { precision: 10, scale: 4 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Messages
```typescript
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  senderAgentId: uuid('sender_agent_id').references(() => agents.id),
  senderUserId: uuid('sender_user_id').references(() => users.id),
  receiverAgentId: uuid('receiver_agent_id').references(() => agents.id),
  type: messageTypeEnum('type').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<MessageMetadata>(),
  taskId: uuid('task_id').references(() => tasks.id),
  threadId: uuid('thread_id'),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Memory (with pgvector)
```typescript
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id),
  type: memoryTypeEnum('type').notNull(), // fact, experience, learning
  content: text('content').notNull(),
  summary: text('summary'),
  embedding: vector('embedding', { dimensions: 1536 }),
  importance: decimal('importance', { precision: 3, scale: 2 }).default('0.5'),
  accessCount: integer('access_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// HNSW index for fast similarity search
// CREATE INDEX idx_memories_embedding ON memories
//   USING hnsw (embedding vector_cosine_ops);
```

### Evaluations & Metrics
```typescript
export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  periodType: varchar('period_type', { length: 20 }).notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  overallScore: decimal('overall_score', { precision: 5, scale: 2 }),
  kpiScores: jsonb('kpi_scores').$type<KPIScore[]>(),
  tasksCompleted: integer('tasks_completed').default(0),
  tasksFailed: integer('tasks_failed').default(0),
  recommendations: jsonb('recommendations').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  value: decimal('value', { precision: 15, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 20 }),
  timestamp: timestamp('timestamp').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Audit Logs
```typescript
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id),
  actorType: varchar('actor_type', { length: 20 }).notNull(),
  actorId: uuid('actor_id').notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 50 }).notNull(),
  resourceId: uuid('resource_id'),
  changes: jsonb('changes').$type<{before?: any; after?: any}>(),
  status: varchar('status', { length: 20 }).default('success'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

## Enums

```typescript
export const companyStatusEnum = pgEnum('company_status', ['setup', 'active', 'paused', 'archived']);
export const agentRoleEnum = pgEnum('agent_role', ['ceo', 'marketing_manager', 'sales_manager', 'content_creator', 'ads_specialist', 'analyst', 'support', 'developer', 'custom']);
export const agentStatusEnum = pgEnum('agent_status', ['created', 'ready', 'running', 'paused', 'waiting', 'terminated']);
export const taskStatusEnum = pgEnum('task_status', ['pending', 'queued', 'in_progress', 'waiting_approval', 'completed', 'failed', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['critical', 'high', 'medium', 'low']);
export const messageTypeEnum = pgEnum('message_type', ['task_assignment', 'task_update', 'question', 'answer', 'report', 'alert', 'system']);
export const memoryTypeEnum = pgEnum('memory_type', ['fact', 'experience', 'learning', 'preference', 'relationship']);
```

---

## Key Indexes

```sql
-- Agent queries
CREATE INDEX idx_agents_company_status ON agents(company_id, status);
CREATE INDEX idx_agents_supervisor ON agents(supervisor_id);

-- Task queries
CREATE INDEX idx_tasks_company_status ON tasks(company_id, status);
CREATE INDEX idx_tasks_assigned_agent ON tasks(assigned_agent_id);
CREATE INDEX idx_tasks_deadline ON tasks(deadline) WHERE deadline IS NOT NULL;

-- Memory vector search
CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);

-- Metrics time-series
CREATE INDEX idx_metrics_timeseries ON metrics(company_id, name, timestamp DESC);
```

---

*Document Version: 1.0*
*Last Updated: 2025-03-13*
