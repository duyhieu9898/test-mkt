import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eventBus } from '../services/event-bus';
import type { Event } from '../services/event-bus';
import { authMiddleware } from '../middleware/auth';

const eventsRouter = new Hono();

// Auth middleware
eventsRouter.use('*', authMiddleware);

// Get recent events for a company
eventsRouter.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const limit = parseInt(c.req.query('limit') || '50');

  const events = eventBus.getRecentEvents(companyId, limit);

  return c.json({
    data: events,
    meta: {
      connectedClients: eventBus.getClientCount(companyId),
    },
  });
});

// Get event bus stats
eventsRouter.get('/stats', async (c) => {
  return c.json({
    data: {
      totalClients: eventBus.getClientCount(),
    },
  });
});

// Publish an event (for testing or internal use)
eventsRouter.post(
  '/company/:companyId/publish',
  zValidator(
    'json',
    z.object({
      type: z.string(),
      payload: z.record(z.unknown()),
      source: z.string().optional(),
      agentId: z.string().uuid().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const data = c.req.valid('json');
    const userId = c.get('userId');

    const event = eventBus.publish({
      type: data.type as Event['type'],
      companyId,
      payload: data.payload,
      source: data.source || 'api',
      agentId: data.agentId,
      userId,
      metadata: data.metadata,
    });

    return c.json({ data: event }, 201);
  }
);

// SSE endpoint for browsers that don't support WebSocket
eventsRouter.get('/company/:companyId/stream', async (c) => {
  const companyId = c.req.param('companyId');
  const eventTypes = c.req.query('types')?.split(',') || ['*'];

  // Set headers for SSE
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  // Create a readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const connectEvent = `event: connected\ndata: ${JSON.stringify({ companyId, timestamp: new Date().toISOString() })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectEvent));

      // Subscribe to events
      const unsubscribes: (() => void)[] = [];

      eventTypes.forEach((eventType) => {
        const unsub = eventBus.subscribe(eventType as Event['type'] | '*', (event: Event) => {
          if (event.companyId === companyId) {
            const sseEvent = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
            try {
              controller.enqueue(new TextEncoder().encode(sseEvent));
            } catch (e) {
              // Stream closed
              unsubscribes.forEach((u) => u());
            }
          }
        });
        unsubscribes.push(unsub);
      });

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          const ping = `event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(ping));
        } catch (e) {
          clearInterval(pingInterval);
          unsubscribes.forEach((u) => u());
        }
      }, 30000);

      // Cleanup on close
      c.req.raw.signal?.addEventListener('abort', () => {
        clearInterval(pingInterval);
        unsubscribes.forEach((u) => u());
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Broadcast to all clients in a company
eventsRouter.post(
  '/company/:companyId/broadcast',
  zValidator(
    'json',
    z.object({
      message: z.string(),
      level: z.enum(['info', 'warning', 'error', 'success']).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { message, level, metadata } = c.req.valid('json');
    const userId = c.get('userId');

    const event = eventBus.publish({
      type: 'system:broadcast',
      companyId,
      source: 'api',
      userId,
      payload: { message, level: level || 'info', ...metadata },
    });

    return c.json({ data: event, recipients: eventBus.getClientCount(companyId) });
  }
);

export default eventsRouter;
