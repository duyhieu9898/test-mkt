/**
 * Base Plugin Interface and Implementation
 *
 * All execution plugins must implement this interface.
 * Plugins are modular components that perform specific business actions.
 */

import type {
  PluginManifest,
  PluginExecutionContext,
  PluginExecutionResult,
  PluginLog,
  PluginCategory,
} from '../types';

// =============================================================================
// PLUGIN INTERFACE
// =============================================================================

export interface IPlugin {
  /** Plugin manifest with metadata */
  readonly manifest: PluginManifest;

  /** Initialize plugin with execution context */
  initialize(context: PluginExecutionContext): Promise<void>;

  /** Execute the plugin with parameters */
  execute(params: Record<string, unknown>): Promise<PluginExecutionResult>;

  /** Validate parameters before execution */
  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] };

  /** Cleanup after execution */
  cleanup(): Promise<void>;
}

// =============================================================================
// BASE PLUGIN IMPLEMENTATION
// =============================================================================

export abstract class BasePlugin implements IPlugin {
  abstract readonly manifest: PluginManifest;

  protected context: PluginExecutionContext | null = null;
  protected logs: PluginLog[] = [];
  protected startTime: number = 0;
  protected apiCallCount = 0;
  protected totalCost = 0;

  async initialize(context: PluginExecutionContext): Promise<void> {
    this.context = context;
    this.logs = [];
    this.startTime = Date.now();
    this.apiCallCount = 0;
    this.totalCost = 0;

    this.log('info', 'Plugin initialized');

    await this.onInitialize(context);
  }

  async execute(params: Record<string, unknown>): Promise<PluginExecutionResult> {
    // Validate first
    const validation = this.validate(params);
    if (!validation.valid) {
      return {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors?.join(', ') || 'Validation failed',
          retryable: false,
        },
        metrics: this.getMetrics(),
        logs: this.logs,
      };
    }

    // Check budget
    if (
      this.context &&
      this.manifest.costPerExecution &&
      this.context.budget.currentSpent + this.manifest.costPerExecution >
        this.context.budget.maxCost
    ) {
      return {
        success: false,
        data: null,
        error: {
          code: 'BUDGET_EXCEEDED',
          message: 'Execution would exceed budget limit',
          retryable: false,
        },
        metrics: this.getMetrics(),
        logs: this.logs,
      };
    }

    try {
      this.log('info', 'Starting execution');

      const result = await this.onExecute(params);

      this.log('info', `Execution completed (success: ${result.success})`);

      return {
        ...result,
        metrics: this.getMetrics(),
        logs: this.logs,
      };
    } catch (error) {
      this.log('error', `Execution failed: ${error}`);

      return {
        success: false,
        data: null,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
        metrics: this.getMetrics(),
        logs: this.logs,
      };
    }
  }

  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Check required inputs
    for (const input of this.manifest.inputs) {
      if (input.required && !(input.name in params)) {
        errors.push(`Missing required input: ${input.name}`);
      }
    }

    // Custom validation
    const customValidation = this.onValidate(params);
    if (customValidation.errors) {
      errors.push(...customValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async cleanup(): Promise<void> {
    this.log('info', 'Plugin cleanup');
    await this.onCleanup();
    this.context = null;
  }

  // =============================================================================
  // TEMPLATE METHODS
  // =============================================================================

  protected async onInitialize(context: PluginExecutionContext): Promise<void> {
    // Override in subclass
  }

  protected abstract onExecute(
    params: Record<string, unknown>
  ): Promise<Omit<PluginExecutionResult, 'metrics' | 'logs'>>;

  protected onValidate(
    params: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    return { valid: true };
  }

  protected async onCleanup(): Promise<void> {
    // Override in subclass
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  protected log(level: PluginLog['level'], message: string, data?: unknown): void {
    this.logs.push({
      level,
      message,
      timestamp: new Date(),
      data,
    });

    // Also console log in development
    console.log(`[${this.manifest.name}] [${level}] ${message}`);
  }

  protected trackApiCall(cost = 0): void {
    this.apiCallCount++;
    this.totalCost += cost;
  }

  protected getMetrics(): PluginExecutionResult['metrics'] {
    return {
      duration: Date.now() - this.startTime,
      cost: this.totalCost + (this.manifest.costPerExecution || 0),
      apiCalls: this.apiCallCount,
    };
  }

  protected getCredential(key: string): string | undefined {
    return this.context?.credentials[key];
  }

  protected requireCredential(key: string): string {
    const value = this.getCredential(key);
    if (!value) {
      throw new Error(`Missing required credential: ${key}`);
    }
    return value;
  }
}

// =============================================================================
// PLUGIN REGISTRY
// =============================================================================

export class PluginRegistry {
  private plugins: Map<string, IPlugin> = new Map();
  private categoryIndex: Map<PluginCategory, Set<string>> = new Map();

  register(plugin: IPlugin): void {
    const id = plugin.manifest.id;

    if (this.plugins.has(id)) {
      console.warn(`Plugin ${id} already registered, replacing`);
    }

    this.plugins.set(id, plugin);

    // Update category index
    const category = plugin.manifest.category;
    if (!this.categoryIndex.has(category)) {
      this.categoryIndex.set(category, new Set());
    }
    this.categoryIndex.get(category)!.add(id);

    console.log(`Plugin registered: ${plugin.manifest.name} (${id})`);
  }

  unregister(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    this.plugins.delete(pluginId);

    // Update category index
    const category = plugin.manifest.category;
    this.categoryIndex.get(category)?.delete(pluginId);

    console.log(`Plugin unregistered: ${pluginId}`);
    return true;
  }

  get(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getByCategory(category: PluginCategory): IPlugin[] {
    const ids = this.categoryIndex.get(category) || new Set();
    return Array.from(ids)
      .map((id) => this.plugins.get(id))
      .filter((p): p is IPlugin => p !== undefined);
  }

  list(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest);
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  clear(): void {
    this.plugins.clear();
    this.categoryIndex.clear();
  }
}

// Singleton instance
let registryInstance: PluginRegistry | null = null;

export function getPluginRegistry(): PluginRegistry {
  if (!registryInstance) {
    registryInstance = new PluginRegistry();
  }
  return registryInstance;
}

export function resetPluginRegistry(): void {
  registryInstance?.clear();
  registryInstance = null;
}
