/**
 * LLM Router — Central AI client
 *
 * Config via .env:
 *   LLM_PROVIDER=openai|anthropic
 *   LLM_MODEL=gpt-4o-mini|gpt-4o|claude-sonnet-4-20250514|...
 *
 * All agents import from here. Change .env = change AI for entire system.
 */

export interface LLMMessage {
  role: 'user' | 'system' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: string;
}

// Lazy-initialized clients (only created when needed)
let _openai: any = null;
let _anthropic: any = null;

function getProvider(): string {
  return process.env.LLM_PROVIDER || 'openai';
}

function getModel(): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return getProvider() === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini';
}

async function getOpenAI() {
  if (!_openai) {
    const OpenAI = (await import('openai')).default;
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

async function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/**
 * Generate text — provider-agnostic, configured via .env
 */
export async function llmGenerate(
  messages: LLMMessage[],
  options?: { maxTokens?: number; json?: boolean }
): Promise<LLMResponse> {
  const provider = getProvider();
  const model = getModel();
  const maxTokens = options?.maxTokens || 2000;

  if (provider === 'anthropic') {
    const anthropic = await getAnthropic();

    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsgs = messages.filter((m) => m.role !== 'system');

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      ...(systemMsg?.content ? { system: systemMsg.content } : {}),
      messages: userMsgs.map((m: LLMMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return { text, model, provider };
  }

  // OpenAI (default)
  const openai = await getOpenAI();

  const response = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: messages.map((m: LLMMessage) => ({ role: m.role, content: m.content })),
    ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
  });

  return {
    text: response.choices[0]?.message?.content || '',
    model,
    provider,
  };
}

/**
 * Extract JSON from LLM response text
 * IMPORTANT: Try object {} FIRST, then array [] — because objects may contain arrays
 */
export function extractJSON(text: string): any | null {
  // Try object first (most common — contains nested arrays)
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  // Then try array (for responses that are purely arrays)
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }
  return null;
}
