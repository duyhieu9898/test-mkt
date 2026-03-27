/**
 * Base Engine Interface
 *
 * All engines in the workflow must implement this interface.
 * This ensures consistent behavior and enables the orchestrator
 * to manage engines uniformly.
 */

import type {
  EngineName,
  EngineConfig,
  EngineInput,
  EngineOutput,
  WorkflowEvent,
  CompanyContext,
} from '../types';

export interface IEngine<TInput = unknown, TOutput = unknown> {
  /** Engine name identifier */
  readonly name: EngineName;

  /** Engine configuration */
  readonly config: EngineConfig;

  /**
   * Initialize the engine
   * Called once when the workflow system starts
   */
  initialize(): Promise<void>;

  /**
   * Process input and produce output
   * Core execution method
   */
  process(input: EngineInput<TInput>): Promise<EngineOutput<TOutput>>;

  /**
   * Handle incoming events from other engines
   */
  handleEvent(event: WorkflowEvent): Promise<void>;

  /**
   * Check if engine is healthy and ready to process
   */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * Gracefully shutdown the engine
   */
  shutdown(): Promise<void>;
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseEngine<TInput = unknown, TOutput = unknown>
  implements IEngine<TInput, TOutput>
{
  abstract readonly name: EngineName;
  abstract readonly config: EngineConfig;

  protected initialized = false;
  protected eventHandlers: Map<string, (event: WorkflowEvent) => Promise<void>> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn(`Engine ${this.name} already initialized`);
      return;
    }
    await this.onInitialize();
    this.initialized = true;
    console.log(`Engine ${this.name} initialized`);
  }

  async process(input: EngineInput<TInput>): Promise<EngineOutput<TOutput>> {
    if (!this.initialized) {
      throw new Error(`Engine ${this.name} not initialized`);
    }

    const startTime = Date.now();

    try {
      const result = await this.execute(input);
      return {
        ...result,
        metrics: {
          ...result.metrics,
          duration: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: null as unknown as TOutput,
        errors: [
          {
            code: 'ENGINE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true,
          },
        ],
        metrics: {
          duration: Date.now() - startTime,
        },
      };
    }
  }

  async handleEvent(event: WorkflowEvent): Promise<void> {
    const handler = this.eventHandlers.get(event.type);
    if (handler) {
      await handler(event);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return {
      healthy: this.initialized,
      message: this.initialized ? 'Engine ready' : 'Engine not initialized',
    };
  }

  async shutdown(): Promise<void> {
    await this.onShutdown();
    this.initialized = false;
    console.log(`Engine ${this.name} shut down`);
  }

  // Template methods for subclasses
  protected abstract onInitialize(): Promise<void>;
  protected abstract execute(input: EngineInput<TInput>): Promise<EngineOutput<TOutput>>;
  protected async onShutdown(): Promise<void> {
    // Default implementation - override if needed
  }

  // Helper to register event handlers
  protected on(eventType: string, handler: (event: WorkflowEvent) => Promise<void>): void {
    this.eventHandlers.set(eventType, handler);
  }

  // Helper to create consistent output
  protected success(
    data: TOutput,
    options?: {
      nextEngines?: EngineName[];
      events?: WorkflowEvent[];
      tokensUsed?: number;
      cost?: number;
    }
  ): EngineOutput<TOutput> {
    return {
      success: true,
      data,
      nextEngines: options?.nextEngines,
      events: options?.events,
      metrics: {
        duration: 0, // Will be set by process()
        tokensUsed: options?.tokensUsed,
        cost: options?.cost,
      },
    };
  }

  protected failure(
    errors: Array<{ code: string; message: string; recoverable?: boolean }>
  ): EngineOutput<TOutput> {
    return {
      success: false,
      data: null as unknown as TOutput,
      errors: errors.map((e) => ({
        ...e,
        recoverable: e.recoverable ?? true,
      })),
      metrics: { duration: 0 },
    };
  }
}
