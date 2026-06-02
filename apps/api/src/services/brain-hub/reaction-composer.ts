/**
 * Reaction composer — when a watcher fires, this turns the trigger
 * events into concrete drafts the founder can approve.
 *
 * Three action types ship v1:
 *   - notify              just a one-liner summary, no LLM call
 *   - chatbot_faq_draft   ~1 LLM call → drafts an FAQ answer
 *   - blog_draft_launcher prepares params for Campaign Launcher; the
 *                         actual launch is kicked on approval so we
 *                         don't burn credits on suggestions the
 *                         founder dismisses
 */
import { llmGenerate } from '../../lib/llm';
import type {
  BrainWatcher,
  DataEvent,
  ReactionDraft,
  ReactionActionType,
} from '@1person/core/db';

export interface ComposeArgs {
  watcher: BrainWatcher;
  groupKey: string;
  events: DataEvent[];
}

export interface ComposeResult {
  headline: string;
  summary: string;
  drafts: ReactionDraft[];
}

export async function composeReaction(args: ComposeArgs): Promise<ComposeResult> {
  const { watcher, groupKey, events } = args;
  const eventCount = events.length;

  const headline = buildHeadline(watcher, groupKey, eventCount);
  const summary = buildSummary(events);

  const drafts: ReactionDraft[] = [];
  for (const action of watcher.actions) {
    const draft = await composeAction(action.type, {
      watcher,
      groupKey,
      events,
      params: action.params ?? {},
    });
    if (draft) drafts.push(draft);
  }

  return { headline, summary, drafts };
}

function buildHeadline(watcher: BrainWatcher, groupKey: string, n: number): string {
  switch (watcher.condition.kind) {
    case 'recurring_topic':
      return `"${groupKey}" mentioned in ${n} message${n === 1 ? '' : 's'}`;
    case 'event_spike':
      return `${n} ${groupKey} events in the last ${watcher.condition.windowHours}h`;
    case 'keyword_match':
      return `"${groupKey}" matched in ${n} event${n === 1 ? '' : 's'}`;
    default:
      return `${watcher.name} fired (${n} events)`;
  }
}

function buildSummary(events: DataEvent[]): string {
  const previews = events
    .slice(0, 5)
    .map((e) => `• ${e.subject} — ${truncate(e.content, 140)}`)
    .join('\n');
  const more = events.length > 5 ? `\n…and ${events.length - 5} more.` : '';
  return previews + more;
}

interface ComposeActionArgs {
  watcher: BrainWatcher;
  groupKey: string;
  events: DataEvent[];
  params: Record<string, unknown>;
}

async function composeAction(
  type: ReactionActionType,
  args: ComposeActionArgs,
): Promise<ReactionDraft | null> {
  switch (type) {
    case 'notify':
      return composeNotify(args);
    case 'chatbot_faq_draft':
      return composeChatbotFaq(args);
    case 'blog_draft_launcher':
      return composeBlogLauncher(args);
    default:
      return null;
  }
}

function composeNotify(args: ComposeActionArgs): ReactionDraft {
  return {
    actionType: 'notify',
    title: `Heads up — pattern detected`,
    body: `${args.events.length} matching event${args.events.length === 1 ? '' : 's'} for "${args.groupKey}". Review the trigger events to decide if action is needed.`,
    confidence: 1.0,
  };
}

async function composeChatbotFaq(args: ComposeActionArgs): Promise<ReactionDraft> {
  const sample = args.events
    .slice(0, 6)
    .map((e, i) => `${i + 1}. ${truncate(e.content, 240)}`)
    .join('\n');

  const prompt = `You are drafting a customer-facing FAQ answer for a B2B SaaS.
Topic: "${args.groupKey}"
Below are real recent messages from prospects/customers asking about this. Draft ONE clear, friendly answer (under 120 words) that a chatbot can use.

Messages:
${sample}

Return JUST the answer text, no preamble.`;

  try {
    const res = await llmGenerate(
      [
        { role: 'system', content: 'You write concise, accurate B2B SaaS support answers.' },
        { role: 'user', content: prompt },
      ],
      {
        featureKey: 'brain_hub_faq_draft',
        tier: 'balanced',
        maxTokens: 400,
        traceName: 'brain_hub.compose.faq',
      },
    );
    const body = (res.text ?? '').trim();
    const confidence = body.length > 60 ? 0.85 : 0.55;
    return {
      actionType: 'chatbot_faq_draft',
      title: `Chatbot FAQ — "${args.groupKey}"`,
      body,
      confidence,
      followUp: { label: 'Copy to chatbot knowledge base' },
    };
  } catch (err) {
    console.warn('[brain-hub] FAQ compose failed:', err);
    return {
      actionType: 'chatbot_faq_draft',
      title: `Chatbot FAQ — "${args.groupKey}" (draft failed)`,
      body: `Draft could not be generated. Trigger events:\n${args.events.slice(0, 3).map((e) => `- ${e.content.slice(0, 120)}`).join('\n')}`,
      confidence: 0,
    };
  }
}

function composeBlogLauncher(args: ComposeActionArgs): ReactionDraft {
  // We don't actually call Campaign Launcher yet — that happens on
  // approval so we don't burn credits on dismissed suggestions.
  const tone = (args.params.tone as string | undefined) ?? 'explainer';
  const launcherBrief = `Brain Hub watcher "${args.watcher.name}" detected ${args.events.length} events around the topic "${args.groupKey}". Sample messages:\n\n${args.events.slice(0, 4).map((e, i) => `${i + 1}. ${truncate(e.content, 200)}`).join('\n')}\n\nTone: ${tone}.`;

  const payload = {
    keyword: args.groupKey,
    brief: launcherBrief,
    targets: { wordpress: true, linkedin: true, facebook: false, instagram: false },
  };

  return {
    actionType: 'blog_draft_launcher',
    title: `Blog draft — "${args.groupKey}" (${tone})`,
    body: JSON.stringify(payload, null, 2),
    confidence: 0.75,
    followUp: { label: 'Approve & run Campaign Launcher' },
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
