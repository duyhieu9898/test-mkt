/**
 * Workflow Orchestrator
 *
 * Central coordinator that manages the flow of data through all engines.
 * Implements the main workflow pipeline:
 *
 * User Prompt → Company Generator → Market Intelligence → Strategy Engine
 * → Execution Layer → Data Collection → Optimization → Experimentation
 * → Intelligence Network → (Loop back to Strategy)
 */

import type {
  EngineName,
  EngineInput,
  EngineOutput,
  WorkflowEvent,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStep,
  CompanyContext,
} from './types';
import type { IEngine } from './engines/base-engine';
import { createAllEngines, ENGINE_ORDER } from './engines';
import { WorkflowEventBus, getEventBus } from './events/event-bus';

// =============================================================================
// ORCHESTRATOR CONFIGURATION
// =============================================================================

export interface OrchestratorConfig {
  autoInitialize: boolean;
  enableEventBus: boolean;
  defaultTimeout: number;
  maxConcurrentWorkflows: number;
  enableMetrics: boolean;
  enableLogging: boolean;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  autoInitialize: true,
  enableEventBus: true,
  defaultTimeout: 300000, // 5 minutes
  maxConcurrentWorkflows: 10,
  enableMetrics: true,
  enableLogging: true,
};

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export class WorkflowOrchestrator {
  private engines: Map<EngineName, IEngine> = new Map();
  private eventBus: WorkflowEventBus;
  private config: OrchestratorConfig;
  private initialized = false;
  private activeWorkflows: Map<string, WorkflowExecution> = new Map();
  private workflowDefinitions: Map<string, WorkflowDefinition> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = getEventBus();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize all engines
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[Orchestrator] Already initialized');
      return;
    }

    this.log('Initializing workflow orchestrator...');

    // Create all engines
    this.engines = createAllEngines();

    // Initialize engines in order
    for (const name of ENGINE_ORDER) {
      const engine = this.engines.get(name);
      if (engine) {
        this.log(`Initializing engine: ${name}`);
        await engine.initialize();

        // Register engine event handlers with event bus
        if (this.config.enableEventBus) {
          this.eventBus.subscribe('*', (event) => engine.handleEvent(event), {
            source: name as EngineName,
          });
        }
      }
    }

    // Register built-in workflow definitions
    this.registerBuiltInWorkflows();

    this.initialized = true;
    this.log('Workflow orchestrator initialized');
  }

  /**
   * Shutdown all engines
   */
  async shutdown(): Promise<void> {
    this.log('Shutting down workflow orchestrator...');

    // Shutdown engines in reverse order
    for (const name of [...ENGINE_ORDER].reverse()) {
      const engine = this.engines.get(name);
      if (engine) {
        this.log(`Shutting down engine: ${name}`);
        await engine.shutdown();
      }
    }

    this.eventBus.clear();
    this.initialized = false;
    this.log('Workflow orchestrator shut down');
  }

  // ===========================================================================
  // WORKFLOW EXECUTION
  // ===========================================================================

  /**
   * Run the full company creation workflow
   */
  async runCompanyCreationWorkflow(
    userId: string,
    prompt: string,
    preferences?: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const workflowId = `wf-create-${Date.now()}`;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const execution: WorkflowExecution = {
      id: workflowId,
      workflowId: 'company-creation',
      companyId: '', // Will be set after company generator
      status: 'running',
      steps: [],
      startedAt: new Date(),
    };

    this.activeWorkflows.set(workflowId, execution);

    try {
      // Step 1: Company Generator
      this.log(`[${workflowId}] Step 1: Company Generator`);
      const companyResult = await this.executeEngine('company-generator', {
        context: this.createInitialContext(userId),
        data: { prompt, userId, preferences },
        metadata: {
          requestId,
          timestamp: new Date(),
          source: 'user',
          previousEngines: [],
        },
      });

      if (!companyResult.success) {
        throw new Error(`Company generation failed: ${companyResult.errors?.[0]?.message}`);
      }

      const companyData = companyResult.data as { company: { id: string } };
      execution.companyId = companyData.company.id;

      // Publish events
      if (companyResult.events) {
        await this.publishEvents(companyResult.events);
      }

      // Step 2: Market Intelligence (parallel with step 3)
      this.log(`[${workflowId}] Step 2: Market Intelligence`);
      const marketPromise = this.executeEngine('market-intelligence', {
        context: this.createContext(companyData.company.id),
        data: {
          companyId: companyData.company.id,
          industry: 'technology', // From company data
          refreshType: 'full',
        },
        metadata: {
          requestId,
          timestamp: new Date(),
          source: 'company-generator',
          previousEngines: ['company-generator'],
        },
      });

      // Step 3: Initial Strategy (can run in parallel)
      this.log(`[${workflowId}] Step 3: Strategy Engine`);
      const strategyPromise = this.executeEngine('strategy-engine', {
        context: this.createContext(companyData.company.id),
        data: {
          companyId: companyData.company.id,
          context: {
            company: {
              stage: 'idea',
              metrics: { revenue: 0, leads: 0, customers: 0, traffic: 0, conversionRate: 0, cac: 0, ltv: 0, churnRate: 0 },
              budget: { total: 500, remaining: 500 },
            },
          },
          trigger: 'event',
          urgency: 'normal',
        },
        metadata: {
          requestId,
          timestamp: new Date(),
          source: 'company-generator',
          previousEngines: ['company-generator'],
        },
      });

      // Wait for both
      const [marketResult, strategyResult] = await Promise.all([
        marketPromise,
        strategyPromise,
      ]);

      // Publish events
      if (marketResult.events) await this.publishEvents(marketResult.events);
      if (strategyResult.events) await this.publishEvents(strategyResult.events);

      // Mark workflow as completed
      execution.status = 'completed';
      execution.completedAt = new Date();

      this.log(`[${workflowId}] Workflow completed`);

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.completedAt = new Date();

      this.log(`[${workflowId}] Workflow failed: ${execution.error}`);

      return execution;
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  /**
   * Run a single engine
   */
  async executeEngine<TInput, TOutput>(
    engineName: EngineName,
    input: EngineInput<TInput>
  ): Promise<EngineOutput<TOutput>> {
    const engine = this.engines.get(engineName);

    if (!engine) {
      return {
        success: false,
        data: null as unknown as TOutput,
        errors: [
          {
            code: 'ENGINE_NOT_FOUND',
            message: `Engine ${engineName} not found`,
            recoverable: false,
          },
        ],
        metrics: { duration: 0 },
      };
    }

    const startTime = Date.now();
    this.log(`Executing engine: ${engineName}`);

    try {
      const result = await engine.process(input);

      this.log(
        `Engine ${engineName} completed in ${Date.now() - startTime}ms (success: ${result.success})`
      );

      return result as EngineOutput<TOutput>;
    } catch (error) {
      this.log(`Engine ${engineName} failed: ${error}`);

      return {
        success: false,
        data: null as unknown as TOutput,
        errors: [
          {
            code: 'ENGINE_EXECUTION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true,
          },
        ],
        metrics: { duration: Date.now() - startTime },
      };
    }
  }

  /**
   * Run the continuous optimization loop
   */
  async runOptimizationLoop(companyId: string): Promise<void> {
    this.log(`Starting optimization loop for ${companyId}`);

    // This would run continuously in production
    // For now, just execute the loop once

    // 1. Collect data
    await this.executeEngine('data-collection', {
      context: this.createContext(companyId),
      data: {
        companyId,
        sources: [{ type: 'execution', id: 'all' }],
        timeRange: {
          start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          end: new Date(),
        },
      },
      metadata: {
        requestId: `loop-${Date.now()}`,
        timestamp: new Date(),
        source: 'strategy-engine',
        previousEngines: ['strategy-engine'],
      },
    });

    // 2. Optimize
    await this.executeEngine('optimization-engine', {
      context: this.createContext(companyId),
      data: {
        companyId,
        data: { aggregations: [], anomalies: [], currentPerformance: {} },
        targets: [],
        constraints: [],
      },
      metadata: {
        requestId: `loop-${Date.now()}`,
        timestamp: new Date(),
        source: 'data-collection',
        previousEngines: ['data-collection'],
      },
    });

    // 3. Check experiments
    await this.executeEngine('experimentation-engine', {
      context: this.createContext(companyId),
      data: {
        companyId,
        action: 'analyze',
      },
      metadata: {
        requestId: `loop-${Date.now()}`,
        timestamp: new Date(),
        source: 'optimization-engine',
        previousEngines: ['optimization-engine'],
      },
    });

    // 4. Update intelligence network
    await this.executeEngine('intelligence-network', {
      context: this.createContext(companyId),
      data: {
        companyId,
        action: 'get_recommendations',
      },
      metadata: {
        requestId: `loop-${Date.now()}`,
        timestamp: new Date(),
        source: 'experimentation-engine',
        previousEngines: ['experimentation-engine'],
      },
    });

    this.log(`Optimization loop completed for ${companyId}`);
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private createInitialContext(userId: string): CompanyContext {
    return {
      companyId: '',
      userId,
      industry: '',
      businessType: '',
      stage: 'idea',
      budget: { total: 0, remaining: 0, monthlyLimit: 0 },
      goals: [],
      metrics: {
        revenue: 0,
        leads: 0,
        customers: 0,
        traffic: 0,
        conversionRate: 0,
        cac: 0,
        ltv: 0,
        churnRate: 0,
      },
    };
  }

  private createContext(companyId: string): CompanyContext {
    // TODO: Load actual company context from database
    return {
      companyId,
      userId: '',
      industry: '',
      businessType: '',
      stage: 'idea',
      budget: { total: 500, remaining: 500, monthlyLimit: 500 },
      goals: [],
      metrics: {
        revenue: 0,
        leads: 0,
        customers: 0,
        traffic: 0,
        conversionRate: 0,
        cac: 0,
        ltv: 0,
        churnRate: 0,
      },
    };
  }

  private async publishEvents(events: WorkflowEvent[]): Promise<void> {
    if (!this.config.enableEventBus) return;

    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }

  private registerBuiltInWorkflows(): void {
    // Register the main company creation workflow
    this.workflowDefinitions.set('company-creation', {
      id: 'company-creation',
      name: 'Company Creation',
      description: 'Creates a new AI company from user prompt',
      trigger: { type: 'manual', config: {} },
      steps: [
        { id: 'generate', engine: 'company-generator', action: 'create', inputs: {} },
        { id: 'intelligence', engine: 'market-intelligence', action: 'analyze', inputs: {} },
        { id: 'strategy', engine: 'strategy-engine', action: 'plan', inputs: {} },
      ],
      onError: 'stop',
      timeout: 120000,
    });

    // Register the optimization loop workflow
    this.workflowDefinitions.set('optimization-loop', {
      id: 'optimization-loop',
      name: 'Optimization Loop',
      description: 'Continuous optimization cycle',
      trigger: { type: 'schedule', config: { interval: '1h' } },
      steps: [
        { id: 'collect', engine: 'data-collection', action: 'collect', inputs: {} },
        { id: 'optimize', engine: 'optimization-engine', action: 'analyze', inputs: {} },
        { id: 'experiment', engine: 'experimentation-engine', action: 'check', inputs: {} },
        { id: 'learn', engine: 'intelligence-network', action: 'contribute', inputs: {} },
      ],
      onError: 'skip',
      timeout: 300000,
    });
  }

  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[Orchestrator] ${message}`);
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Get engine by name
   */
  getEngine(name: EngineName): IEngine | undefined {
    return this.engines.get(name);
  }

  /**
   * Get all engines
   */
  getEngines(): Map<EngineName, IEngine> {
    return new Map(this.engines);
  }

  /**
   * Get event bus
   */
  getEventBus(): WorkflowEventBus {
    return this.eventBus;
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows(): WorkflowExecution[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get workflow definitions
   */
  getWorkflowDefinitions(): WorkflowDefinition[] {
    return Array.from(this.workflowDefinitions.values());
  }

  /**
   * Health check for all engines
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    engines: { name: string; healthy: boolean; message?: string }[];
  }> {
    const results = await Promise.all(
      Array.from(this.engines.entries()).map(async ([name, engine]) => {
        const health = await engine.healthCheck();
        return { name, ...health };
      })
    );

    return {
      healthy: results.every((r) => r.healthy),
      engines: results,
    };
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    initialized: boolean;
    engineCount: number;
    activeWorkflows: number;
    eventBusStats: ReturnType<WorkflowEventBus['getStats']>;
  } {
    return {
      initialized: this.initialized,
      engineCount: this.engines.size,
      activeWorkflows: this.activeWorkflows.size,
      eventBusStats: this.eventBus.getStats(),
    };
  }
}

// Singleton instance
let orchestratorInstance: WorkflowOrchestrator | null = null;

export function getOrchestrator(config?: Partial<OrchestratorConfig>): WorkflowOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new WorkflowOrchestrator(config);
  }
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  orchestratorInstance = null;
}
