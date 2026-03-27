/**
 * Engine Exports
 *
 * All engines in the AI Company OS workflow system.
 */

// Base engine
export { BaseEngine } from './base-engine';
export type { IEngine } from './base-engine';

// Company Generator
export {
  CompanyGeneratorEngine,
  createCompanyGeneratorEngine,
} from './company-generator';
export type {
  CompanyGeneratorInput,
  CompanyGeneratorOutput,
} from './company-generator';

// Market Intelligence
export {
  MarketIntelligenceEngine,
  createMarketIntelligenceEngine,
} from './market-intelligence';
export type {
  MarketIntelligenceInput,
  MarketIntelligenceOutput,
  MarketTrend,
  CompetitorActivity,
  MarketOpportunity,
  MarketRisk,
  MarketSignal,
  IMarketScraper,
  ITrendDetector,
  ICompetitorMonitor,
  IOpportunityDetector,
} from './market-intelligence';

// Strategy Engine
export {
  StrategyEngine,
  createStrategyEngine,
} from './strategy-engine';
export type {
  StrategyEngineInput,
  StrategyEngineOutput,
  StrategyContext,
  StrategyDecision,
  StrategyGoal,
  ResourceAllocation,
  TaskAssignment,
  StrategyRecommendation,
  IContextAggregator,
  IStrategicReasoner,
  IGoalDecomposer,
} from './strategy-engine';
// Note: IResourceAllocator is also in strategy-engine but conflicts with optimization
// Use StrategyResourceAllocator instead
export type { IResourceAllocator as IStrategyResourceAllocator } from './strategy-engine';

// Execution Layer
export {
  ExecutionLayerEngine,
  createExecutionLayerEngine,
} from './execution-layer';
export type {
  ExecutionLayerInput,
  ExecutionLayerOutput,
  ExecutionTask,
  ExecutionTaskType,
  ExecutionContext,
  ExecutionResult,
  ExecutionMetrics,
  Artifact,
  ExecutionPlugin,
} from './execution-layer';

// Data Collection
export {
  DataCollectionEngine,
  createDataCollectionEngine,
} from './data-collection';
export type {
  DataCollectionInput,
  DataCollectionOutput,
  DataSource,
  DataFilter,
  DataCollection,
  DataPoint,
  DataAggregation,
  DataAnomaly,
  DataAlert,
  IDataConnector,
  IAnomalyDetector,
  IAlertEngine,
  AlertRule,
} from './data-collection';

// Optimization Engine
export {
  OptimizationEngine,
  createOptimizationEngine,
} from './optimization-engine';
export type {
  OptimizationEngineInput,
  OptimizationEngineOutput,
  PerformanceMetrics,
  OptimizationTarget,
  OptimizationConstraint,
  OptimizationRecommendation,
  OptimizationAdjustment,
  PerformanceProjection,
  Bottleneck,
  OpportunityInsight,
  IPerformanceAnalyzer,
  ICampaignOptimizer,
  IFunnelOptimizer,
} from './optimization-engine';
export type { IResourceAllocator as IOptimizationResourceAllocator } from './optimization-engine';

// Experimentation Engine
export {
  ExperimentationEngine,
  createExperimentationEngine,
} from './experimentation-engine';
export type {
  ExperimentationEngineInput,
  ExperimentationEngineOutput,
  ExperimentContext,
  Hypothesis,
  Experiment,
  ExperimentVariant,
  VariantChange,
  GuardrailMetric,
  ExperimentResult,
  ExperimentWinner,
  ExperimentRecommendation,
  IHypothesisGenerator,
  IExperimentDesigner,
  IVariantGenerator,
  IStatisticalAnalyzer,
} from './experimentation-engine';

// Intelligence Network
export {
  IntelligenceNetworkEngine,
  createIntelligenceNetworkEngine,
} from './intelligence-network';
export type {
  IntelligenceNetworkInput,
  IntelligenceNetworkOutput,
  ContributionData,
  IntelligenceQuery,
  Pattern,
  PatternCondition,
  Benchmark,
  IntelligenceRecommendation,
  BestPractice,
  IDataAnonymizer,
  IPatternDetector,
  IBenchmarkCalculator,
  IRecommendationEngine,
} from './intelligence-network';

// Types from main types file (re-export for convenience)
import type { EngineName } from '../types';
export type { EngineName } from '../types';

// Engine factories
import { createCompanyGeneratorEngine } from './company-generator';
import { createMarketIntelligenceEngine } from './market-intelligence';
import { createStrategyEngine } from './strategy-engine';
import { createExecutionLayerEngine } from './execution-layer';
import { createDataCollectionEngine } from './data-collection';
import { createOptimizationEngine } from './optimization-engine';
import { createExperimentationEngine } from './experimentation-engine';
import { createIntelligenceNetworkEngine } from './intelligence-network';
import type { IEngine } from './base-engine';

/**
 * Create all engines
 */
export function createAllEngines(): Map<EngineName, IEngine> {
  const engines = new Map<EngineName, IEngine>();

  engines.set('company-generator', createCompanyGeneratorEngine());
  engines.set('market-intelligence', createMarketIntelligenceEngine());
  engines.set('strategy-engine', createStrategyEngine());
  engines.set('execution-layer', createExecutionLayerEngine());
  engines.set('data-collection', createDataCollectionEngine());
  engines.set('optimization-engine', createOptimizationEngine());
  engines.set('experimentation-engine', createExperimentationEngine());
  engines.set('intelligence-network', createIntelligenceNetworkEngine());

  return engines;
}

/**
 * Engine execution order (based on dependencies)
 */
export const ENGINE_ORDER: EngineName[] = [
  'company-generator',
  'market-intelligence',
  'strategy-engine',
  'execution-layer',
  'data-collection',
  'optimization-engine',
  'experimentation-engine',
  'intelligence-network',
];
