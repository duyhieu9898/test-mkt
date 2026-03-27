/**
 * AI Company OS - Workflow Package
 *
 * Central workflow orchestration system that manages the flow of data
 * through all engines in the platform.
 *
 * Architecture:
 * ```
 * User Prompt
 *      ↓
 * ┌─────────────────────────────────────────────────────┐
 * │              WORKFLOW ORCHESTRATOR                  │
 * │  Manages: Events, Engine Execution, Plugin System   │
 * └─────────────────────────────────────────────────────┘
 *      ↓
 * ┌─────────────────────────────────────────────────────┐
 * │ Company Generator → Market Intelligence            │
 * │      ↓                                             │
 * │ Strategy Engine (AI CEO)                           │
 * │      ↓                                             │
 * │ Execution Layer ←→ Plugins                         │
 * │      ↓                                             │
 * │ Data Collection                                    │
 * │      ↓                                             │
 * │ Optimization Engine ←→ Experimentation Engine      │
 * │      ↓                                             │
 * │ Intelligence Network                               │
 * │      ↓                                             │
 * │ (Loop back to Strategy)                            │
 * └─────────────────────────────────────────────────────┘
 * ```
 *
 * Usage:
 * ```typescript
 * import { getOrchestrator } from '@1person/workflow';
 *
 * const orchestrator = getOrchestrator();
 * await orchestrator.initialize();
 *
 * const result = await orchestrator.runCompanyCreationWorkflow(
 *   userId,
 *   "Build a SaaS for newsletter creators"
 * );
 * ```
 */

// Types
export * from './types';

// Engines - export specific items to avoid conflicts
export {
  BaseEngine,
  type IEngine,
  createAllEngines,
  ENGINE_ORDER,
  // Engine classes
  CompanyGeneratorEngine,
  createCompanyGeneratorEngine,
  MarketIntelligenceEngine,
  createMarketIntelligenceEngine,
  StrategyEngine,
  createStrategyEngine,
  ExecutionLayerEngine,
  createExecutionLayerEngine,
  DataCollectionEngine,
  createDataCollectionEngine,
  OptimizationEngine,
  createOptimizationEngine,
  ExperimentationEngine,
  createExperimentationEngine,
  IntelligenceNetworkEngine,
  createIntelligenceNetworkEngine,
} from './engines';

// Events
export { WorkflowEventBus, getEventBus, resetEventBus } from './events';

// Plugins
export {
  BasePlugin,
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
  LandingPageGeneratorPlugin,
  createLandingPageGeneratorPlugin,
  registerBuiltInPlugins,
  type IPlugin,
} from './plugins';

// Orchestrator
export {
  WorkflowOrchestrator,
  getOrchestrator,
  resetOrchestrator,
  type OrchestratorConfig,
} from './orchestrator';

// Convenience function to initialize everything
import { getOrchestrator } from './orchestrator';
import { registerBuiltInPlugins } from './plugins';

/**
 * Initialize the complete workflow system
 */
export async function initializeWorkflowSystem(): Promise<void> {
  console.log('Initializing AI Company OS Workflow System...');

  // Register built-in plugins
  registerBuiltInPlugins();

  // Initialize orchestrator (which initializes all engines)
  const orchestrator = getOrchestrator();
  await orchestrator.initialize();

  console.log('Workflow system initialized');
  console.log(orchestrator.getStatus());
}

/**
 * Shutdown the workflow system
 */
export async function shutdownWorkflowSystem(): Promise<void> {
  const orchestrator = getOrchestrator();
  await orchestrator.shutdown();

  console.log('Workflow system shut down');
}
