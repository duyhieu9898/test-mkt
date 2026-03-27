/**
 * Agent System - Wire up all agents, registry, memory, orchestrator
 *
 * New agents registered here — no pipeline changes needed.
 */

import { AgentRegistry } from './agent-registry';
import { MemorySystem } from './memory';
import { Orchestrator } from './orchestrator';
import { FeedbackLoop } from './feedback-loop';

// Core agents
import { CrawlerAgent } from './crawler-agent';
import { ContentExtractionAgent } from './content-extraction-agent';
import { SeoAuditAgent } from './seo-audit-agent';
import { SocialDetectionAgent } from './social-detection-agent';
import { BusinessUnderstandingAgent } from './business-understanding-agent';
import { PlannerAgent } from './planner-agent';
import { LandingPageAgent } from './landing-page-agent';

// Multi-channel agents
import { SocialAgent } from './social-agent';
import { MarketingAgent } from './marketing-agent';
import { SalesAgent } from './sales-agent';

// --- Build the system ---

const registry = new AgentRegistry();

// Core pipeline agents
registry.register(new CrawlerAgent());
registry.register(new ContentExtractionAgent());
registry.register(new SeoAuditAgent());
registry.register(new SocialDetectionAgent());
registry.register(new BusinessUnderstandingAgent());
registry.register(new LandingPageAgent());

// Multi-channel agents
registry.register(new SocialAgent());
registry.register(new MarketingAgent());
registry.register(new SalesAgent());

// System components
const memorySystem = new MemorySystem();
const plannerAgent = new PlannerAgent();
const orchestrator = new Orchestrator(registry, memorySystem, plannerAgent);
const feedbackLoop = new FeedbackLoop(orchestrator, memorySystem);

export { registry, memorySystem, orchestrator, feedbackLoop, plannerAgent };
export { AgentRegistry } from './agent-registry';
export { MemorySystem } from './memory';
export { Orchestrator } from './orchestrator';
export { FeedbackLoop } from './feedback-loop';
export { BaseAgent } from './base-agent';
export type { AgentContext, AgentResult, TaskSuggestion, MemoryAccessor } from './base-agent';
export type { DynamicPlan, PlanTask } from './planner-agent';
