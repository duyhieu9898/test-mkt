/**
 * Workflow Event Bus
 *
 * Central communication system for all engines.
 * Implements pub/sub pattern for decoupled communication.
 */

import type { WorkflowEvent, WorkflowEventType, EngineName } from '../types';

export type EventHandler = (event: WorkflowEvent) => Promise<void>;

export interface EventSubscription {
  id: string;
  eventType: WorkflowEventType | '*';
  handler: EventHandler;
  source?: EngineName;
  priority: number;
}

export interface EventBusConfig {
  maxQueueSize: number;
  processingConcurrency: number;
  retryAttempts: number;
  retryDelayMs: number;
  deadLetterEnabled: boolean;
}

const DEFAULT_CONFIG: EventBusConfig = {
  maxQueueSize: 10000,
  processingConcurrency: 10,
  retryAttempts: 3,
  retryDelayMs: 1000,
  deadLetterEnabled: true,
};

export class WorkflowEventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private eventQueue: WorkflowEvent[] = [];
  private processing = false;
  private deadLetterQueue: Array<{ event: WorkflowEvent; error: string }> = [];
  private config: EventBusConfig;

  constructor(config: Partial<EventBusConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType: WorkflowEventType | '*',
    handler: EventHandler,
    options?: { source?: EngineName; priority?: number }
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      handler,
      source: options?.source,
      priority: options?.priority ?? 0,
    };

    const key = eventType;
    const existing = this.subscriptions.get(key) || [];
    existing.push(subscription);
    // Sort by priority (higher first)
    existing.sort((a, b) => b.priority - a.priority);
    this.subscriptions.set(key, existing);

    console.log(`[EventBus] Subscribed to ${eventType}: ${subscriptionId}`);
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    for (const [key, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        console.log(`[EventBus] Unsubscribed: ${subscriptionId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Publish an event
   */
  async publish(event: WorkflowEvent): Promise<void> {
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      console.error('[EventBus] Queue full, dropping event:', event.id);
      return;
    }

    this.eventQueue.push(event);
    console.log(`[EventBus] Event published: ${event.type} (${event.id})`);

    if (!this.processing) {
      await this.processQueue();
    }
  }

  /**
   * Publish multiple events
   */
  async publishBatch(events: WorkflowEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Process event queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.eventQueue.length > 0) {
      const batch = this.eventQueue.splice(0, this.config.processingConcurrency);

      await Promise.all(
        batch.map(async (event) => {
          try {
            await this.dispatchEvent(event);
          } catch (error) {
            await this.handleEventError(event, error);
          }
        })
      );
    }

    this.processing = false;
  }

  /**
   * Dispatch event to subscribers
   */
  private async dispatchEvent(event: WorkflowEvent): Promise<void> {
    // Get specific subscribers
    const specificSubs = this.subscriptions.get(event.type) || [];
    // Get wildcard subscribers
    const wildcardSubs = this.subscriptions.get('*') || [];

    const allSubs = [...specificSubs, ...wildcardSubs];

    // Filter by source if specified
    const filteredSubs = allSubs.filter(
      (sub) => !sub.source || sub.source === event.source
    );

    console.log(`[EventBus] Dispatching ${event.type} to ${filteredSubs.length} handlers`);

    // Execute handlers
    await Promise.all(
      filteredSubs.map(async (sub) => {
        try {
          await sub.handler(event);
        } catch (error) {
          console.error(`[EventBus] Handler ${sub.id} failed:`, error);
          throw error;
        }
      })
    );
  }

  /**
   * Handle event processing errors
   */
  private async handleEventError(event: WorkflowEvent, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[EventBus] Event ${event.id} failed: ${errorMessage}`);

    if (this.config.deadLetterEnabled) {
      this.deadLetterQueue.push({ event, error: errorMessage });
      console.log(`[EventBus] Event moved to dead letter queue: ${event.id}`);
    }
  }

  /**
   * Get dead letter queue contents
   */
  getDeadLetterQueue(): Array<{ event: WorkflowEvent; error: string }> {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry dead letter queue events
   */
  async retryDeadLetterQueue(): Promise<number> {
    const events = this.deadLetterQueue.splice(0, this.deadLetterQueue.length);
    let retried = 0;

    for (const { event } of events) {
      try {
        await this.dispatchEvent(event);
        retried++;
      } catch {
        this.deadLetterQueue.push({
          event,
          error: 'Retry failed',
        });
      }
    }

    return retried;
  }

  /**
   * Get event bus stats
   */
  getStats(): {
    queueSize: number;
    deadLetterSize: number;
    subscriptionCount: number;
    processing: boolean;
  } {
    let subscriptionCount = 0;
    for (const subs of this.subscriptions.values()) {
      subscriptionCount += subs.length;
    }

    return {
      queueSize: this.eventQueue.length,
      deadLetterSize: this.deadLetterQueue.length,
      subscriptionCount,
      processing: this.processing,
    };
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
    this.eventQueue = [];
    console.log('[EventBus] Cleared all subscriptions and queue');
  }
}

// Singleton instance
let eventBusInstance: WorkflowEventBus | null = null;

export function getEventBus(config?: Partial<EventBusConfig>): WorkflowEventBus {
  if (!eventBusInstance) {
    eventBusInstance = new WorkflowEventBus(config);
  }
  return eventBusInstance;
}

export function resetEventBus(): void {
  eventBusInstance?.clear();
  eventBusInstance = null;
}
