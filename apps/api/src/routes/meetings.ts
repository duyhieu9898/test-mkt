/**
 * Meeting Intelligence API Routes
 *
 * Upload audio, add transcripts, AI-extract insights, approve to knowledge.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import { meetings, tasks } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';
import { resolveTranscriptionProvider } from '../lib/config-resolver';
import { assertCompanyAccess, authorizeCompanyAccess } from '../lib/company-access';
import { replaceApprovedKnowledge } from '../services/knowledge-lifecycle';
import {
  deleteObjectByStorageReference,
  isObjectStorageReference,
  objectStorageReference,
  readObjectFromStorageReference,
  saveObject,
} from '../services/object-storage';

const meetingsRouter = new Hono();
meetingsRouter.use('*', authMiddleware);
meetingsRouter.use('/company/:companyId', async (c, next) => {
  await assertCompanyAccess(c.req.param('companyId'), c.get('user').userId);
  await next();
});
meetingsRouter.use('/company/:companyId/*', async (c, next) => {
  await assertCompanyAccess(c.req.param('companyId'), c.get('user').userId);
  await next();
});

function sanitizeFileName(name?: string): string {
  return (name || 'audio.mp3').replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function inferAudioContentType(value?: string | null): string {
  const lower = (value || '').toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg';
}

async function resolveLegacyAudioPath(companyId: string, audioUrl: string): Promise<string | null> {
  const path = await import('node:path');
  const storageRoot = path.resolve(process.cwd(), '..', '..', 'deploy', 'meetings', companyId);
  const resolvedPath = path.resolve(audioUrl);
  const relativePath = path.relative(storageRoot, resolvedPath);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return resolvedPath;
}

async function readStoredAudio(companyId: string, audioUrl: string): Promise<Buffer | null> {
  const storedBuffer = await readObjectFromStorageReference(audioUrl).catch(() => null);
  if (storedBuffer) return storedBuffer;

  const audioPath = await resolveLegacyAudioPath(companyId, audioUrl);
  if (!audioPath) return null;
  const fs = await import('node:fs/promises');
  return fs.readFile(audioPath).catch(() => null);
}

async function deleteStoredAudio(companyId: string, audioUrl?: string | null): Promise<void> {
  if (!audioUrl) return;
  if (isObjectStorageReference(audioUrl)) {
    await deleteObjectByStorageReference(audioUrl).catch(() => undefined);
    return;
  }

  const audioPath = await resolveLegacyAudioPath(companyId, audioUrl);
  if (audioPath) {
    const fs = await import('node:fs/promises');
    await fs.unlink(audioPath).catch(() => undefined);
  }
}

// Upload audio file
meetingsRouter.post('/company/:companyId/upload', async (c) => {
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.upload');
  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;
  const title = (body['title'] as string) || 'Untitled Meeting';

  if (!file) {
    return c.json({ error: 'No audio file provided' }, 400);
  }

  const fileName = `${randomUUID()}-${sanitizeFileName(file.name || 'audio.mp3')}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveObject({
    key: `meetings/${companyId}/${fileName}`,
    body: buffer,
    contentType: file.type || inferAudioContentType(fileName),
    cacheControl: 'private, max-age=0, no-store',
  });

  // Create meeting record
  const [meeting] = await db
    .insert(meetings)
    .values({
      companyId,
      title,
      audioUrl: objectStorageReference(stored.key),
      status: 'uploading',
    })
    .returning();
  if (!meeting) return c.json({ error: 'Could not create meeting' }, 500);

  // Resolve active transcription provider via admin config (doc 10 §7).
  // Picks Local (free) if faster-whisper-server is enabled, else OpenAI
  // Whisper, else falls back to env. If nothing is configured, returns
  // with needsTranscript=true so the user can paste a transcript.
  const transcriptionProvider = await resolveTranscriptionProvider();
  if (transcriptionProvider) {
    try {
      await db
        .update(meetings)
        .set({ status: 'transcribing', updatedAt: new Date() })
        .where(eq(meetings.id, meeting.id));

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: transcriptionProvider.apiKey || 'local',
        baseURL: transcriptionProvider.baseUrl || undefined,
      });

      // Reuse the uploaded bytes for Whisper. The source file is already in S3,
      // so no large recording is written into the local repo/deploy folder.
      const audioFile = new File([buffer], fileName, { type: file.type || inferAudioContentType(fileName) });

      const transcription = await openai.audio.transcriptions.create({
        model: transcriptionProvider.model,
        file: audioFile,
      });

      const transcript = transcription.text;

      // Analyze transcript with LLM
      const insights = await analyzeMeetingTranscript(transcript, companyId);

      await db
        .update(meetings)
        .set({
          transcript,
          insights: insights as any,
          status: 'analyzed',
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, meeting.id));

      return c.json({ id: meeting.id, status: 'analyzed', title });
    } catch (err) {
      // Whisper failed — user can paste transcript manually
      await db
        .update(meetings)
        .set({ status: 'uploading', updatedAt: new Date() })
        .where(eq(meetings.id, meeting.id));
    }
  }

  return c.json({ id: meeting.id, status: 'uploading', title, needsTranscript: true });
});

// Add transcript manually
meetingsRouter.post(
  '/company/:companyId/add-transcript',
  zValidator(
    'json',
    z.object({
      meetingId: z.string().uuid().optional(),
      title: z.string().min(1).optional(),
      transcript: z.string().min(10),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.upload');
    const { meetingId, title, transcript } = c.req.valid('json');

    let id = meetingId;

    if (meetingId) {
      const existing = await db.query.meetings.findFirst({
        where: and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)),
        columns: { id: true },
      });
      if (!existing) return c.json({ error: 'Meeting not found' }, 404);

      // Update existing meeting
      await db
        .update(meetings)
        .set({
          transcript,
          ...(title ? { title } : {}),
          status: 'transcribing',
          updatedAt: new Date(),
        })
        .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)));
    } else {
      // Create new meeting with transcript
      const [meeting] = await db
        .insert(meetings)
        .values({
          companyId,
          title: title || 'Meeting Transcript',
          transcript,
          status: 'transcribing',
        })
        .returning();
      if (!meeting) return c.json({ error: 'Could not create meeting' }, 500);
      id = meeting.id;
    }

    // Analyze with LLM
    try {
      const insights = await analyzeMeetingTranscript(transcript, companyId);

      await db
        .update(meetings)
        .set({
          insights: insights as any,
          status: 'analyzed',
          updatedAt: new Date(),
        })
        .where(and(eq(meetings.id, id!), eq(meetings.companyId, companyId)));

      return c.json({ id, status: 'analyzed', insights });
    } catch (err) {
      return c.json(
        { id, status: 'transcribing', error: 'Analysis failed — try again' },
        500
      );
    }
  }
);

// Re-run the latest grounded extraction without requiring another audio upload.
meetingsRouter.post('/company/:companyId/:id/reanalyze', async (c) => {
  const companyId = c.req.param('companyId');
  const meetingId = c.req.param('id');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.upload');

  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)),
    columns: { id: true, transcript: true, status: true },
  });

  if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
  if (!meeting.transcript?.trim()) {
    return c.json({ error: 'This meeting does not have a transcript to analyze.' }, 400);
  }
  if (meeting.status === 'approved') {
    return c.json({
      error: 'Approved meeting insights cannot be replaced. Upload a new meeting to create a new reviewed version.',
    }, 409);
  }

  await db
    .update(meetings)
    .set({ status: 'transcribing', updatedAt: new Date() })
    .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)));

  try {
    const insights = await analyzeMeetingTranscript(meeting.transcript, companyId);
    await db
      .update(meetings)
      .set({ insights: insights as any, status: 'analyzed', updatedAt: new Date() })
      .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)));

    return c.json({ id: meetingId, status: 'analyzed', insights });
  } catch (error) {
    await db
      .update(meetings)
      .set({ status: 'analyzed', updatedAt: new Date() })
      .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)));
    throw error;
  }
});

// List meetings
meetingsRouter.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.view_internal');

  const data = await db
    .select()
    .from(meetings)
    .where(eq(meetings.companyId, companyId))
    .orderBy(desc(meetings.createdAt))
    .limit(50);

  return c.json({ data });
});

// Fetch a private recording for authenticated in-dashboard playback.
meetingsRouter.get('/company/:companyId/:id/audio', async (c) => {
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.view_internal');
  const meetingId = c.req.param('id');
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)),
    columns: { audioUrl: true },
  });

  if (!meeting?.audioUrl) return c.json({ error: 'Recording not found' }, 404);
  const audio = await readStoredAudio(companyId, meeting.audioUrl);
  if (!audio) return c.json({ error: 'Recording not found' }, 404);

  try {
    const contentType = inferAudioContentType(meeting.audioUrl);

    return new Response(Uint8Array.from(audio).buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(audio.length),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return c.json({ error: 'Recording file is unavailable' }, 404);
  }
});

// Get meeting detail
meetingsRouter.get('/company/:companyId/:id', async (c) => {
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.view_internal');
  const meetingId = c.req.param('id');

  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)),
  });

  if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
  return c.json(meeting);
});

// Discard a recording and its draft insights before they enter Knowledge/Brain.
meetingsRouter.delete('/company/:companyId/:id', async (c) => {
  const companyId = c.req.param('companyId');
  const meetingId = c.req.param('id');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.upload');
  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)),
  });

  if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
  if (meeting.status === 'approved') {
    return c.json({
      error: 'Approved meetings cannot be discarded because their insights are already in Knowledge Hub.',
    }, 409);
  }

  await db.delete(meetings).where(and(
    eq(meetings.id, meetingId),
    eq(meetings.companyId, companyId),
  ));

  await deleteStoredAudio(companyId, meeting.audioUrl);

  return c.json({ discarded: true });
});

// Approve insights → save to knowledge_base + create tasks
meetingsRouter.patch('/company/:companyId/:id/approve', async (c) => {
  const companyId = c.req.param('companyId');
  const meetingId = c.req.param('id');
  await authorizeCompanyAccess(c.get('user').userId, companyId, 'knowledge.approve');

  const meeting = await db.query.meetings.findFirst({
    where: and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)),
  });

  if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
  if (!meeting.insights) return c.json({ error: 'No insights to approve' }, 400);
  if (meeting.status === 'approved') {
    return c.json({ approved: true, alreadyApproved: true, knowledgeSaved: 0, tasksSaved: 0 });
  }

  const insights = meeting.insights as any;
  const knowledgeItems = [
    ...(meeting.transcript ? [{
      category: 'meeting_transcript',
      title: `Transcript: ${meeting.title}`,
      content: meeting.transcript,
    }] : []),
    ...(insights.summary ? [{
      category: 'meeting_insight',
      title: `Meeting summary: ${meeting.title}`,
      content: String(insights.summary),
    }] : []),
    ...(Array.isArray(insights.highlights) ? insights.highlights.map((highlight: string) => ({
      category: 'meeting_insight',
      title: `Key point from ${meeting.title}`,
      content: highlight,
    })) : []),
    ...(Array.isArray(insights.decisions) ? insights.decisions.map((decision: string) => ({
      category: 'decision',
      title: `Decision from ${meeting.title}`,
      content: decision,
    })) : []),
    ...(Array.isArray(insights.strategies) ? insights.strategies.map((strategy: string) => ({
      category: 'strategy',
      title: `Strategy from ${meeting.title}`,
      content: strategy,
    })) : []),
    ...(Array.isArray(insights.marketInsights) ? insights.marketInsights.map((insight: string) => ({
      category: 'market',
      title: `Market insight from ${meeting.title}`,
      content: insight,
    })) : []),
    ...(Array.isArray(insights.salesObjections) ? insights.salesObjections.map((objection: string) => ({
      category: 'sales_objection',
      title: `Sales objection from ${meeting.title}`,
      content: objection,
    })) : []),
  ].map((item) => ({ ...item, visibility: 'internal' as const, tags: ['meeting'] }));

  const sync = await replaceApprovedKnowledge({
    companyId,
    source: `meeting:${meetingId}`,
    verifiedByUserId: c.get('user').userId,
    items: knowledgeItems,
  });

  // Create tasks from action items
  const previousTasks = await db
    .select({ id: tasks.id, input: tasks.input })
    .from(tasks)
    .where(eq(tasks.companyId, companyId));
  const previousTaskIds = previousTasks
    .filter((task) => (task.input as any)?.meetingId === meetingId)
    .map((task) => task.id);
  if (previousTaskIds.length > 0) {
    await db.delete(tasks).where(and(
      eq(tasks.companyId, companyId),
      inArray(tasks.id, previousTaskIds),
    ));
  }

  let tasksSaved = 0;
  if (insights.tasks?.length) {
    for (const task of insights.tasks) {
      await db.insert(tasks).values({
        companyId,
        title: task.title,
        description: `Action item from meeting: ${meeting.title}${task.assignee ? `\nAssignee: ${task.assignee}` : ''}${task.dueDate ? `\nDue: ${task.dueDate}` : ''}`,
        type: 'action_item',
        priority: 'medium',
        status: 'pending',
        input: { source: 'meeting', meetingId } as any,
      });
      tasksSaved++;
    }
  }

  // Update meeting status
  await db
    .update(meetings)
    .set({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId)));

  // Only user-approved meeting insights may influence future recommendations.
  await extractMeetingBrainLearnings({
    companyId,
    meetingId,
    meetingTitle: meeting.title,
    insights,
  });

  return c.json({
    approved: true,
    knowledgeSaved: sync.saved,
    tasksSaved,
    searchEntriesIndexed: sync.indexed,
    indexingFailed: sync.indexingFailed,
  });
});

// ============================================
// HELPER: Analyze transcript with LLM
// ============================================

function transcriptForGroundedAnalysis(transcript: string): string {
  const cleaned = transcript.replace(/\u0000/g, '').trim();
  const chunks: string[] = [];
  const maxChars = 10000;
  const maxChunks = 6;
  let cursor = 0;

  while (cursor < cleaned.length) {
    const hardEnd = Math.min(cursor + maxChars, cleaned.length);
    const paragraphEnd = cleaned.lastIndexOf('\n\n', hardEnd);
    const sentenceEnd = cleaned.lastIndexOf('. ', hardEnd);
    const boundary = Math.max(paragraphEnd, sentenceEnd);
    const end = boundary > cursor + Math.floor(maxChars * 0.65) ? boundary + 1 : hardEnd;
    chunks.push(cleaned.slice(cursor, end).trim());
    cursor = end;
  }

  const nonEmptyChunks = chunks.filter(Boolean);
  const selected = nonEmptyChunks.length <= maxChunks
    ? nonEmptyChunks
    : Array.from({ length: maxChunks }, (_, index) =>
        nonEmptyChunks[Math.round((index * (nonEmptyChunks.length - 1)) / (maxChunks - 1))] ?? ''
      ).filter((chunk) => chunk.length > 0);

  return selected.map((chunk, index) => `[Transcript part ${index + 1}/${selected.length}]\n${chunk}`).join('\n\n');
}

function transcriptSummaryFallback(transcript: string): string {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'No readable transcript was found.';
  const sentences = cleaned.match(/[^.!?\n。！？]+[.!?。！？]?/g) || [cleaned];
  return sentences.slice(0, 3).join(' ').trim().slice(0, 700);
}

function normalizeStringArray(value: unknown, limit = 12): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === 'string' || typeof item === 'number') {
            return String(item).trim();
          }
          if (item && typeof item === 'object') {
            const candidate = item as Record<string, unknown>;
            return String(
              candidate.title
              || candidate.text
              || candidate.content
              || candidate.description
              || candidate.insight
              || candidate.value
              || ''
            ).trim();
          }
          return '';
        })
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function normalizeMeetingInsights(parsed: any, transcript: string) {
  const fallbackSummary = transcriptSummaryFallback(transcript);
  const taskSource = parsed?.tasks ?? parsed?.actionItems ?? parsed?.action_items;
  const tasks = Array.isArray(taskSource)
    ? taskSource
        .map((task: any) => ({
          title: String(
            typeof task === 'string'
              ? task
              : task?.title || task?.task || task?.description || ''
          ).trim(),
          assignee: task?.assignee ? String(task.assignee).trim() : null,
          dueDate: task?.dueDate || task?.due_date
            ? String(task.dueDate || task.due_date).trim()
            : null,
        }))
        .filter((task: { title: string }) => task.title.length > 0)
        .slice(0, 20)
    : [];

  const keyTopics = normalizeStringArray(
    parsed?.keyTopics ?? parsed?.key_topics ?? parsed?.topics,
    12,
  );
  const keywords = normalizeStringArray(
    parsed?.keywords ?? parsed?.keyWords ?? parsed?.key_words,
    12,
  );

  return {
    summary: String(parsed?.summary || '').trim() || fallbackSummary,
    highlights: normalizeStringArray(
      parsed?.highlights
      ?? parsed?.keyPoints
      ?? parsed?.key_points
      ?? parsed?.mainPoints
      ?? parsed?.main_points,
      15,
    ),
    decisions: normalizeStringArray(
      parsed?.decisions ?? parsed?.keyDecisions ?? parsed?.key_decisions,
      15,
    ),
    tasks,
    strategies: normalizeStringArray(
      parsed?.strategies ?? parsed?.strategyInsights ?? parsed?.strategy_insights,
      15,
    ),
    keyTopics: keyTopics.length > 0 ? keyTopics : keywords.slice(0, 8),
    marketInsights: normalizeStringArray(
      parsed?.marketInsights ?? parsed?.market_insights ?? parsed?.customerInsights ?? parsed?.customer_insights,
      12,
    ),
    salesObjections: normalizeStringArray(
      parsed?.salesObjections ?? parsed?.sales_objections ?? parsed?.objections,
      12,
    ),
    keywords: keywords.length > 0 ? keywords : keyTopics.slice(0, 8),
  };
}

async function analyzeMeetingTranscript(transcript: string, companyId?: string) {
  // Load business context so AI understands what the meeting is about
  let businessContext = '';
  if (companyId) {
    try {
      const ctx = await buildBusinessContext(companyId);
      businessContext = `\nBUSINESS CONTEXT (glossary only, not evidence):\n${ctx.fullContext}\n`;
    } catch {}
  }

  // Doc 10 §7: extraction now also surfaces market insights + sales
  // objections so they can feed the Business Brain (see extractMeetingBrainLearnings).
  const response = await llmGenerate(
    [
      {
        role: 'system',
        content: `You are a precise business transcript analyst. Extract useful structured information while staying grounded in the transcript. Business context is only a glossary for names; never use it as evidence. Return valid JSON only and write in the same language as the transcript.`,
      },
      {
        role: 'user',
        content: `Analyze this meeting transcript and extract grounded insights.
${businessContext}
Grounding rules:
- TRANSCRIPT is the only source of truth.
- Do not invent recommendations, decisions, strategies, market insights, sales objections, or tasks.
- Summary is required and must summarize only the transcript. Never leave summary empty when transcript has readable content.
- Highlights are the most important facts, claims, benefits, problems, or messages stated in the transcript. Return 4-8 highlights whenever the transcript is readable.
- Key topics are short labels for the subjects actually covered. Return 3-8 topics whenever the transcript is readable.
- Keywords are important named concepts, services, products, audiences, places, or themes stated in the transcript. Return 5-10 keywords whenever possible.
- Decisions must be commitments or choices clearly made in the transcript.
- Tasks must be explicit action items. Do not turn general statements into tasks.
- Strategies may include business approaches, positioning, teaching/sales/marketing methods, or value propositions explicitly described in the transcript. Do not generate new advice.
- Market insights may include explicit information about customers, audience needs, locations, demand, competitors, or market positioning.
- If a field is not present in the transcript, return [] for that field.

Return JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting",
  "highlights": ["important grounded point 1", "important grounded point 2"],
  "decisions": ["decision 1", "decision 2"],
  "tasks": [{"title": "task description", "assignee": "person name or null", "dueDate": "date or null"}],
  "strategies": ["strategy insight 1", "strategy insight 2"],
  "keyTopics": ["short topic 1", "short topic 2"],
  "marketInsights": ["things the team learned about the market, competitors, or customers"],
  "salesObjections": ["objections or hesitations heard from prospects during this meeting"],
  "keywords": ["important term stated in the transcript"]
}

TRANSCRIPT:
${transcriptForGroundedAnalysis(transcript)}`,
      },
    ],
    {
      maxTokens: 2000,
      json: true,
      featureKey: 'feedback_learning',
      traceName: 'meetings.analyzeMeetingTranscript',
      metadata: { companyId },
    }
  );

  const parsed = extractJSON(response.text);
  return normalizeMeetingInsights(parsed, transcript);
}

/**
 * Meeting → Brain extraction (doc 10 §7 / Task 11.6).
 *
 * After `analyzeMeetingTranscript` returns, this function writes the
 * extracted insights back to the Business Brain so the next campaign,
 * the next Deal Assistant call, and the next CEO Advisor refresh all
 * benefit from what the team just discussed. Non-fatal: if the brain
 * write fails, logs and continues — the meeting is still analyzed.
 *
 * Writes to `brain_campaign_learnings` (category = insight / win / fail):
 *  - marketInsights → category 'insight'
 *  - salesObjections → category 'fail' (objections = friction to fix)
 *  - strategies → category 'win' when prefixed with "worked"/"succeeded", else 'insight'
 */
async function extractMeetingBrainLearnings(params: {
  companyId: string;
  meetingId: string;
  meetingTitle: string;
  insights: any;
}): Promise<void> {
  const { companyId, meetingId, meetingTitle, insights } = params;
  if (!insights) return;

  try {
    const { ensureTenantForCompany, getTenantAI } = await import('../lib/tenant-ai');
    const { db: dbInstance } = await import('../lib/db');
    const { companies: companiesTable } = await import('@1person/core/db');
    const { eq: eqFn } = await import('drizzle-orm');

    const company = await dbInstance.query.companies.findFirst({
      where: eqFn(companiesTable.id, companyId),
      columns: { id: true, name: true },
    });
    if (!company) return;

    const tenantId = await ensureTenantForCompany(company.id, company.name);
    const ai = getTenantAI();

    const append = async (lesson: string, category: 'insight' | 'win' | 'fail') => {
      await ai.brain.appendLearning(
        tenantId,
        {
          lesson,
          category,
          metricSnapshot: {
            source: 'meeting',
            meetingId,
            meetingTitle,
            recordedAt: new Date().toISOString(),
          },
        },
        `system:meeting-extract`,
      );
    };

    const marketInsights: string[] = Array.isArray(insights.marketInsights)
      ? insights.marketInsights.slice(0, 10)
      : [];
    const salesObjections: string[] = Array.isArray(insights.salesObjections)
      ? insights.salesObjections.slice(0, 10)
      : [];
    const strategies: string[] = Array.isArray(insights.strategies)
      ? insights.strategies.slice(0, 10)
      : [];

    for (const m of marketInsights) {
      if (typeof m === 'string' && m.trim().length > 3) {
        await append(`[Market] ${m.trim()}`, 'insight');
      }
    }
    for (const o of salesObjections) {
      if (typeof o === 'string' && o.trim().length > 3) {
        await append(`[Objection] ${o.trim()}`, 'fail');
      }
    }
    for (const s of strategies) {
      if (typeof s === 'string' && s.trim().length > 3) {
        const lower = s.toLowerCase();
        const category: 'win' | 'insight' =
          lower.includes('worked') || lower.includes('succeeded') || lower.includes('winning')
            ? 'win'
            : 'insight';
        await append(`[Strategy] ${s.trim()}`, category);
      }
    }
  } catch (err) {
    console.warn('[meetings] extractMeetingBrainLearnings failed:', err);
  }
}

export default meetingsRouter;
