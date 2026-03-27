/**
 * Base Agent - Abstract foundation for all AI agents
 *
 * Every agent in the system extends this class.
 * Agents are self-describing, capability-based, and can suggest follow-up work.
 */

export interface AgentContext {
  companyId: string;
  executionId: string;
  memory: MemoryAccessor;
  parentTaskId?: string;
}

export interface MemoryAccessor {
  store(entry: { type: string; title: string; content: string; metadata?: Record<string, unknown> }): Promise<string>;
  recall(options: { type?: string; category?: string; limit?: number }): Promise<MemoryEntry[]>;
  storeKnowledge(category: string, title: string, content: string): Promise<string>;
  recallKnowledge(category: string): Promise<KnowledgeEntry[]>;
}

export interface MemoryEntry {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  createdAt: Date;
}

export interface TaskSuggestion {
  type: string;
  title: string;
  input: Record<string, unknown>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependsOn?: string[];
}

export interface AgentResult {
  success: boolean;
  data: Record<string, unknown>;
  suggestedNextTasks?: TaskSuggestion[];
  memoryEntries?: Array<{ type: string; title: string; content: string; metadata?: Record<string, unknown> }>;
  error?: string;
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: string[];

  abstract canHandle(taskType: string): boolean;
  abstract execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult>;
}
