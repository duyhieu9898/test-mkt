// Custom error types for the worker service

export class WorkerError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    retryable: boolean = false,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
    this.retryable = retryable;
    this.metadata = metadata;
  }
}

export class LLMError extends WorkerError {
  public readonly statusCode?: number;
  public readonly provider: string;

  constructor(
    message: string,
    code: string,
    provider: string = 'openai',
    retryable: boolean = false,
    statusCode?: number,
    metadata?: Record<string, unknown>
  ) {
    super(message, code, retryable, metadata);
    this.name = 'LLMError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export class DatabaseError extends WorkerError {
  public readonly operation: string;

  constructor(
    message: string,
    operation: string,
    retryable: boolean = true,
    metadata?: Record<string, unknown>
  ) {
    super(message, `DB_${operation.toUpperCase()}_ERROR`, retryable, metadata);
    this.name = 'DatabaseError';
    this.operation = operation;
  }
}

export class TaskError extends WorkerError {
  public readonly taskId: string;
  public readonly agentId?: string;

  constructor(
    message: string,
    taskId: string,
    code: string,
    agentId?: string,
    retryable: boolean = false,
    metadata?: Record<string, unknown>
  ) {
    super(message, code, retryable, { ...metadata, taskId, agentId });
    this.name = 'TaskError';
    this.taskId = taskId;
    this.agentId = agentId;
  }
}

export class RateLimitError extends WorkerError {
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, metadata?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT_EXCEEDED', true, metadata);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class BudgetExceededError extends WorkerError {
  public readonly budgetLimit: number;
  public readonly currentSpend: number;

  constructor(
    budgetLimit: number,
    currentSpend: number,
    metadata?: Record<string, unknown>
  ) {
    super(
      `Budget exceeded: $${currentSpend.toFixed(2)} / $${budgetLimit.toFixed(2)}`,
      'BUDGET_EXCEEDED',
      false,
      metadata
    );
    this.name = 'BudgetExceededError';
    this.budgetLimit = budgetLimit;
    this.currentSpend = currentSpend;
  }
}

// Error classification helper
export function classifyError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
} {
  if (error instanceof WorkerError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      severity: getSeverity(error),
    };
  }

  if (error instanceof Error) {
    // Check for known error patterns
    const message = error.message.toLowerCase();

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429')) {
      return { code: 'RATE_LIMIT', message: error.message, retryable: true, severity: 'medium' };
    }

    // Network errors
    if (message.includes('econnrefused') || message.includes('etimedout') || message.includes('network')) {
      return { code: 'NETWORK_ERROR', message: error.message, retryable: true, severity: 'medium' };
    }

    // Authentication
    if (message.includes('auth') || message.includes('401') || message.includes('api key')) {
      return { code: 'AUTH_ERROR', message: error.message, retryable: false, severity: 'critical' };
    }

    // Database
    if (message.includes('database') || message.includes('postgres') || message.includes('sql')) {
      return { code: 'DATABASE_ERROR', message: error.message, retryable: true, severity: 'high' };
    }

    return { code: 'UNKNOWN_ERROR', message: error.message, retryable: false, severity: 'medium' };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    retryable: false,
    severity: 'medium',
  };
}

function getSeverity(error: WorkerError): 'low' | 'medium' | 'high' | 'critical' {
  if (error instanceof BudgetExceededError) return 'high';
  if (error instanceof LLMError && error.statusCode === 401) return 'critical';
  if (error instanceof DatabaseError) return 'high';
  if (error instanceof RateLimitError) return 'medium';
  return 'medium';
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// Calculate delay for exponential backoff
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, config.maxDelayMs);
}

// Check if error is retryable
export function isRetryable(error: unknown, config?: RetryConfig): boolean {
  const classified = classifyError(error);

  if (config?.retryableErrors) {
    return config.retryableErrors.includes(classified.code);
  }

  return classified.retryable;
}
