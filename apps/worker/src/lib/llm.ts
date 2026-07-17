import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LLMError, RateLimitError } from './errors';
import { withRetry, llmCircuitBreaker, llmRateLimiter } from './retry';
import { env } from './env';

// LLM Configuration - using centralized env
const getLLMConfig = () => ({
  model: env.AGENT_AI_MODEL,
  temperature: 0.7,
  maxTokens: 4096,
});

// Lazy-initialized OpenAI client
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!env.OPENAI_API_KEY) {
      throw new LLMError(
        'OPENAI_API_KEY environment variable is not set',
        'API_KEY_MISSING',
        'openai',
        false
      );
    }
    _openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

// Wrap OpenAI errors into our custom error types
function handleOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    const isRateLimit = error.status === 429;
    const isRetryable = error.status ? error.status >= 500 || isRateLimit : false;

    if (isRateLimit) {
      const retryAfter = error.headers?.['retry-after'];
      const retryMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      throw new RateLimitError(error.message, retryMs, { provider: 'openai' });
    }

    throw new LLMError(
      error.message,
      `OPENAI_${error.status || 'UNKNOWN'}`,
      'openai',
      isRetryable,
      error.status
    );
  }
  throw error;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
  model: string;
}

export interface AgentContext {
  agentName: string;
  agentRole: string;
  companyName: string;
  companyDescription?: string;
  departmentName?: string;
  capabilities: string[];
  currentTask?: {
    title: string;
    description: string;
    type: string;
  };
  conversationHistory?: LLMMessage[];
}

// Cost per 1K tokens (GPT-4o-mini pricing)
const PRICING = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o-mini'];
  return (promptTokens / 1000) * pricing.input + (completionTokens / 1000) * pricing.output;
}

// Build system prompt for an agent
export function buildAgentSystemPrompt(context: AgentContext): string {
  return `You are ${context.agentName}, a ${context.agentRole} AI agent working for ${context.companyName}.

${context.companyDescription ? `Company Description: ${context.companyDescription}` : ''}

${context.departmentName ? `Department: ${context.departmentName}` : ''}
Your capabilities include: ${context.capabilities.join(', ')}

Your responsibilities:
- Execute tasks assigned to you efficiently and professionally
- Provide detailed, actionable outputs
- Report progress and results clearly
- Ask for clarification when needed
- Stay within your role and capabilities

Communication style:
- Be professional but friendly
- Be concise but thorough
- Use structured formats when appropriate (lists, steps, etc.)
- Always explain your reasoning

${context.currentTask ? `
Current Task:
- Title: ${context.currentTask.title}
- Description: ${context.currentTask.description}
- Type: ${context.currentTask.type}
` : ''}

Remember: You are an AI agent, not a human. Be helpful, accurate, and efficient.`;
}

// Main LLM call function with retry and circuit breaker
export async function callLLM(
  messages: LLMMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    skipRetry?: boolean;
  }
): Promise<LLMResponse> {
  const config = getLLMConfig();
  const model = options?.model || config.model;

  // Acquire rate limit token
  await llmRateLimiter.acquire();

  const makeRequest = async (): Promise<LLMResponse> => {
    try {
      const response = await llmCircuitBreaker.execute(async () => {
        return getOpenAI().chat.completions.create({
          model,
          messages: messages as ChatCompletionMessageParam[],
          temperature: options?.temperature ?? config.temperature,
          max_tokens: options?.maxTokens ?? config.maxTokens,
        });
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      return {
        content,
        tokensUsed: {
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
          total: usage.total_tokens,
        },
        cost: calculateCost(model, usage.prompt_tokens, usage.completion_tokens),
        model,
      };
    } catch (error) {
      handleOpenAIError(error);
    }
  };

  if (options?.skipRetry) {
    return makeRequest();
  }

  // Use retry logic
  const result = await withRetry(makeRequest, {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
  });

  if (!result.success || !result.data) {
    throw result.error || new LLMError('LLM call failed after retries', 'RETRY_EXHAUSTED', 'openai', false);
  }

  return result.data;
}

// Streaming LLM call
export async function* streamLLM(
  messages: LLMMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): AsyncGenerator<string, LLMResponse> {
  const config = getLLMConfig();
  const model = options?.model || config.model;

  const stream = await getOpenAI().chat.completions.create({
    model,
    messages: messages as ChatCompletionMessageParam[],
    temperature: options?.temperature ?? config.temperature,
    max_tokens: options?.maxTokens ?? config.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });

  let fullContent = '';
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      yield content;
    }
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  return {
    content: fullContent,
    tokensUsed: {
      prompt: usage.prompt_tokens,
      completion: usage.completion_tokens,
      total: usage.total_tokens,
    },
    cost: calculateCost(model, usage.prompt_tokens, usage.completion_tokens),
    model,
  };
}

// Agent-specific LLM call with context
export async function agentThink(
  context: AgentContext,
  userMessage: string,
  options?: {
    model?: string;
    temperature?: number;
  }
): Promise<LLMResponse> {
  const systemPrompt = buildAgentSystemPrompt(context);

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(context.conversationHistory || []),
    { role: 'user', content: userMessage },
  ];

  return callLLM(messages, options);
}

// Task execution prompt
export function buildTaskExecutionPrompt(task: {
  title: string;
  description: string;
  type: string;
  input?: unknown;
}): string {
  return `Please execute the following task:

Task: ${task.title}
Description: ${task.description}
Type: ${task.type}
${task.input ? `Input Data: ${JSON.stringify(task.input, null, 2)}` : ''}

Provide a detailed response including:
1. Your understanding of the task
2. The steps you'll take to complete it
3. The actual output/result
4. Any recommendations or next steps

Format your response clearly with sections.`;
}

// Analyze and plan task
export async function analyzeTask(
  context: AgentContext,
  task: { title: string; description: string; type: string }
): Promise<{
  analysis: string;
  steps: string[];
  estimatedTime: string;
  dependencies: string[];
}> {
  const prompt = `Analyze this task and create an execution plan:

Task: ${task.title}
Description: ${task.description}
Type: ${task.type}

Respond in JSON format:
{
  "analysis": "Brief analysis of the task",
  "steps": ["Step 1", "Step 2", ...],
  "estimatedTime": "Estimated completion time",
  "dependencies": ["Any dependencies or prerequisites"]
}`;

  const response = await agentThink(context, prompt, { temperature: 0.3 });

  try {
    // Extract JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fallback
  }

  return {
    analysis: response.content,
    steps: ['Execute task as described'],
    estimatedTime: 'Unknown',
    dependencies: [],
  };
}

export { getOpenAI };
