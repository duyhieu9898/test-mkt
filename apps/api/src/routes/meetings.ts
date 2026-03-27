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

  // Try Whisper transcription if OpenAI key available
  if (process.env.OPENAI_API_KEY) {
    try {
      await db
        .update(meetings)
        .set({ status: 'transcribing', updatedAt: new Date() })
        .where(eq(meetings.id, meeting.id));

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Read file for Whisper
      const fileData = fs.readFileSync(filePath);
      const audioFile = new File([fileData], fileName, { type: 'audio/mpeg' });

      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
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
  "keyTopics": ["topic 1", "topic 2"]
}

TRANSCRIPT:
${transcript.substring(0, 8000)}`,
      },
    ],
    { maxTokens: 1500, json: true }
  );

  const parsed = extractJSON(response.text);
  return (
    parsed || {
      summary: response.text.substring(0, 500),
      decisions: [],
      tasks: [],
      strategies: [],
      keyTopics: [],
    }
  );
}

export default meetingsRouter;
