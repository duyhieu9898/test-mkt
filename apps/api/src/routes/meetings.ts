/**
 * Meeting Intelligence API Routes
 *
 * Upload audio, add transcripts, AI-extract insights, approve to knowledge.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { meetings, knowledgeBase, tasks } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';
import { resolveTranscriptionProvider } from '../lib/config-resolver';

const meetingsRouter = new Hono();
meetingsRouter.use('*', authMiddleware);

// Upload audio file
meetingsRouter.post('/company/:companyId/upload', async (c) => {
  const companyId = c.req.param('companyId');
  const body = await c.req.parseBody();
  const file = body['file'] as File | undefined;
  const title = (body['title'] as string) || 'Untitled Meeting';

  if (!file) {
    return c.json({ error: 'No audio file provided' }, 400);
  }

  // Save file to disk
  const fs = await import('fs');
  const path = await import('path');
  const uploadDir = path.join(process.cwd(), '..', '..', 'deploy', 'meetings', companyId);
  fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name || 'audio.mp3'}`;
  const filePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Create meeting record
  const [meeting] = await db
    .insert(meetings)
    .values({
      companyId,
      title,
      audioUrl: filePath,
      status: 'uploading',
    })
    .returning();

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

      // Read file for Whisper (shape works for both OpenAI and
      // faster-whisper-server since the latter is OpenAI-compatible)
      const fileData = fs.readFileSync(filePath);
      const audioFile = new File([fileData], fileName, { type: 'audio/mpeg' });

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

      // Doc 10 §7 / Task 11.6 — push the learnings into the Brain so the
      // next campaign + Deal Assistant + CEO Advisor benefit. Non-fatal.
      extractMeetingBrainLearnings({
        companyId,
        meetingId: meeting.id,
        meetingTitle: title,
        insights,
      }).catch(() => {});

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
    const { meetingId, title, transcript } = c.req.valid('json');

    let id = meetingId;

    if (meetingId) {
      // Update existing meeting
      await db
        .update(meetings)
        .set({ transcript, status: 'transcribing', updatedAt: new Date() })
        .where(eq(meetings.id, meetingId));
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
        .where(eq(meetings.id, id!));

      // Doc 10 §7 / Task 11.6 — push learnings into Brain. Non-fatal.
      if (id) {
        extractMeetingBrainLearnings({
          companyId,
          meetingId: id,
          meetingTitle: title || 'Meeting Transcript',
          insights,
        }).catch(() => {});
      }

      return c.json({ id, status: 'analyzed', insights });
    } catch (err) {
      return c.json(
        { id, status: 'transcribing', error: 'Analysis failed — try again' },
        500
      );
    }
  }
);

// List meetings
meetingsRouter.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');

  const data = await db
    .select()
    .from(meetings)
    .where(eq(meetings.companyId, companyId))
    .orderBy(desc(meetings.createdAt))
    .limit(50);

  return c.json({ data });
});

// Get meeting detail
meetingsRouter.get('/company/:companyId/:id', async (c) => {
  const meetingId = c.req.param('id');

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });

  if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
  return c.json(meeting);
});

// Approve insights → save to knowledge_base + create tasks
meetingsRouter.patch('/company/:companyId/:id/approve', async (c) => {
  const companyId = c.req.param('companyId');
  const meetingId = c.req.param('id');

  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });

  if (!meeting) return c.json({ error: 'Meeting not found' }, 404);
  if (!meeting.insights) return c.json({ error: 'No insights to approve' }, 400);

  const insights = meeting.insights as any;
  let knowledgeSaved = 0;
  let tasksSaved = 0;

  // Save summary as knowledge
  if (insights.summary) {
    await db.insert(knowledgeBase).values({
      companyId,
      category: 'meeting_insight',
      title: `Meeting: ${meeting.title}`,
      content: insights.summary,
      source: `meeting:${meetingId}`,
    });
    knowledgeSaved++;
  }

  // Save decisions as knowledge
  if (insights.decisions?.length) {
    for (const decision of insights.decisions) {
      await db.insert(knowledgeBase).values({
        companyId,
        category: 'decision',
        title: `Decision from ${meeting.title}`,
        content: decision,
        source: `meeting:${meetingId}`,
      });
      knowledgeSaved++;
    }
  }

  // Save strategies as knowledge
  if (insights.strategies?.length) {
    for (const strategy of insights.strategies) {
      await db.insert(knowledgeBase).values({
        companyId,
        category: 'strategy',
        title: `Strategy from ${meeting.title}`,
        content: strategy,
        source: `meeting:${meetingId}`,
      });
      knowledgeSaved++;
    }
  }

  // Create tasks from action items
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
    .where(eq(meetings.id, meetingId));

  return c.json({ approved: true, knowledgeSaved, tasksSaved });
});

// ============================================
// HELPER: Analyze transcript with LLM
// ============================================

async function analyzeMeetingTranscript(transcript: string, companyId?: string) {
  // Load business context so AI understands what the meeting is about
  let businessContext = '';
  if (companyId) {
    try {
      const ctx = await buildBusinessContext(companyId);
      businessContext = `\nBUSINESS CONTEXT (for better understanding):\n${ctx.fullContext}\n`;
    } catch {}
  }

  // Doc 10 §7: extraction now also surfaces market insights + sales
  // objections so they can feed the Business Brain (see extractMeetingBrainLearnings).
  const response = await llmGenerate(
    [
      {
        role: 'system',
        content: `You are a meeting analyst for a business. You understand the company's products, services, and strategy. Extract structured insights from meeting transcripts. Return valid JSON only.`,
      },
      {
        role: 'user',
        content: `Analyze this meeting transcript and extract insights.
${businessContext}
Return JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting",
  "decisions": ["decision 1", "decision 2"],
  "tasks": [{"title": "task description", "assignee": "person name or null", "dueDate": "date or null"}],
  "strategies": ["strategy insight 1", "strategy insight 2"],
  "keyTopics": ["topic 1", "topic 2"],
  "marketInsights": ["things the team learned about the market, competitors, or customers"],
  "salesObjections": ["objections or hesitations heard from prospects during this meeting"],
  "keywords": ["5-8 terms that should drive future SEO + content work"]
}

TRANSCRIPT:
${transcript.substring(0, 8000)}`,
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
  return (
    parsed || {
      summary: response.text.substring(0, 500),
      decisions: [],
      tasks: [],
      strategies: [],
      keyTopics: [],
      marketInsights: [],
      salesObjections: [],
      keywords: [],
    }
  );
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
