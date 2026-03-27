/**
 * Data Collection Engine (Radar)
 *
 * Collects and aggregates data from all execution activities.
 * Feeds into Optimization and Experimentation engines.
 *
 * Components: Market Radar, Competitor Radar, Opportunity Radar
 */

import { BaseEngine } from './base-engine';
import type { EngineName, EngineConfig, EngineInput, EngineOutput } from '../types';

// =============================================================================
// INPUT/OUTPUT TYPES
// =============================================================================

export interface DataCollectionInput {
  companyId: string;
  sources: DataSource[];
  timeRange: {
    start: Date;
    end: Date;
  };
  filters?: DataFilter[];
}

export interface DataSource {
  type: 'execution' | 'analytics' | 'crm' | 'ads' | 'social' | 'web' | 'competitor';
  id: string;
  config?: Record<string, unknown>;
}

export interface DataFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: unknown;
}

export interface DataCollectionOutput {
  collections: DataCollection[];
  aggregations: DataAggregation[];
  anomalies: DataAnomaly[];
  alerts: DataAlert[];
  summary: {
    totalDataPoints: number;
    sourcesProcessed: number;
    anomaliesDetected: number;
    alertsTriggered: number;
  };
}

export interface DataCollection {
  sourceId: string;
  sourceType: string;
  dataPoints: DataPoint[];
  collectedAt: Date;
  quality: {
    completeness: number;
    freshness: number;
    accuracy: number;
  };
}

export interface DataPoint {
  id: string;
  timestamp: Date;
  metric: string;
  value: number;
  dimensions: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface DataAggregation {
  metric: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  values: {
    timestamp: Date;
    value: number;
    change: number; // percentage change from previous period
  }[];
  statistics: {
    min: number;
    max: number;
    avg: number;
    sum: number;
    stdDev: number;
  };
}

export interface DataAnomaly {
  id: string;
  metric: string;
  type: 'spike' | 'drop' | 'trend_change' | 'pattern_break';
  severity: 'critical' | 'high' | 'medium' | 'low';
  detectedAt: Date;
  expectedValue: number;
  actualValue: number;
  deviation: number; // percentage
  possibleCauses: string[];
}

export interface DataAlert {
  id: string;
  type: 'threshold_exceeded' | 'anomaly' | 'trend' | 'goal_at_risk';
  title: string;
  message: string;
  metric: string;
  currentValue: number;
  threshold?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  triggeredAt: Date;
  requiresAction: boolean;
  suggestedActions: string[];
}

// =============================================================================
// ENGINE IMPLEMENTATION
// =============================================================================

export class DataCollectionEngine extends BaseEngine<
  DataCollectionInput,
  DataCollectionOutput
> {
  readonly name: EngineName = 'data-collection';

  readonly config: EngineConfig = {
    name: 'data-collection',
    enabled: true,
    priority: 5,
    timeout: 60000,
    retryCount: 3,
    dependencies: ['execution-layer'],
  };

  protected async onInitialize(): Promise<void> {
    // Register event handlers
    this.on('execution.task.completed', async (event) => {
      console.log(`Task completed, collecting execution data: ${event.data}`);
    });

    this.on('execution.plugin.invoked', async (event) => {
      console.log(`Plugin invoked, tracking metrics: ${event.data}`);
    });
  }

  protected async execute(
    input: EngineInput<DataCollectionInput>
  ): Promise<EngineOutput<DataCollectionOutput>> {
    const { companyId, sources, timeRange, filters } = input.data;

    console.log(`Collecting data from ${sources.length} sources for ${companyId}...`);

    // TODO: Implement actual data collection
    // - Connect to data sources
    // - Fetch raw data
    // - Process and aggregate
    // - Detect anomalies
    // - Generate alerts

    const result: DataCollectionOutput = {
      collections: [],
      aggregations: [],
      anomalies: [],
      alerts: [],
      summary: {
        totalDataPoints: 0,
        sourcesProcessed: sources.length,
        anomaliesDetected: 0,
        alertsTriggered: 0,
      },
    };

    return this.success(result, {
      nextEngines: ['optimization-engine', 'experimentation-engine'],
      events: [
        {
          id: `evt-${Date.now()}`,
          type: 'data.collected',
          source: this.name,
          companyId,
          timestamp: new Date(),
          data: { dataPoints: result.summary.totalDataPoints },
          priority: 'low',
          requiresAction: false,
        },
      ],
    });
  }
}

// =============================================================================
// SUB-MODULES (Interfaces for future implementation)
// =============================================================================

export interface IDataConnector {
  name: string;
  connect(config: Record<string, unknown>): Promise<void>;
  fetch(query: unknown): Promise<DataPoint[]>;
  disconnect(): Promise<void>;
}

export interface IAnomalyDetector {
  detect(dataPoints: DataPoint[]): Promise<DataAnomaly[]>;
}

export interface IAlertEngine {
  evaluate(
    aggregations: DataAggregation[],
    anomalies: DataAnomaly[],
    rules: AlertRule[]
  ): Promise<DataAlert[]>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: {
    operator: string;
    threshold: number;
  };
  severity: string;
  actions: string[];
}

// Export singleton factory
export const createDataCollectionEngine = () => new DataCollectionEngine();
