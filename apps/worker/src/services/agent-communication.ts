import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, or, inArray, isNull } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { queueNotification } from '../lib/queue';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'agent-communication' });

// Types from schema
type AgentMessage = typeof schema.agentMessages.$inferSelect;
type MessageType = typeof schema.agentMessages.$inferInsert['messageType'];
type MessagePriority = typeof schema.agentMessages.$inferInsert['priority'];

// Structured message input
export interface StructuredMessageInput {
  senderAgentId: string;
  receiverAgentId: string;
  messageType: MessageType;
  priority?: MessagePriority;

  // Core structured content
  goal: string;
  context?: {
    taskId?: string;
    taskTitle?: string;
    objectiveId?: string;
    objectiveTitle?: string;
    previousMessages?: string[];
    relevantData?: Record<string, unknown>;
    situation?: string;
  };
  constraints?: {
    deadline?: string;
    budget?: number;
    requiredCapabilities?: string[];
    qualityStandards?: string[];
    dependencies?: string[];
    restrictions?: string[];
  };
  expectedOutput?: {
    format: 'task_result' | 'decision' | 'information' | 'confirmation' | 'plan' | 'feedback';
    description: string;
    schema?: Record<string, unknown>;
    deadline?: string;
  };
  content: {
    summary: string;
    details?: string;
    attachments?: Array<{
      type: 'data' | 'document' | 'analysis' | 'report';
      title: string;
      content: string | Record<string, unknown>;
    }>;
    actions?: Array<{
      action: string;
      reason: string;
      status?: 'pending' | 'completed' | 'blocked';
    }>;
    questions?: string[];
    recommendations?: string[];
  };

  // Optional
  threadId?: string;
  parentMessageId?: string;
  requiresResponse?: boolean;
  responseDeadline?: Date;
}

// Send a structured message between agents
export async function sendAgentMessage(input: StructuredMessageInput): Promise<AgentMessage> {
  logger.info('Sending agent message', {
    from: input.senderAgentId,
    to: input.receiverAgentId,
    type: input.messageType,
  });

  // Get sender agent for company ID
  const sender = await db.query.agents.findFirst({
    where: eq(schema.agents.id, input.senderAgentId),
  });

  if (!sender) {
    throw new Error(`Sender agent not found: ${input.senderAgentId}`);
  }

  // Validate receiver exists
  const receiver = await db.query.agents.findFirst({
    where: eq(schema.agents.id, input.receiverAgentId),
  });

  if (!receiver) {
    throw new Error(`Receiver agent not found: ${input.receiverAgentId}`);
  }

  // Create thread ID if not provided
  const threadId = input.threadId || `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Insert message
  const [message] = await db
    .insert(schema.agentMessages)
    .values({
      companyId: sender.companyId,
      senderAgentId: input.senderAgentId,
      receiverAgentId: input.receiverAgentId,
      messageType: input.messageType,
      priority: input.priority || 'normal',
      goal: input.goal,
      context: input.context,
      constraints: input.constraints,
      expectedOutput: input.expectedOutput,
      content: input.content,
      threadId,
      parentMessageId: input.parentMessageId,
      requiresResponse: input.requiresResponse !== false ? 1 : 0,
      responseDeadline: input.responseDeadline,
      status: 'sent',
    })
    .returning();

  logger.info('Message sent', { messageId: message.id, threadId });

  return message;
}

// Get messages for an agent
export async function getAgentInbox(
  agentId: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    messageTypes?: MessageType[];
  } = {}
): Promise<AgentMessage[]> {
  const { unreadOnly = false, limit = 50, messageTypes } = options;

  let query = db.query.agentMessages.findMany({
    where: and(
      eq(schema.agentMessages.receiverAgentId, agentId),
      unreadOnly ? isNull(schema.agentMessages.readAt) : undefined,
      messageTypes ? inArray(schema.agentMessages.messageType, messageTypes) : undefined
    ),
    orderBy: [desc(schema.agentMessages.createdAt)],
    limit,
    with: {
      sender: true,
    },
  });

  return query;
}

// Mark message as read
export async function markMessageRead(messageId: string): Promise<void> {
  await db
    .update(schema.agentMessages)
    .set({
      status: 'read',
      readAt: new Date(),
    })
    .where(eq(schema.agentMessages.id, messageId));
}

// Respond to a message
export async function respondToMessage(
  originalMessageId: string,
  responderAgentId: string,
  response: Omit<StructuredMessageInput, 'senderAgentId' | 'receiverAgentId' | 'threadId' | 'parentMessageId'>
): Promise<AgentMessage> {
  const originalMessage = await db.query.agentMessages.findFirst({
    where: eq(schema.agentMessages.id, originalMessageId),
  });

  if (!originalMessage) {
    throw new Error(`Original message not found: ${originalMessageId}`);
  }

  // Create response message
  const responseMessage = await sendAgentMessage({
    ...response,
    senderAgentId: responderAgentId,
    receiverAgentId: originalMessage.senderAgentId!,
    threadId: originalMessage.threadId || undefined,
    parentMessageId: originalMessageId,
  });

  // Update original message with response
  await db
    .update(schema.agentMessages)
    .set({
      status: 'responded',
      responseMessageId: responseMessage.id,
    })
    .where(eq(schema.agentMessages.id, originalMessageId));

  return responseMessage;
}

// Delegate a task to another agent
export async function delegateTask(
  fromAgentId: string,
  toAgentId: string,
  task: {
    taskId: string;
    title: string;
    description: string;
    deadline?: Date;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    context?: string;
  }
): Promise<AgentMessage> {
  return sendAgentMessage({
    senderAgentId: fromAgentId,
    receiverAgentId: toAgentId,
    messageType: 'task_delegation',
    priority: task.priority || 'normal',
    goal: `Complete the delegated task: ${task.title}`,
    context: {
      taskId: task.taskId,
      taskTitle: task.title,
      situation: task.context,
    },
    constraints: {
      deadline: task.deadline?.toISOString(),
    },
    expectedOutput: {
      format: 'task_result',
      description: 'Completed task output and any relevant findings',
      deadline: task.deadline?.toISOString(),
    },
    content: {
      summary: `Task delegation: ${task.title}`,
      details: task.description,
      actions: [
        { action: 'Review task requirements', reason: 'Understand scope', status: 'pending' },
        { action: 'Execute task', reason: 'Complete assigned work', status: 'pending' },
        { action: 'Report results', reason: 'Communicate completion', status: 'pending' },
      ],
    },
    requiresResponse: true,
    responseDeadline: task.deadline,
  });
}

// Request help from another agent
export async function requestHelp(
  fromAgentId: string,
  toAgentId: string,
  request: {
    problem: string;
    context: string;
    urgency: 'critical' | 'high' | 'medium' | 'low';
    specificHelp?: string;
  }
): Promise<AgentMessage> {
  return sendAgentMessage({
    senderAgentId: fromAgentId,
    receiverAgentId: toAgentId,
    messageType: 'request_help',
    priority: request.urgency,
    goal: `Get help with: ${request.problem}`,
    context: {
      situation: request.context,
    },
    expectedOutput: {
      format: 'information',
      description: request.specificHelp || 'Guidance or assistance with the problem',
    },
    content: {
      summary: `Help needed: ${request.problem}`,
      details: request.context,
      questions: request.specificHelp ? [request.specificHelp] : [],
    },
    requiresResponse: true,
  });
}

// Request a decision from supervisor
export async function requestDecision(
  fromAgentId: string,
  supervisorAgentId: string,
  request: {
    decision: string;
    options: Array<{ option: string; pros: string[]; cons: string[] }>;
    context: string;
    deadline?: Date;
    recommendation?: string;
  }
): Promise<AgentMessage> {
  return sendAgentMessage({
    senderAgentId: fromAgentId,
    receiverAgentId: supervisorAgentId,
    messageType: 'decision_request',
    priority: request.deadline ? 'high' : 'normal',
    goal: `Get decision on: ${request.decision}`,
    context: {
      situation: request.context,
      relevantData: { options: request.options },
    },
    constraints: {
      deadline: request.deadline?.toISOString(),
    },
    expectedOutput: {
      format: 'decision',
      description: 'Clear decision on which option to proceed with',
      deadline: request.deadline?.toISOString(),
    },
    content: {
      summary: `Decision needed: ${request.decision}`,
      details: request.context,
      recommendations: request.recommendation ? [request.recommendation] : [],
      attachments: [
        {
          type: 'analysis',
          title: 'Options Analysis',
          content: request.options,
        },
      ],
    },
    requiresResponse: true,
    responseDeadline: request.deadline,
  });
}

// Escalate an issue
export async function escalateIssue(
  fromAgentId: string,
  toAgentId: string,
  issue: {
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium';
    attempts: string[];
    impact: string;
  }
): Promise<AgentMessage> {
  return sendAgentMessage({
    senderAgentId: fromAgentId,
    receiverAgentId: toAgentId,
    messageType: 'escalation',
    priority: issue.severity,
    goal: `Resolve escalated issue: ${issue.title}`,
    context: {
      situation: issue.description,
      relevantData: {
        previousAttempts: issue.attempts,
        businessImpact: issue.impact,
      },
    },
    expectedOutput: {
      format: 'plan',
      description: 'Resolution plan or guidance on how to proceed',
    },
    content: {
      summary: `ESCALATION: ${issue.title}`,
      details: issue.description,
      actions: issue.attempts.map(a => ({
        action: a,
        reason: 'Previous attempt',
        status: 'completed' as const,
      })),
    },
    requiresResponse: true,
  });
}

// Send status report
export async function sendStatusReport(
  fromAgentId: string,
  toAgentId: string,
  report: {
    period: string;
    accomplishments: string[];
    inProgress: string[];
    blockers: string[];
    metrics: Record<string, number>;
    nextPriorities: string[];
  }
): Promise<AgentMessage> {
  return sendAgentMessage({
    senderAgentId: fromAgentId,
    receiverAgentId: toAgentId,
    messageType: 'status_report',
    priority: 'normal',
    goal: `Provide status update for ${report.period}`,
    context: {
      relevantData: { metrics: report.metrics },
    },
    expectedOutput: {
      format: 'feedback',
      description: 'Acknowledgment and any guidance',
    },
    content: {
      summary: `Status Report: ${report.period}`,
      details: `Accomplishments:\n${report.accomplishments.map(a => `- ${a}`).join('\n')}\n\nIn Progress:\n${report.inProgress.map(i => `- ${i}`).join('\n')}`,
      actions: report.nextPriorities.map(p => ({
        action: p,
        reason: 'Next priority',
        status: 'pending' as const,
      })),
      attachments: report.blockers.length > 0 ? [
        {
          type: 'analysis',
          title: 'Blockers',
          content: report.blockers,
        },
      ] : undefined,
    },
    requiresResponse: false,
  });
}

// Process message and generate response using LLM
export async function processAndRespond(
  agentId: string,
  messageId: string
): Promise<AgentMessage | null> {
  logger.info('Processing message for response', { agentId, messageId });

  // Get the message
  const message = await db.query.agentMessages.findFirst({
    where: eq(schema.agentMessages.id, messageId),
    with: { sender: true },
  });

  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  // Get the responding agent
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Mark as read
  await markMessageRead(messageId);

  // If no response required, return null
  if (!message.requiresResponse) {
    return null;
  }

  // Build prompt for LLM to generate response
  const prompt = `You are ${agent.name}, a ${agent.role} AI agent.

You received this structured message from ${message.sender?.name || 'another agent'}:

## Message Type: ${message.messageType}
## Priority: ${message.priority}

## Goal
${message.goal}

## Context
${JSON.stringify(message.context, null, 2)}

## Constraints
${JSON.stringify(message.constraints, null, 2)}

## Expected Output
${JSON.stringify(message.expectedOutput, null, 2)}

## Content
${JSON.stringify(message.content, null, 2)}

Generate a structured response in JSON format:
{
  "goal": "Your goal in responding",
  "content": {
    "summary": "Brief response summary",
    "details": "Detailed response",
    "actions": [{"action": "action item", "reason": "why", "status": "pending|completed"}],
    "recommendations": ["recommendation 1"]
  }
}

Respond professionally and helpfully based on your role and capabilities.`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: agent.systemPrompt || `You are ${agent.name}, a helpful ${agent.role} AI agent.`,
    },
    { role: 'user', content: prompt },
  ];

  try {
    const llmResponse = await callLLM(messages, { temperature: 0.5 });

    const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      goal: string;
      content: StructuredMessageInput['content'];
    };

    // Send the response
    const response = await respondToMessage(messageId, agentId, {
      messageType: getResponseType(message.messageType),
      goal: parsed.goal,
      content: parsed.content,
    });

    logger.info('Response generated and sent', {
      originalMessageId: messageId,
      responseId: response.id,
    });

    return response;
  } catch (error) {
    logger.error('Failed to process message', { error: String(error) });
    throw error;
  }
}

// Get appropriate response message type
function getResponseType(requestType: MessageType): MessageType {
  const responseMap: Record<string, MessageType> = {
    task_delegation: 'task_completion',
    request_help: 'provide_help',
    decision_request: 'decision_response',
    collaboration_invite: 'collaboration_invite',
    escalation: 'decision_response',
  };

  return responseMap[requestType as string] || 'information_share';
}

// Get conversation thread
export async function getThread(threadId: string): Promise<AgentMessage[]> {
  return db.query.agentMessages.findMany({
    where: eq(schema.agentMessages.threadId, threadId),
    orderBy: [schema.agentMessages.createdAt],
    with: {
      sender: true,
      receiver: true,
    },
  });
}

// Start collaboration session
export async function startCollaboration(
  initiatorAgentId: string,
  participantAgentIds: string[],
  session: {
    title: string;
    purpose: string;
    objectiveId?: string;
    taskIds?: string[];
  }
): Promise<typeof schema.collaborationSessions.$inferSelect> {
  const initiator = await db.query.agents.findFirst({
    where: eq(schema.agents.id, initiatorAgentId),
  });

  if (!initiator) {
    throw new Error(`Initiator agent not found: ${initiatorAgentId}`);
  }

  const [collaboration] = await db
    .insert(schema.collaborationSessions)
    .values({
      companyId: initiator.companyId,
      title: session.title,
      purpose: session.purpose,
      initiatorAgentId,
      participantAgentIds,
      objectiveId: session.objectiveId,
      taskIds: session.taskIds,
      status: 'active',
      outcomes: {
        decisions: [],
        actionItems: [],
        insights: [],
        documentsCreated: [],
      },
      messageIds: [],
    })
    .returning();

  // Invite all participants
  for (const participantId of participantAgentIds) {
    await sendAgentMessage({
      senderAgentId: initiatorAgentId,
      receiverAgentId: participantId,
      messageType: 'collaboration_invite',
      priority: 'normal',
      goal: `Join collaboration: ${session.title}`,
      context: {
        objectiveId: session.objectiveId,
        situation: session.purpose,
      },
      content: {
        summary: `Collaboration invite: ${session.title}`,
        details: session.purpose,
      },
      requiresResponse: true,
    });
  }

  logger.info('Collaboration session started', {
    sessionId: collaboration.id,
    participants: participantAgentIds.length,
  });

  return collaboration;
}

// Update agent relationship after interaction
export async function updateAgentRelationship(
  agentAId: string,
  agentBId: string,
  interaction: {
    successful: boolean;
    type: 'collaboration' | 'delegation' | 'help';
  }
): Promise<void> {
  const agents = await Promise.all([
    db.query.agents.findFirst({ where: eq(schema.agents.id, agentAId) }),
    db.query.agents.findFirst({ where: eq(schema.agents.id, agentBId) }),
  ]);

  if (!agents[0] || !agents[1]) return;

  // Check if relationship exists
  const existing = await db.query.agentRelationships.findFirst({
    where: and(
      or(
        and(
          eq(schema.agentRelationships.agentAId, agentAId),
          eq(schema.agentRelationships.agentBId, agentBId)
        ),
        and(
          eq(schema.agentRelationships.agentAId, agentBId),
          eq(schema.agentRelationships.agentBId, agentAId)
        )
      )
    ),
  });

  if (existing) {
    // Update existing relationship
    const updates: Partial<typeof schema.agentRelationships.$inferInsert> = {
      collaborationCount: existing.collaborationCount! + 1,
      communicationFrequency: existing.communicationFrequency! + 1,
    };

    if (interaction.successful) {
      updates.successfulCollaborations = existing.successfulCollaborations! + 1;
      updates.trustScore = Math.min(100, (existing.trustScore || 50) + 2);
    } else {
      updates.trustScore = Math.max(0, (existing.trustScore || 50) - 5);
    }

    await db
      .update(schema.agentRelationships)
      .set(updates)
      .where(eq(schema.agentRelationships.id, existing.id));
  } else {
    // Create new relationship
    await db.insert(schema.agentRelationships).values({
      companyId: agents[0].companyId,
      agentAId,
      agentBId,
      relationshipType: 'collaborator',
      collaborationCount: 1,
      successfulCollaborations: interaction.successful ? 1 : 0,
      communicationFrequency: 1,
      trustScore: interaction.successful ? 55 : 45,
      compatibilityScore: 50,
    });
  }
}
