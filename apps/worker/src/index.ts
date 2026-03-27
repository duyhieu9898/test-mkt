import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(process.cwd(), '../../.env') });

import { createTaskWorker } from './jobs/task-processor';
import { createCommandWorker, setCommandEventHandlers } from './jobs/command-processor';
import { createEvaluationWorker } from './jobs/evaluation-processor';
import { redis, getQueueStats, cleanupQueues } from './lib/queue';
import { startDistributionScheduler } from './workers/distribution-scheduler';
import {
  runOperationalWorkflow,
  runStrategicWorkflow,
  runMaintenanceWorkflow,
  runRiskMonitoringWorkflow,
  initializeWorkflowSystem,
} from './services/workflow-runner';
import { computeCompanyState } from './services/company-state-engine';

console.log(`
  ___  ____
 / _ \\|  _ \\ ___ _ __ ___  ___  _ __
| | | | |_) / _ \\ '__/ __|/ _ \\| '_ \\
| |_| |  __/  __/ |  \\__ \\ (_) | | | |
 \\___/|_|   \\___|_|  |___/\\___/|_| |_|

 AI Worker Service v0.1.0
 ========================
`);

// Verify Redis connection
async function checkRedis() {
  try {
    await redis.ping();
    console.log('✅ Redis connected');
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    return false;
  }
}

// Start workers
async function start() {
  // Check Redis
  const redisOk = await checkRedis();
  if (!redisOk) {
    console.error('Cannot start without Redis. Exiting...');
    process.exit(1);
  }

  // Create workers
  const taskWorker = createTaskWorker();
  const commandWorker = createCommandWorker();
  const evaluationWorker = createEvaluationWorker();

  console.log('✅ Task Worker started');
  console.log('✅ Command Worker started');
  console.log('✅ Evaluation Worker started');

  // Start Distribution Scheduler (social media posting)
  const distributionScheduler = startDistributionScheduler();
  console.log('✅ Distribution Scheduler started');

  // Print stats periodically
  setInterval(async () => {
    const stats = await getQueueStats();
    const totalWaiting =
      stats.taskExecution.waiting +
      stats.agentCommand.waiting +
      stats.agentEvaluation.waiting;

    if (totalWaiting > 0) {
      console.log(`[Stats] Waiting: Tasks=${stats.taskExecution.waiting}, Commands=${stats.agentCommand.waiting}, Evals=${stats.agentEvaluation.waiting}`);
    }
  }, 30000);

  // Cleanup old jobs daily
  setInterval(async () => {
    await cleanupQueues();
    console.log('[Cleanup] Old jobs cleaned');
  }, 24 * 60 * 60 * 1000);

  // ================================================
  // AI Company OS Workflow Scheduler
  // ================================================

  // Get all active companies and run workflows
  const runScheduledWorkflows = async () => {
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;
      const { eq } = await import('drizzle-orm');
      const schema = await import('@1person/core/db');

      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
      const client = postgres(DATABASE_URL);
      const db = drizzle(client, { schema });

      const companies = await db.query.companies.findMany({
        where: eq(schema.companies.status, 'active'),
      });

      for (const company of companies) {
        // Run operational workflow every 5 minutes
        await runOperationalWorkflow(company.id).catch(err =>
          console.error(`[Workflow] Operational failed for ${company.id}:`, err)
        );
      }
    } catch (error) {
      console.error('[Workflow] Scheduler error:', error);
    }
  };

  const runStrategicWorkflows = async () => {
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;
      const { eq } = await import('drizzle-orm');
      const schema = await import('@1person/core/db');

      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
      const client = postgres(DATABASE_URL);
      const db = drizzle(client, { schema });

      const companies = await db.query.companies.findMany({
        where: eq(schema.companies.status, 'active'),
      });

      for (const company of companies) {
        await runStrategicWorkflow(company.id).catch(err =>
          console.error(`[Workflow] Strategic failed for ${company.id}:`, err)
        );
      }
    } catch (error) {
      console.error('[Workflow] Strategic scheduler error:', error);
    }
  };

  const runMaintenanceWorkflows = async () => {
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;
      const { eq } = await import('drizzle-orm');
      const schema = await import('@1person/core/db');

      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
      const client = postgres(DATABASE_URL);
      const db = drizzle(client, { schema });

      const companies = await db.query.companies.findMany({
        where: eq(schema.companies.status, 'active'),
      });

      for (const company of companies) {
        await runMaintenanceWorkflow(company.id).catch(err =>
          console.error(`[Workflow] Maintenance failed for ${company.id}:`, err)
        );
      }
    } catch (error) {
      console.error('[Workflow] Maintenance scheduler error:', error);
    }
  };

  // Event Trigger Evaluation (every 5 minutes)
  const runEventTriggerEvaluation = async () => {
    try {
      const { runTriggerEvaluation } = await import('./services/event-triggers');
      await runTriggerEvaluation();
    } catch (error) {
      console.error('[EventTriggers] Evaluation error:', error);
    }
  };

  // Daily Strategy Refresh (every day at midnight)
  const runDailyStrategyRefresh = async () => {
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;
      const { eq } = await import('drizzle-orm');
      const schema = await import('@1person/core/db');
      const { runDailyStrategyRefresh } = await import('./services/strategy-horizon');

      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
      const client = postgres(DATABASE_URL);
      const db = drizzle(client, { schema });

      const companies = await db.query.companies.findMany({
        where: eq(schema.companies.status, 'active'),
      });

      for (const company of companies) {
        await runDailyStrategyRefresh(company.id).catch(err =>
          console.error(`[Strategy] Daily refresh failed for ${company.id}:`, err)
        );
      }
    } catch (error) {
      console.error('[Strategy] Daily refresh error:', error);
    }
  };

  // Risk Monitoring (every 10 minutes)
  const runRiskMonitoringScheduled = async () => {
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;
      const { eq } = await import('drizzle-orm');
      const schema = await import('@1person/core/db');

      const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
      const client = postgres(DATABASE_URL);
      const db = drizzle(client, { schema });

      const companies = await db.query.companies.findMany({
        where: eq(schema.companies.status, 'active'),
      });

      for (const company of companies) {
        await runRiskMonitoringWorkflow(company.id).catch(err =>
          console.error(`[Risk] Monitoring failed for ${company.id}:`, err)
        );
      }
    } catch (error) {
      console.error('[Risk] Monitoring scheduler error:', error);
    }
  };

  // Schedule workflows
  // Operational: every 5 minutes
  setInterval(runScheduledWorkflows, 5 * 60 * 1000);

  // Event Triggers: every 5 minutes
  setInterval(runEventTriggerEvaluation, 5 * 60 * 1000);

  // Strategic: every hour
  setInterval(runStrategicWorkflows, 60 * 60 * 1000);

  // Daily Strategy: every 24 hours
  setInterval(runDailyStrategyRefresh, 24 * 60 * 60 * 1000);

  // Risk Monitoring: every 10 minutes
  setInterval(runRiskMonitoringScheduled, 10 * 60 * 1000);

  // Maintenance: every 24 hours
  setInterval(runMaintenanceWorkflows, 24 * 60 * 60 * 1000);

  console.log('✅ Workflow Scheduler started');
  console.log('   - Operational: every 5 minutes');
  console.log('   - Event Triggers: every 5 minutes');
  console.log('   - Risk Monitoring: every 10 minutes');
  console.log('   - Strategic: every 1 hour');
  console.log('   - Daily Strategy: every 24 hours');
  console.log('   - Maintenance: every 24 hours');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\\nShutting down workers...');

    // Stop distribution scheduler
    distributionScheduler.stop();

    await Promise.all([
      taskWorker.close(),
      commandWorker.close(),
      evaluationWorker.close(),
    ]);

    await redis.quit();
    console.log('Workers stopped. Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('\\n🚀 Worker service is running');
  console.log('   Press Ctrl+C to stop\\n');
}

start().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
