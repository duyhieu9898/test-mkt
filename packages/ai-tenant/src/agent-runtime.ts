// =============================================================================
// @1person/ai-tenant — Agent Runtime
// =============================================================================
// Per-tenant agent management. Each tenant can configure multiple AI agents
// with different system prompts, tones, temperatures, and tool sets.
//
// RULES:
// - EVERY database query MUST filter by tenantId
// - EVERY mutation creates an audit log entry
// =============================================================================

import { eq, and } from 'drizzle-orm';
import { tenantAgents, tenants } from './schema.js';
import { logAction } from './audit-trail.js';
import type { Database } from './db.js';
import type { AgentConfig } from './types.js';

// ---------------------------------------------------------------------------
// Agent CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new agent for a tenant.
 * Generates a system prompt from the template if not explicitly provided.
 */
export async function createAgent(
  db: Database,
  tenantId: string,
  config: Partial<AgentConfig>,
  actor: string = 'system',
): Promise<AgentConfig> {
  // Validate tenant exists
  const tenantRows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tenant = tenantRows[0];
  if (!tenant) {
    throw new Error('Company not found. Please check the company ID.');
  }

  const agentName = config.name ?? 'AI Assistant';
  const tone = config.tone ?? 'professional';

  const systemPrompt =
    config.systemPrompt ??
    buildSystemPrompt(agentName, tenant.name, tone);

  const [agent] = await db
    .insert(tenantAgents)
    .values({
      tenantId,
      name: agentName,
      systemPrompt,
      tone,
      temperature: config.temperature ?? 0.7,
      maxContextChunks: config.maxContextChunks ?? 5,
      tools: config.tools ?? [],
      isDefault: false,
    })
    .returning();

  if (!agent) {
    throw new Error('Unable to create agent. Please try again.');
  }

  // Log to audit trail
  await logAction(db, tenantId, 'agent_create', actor, {
    agentId: agent.id,
    agentName: agent.name,
    tone: agent.tone,
  });

  return mapToAgentConfig(agent, tenantId);
}

/**
 * Update an existing agent's configuration.
 * ALWAYS filters by tenantId to enforce data isolation.
 */
export async function updateAgent(
  db: Database,
  tenantId: string,
  agentId: string,
  updates: Partial<AgentConfig>,
  actor: string = 'system',
): Promise<AgentConfig> {
  // Verify agent belongs to this tenant
  const existing = await db
    .select()
    .from(tenantAgents)
    .where(
      and(
        eq(tenantAgents.id, agentId),
        eq(tenantAgents.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    throw new Error('Agent not found. It may have been deleted or belongs to another company.');
  }

  // Build the update payload — only include provided fields
  const updatePayload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.systemPrompt !== undefined) updatePayload.systemPrompt = updates.systemPrompt;
  if (updates.tone !== undefined) updatePayload.tone = updates.tone;
  if (updates.temperature !== undefined) updatePayload.temperature = updates.temperature;
  if (updates.maxContextChunks !== undefined) updatePayload.maxContextChunks = updates.maxContextChunks;
  if (updates.tools !== undefined) updatePayload.tools = updates.tools;

  const [updated] = await db
    .update(tenantAgents)
    .set(updatePayload)
    .where(
      and(
        eq(tenantAgents.id, agentId),
        eq(tenantAgents.tenantId, tenantId),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error('Unable to update agent. Please try again.');
  }

  // Log to audit trail
  await logAction(db, tenantId, 'agent_update', actor, {
    agentId,
    updatedFields: Object.keys(updatePayload).filter((k) => k !== 'updatedAt'),
  });

  return mapToAgentConfig(updated, tenantId);
}

/**
 * Get a single agent by ID. ALWAYS filters by tenantId.
 */
export async function getAgent(
  db: Database,
  tenantId: string,
  agentId: string,
): Promise<AgentConfig | null> {
  const agents = await db
    .select()
    .from(tenantAgents)
    .where(
      and(
        eq(tenantAgents.id, agentId),
        eq(tenantAgents.tenantId, tenantId),
      ),
    )
    .limit(1);

  return agents[0] ? mapToAgentConfig(agents[0], tenantId) : null;
}

/**
 * List all agents for a tenant. ALWAYS filters by tenantId.
 */
export async function listAgents(
  db: Database,
  tenantId: string,
): Promise<AgentConfig[]> {
  const agents = await db
    .select()
    .from(tenantAgents)
    .where(eq(tenantAgents.tenantId, tenantId))
    .orderBy(tenantAgents.createdAt);

  return agents.map((a) => mapToAgentConfig(a, tenantId));
}

/**
 * Get the default agent for a tenant.
 * Returns null if no default agent is configured.
 */
export async function getDefaultAgent(
  db: Database,
  tenantId: string,
): Promise<AgentConfig | null> {
  const agents = await db
    .select()
    .from(tenantAgents)
    .where(
      and(
        eq(tenantAgents.tenantId, tenantId),
        eq(tenantAgents.isDefault, true),
      ),
    )
    .limit(1);

  return agents[0] ? mapToAgentConfig(agents[0], tenantId) : null;
}

/**
 * Set an agent as the default for its tenant.
 * Unsets any previously default agent.
 */
export async function setDefaultAgent(
  db: Database,
  tenantId: string,
  agentId: string,
  actor: string = 'system',
): Promise<void> {
  // Unset current default
  await db
    .update(tenantAgents)
    .set({ isDefault: false })
    .where(
      and(
        eq(tenantAgents.tenantId, tenantId),
        eq(tenantAgents.isDefault, true),
      ),
    );

  // Set new default
  await db
    .update(tenantAgents)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(tenantAgents.id, agentId),
        eq(tenantAgents.tenantId, tenantId),
      ),
    );

  await logAction(db, tenantId, 'agent_update', actor, {
    agentId,
    action: 'set_as_default',
  });
}

// ---------------------------------------------------------------------------
// System prompt template
// ---------------------------------------------------------------------------

/**
 * Build a default system prompt for an agent based on its name, company, and tone.
 */
function buildSystemPrompt(
  agentName: string,
  tenantName: string,
  tone: string,
): string {
  return `You are ${agentName}, an AI assistant for ${tenantName}.
Your tone is ${tone}.
Answer questions using ONLY the provided context.
If the answer is not in the context, say so honestly.
Always cite which document your answer comes from by referencing [Source N].
Be concise, accurate, and helpful.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToAgentConfig(
  row: typeof tenantAgents.$inferSelect,
  tenantId: string,
): AgentConfig {
  return {
    id: row.id,
    tenantId,
    name: row.name,
    systemPrompt: row.systemPrompt,
    tone: row.tone as AgentConfig['tone'],
    temperature: row.temperature,
    maxContextChunks: row.maxContextChunks,
    tools: (row.tools as string[]) ?? [],
    createdAt: row.createdAt,
  };
}
