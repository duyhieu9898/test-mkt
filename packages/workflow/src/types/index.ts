/**
 * AI Company OS - Workflow Types
 *
 * Core types for the workflow system that orchestrates
 * all engines in the platform.
 */

// =============================================================================
// COMPANY CONTEXT
// =============================================================================

export interface CompanyContext {
  companyId: string;
  userId: string;
  industry: string;
  businessType: string;
  stage: 'idea' | 'mvp' | 'launch' | 'growth' | 'optimize';
  budget: {
    total: number;
    remaining: number;
    monthlyLimit: number;
  };
  goals: Goal[];
  metrics: CompanyMetrics;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  type: 'revenue' | 'growth' | 'acquisition' | 'retention' | 'efficiency';
  targetValue: number;
  currentValue: number;
  deadline?: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface CompanyMetrics {
  revenue: number;
  leads: number;
  customers: number;
  traffic: number;
  conversionRate: number;
  cac: number; // Customer Acquisition Cost
  ltv: number; // Lifetime Value
  churnRate: number;
}

// =============================================================================
// ENGINE TYPES
// =============================================================================

export type EngineName =
  | 'company-generator'
  | 'market-intelligence'
  | 'strategy-engine'
  | 'execution-layer'
  | 'data-collection'
  | 'optimization-engine'
  | 'experimentation-engine'
  | 'intelligence-network';

export interface EngineConfig {
  name: EngineName;
  enabled: boolean;
  priority: number;
  timeout: number; // milliseconds
  retryCount: number;
  dependencies: EngineName[];
}

export interface EngineInput<T = unknown> {
  context: CompanyContext;
  data: T;
  metadata: {
    requestId: string;
    timestamp: Date;
    source: EngineName | 'user';
    previousEngines: EngineName[];
  };
}

export interface EngineOutput<T = unknown> {
  success: boolean;
  data: T;
  errors?: EngineError[];
  metrics: {
    duration: number;
    tokensUsed?: number;
    cost?: number;
  };
  nextEngines?: EngineName[];
  events?: WorkflowEvent[];
}

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

// =============================================================================
// WORKFLOW EVENTS
// =============================================================================

export type WorkflowEventType =
  // Company Generator Events
  | 'company.created'
  | 'company.updated'
  | 'agents.spawned'
  // Market Intelligence Events
  | 'market.trend.detected'
  | 'market.opportunity.found'
  | 'competitor.activity.detected'
  | 'market.risk.identified'
  // Strategy Engine Events
  | 'strategy.decision.made'
  | 'strategy.goal.created'
  | 'strategy.resource.allocated'
  | 'strategy.task.assigned'
  // Execution Layer Events
  | 'execution.task.started'
  | 'execution.task.completed'
  | 'execution.task.failed'
  | 'execution.plugin.invoked'
  // Data Collection Events
  | 'data.collected'
  | 'data.anomaly.detected'
  | 'data.threshold.exceeded'
  // Optimization Events
  | 'optimization.recommendation.made'
  | 'optimization.applied'
  | 'optimization.rollback'
  // Experimentation Events
  | 'experiment.started'
  | 'experiment.completed'
  | 'experiment.winner.found'
  // Intelligence Network Events
  | 'intelligence.pattern.detected'
  | 'intelligence.recommendation.made'
  | 'intelligence.benchmark.updated';

export interface WorkflowEvent<T = unknown> {
  id: string;
  type: WorkflowEventType;
  source: EngineName;
  companyId: string;
  timestamp: Date;
  data: T;
  priority: 'critical' | 'high' | 'medium' | 'low';
  requiresAction: boolean;
}

// =============================================================================
// PLUGIN TYPES
// =============================================================================

export type PluginCategory =
  | 'ads'           // Meta Ads, Google Ads, TikTok Ads
  | 'content'       // Landing Page, Blog, Social
  | 'outreach'      // Email, LinkedIn, Cold Calling
  | 'scraping'      // Lead Scraper, Competitor Monitor
  | 'analytics'     // Tracking, Attribution
  | 'communication' // Email, SMS, Chat
  | 'payment'       // Stripe, PayPal
  | 'crm';          // HubSpot, Salesforce

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  category: PluginCategory;
  description: string;
  author: string;

  // Capabilities
  inputs: PluginIOSchema[];
  outputs: PluginIOSchema[];

  // Requirements
  requiredCredentials: string[];
  requiredPermissions: string[];

  // Execution
  timeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };

  // Pricing
  costPerExecution?: number;
  costPerUnit?: string;
}

export interface PluginIOSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  schema?: Record<string, unknown>; // JSON Schema
}

export interface PluginExecutionContext {
  companyId: string;
  agentId?: string;
  taskId?: string;
  credentials: Record<string, string>;
  budget: {
    maxCost: number;
    currentSpent: number;
  };
}

export interface PluginExecutionResult<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metrics: {
    duration: number;
    cost: number;
    apiCalls: number;
  };
  logs: PluginLog[];
}

export interface PluginLog {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: unknown;
}

// =============================================================================
// WORKFLOW ORCHESTRATION
// =============================================================================

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  onError: 'stop' | 'skip' | 'retry';
  timeout: number;
}

export interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'manual' | 'condition';
  config: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  engine: EngineName;
  action: string;
  inputs: Record<string, unknown>;
  conditions?: WorkflowCondition[];
  onSuccess?: string; // next step id
  onFailure?: string; // fallback step id
}

export interface WorkflowCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  value: unknown;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  companyId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep?: string;
  steps: WorkflowStepExecution[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface WorkflowStepExecution {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}
