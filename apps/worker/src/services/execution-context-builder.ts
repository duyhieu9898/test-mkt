import {
  renderDepartmentPolicy,
  renderSkillKnowledgeBundle,
  resolveSkillsForTask,
  type DepartmentKey,
} from '@1person/core';

interface ExecutionAgent {
  name: string;
  role: string;
  title?: string | null;
  description?: string | null;
  departmentName?: string | null;
  capabilities?: unknown;
  systemPrompt?: string | null;
}

interface ExecutionCompany {
  name: string;
  description?: string | null;
  industry?: string | null;
  businessType?: string | null;
  settings?: unknown;
  goals?: unknown;
  businessPlan?: unknown;
}

interface ExecutionTask {
  title: string;
  description?: string | null;
  type: string;
  input?: {
    type: string;
    data: Record<string, unknown>;
    constraints?: Record<string, unknown>;
  } | null;
}

export interface BuiltExecutionContext {
  prompt: string;
  department: DepartmentKey;
  skillIds: string[];
  deliverableType: string;
  acceptanceCriteria: string[];
  successMetrics: string[];
  resolutionReason: string;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function capabilityNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((capability) => {
      if (typeof capability === 'string') return capability;
      if (
        capability &&
        typeof capability === 'object' &&
        'name' in capability &&
        typeof capability.name === 'string'
      ) {
        return capability.name;
      }
      return '';
    })
    .filter(Boolean);
}

function compactJson(value: unknown, maxChars: number): string {
  if (value === undefined || value === null) return '';
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > maxChars
      ? `${serialized.slice(0, maxChars)}\n[...context truncated]`
      : serialized;
  } catch {
    return '';
  }
}

export function buildExecutionContext(input: {
  agent: ExecutionAgent;
  company: ExecutionCompany;
  task: ExecutionTask;
}): BuiltExecutionContext {
  const planningData = input.task.input?.data || {};
  const explicitSkillIds = Array.isArray(planningData.skillIds)
    ? stringArray(planningData.skillIds)
    : undefined;
  const requestedDepartment =
    typeof planningData.department === 'string'
      ? planningData.department
      : input.agent.departmentName || input.agent.role;

  const resolution = resolveSkillsForTask({
    type: input.task.type,
    title: input.task.title,
    description: input.task.description || '',
    department: requestedDepartment,
    explicitSkillIds,
  });

  const deliverableType =
    typeof planningData.deliverableType === 'string'
      ? planningData.deliverableType
      : input.task.type;
  const acceptanceCriteria = stringArray(planningData.acceptanceCriteria);
  const successMetrics = stringArray(planningData.successMetrics);
  const capabilities = capabilityNames(input.agent.capabilities);

  const skillFramework = renderSkillKnowledgeBundle(resolution.skills, {
    maxCharsEach: resolution.skills.length > 1 ? 3500 : 6500,
  });

  const companyContext = [
    `Company: ${input.company.name}`,
    input.company.industry ? `Industry: ${input.company.industry}` : '',
    input.company.businessType ? `Business type: ${input.company.businessType}` : '',
    input.company.description ? `Description: ${input.company.description}` : '',
    `Settings: ${compactJson(input.company.settings, 900)}`,
    `Goals: ${compactJson(input.company.goals, 1200)}`,
    `Business plan: ${compactJson(input.company.businessPlan, 2400)}`,
  ].filter(Boolean).join('\n');

  const deliveryContract = [
    `Deliverable type: ${deliverableType}`,
    acceptanceCriteria.length
      ? `Acceptance criteria:\n${acceptanceCriteria.map((item) => `- ${item}`).join('\n')}`
      : 'Acceptance criteria: Produce a concrete, usable deliverable that directly completes the task.',
    successMetrics.length
      ? `Success metrics:\n${successMetrics.map((item) => `- ${item}`).join('\n')}`
      : '',
    'Working rules:',
    '- Work from the supplied company facts. Label assumptions instead of inventing facts.',
    '- Return the actual deliverable before optional recommendations.',
    '- Respect task dependencies and make handoff information clear for the next department.',
    '- Drafting and analysis may be autonomous; publishing, sending, spending, or destructive actions require approval.',
  ].filter(Boolean).join('\n');

  const prompt = [
    '=== DEPARTMENT OPERATING PLAN ===',
    renderDepartmentPolicy(resolution.department),
    `Assigned agent: ${input.agent.name} (${input.agent.title || input.agent.role})`,
    capabilities.length ? `Capabilities: ${capabilities.join(', ')}` : '',
    input.agent.description ? `Agent responsibility: ${input.agent.description}` : '',
    input.agent.systemPrompt ? `Agent-specific instructions: ${input.agent.systemPrompt}` : '',
    '',
    '=== COMPANY CONTEXT ===',
    companyContext,
    '',
    skillFramework ? '=== EXPERT KNOWLEDGE ===' : '',
    skillFramework,
    '',
    '=== DELIVERY CONTRACT ===',
    deliveryContract,
  ].filter((part) => part !== '').join('\n');

  return {
    prompt,
    department: resolution.department,
    skillIds: resolution.skills,
    deliverableType,
    acceptanceCriteria,
    successMetrics,
    resolutionReason: resolution.reason,
  };
}
