/**
 * Reaction approver — runs the actual side effects when a founder
 * approves a reaction. v1 handles two action types:
 *
 *   - chatbot_faq_draft   inserts the drafted answer into the
 *                         knowledge_base as a 'public' entry so the
 *                         chatbot picks it up via vector RAG
 *   - blog_draft_launcher kicks Campaign Launcher with the pre-filled
 *                         keyword / brief / targets payload
 *
 * `notify` actions need no approval action — they're surfaced for
 * awareness only and "approve" just marks them as reviewed.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../lib/db';
import {
  brainReactions,
  knowledgeBase,
  type BrainReaction,
  type ReactionDraft,
} from '@1person/core/db';
import { startLaunch } from '../launch-orchestrator';
import { embedKnowledgeEntry } from '../embedding-service';

export interface ApproveResult {
  status: 'approved' | 'published';
  drafts: ReactionDraft[];
  followUps: Array<{ label: string; href?: string; launchId?: string }>;
}

export async function approveReaction(
  companyId: string,
  reactionId: string,
): Promise<ApproveResult> {
  const reaction = await db.query.brainReactions.findFirst({
    where: and(eq(brainReactions.id, reactionId), eq(brainReactions.companyId, companyId)),
  });
  if (!reaction) throw new Error('Reaction not found');
  if (reaction.status !== 'suggested') {
    return {
      status: reaction.status as 'approved' | 'published',
      drafts: reaction.drafts ?? [],
      followUps: [],
    };
  }

  const updatedDrafts: ReactionDraft[] = [];
  const followUps: ApproveResult['followUps'] = [];

  for (const draft of reaction.drafts ?? []) {
    const result = await executeDraft(companyId, reaction, draft);
    updatedDrafts.push(result.draft);
    if (result.followUp) followUps.push(result.followUp);
  }

  // Status: published if every draft actually shipped something
  // concrete; otherwise approved (founder still has follow-ups to do).
  const allShipped = updatedDrafts.every((d) =>
    d.actionType === 'notify' || !!d.followUp?.launchId || !!d.followUp?.href,
  );
  const newStatus = allShipped ? 'published' : 'approved';

  await db
    .update(brainReactions)
    .set({
      status: newStatus,
      drafts: updatedDrafts,
      reviewedAt: new Date(),
    })
    .where(eq(brainReactions.id, reactionId));

  return { status: newStatus, drafts: updatedDrafts, followUps };
}

interface ExecuteResult {
  draft: ReactionDraft;
  followUp?: ApproveResult['followUps'][number];
}

async function executeDraft(
  companyId: string,
  reaction: BrainReaction,
  draft: ReactionDraft,
): Promise<ExecuteResult> {
  switch (draft.actionType) {
    case 'notify':
      return { draft };

    case 'chatbot_faq_draft':
      return await executeFaqDraft(companyId, reaction, draft);

    case 'blog_draft_launcher':
      return await executeBlogLauncher(companyId, reaction, draft);

    default:
      return { draft };
  }
}

async function executeFaqDraft(
  companyId: string,
  reaction: BrainReaction,
  draft: ReactionDraft,
): Promise<ExecuteResult> {
  if (!draft.body || draft.body.trim().length < 20) {
    return { draft };
  }

  // Insert as a knowledge_base entry so the chatbot's vector RAG picks
  // it up. We tag it 'brain-hub-faq' so it's easy to find later.
  const [entry] = await db
    .insert(knowledgeBase)
    .values({
      companyId,
      title: draft.title.slice(0, 200),
      content: draft.body,
      category: 'support',
      visibility: 'public',
      tags: ['brain-hub-faq', `from-reaction:${reaction.id}`],
    })
    .returning({ id: knowledgeBase.id });

  if (entry?.id) {
    // Best-effort embedding so the chatbot can find it immediately.
    try {
      await embedKnowledgeEntry({
        companyId,
        entryId: entry.id,
        title: draft.title,
        text: draft.body,
        category: 'support',
      });
    } catch (err) {
      console.warn('[brain-hub] FAQ embedding failed:', err);
    }
  }

  return {
    draft: {
      ...draft,
      followUp: { label: 'Added to Knowledge Base', href: `/${companyId}/knowledge` },
    },
    followUp: { label: 'Added to Knowledge Base', href: `/${companyId}/knowledge` },
  };
}

async function executeBlogLauncher(
  companyId: string,
  _reaction: BrainReaction,
  draft: ReactionDraft,
): Promise<ExecuteResult> {
  // draft.body is the JSON payload we prepared in the composer.
  let payload: { keyword: string; brief?: string; targets: Record<string, boolean> };
  try {
    payload = JSON.parse(draft.body);
  } catch {
    return { draft };
  }

  const { launchId } = await startLaunch({
    companyId,
    keyword: payload.keyword,
    brief: payload.brief,
    targets: {
      wordpress: !!payload.targets?.wordpress,
      facebook: !!payload.targets?.facebook,
      linkedin: !!payload.targets?.linkedin,
      instagram: !!payload.targets?.instagram,
    },
  });

  return {
    draft: {
      ...draft,
      followUp: {
        label: 'Open launch in progress',
        href: `/${companyId}/launch?id=${launchId}`,
        launchId,
      },
    },
    followUp: {
      label: 'Open launch in progress',
      href: `/${companyId}/launch?id=${launchId}`,
      launchId,
    },
  };
}

export async function dismissReaction(
  companyId: string,
  reactionId: string,
): Promise<void> {
  await db
    .update(brainReactions)
    .set({ status: 'dismissed', reviewedAt: new Date() })
    .where(and(eq(brainReactions.id, reactionId), eq(brainReactions.companyId, companyId)));
}
