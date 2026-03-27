/**
 * Memory System - Persistent company intelligence
 *
 * Wraps existing agentMemories and knowledgeBase tables.
 * Provides scoped accessors for agents to read/write memory.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { agentMemories, knowledgeBase } from '@1person/core/db';
import type { MemoryAccessor, MemoryEntry, KnowledgeEntry } from './base-agent';

export class MemorySystem {
  /**
   * Store a memory entry for a specific agent
   */
  async store(entry: {
    companyId: string;
    agentId: string;
    type: string;
    title: string;
    content: string;
    importance?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const [result] = await db.insert(agentMemories).values({
      companyId: entry.companyId,
      agentId: entry.agentId,
      type: entry.type as any,
      title: entry.title,
      content: entry.content,
      importance: (entry.importance || 'medium') as any,
      metadata: entry.metadata as any,
    }).returning({ id: agentMemories.id });

    return result.id;
  }

  /**
   * Recall memories for a company
   */
  async recall(companyId: string, options: {
    type?: string;
    agentId?: string;
    limit?: number;
  } = {}): Promise<MemoryEntry[]> {
    const conditions = [eq(agentMemories.companyId, companyId)];

    if (options.type) {
      conditions.push(eq(agentMemories.type, options.type as any));
    }
    if (options.agentId) {
      conditions.push(eq(agentMemories.agentId, options.agentId));
    }

    const results = await db
      .select()
      .from(agentMemories)
      .where(and(...conditions))
      .orderBy(desc(agentMemories.createdAt))
      .limit(options.limit || 20);

    return results.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      metadata: r.metadata as Record<string, unknown> | undefined,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Store company-wide knowledge
   */
  async storeKnowledge(companyId: string, category: string, title: string, content: string, source?: string): Promise<string> {
    // Upsert - if same category+title exists, update it
    const existing = await db.query.knowledgeBase.findFirst({
      where: and(
        eq(knowledgeBase.companyId, companyId),
        eq(knowledgeBase.category, category),
        eq(knowledgeBase.title, title)
      ),
    });

    if (existing) {
      await db.update(knowledgeBase)
        .set({ content, updatedAt: new Date(), source })
        .where(eq(knowledgeBase.id, existing.id));
      return existing.id;
    }

    const [result] = await db.insert(knowledgeBase).values({
      companyId,
      category,
      title,
      content,
      source: source || 'agent',
    }).returning({ id: knowledgeBase.id });

    return result.id;
  }

  /**
   * Recall company knowledge by category
   */
  async recallKnowledge(companyId: string, category: string): Promise<KnowledgeEntry[]> {
    const results = await db
      .select()
      .from(knowledgeBase)
      .where(and(
        eq(knowledgeBase.companyId, companyId),
        eq(knowledgeBase.category, category)
      ))
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(20);

    return results.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      content: r.content,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Create a scoped accessor for a specific agent
   */
  createAccessor(companyId: string, agentId: string): MemoryAccessor {
    return {
      store: async (entry) => {
        return this.store({
          companyId,
          agentId,
          type: entry.type,
          title: entry.title,
          content: entry.content,
          metadata: entry.metadata,
        });
      },
      recall: async (options) => {
        return this.recall(companyId, {
          type: options.type,
          agentId: options.category ? undefined : agentId, // if category specified, search all agents
          limit: options.limit,
        });
      },
      storeKnowledge: async (category, title, content) => {
        return this.storeKnowledge(companyId, category, title, content, agentId);
      },
      recallKnowledge: async (category) => {
        return this.recallKnowledge(companyId, category);
      },
    };
  }
}

export const memorySystem = new MemorySystem();
