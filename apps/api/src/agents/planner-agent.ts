/**
 * Planner Agent - AI-driven dynamic workflow planning
 *
 * The planner does NOT follow a fixed sequence.
 * It uses AI to decide which tasks to run based on:
 * - The goal
 * - Available agent capabilities
 * - Current company context/memory
 * - Previous plan outcomes
 *
 * Plans are stored and can be re-evaluated (self-evolving).
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';

export interface PlanTask {
  id: string;
  type: string;
  title: string;
  input: Record<string, unknown>;
  dependsOn: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface DynamicPlan {
  id: string;
  goal: string;
  tasks: PlanTask[];
  reasoning: string;
  successCriteria: string[];
  status: 'created' | 'executing' | 'completed' | 'failed' | 'evolving';
}

export class PlannerAgent extends BaseAgent {
  readonly name = 'planner';
  readonly description = 'Uses AI to generate dynamic execution plans based on goals and available capabilities';
  readonly capabilities = ['generate_plan', 'evaluate_plan', 'replan'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const taskType = (input.taskType as string) || 'generate_plan';

    if (taskType === 'evaluate_plan') {
      return this.evaluatePlan(input, context);
    }

    if (taskType === 'replan') {
      return this.replan(input, context);
    }

    return this.generatePlan(input, context);
  }

  private async generatePlan(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const goal = input.goal as string;
    const availableCapabilities = input.availableCapabilities as string[] || [];
    const agentDescriptions = input.agentDescriptions as Array<{ name: string; description: string; capabilities: string[] }> || [];

    // Gather context from memory
    let memoryContext = '';
    try {
      const companyProfile = await context.memory.recallKnowledge('company_profile');
      const previousPlans = await context.memory.recall({ type: 'strategy', limit: 3 });
      const performanceData = await context.memory.recall({ type: 'customer_insight', limit: 5 });

      if (companyProfile.length > 0) {
        memoryContext += `\nCompany Profile:\n${companyProfile[0].content.substring(0, 1000)}`;
      }
      if (previousPlans.length > 0) {
        memoryContext += `\nPrevious Plans:\n${previousPlans.map((p) => p.title).join('\n')}`;
      }
      if (performanceData.length > 0) {
        memoryContext += `\nRecent Performance Data:\n${performanceData.slice(0, 3).map((p) => p.title).join('\n')}`;
      }
    } catch {
      // Memory read failed, continue without context
    }

    // Additional context from input
    const businessInfo = input.businessInfo ? `\nBusiness Info:\n${JSON.stringify(input.businessInfo)}` : '';
    const websiteUrl = input.websiteUrl ? `\nWebsite: ${input.websiteUrl}` : '';

    try {
      const { text } = await llmGenerate([{
          role: 'user',
          content: `You are a marketing strategist AI. Generate a dynamic execution plan.

GOAL: ${goal}
${websiteUrl}
${businessInfo}
${memoryContext}

AVAILABLE AGENTS AND CAPABILITIES:
${agentDescriptions.map((a) => `- ${a.name}: ${a.description} [${a.capabilities.join(', ')}]`).join('\n')}

ALL AVAILABLE TASK TYPES:
${availableCapabilities.join(', ')}

RULES:
- Only use task types from the available list above
- Order tasks by dependencies (a task can only depend on earlier tasks)
- Each task must have a unique id like "task_1", "task_2", etc.
- Be specific about inputs
- Include success criteria

Return ONLY valid JSON:
{
  "goal": "${goal}",
  "reasoning": "Why this plan in this order",
  "tasks": [
    {
      "id": "task_1",
      "type": "task_type_from_available_list",
      "title": "Human-readable description",
      "input": {"key": "value"},
      "dependsOn": [],
      "priority": "high"
    }
  ],
  "successCriteria": ["Criterion 1", "Criterion 2"]
}`,
        }], { maxTokens: 2000 });

      const planData = extractJSON(text);

      if (!planData) {
        return { success: false, data: {}, error: 'Planner returned no structured plan' };
      }
      const plan: DynamicPlan = {
        id: `plan_${Date.now()}`,
        goal: planData.goal || goal,
        tasks: (planData.tasks || []).map((t: any) => ({
          id: t.id,
          type: t.type,
          title: t.title,
          input: t.input || {},
          dependsOn: t.dependsOn || [],
          priority: t.priority || 'medium',
        })),
        reasoning: planData.reasoning || '',
        successCriteria: planData.successCriteria || [],
        status: 'created',
      };

      return {
        success: true,
        data: { plan },
        memoryEntries: [
          {
            type: 'strategy',
            title: `Plan: ${goal}`,
            content: JSON.stringify(plan),
            metadata: { tags: ['plan'], planId: plan.id, taskCount: plan.tasks.length },
          },
        ],
      };
    } catch (error) {
      console.error('Plan generation failed:', error);
      // Fallback: generate a sensible default plan
      return this.generateFallbackPlan(goal, availableCapabilities, input);
    }
  }

  private async evaluatePlan(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const plan = input.plan as DynamicPlan;
    const results = input.results as Record<string, AgentResult>;

    const successCount = Object.values(results).filter((r) => r.success).length;
    const totalTasks = plan.tasks.length;
    const successRate = totalTasks > 0 ? successCount / totalTasks : 0;

    const evaluation = {
      planId: plan.id,
      successRate,
      completedTasks: successCount,
      totalTasks,
      needsReplan: successRate < 0.7,
      suggestions: successRate < 0.7
        ? ['Re-run failed tasks', 'Adjust strategy based on failures']
        : ['Plan executed successfully', 'Schedule optimization cycle'],
    };

    return {
      success: true,
      data: { evaluation },
      memoryEntries: [
        {
          type: 'feedback',
          title: `Plan evaluation: ${successRate * 100}% success`,
          content: JSON.stringify(evaluation),
          metadata: { tags: ['evaluation'], planId: plan.id },
        },
      ],
      suggestedNextTasks: evaluation.needsReplan
        ? [{ type: 'replan', title: 'Re-plan after failures', input: { plan, results, evaluation }, priority: 'high' }]
        : [],
    };
  }

  private async replan(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const evaluation = input.evaluation as Record<string, unknown>;
    const originalGoal = (input.plan as DynamicPlan)?.goal || 'optimize and improve';

    // Re-generate with failure context
    return this.generatePlan(
      {
        ...input,
        goal: `${originalGoal} (re-plan after ${JSON.stringify(evaluation)})`,
        availableCapabilities: input.availableCapabilities,
        agentDescriptions: input.agentDescriptions,
      },
      context
    );
  }

  private generateFallbackPlan(goal: string, capabilities: string[], input: Record<string, unknown>): AgentResult {
    const hasWebsite = !!input.websiteUrl;
    const tasks: PlanTask[] = [];
    let taskNum = 1;

    if (hasWebsite && capabilities.includes('crawl_website')) {
      tasks.push({ id: `task_${taskNum++}`, type: 'crawl_website', title: 'Crawl website', input: { url: input.websiteUrl }, dependsOn: [], priority: 'high' });
      tasks.push({ id: `task_${taskNum++}`, type: 'seo_audit', title: 'Run SEO audit', input: {}, dependsOn: ['task_1'], priority: 'high' });
      tasks.push({ id: `task_${taskNum++}`, type: 'detect_social_profiles', title: 'Detect social profiles', input: {}, dependsOn: ['task_1'], priority: 'medium' });
      tasks.push({ id: `task_${taskNum++}`, type: 'analyze_business', title: 'Analyze business', input: {}, dependsOn: ['task_1'], priority: 'high' });
    }

    if (capabilities.includes('generate_plan')) {
      tasks.push({ id: `task_${taskNum++}`, type: 'generate_plan', title: 'Generate growth strategy', input: { goal: 'create marketing plan' }, dependsOn: tasks.map((t) => t.id), priority: 'high' });
    }

    return {
      success: true,
      data: {
        plan: {
          id: `plan_fallback_${Date.now()}`,
          goal,
          tasks,
          reasoning: 'Fallback plan generated due to AI planning failure',
          successCriteria: ['All tasks complete successfully'],
          status: 'created',
        } as DynamicPlan,
      },
    };
  }
}
