/**
 * Agent Registry - Pluggable agent lookup by capability
 *
 * Agents register themselves with capabilities.
 * The orchestrator looks up agents by task type at runtime.
 */

import type { BaseAgent } from './base-agent';

export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();
  private capabilityIndex = new Map<string, BaseAgent[]>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);

    for (const cap of agent.capabilities) {
      const existing = this.capabilityIndex.get(cap) || [];
      existing.push(agent);
      this.capabilityIndex.set(cap, existing);
    }
  }

  getByName(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  findByCapability(capability: string): BaseAgent[] {
    return this.capabilityIndex.get(capability) || [];
  }

  findForTask(taskType: string): BaseAgent | undefined {
    // First try exact capability match
    const byCapability = this.capabilityIndex.get(taskType);
    if (byCapability && byCapability.length > 0) {
      return byCapability[0];
    }

    // Then try canHandle on all agents
    for (const agent of this.agents.values()) {
      if (agent.canHandle(taskType)) {
        return agent;
      }
    }

    return undefined;
  }

  listAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  listCapabilities(): string[] {
    return Array.from(this.capabilityIndex.keys());
  }

  getAgentDescriptions(): Array<{ name: string; description: string; capabilities: string[] }> {
    return this.listAll().map((a) => ({
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
    }));
  }
}
