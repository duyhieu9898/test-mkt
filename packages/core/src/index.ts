// Core package exports
export * from './db';

// Re-export commonly used types
export type {
  UserPreferences,
} from './db/schema/users';

export type {
  CompanySettings,
  CompanyGoals,
  BusinessPlan,
} from './db/schema/companies';

export type {
  AgentCapability,
  KPITarget,
  AgentConfig,
} from './db/schema/agents';

export type {
  TaskInput,
  TaskOutput,
} from './db/schema/tasks';

export type {
  MessageMetadata,
} from './db/schema/messages';

export type {
  KPIScore,
  EvaluationInsight,
} from './db/schema/metrics';
