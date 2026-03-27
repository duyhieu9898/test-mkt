import type { RetryConfig } from './errors';
import {
  DEFAULT_RETRY_CONFIG,
  calculateBackoffDelay,
  isRetryable,
  classifyError,
} from './errors';

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

export interface RetryLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger: RetryLogger = {
  debug: (msg, meta) => console.log(`[Retry] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[Retry] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[Retry] ${msg}`, meta || ''),
};

// Retry a function with exponential backoff
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger: RetryLogger = defaultLogger
): Promise<RetryResult<T>> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      logger.debug(`Attempt ${attempt}/${finalConfig.maxAttempts}`);
      const data = await fn();

      return {
        success: true,
        data,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const classified = classifyError(error);

      logger.warn(`Attempt ${attempt} failed: ${classified.message}`, {
        code: classified.code,
        retryable: classified.retryable,
        severity: classified.severity,
      });

      // Check if we should retry
      if (attempt < finalConfig.maxAttempts && isRetryable(error, finalConfig)) {
        const delayMs = calculateBackoffDelay(attempt, finalConfig);
        logger.debug(`Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      } else if (!isRetryable(error, finalConfig)) {
        logger.error(`Non-retryable error, stopping`, { code: classified.code });
        break;
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: finalConfig.maxAttempts,
    totalDurationMs: Date.now() - startTime,
  };
}

// Circuit breaker implementation
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
};

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        console.log(`[CircuitBreaker:${this.name}] Transitioning to half-open`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is open`);
      }
    }

    try {
      const result = await fn();

      // Success
      if (this.state === 'half-open') {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
          this.reset();
          console.log(`[CircuitBreaker:${this.name}] Circuit closed after successful recovery`);
        }
      } else {
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open' || this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      console.warn(
        `[CircuitBreaker:${this.name}] Circuit opened after ${this.failures} failures`
      );
    }
  }

  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenAttempts = 0;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

// Rate limiter using token bucket algorithm
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private readonly name: string;

  constructor(name: string, maxTokens: number = 10, refillRate: number = 1) {
    this.name = name;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(tokens: number = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    // Calculate wait time
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    console.log(`[RateLimiter:${this.name}] Waiting ${waitTime}ms for tokens`);
    await sleep(waitTime);

    this.refill();
    this.tokens -= tokens;
    return true;
  }

  tryAcquire(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Create global instances for LLM calls
export const llmCircuitBreaker = new CircuitBreaker('llm', {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
});

export const llmRateLimiter = new RateLimiter('llm', 60, 10); // 60 requests, refill 10/sec
