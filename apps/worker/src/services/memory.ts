import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, sql, gte, or, inArray } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { generateEmbedding, cosineSimilarity, createMemoryText } from '../lib/embeddings';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'memory' });

export interface MemoryInput {
  agentId: string;
  companyId: string;
  type: 'task_result' | 'strategy' | 'failure_lesson' | 'customer_insight' | 'skill_knowledge' | 'collaboration' | 'decision' | 'feedback';
  title: string;
  content: string;
  importance?: 'critical' | 'high' | 'medium' | 'low';
  sourceTaskId?: string;
  metadata?: {
    tags?: string[];
    relatedAgentIds?: string[];
    campaign?: string;
    outcome?: 'success' | 'failure' | 'partial';
    metrics?: Record<string, number>;
    context?: Record<string, unknown>;
  };
  expiresAt?: Date;
}

export interface MemorySearchResult {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  type: string;
  importance: string | null;
  similarity: number;
  createdAt: Date;
  metadata: MemoryInput['metadata'];
}

export interface AgentMemoryContext {
  recentMemories: MemorySearchResult[];
  relevantKnowledge: Array<{ title: string; content: string; category: string }>;
  pastStrategies: MemorySearchResult[];
  failureLessons: MemorySearchResult[];
}

// Store a new memory with embedding
export async function storeMemory(input: MemoryInput): Promise<string> {
  logger.info('Storing new memory', {
    agentId: input.agentId,
    type: input.type,
    title: input.title.slice(0, 50),
  });

  try {
    // Generate summary using LLM
    const summaryMessages: LLMMessage[] = [
      {
        role: 'system',
        content: 'Summarize the following content in 1-2 sentences for quick reference.',
      },
      {
        role: 'user',
        content: `Title: ${input.title}\n\nContent: ${input.content.slice(0, 2000)}`,
      },
    ];

    let summary = input.content.slice(0, 200);
    try {
      const summaryResponse = await callLLM(summaryMessages, { temperature: 0.3, skipRetry: true });
      summary = summaryResponse.content;
    } catch {
      // Use truncated content as summary if LLM fails
    }

    // Generate embedding
    const embeddingText = createMemoryText(input.title, input.content, input.metadata);
    const { embedding } = await generateEmbedding(embeddingText);

    // Store in database (using raw SQL for vector type)
    const result = await db.execute(sql`
      INSERT INTO agent_memories (
        id, company_id, agent_id, type, title, content, summary,
        embedding, importance, source_task_id, metadata, expires_at,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        ${input.companyId},
        ${input.agentId},
        ${input.type},
        ${input.title},
        ${input.content},
        ${summary},
        ${JSON.stringify(embedding)}::vector,
        ${input.importance || 'medium'},
        ${input.sourceTaskId || null},
        ${JSON.stringify(input.metadata || {})}::jsonb,
        ${input.expiresAt || null},
        NOW(),
        NOW()
      )
      RETURNING id
    `);

    const memoryId = (result as unknown as Array<{ id: string }>)[0]?.id;
    logger.info('Memory stored successfully', { memoryId });

    return memoryId;
  } catch (error) {
    logger.error('Failed to store memory', { error: String(error) });
    throw error;
  }
}

// Search memories by semantic similarity
export async function searchMemories(
  agentId: string,
  query: string,
  options: {
    types?: MemoryInput['type'][];
    limit?: number;
    minSimilarity?: number;
    includeCompanyKnowledge?: boolean;
  } = {}
): Promise<MemorySearchResult[]> {
  const { types, limit = 10, minSimilarity = 0.7, includeCompanyKnowledge = true } = options;

  logger.debug('Searching memories', { agentId, query: query.slice(0, 50), types });

  try {
    // Generate query embedding
    const { embedding: queryEmbedding } = await generateEmbedding(query);

    // Search using cosine similarity
    let typeFilter = '';
    if (types && types.length > 0) {
      typeFilter = `AND type IN (${types.map((t) => `'${t}'`).join(', ')})`;
    }

    const results = await db.execute(sql`
      SELECT
        id,
        title,
        content,
        summary,
        type,
        importance,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity,
        created_at,
        metadata
      FROM agent_memories
      WHERE agent_id = ${agentId}
        AND is_archived = 0
        AND (expires_at IS NULL OR expires_at > NOW())
        ${sql.raw(typeFilter)}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `);

    const memories = (results as unknown as MemorySearchResult[])
      .filter((m) => m.similarity >= minSimilarity)
      .map((m) => ({
        ...m,
        metadata: typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata,
      }));

    // Update access counts
    if (memories.length > 0) {
      const memoryIds = memories.map((m) => m.id);
      await db.execute(sql`
        UPDATE agent_memories
        SET access_count = access_count + 1,
            last_accessed_at = NOW()
        WHERE id = ANY(${memoryIds}::uuid[])
      `);
    }

    logger.debug('Memory search completed', { found: memories.length });

    return memories;
  } catch (error) {
    logger.error('Memory search failed', { error: String(error) });
    // Return empty if vector search fails (pgvector not installed)
    return [];
  }
}

// Get full memory context for an agent before task execution
export async function getAgentMemoryContext(
  agentId: string,
  taskContext: {
    title: string;
    description: string;
    type: string;
  }
): Promise<AgentMemoryContext> {
  logger.info('Building agent memory context', { agentId, task: taskContext.title });

  const searchQuery = `${taskContext.title} ${taskContext.description} ${taskContext.type}`;

  // Search for relevant memories in parallel
  const [recentMemories, strategies, lessons] = await Promise.all([
    // Recent relevant memories
    searchMemories(agentId, searchQuery, { limit: 5 }),

    // Past successful strategies
    searchMemories(agentId, searchQuery, {
      types: ['strategy'],
      limit: 3,
    }),

    // Failure lessons
    searchMemories(agentId, searchQuery, {
      types: ['failure_lesson'],
      limit: 3,
    }),
  ]);

  // Get company knowledge
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  let relevantKnowledge: AgentMemoryContext['relevantKnowledge'] = [];

  if (agent) {
    try {
      const { embedding: queryEmbedding } = await generateEmbedding(searchQuery);

      const knowledge = await db.execute(sql`
        SELECT title, content, category
        FROM knowledge_base
        WHERE company_id = ${agent.companyId}
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT 3
      `);

      relevantKnowledge = knowledge as unknown as AgentMemoryContext['relevantKnowledge'];
    } catch {
      // Knowledge base search failed, continue without it
    }
  }

  logger.info('Memory context built', {
    recentMemories: recentMemories.length,
    strategies: strategies.length,
    lessons: lessons.length,
    knowledge: relevantKnowledge.length,
  });

  return {
    recentMemories,
    relevantKnowledge,
    pastStrategies: strategies,
    failureLessons: lessons,
  };
}

// Create memory from completed task
export async function createMemoryFromTask(
  taskId: string,
  agentId: string,
  result: {
    success: boolean;
    output: string;
    insights?: string[];
  }
): Promise<void> {
  logger.info('Creating memory from task', { taskId, agentId, success: result.success });

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    with: { company: true },
  });

  if (!task) {
    logger.warn('Task not found for memory creation', { taskId });
    return;
  }

  // Store task result memory
  await storeMemory({
    agentId,
    companyId: task.companyId,
    type: result.success ? 'task_result' : 'failure_lesson',
    title: `${result.success ? 'Completed' : 'Failed'}: ${task.title}`,
    content: result.output.slice(0, 5000),
    importance: result.success ? 'medium' : 'high',
    sourceTaskId: taskId,
    metadata: {
      outcome: result.success ? 'success' : 'failure',
      tags: [task.type],
    },
  });

  // If successful and has insights, store as strategy
  if (result.success && result.insights && result.insights.length > 0) {
    await storeMemory({
      agentId,
      companyId: task.companyId,
      type: 'strategy',
      title: `Strategy: ${task.title}`,
      content: result.insights.join('\n'),
      importance: 'high',
      sourceTaskId: taskId,
      metadata: {
        outcome: 'success',
        tags: [task.type, 'learned_strategy'],
      },
    });
  }

  logger.info('Task memory created');
}

// Build memory-enhanced prompt for agent
export function buildMemoryEnhancedPrompt(
  basePrompt: string,
  memoryContext: AgentMemoryContext
): string {
  let enhancedPrompt = basePrompt;

  // Add relevant past experiences
  if (memoryContext.recentMemories.length > 0) {
    enhancedPrompt += '\n\n## Relevant Past Experiences:\n';
    for (const memory of memoryContext.recentMemories.slice(0, 3)) {
      enhancedPrompt += `- ${memory.title}: ${memory.summary || memory.content.slice(0, 150)}\n`;
    }
  }

  // Add successful strategies
  if (memoryContext.pastStrategies.length > 0) {
    enhancedPrompt += '\n\n## Strategies That Worked Before:\n';
    for (const strategy of memoryContext.pastStrategies) {
      enhancedPrompt += `- ${strategy.title}: ${strategy.summary || strategy.content.slice(0, 150)}\n`;
    }
  }

  // Add lessons from failures
  if (memoryContext.failureLessons.length > 0) {
    enhancedPrompt += '\n\n## Lessons from Past Failures (Avoid These):\n';
    for (const lesson of memoryContext.failureLessons) {
      enhancedPrompt += `- ${lesson.title}: ${lesson.summary || lesson.content.slice(0, 150)}\n`;
    }
  }

  // Add company knowledge
  if (memoryContext.relevantKnowledge.length > 0) {
    enhancedPrompt += '\n\n## Company Knowledge:\n';
    for (const knowledge of memoryContext.relevantKnowledge) {
      enhancedPrompt += `- [${knowledge.category}] ${knowledge.title}: ${knowledge.content.slice(0, 200)}\n`;
    }
  }

  return enhancedPrompt;
}

// Consolidate memories (merge similar, archive old)
export async function consolidateAgentMemories(agentId: string): Promise<void> {
  logger.info('Consolidating agent memories', { agentId });

  // Archive old low-importance memories (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await db.execute(sql`
    UPDATE agent_memories
    SET is_archived = 1
    WHERE agent_id = ${agentId}
      AND importance IN ('low', 'medium')
      AND created_at < ${thirtyDaysAgo}
      AND access_count < 3
  `);

  // Decrease relevance score for unused memories
  await db.execute(sql`
    UPDATE agent_memories
    SET relevance_score = relevance_score * 0.95
    WHERE agent_id = ${agentId}
      AND last_accessed_at < ${thirtyDaysAgo}
      AND relevance_score > 0.1
  `);

  logger.info('Memory consolidation completed');
}

// Extract learnings from agent's memories for evolution
export async function extractLearningsFromMemories(agentId: string): Promise<string[]> {
  logger.info('Extracting learnings from memories', { agentId });

  // Get high-value memories
  const memories = await db.execute(sql`
    SELECT type, title, summary, metadata
    FROM agent_memories
    WHERE agent_id = ${agentId}
      AND importance IN ('critical', 'high')
      AND is_archived = 0
    ORDER BY access_count DESC, created_at DESC
    LIMIT 20
  `);

  if ((memories as unknown[]).length === 0) {
    return ['Not enough memories to extract learnings'];
  }

  // Use LLM to extract key learnings
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'Analyze these agent memories and extract the top 5 most important learnings or patterns.',
    },
    {
      role: 'user',
      content: `Agent Memories:\n${JSON.stringify(memories, null, 2)}\n\nExtract key learnings as a JSON array: { "learnings": ["learning1", "learning2", ...] }`,
    },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.3 });
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.learnings || [];
    }
  } catch (error) {
    logger.error('Failed to extract learnings', { error: String(error) });
  }

  return [];
}
