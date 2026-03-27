/**
 * Execution Layer Engine
 *
 * Enables AI agents to perform real-world business actions.
 * Uses a plugin system for extensibility.
 *
 * Plugins: Ads, Landing Pages, Email Outreach, Lead Scraping, etc.
 *
 * Flow: Strategy Tasks → Plugin Selection → Execution → Results
 */

import { BaseEngine } from './base-engine';
import type {
  EngineName,
  EngineConfig,
  EngineInput,
  EngineOutput,
  PluginManifest,
  PluginExecutionContext,
  PluginExecutionResult,
  PluginCategory,
} from '../types';

// =============================================================================
// INPUT/OUTPUT TYPES
// =============================================================================

export interface ExecutionLayerInput {
  companyId: string;
  task: ExecutionTask;
  context: ExecutionContext;
}

export interface ExecutionTask {
  id: string;
  type: ExecutionTaskType;
  title: string;
  description: string;
  assignedAgentId: string;
  pluginId?: string;
  parameters: Record<string, unknown>;
  budget: {
    maxCost: number;
    warningThreshold: number;
  };
  deadline?: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export type ExecutionTaskType =
  | 'create_landing_page'
  | 'run_ad_campaign'
  | 'send_outreach'
  | 'scrape_leads'
  | 'generate_content'
  | 'create_banner'
  | 'analyze_data'
  | 'send_email'
  | 'schedule_social'
  | 'custom';

export interface ExecutionContext {
  credentials: Record<string, string>;
  company: {
    name: string;
    industry: string;
    brand: {
      primaryColor: string;
      logo?: string;
      tone: string;
    };
  };
  previousResults?: ExecutionResult[];
}

export interface ExecutionLayerOutput {
  taskId: string;
  status: 'completed' | 'failed' | 'partial';
  result: ExecutionResult;
  pluginUsed: string;
  metrics: ExecutionMetrics;
  artifacts: Artifact[];
  nextActions?: string[];
}

export interface ExecutionResult {
  success: boolean;
  data: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface ExecutionMetrics {
  duration: number;
  cost: number;
  apiCalls: number;
  tokensUsed?: number;
}

export interface Artifact {
  id: string;
  type: 'landing_page' | 'ad_creative' | 'email' | 'lead_list' | 'banner' | 'content' | 'report';
  name: string;
  url?: string;
  data?: unknown;
  createdAt: Date;
}

// =============================================================================
// PLUGIN TYPES (Re-exported from plugins module)
// =============================================================================

// IPlugin and IPluginRegistry are defined in ../plugins/base-plugin.ts
// Import them when needed:
// import { IPlugin, PluginRegistry } from '../plugins/base-plugin';

/**
 * Plugin interface used by execution layer
 * (Matches IPlugin from plugins module)
 */
export interface ExecutionPlugin {
  manifest: PluginManifest;
  initialize(context: PluginExecutionContext): Promise<void>;
  execute(params: Record<string, unknown>): Promise<PluginExecutionResult>;
  validate(params: Record<string, unknown>): { valid: boolean; errors?: string[] };
  cleanup(): Promise<void>;
}

// =============================================================================
// ENGINE IMPLEMENTATION
// =============================================================================

export class ExecutionLayerEngine extends BaseEngine<
  ExecutionLayerInput,
  ExecutionLayerOutput
> {
  readonly name: EngineName = 'execution-layer';

  readonly config: EngineConfig = {
    name: 'execution-layer',
    enabled: true,
    priority: 4,
    timeout: 300000, // 5 minutes (some executions take time)
    retryCount: 2,
    dependencies: ['strategy-engine'],
  };

  private plugins: Map<string, ExecutionPlugin> = new Map();

  protected async onInitialize(): Promise<void> {
    // Load built-in plugins
    await this.loadBuiltInPlugins();

    // Register event handlers
    this.on('strategy.task.assigned', async (event) => {
      console.log(`New task assigned, queuing for execution: ${event.data}`);
    });
  }

  private async loadBuiltInPlugins(): Promise<void> {
    // TODO: Load actual plugins
    // - LandingPagePlugin
    // - MetaAdsPlugin
    // - GoogleAdsPlugin
    // - EmailOutreachPlugin
    // - LeadScraperPlugin
    // - BannerGeneratorPlugin
    console.log('Loading built-in plugins...');
  }

  protected async execute(
    input: EngineInput<ExecutionLayerInput>
  ): Promise<EngineOutput<ExecutionLayerOutput>> {
    const { companyId, task, context } = input.data;

    console.log(`Executing task: ${task.title} (type: ${task.type})`);

    // Select appropriate plugin
    const plugin = this.selectPlugin(task);

    if (!plugin) {
      return this.failure([
        {
          code: 'PLUGIN_NOT_FOUND',
          message: `No plugin found for task type: ${task.type}`,
          recoverable: false,
        },
      ]);
    }

    // Validate parameters
    const validation = plugin.validate(task.parameters);
    if (!validation.valid) {
      return this.failure([
        {
          code: 'INVALID_PARAMETERS',
          message: `Parameter validation failed: ${validation.errors?.join(', ')}`,
          recoverable: false,
        },
      ]);
    }

    // Execute plugin
    try {
      await plugin.initialize({
        companyId,
        taskId: task.id,
        agentId: task.assignedAgentId,
        credentials: context.credentials,
        budget: {
          maxCost: task.budget.maxCost,
          currentSpent: 0, // Will be tracked during execution
        },
      });

      const result = await plugin.execute(task.parameters);

      await plugin.cleanup();

      const output: ExecutionLayerOutput = {
        taskId: task.id,
        status: result.success ? 'completed' : 'failed',
        result: {
          success: result.success,
          data: result.data,
          error: result.error,
        },
        pluginUsed: plugin.manifest.id,
        metrics: {
          duration: result.metrics.duration,
          cost: result.metrics.cost,
          apiCalls: result.metrics.apiCalls,
        },
        artifacts: this.extractArtifacts(task.type, result.data),
      };

      return this.success(output, {
        nextEngines: ['data-collection'],
        events: [
          {
            id: `evt-${Date.now()}`,
            type: result.success ? 'execution.task.completed' : 'execution.task.failed',
            source: this.name,
            companyId,
            timestamp: new Date(),
            data: {
              taskId: task.id,
              taskType: task.type,
              pluginUsed: plugin.manifest.id,
              cost: result.metrics.cost,
            },
            priority: result.success ? 'medium' : 'high',
            requiresAction: !result.success,
          },
        ],
      });
    } catch (error) {
      await plugin.cleanup();
      return this.failure([
        {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          recoverable: true,
        },
      ]);
    }
  }

  private selectPlugin(task: ExecutionTask): ExecutionPlugin | undefined {
    // If specific plugin requested, use it
    if (task.pluginId) {
      return this.plugins.get(task.pluginId);
    }

    // Otherwise, select by task type
    const taskTypeToPlugin: Record<ExecutionTaskType, string> = {
      create_landing_page: 'landing-page-generator',
      run_ad_campaign: 'meta-ads', // Could also select google-ads based on context
      send_outreach: 'email-outreach',
      scrape_leads: 'lead-scraper',
      generate_content: 'content-generator',
      create_banner: 'banner-generator',
      analyze_data: 'analytics',
      send_email: 'email-sender',
      schedule_social: 'social-scheduler',
      custom: 'custom-executor',
    };

    const pluginId = taskTypeToPlugin[task.type];
    return this.plugins.get(pluginId);
  }

  private extractArtifacts(taskType: ExecutionTaskType, data: unknown): Artifact[] {
    // TODO: Implement artifact extraction based on task type
    return [];
  }

  // Public methods for plugin management
  registerPlugin(plugin: ExecutionPlugin): void {
    this.plugins.set(plugin.manifest.id, plugin);
    console.log(`Plugin registered: ${plugin.manifest.name}`);
  }

  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  listPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values()).map((p) => p.manifest);
  }
}

// Export singleton factory
export const createExecutionLayerEngine = () => new ExecutionLayerEngine();
