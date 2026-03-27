import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';

// Event types
export type EventType =
  | 'agent:status'
  | 'agent:action'
  | 'agent:message'
  | 'agent:error'
  | 'task:created'
  | 'task:updated'
  | 'task:completed'
  | 'task:failed'
  | 'conflict:detected'
  | 'conflict:resolved'
  | 'conflict:escalated'
  | 'inbox:new'
  | 'inbox:decision'
  | 'budget:alert'
  | 'budget:updated'
  | 'strategy:updated'
  | 'metrics:updated'
  | 'notification:new'
  | 'system:broadcast';

export interface Event {
  id: string;
  type: EventType;
  companyId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  source: string;
  agentId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

interface WebSocketClient {
  ws: WebSocket;
  id: string;
  companyId: string;
  userId?: string;
  subscriptions: Set<EventType | '*'>;
  lastPing: number;
  isAlive: boolean;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient> = new Map();
  private eventHistory: Map<string, Event[]> = new Map(); // companyId -> recent events
  private readonly maxHistoryPerCompany = 100;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    super();
    this.setMaxListeners(1000);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Initialize WebSocket server
  initialize(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      // Extract path
      const url = new URL(request.url || '', `http://${request.headers.host}`);

      if (url.pathname === '/ws' || url.pathname === '/api/v1/ws') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Handle connections
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    // Start ping interval to detect disconnected clients
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    console.log('📡 Event Bus initialized with WebSocket support');
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage) {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    const companyId = url.searchParams.get('companyId');

    // TODO: Validate token
    if (!companyId) {
      ws.close(4001, 'Missing companyId');
      return;
    }

    const clientId = uuidv4();
    const client: WebSocketClient = {
      ws,
      id: clientId,
      companyId,
      subscriptions: new Set(['*']), // Subscribe to all by default
      lastPing: Date.now(),
      isAlive: true,
    };

    this.clients.set(clientId, client);

    // Send connection acknowledgement
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      companyId,
      timestamp: new Date().toISOString(),
    }));

    // Send recent events on connect
    const recentEvents = this.eventHistory.get(companyId) || [];
    if (recentEvents.length > 0) {
      ws.send(JSON.stringify({
        type: 'history',
        events: recentEvents.slice(-20), // Last 20 events
      }));
    }

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(client, message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    });

    // Handle pong
    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPing = Date.now();
    });

    // Handle close
    ws.on('close', () => {
      this.clients.delete(clientId);
      console.log(`WebSocket client ${clientId} disconnected`);
    });

    // Handle error
    ws.on('error', (error) => {
      console.error(`WebSocket client ${clientId} error:`, error);
      this.clients.delete(clientId);
    });

    console.log(`WebSocket client ${clientId} connected for company ${companyId}`);
  }

  private handleClientMessage(client: WebSocketClient, message: Record<string, unknown>) {
    switch (message.type) {
      case 'subscribe':
        // Subscribe to specific event types
        if (Array.isArray(message.events)) {
          message.events.forEach((eventType: EventType) => {
            client.subscriptions.add(eventType);
          });
          client.ws.send(JSON.stringify({
            type: 'subscribed',
            events: Array.from(client.subscriptions),
          }));
        }
        break;

      case 'unsubscribe':
        // Unsubscribe from event types
        if (Array.isArray(message.events)) {
          message.events.forEach((eventType: EventType) => {
            client.subscriptions.delete(eventType);
          });
          client.ws.send(JSON.stringify({
            type: 'unsubscribed',
            events: message.events,
          }));
        }
        break;

      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private pingClients() {
    this.clients.forEach((client, id) => {
      if (!client.isAlive) {
        client.ws.terminate();
        this.clients.delete(id);
        return;
      }

      client.isAlive = false;
      client.ws.ping();
    });
  }

  // Publish an event
  publish(event: Omit<Event, 'id' | 'timestamp'>): Event {
    const fullEvent: Event = {
      ...event,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    // Store in history
    if (!this.eventHistory.has(event.companyId)) {
      this.eventHistory.set(event.companyId, []);
    }
    const history = this.eventHistory.get(event.companyId)!;
    history.push(fullEvent);
    if (history.length > this.maxHistoryPerCompany) {
      history.shift();
    }

    // Emit locally for internal subscribers
    this.emit(event.type, fullEvent);
    this.emit('*', fullEvent);

    // Broadcast to WebSocket clients
    this.broadcastToCompany(event.companyId, fullEvent);

    return fullEvent;
  }

  // Broadcast to all clients of a company
  private broadcastToCompany(companyId: string, event: Event) {
    const message = JSON.stringify({
      type: 'event',
      event,
    });

    this.clients.forEach((client) => {
      if (client.companyId === companyId && client.ws.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this event type
        if (client.subscriptions.has('*') || client.subscriptions.has(event.type)) {
          client.ws.send(message);
        }
      }
    });
  }

  // Broadcast to all clients (system-wide)
  broadcast(event: Omit<Event, 'id' | 'timestamp' | 'companyId'> & { companyId?: string }) {
    const message = JSON.stringify({
      type: 'broadcast',
      event: {
        ...event,
        id: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  // Get connected client count
  getClientCount(companyId?: string): number {
    if (companyId) {
      return Array.from(this.clients.values()).filter((c) => c.companyId === companyId).length;
    }
    return this.clients.size;
  }

  // Get recent events for a company
  getRecentEvents(companyId: string, limit = 50): Event[] {
    const history = this.eventHistory.get(companyId) || [];
    return history.slice(-limit);
  }

  // Subscribe to events (internal use)
  subscribe(eventType: EventType | '*', handler: (event: Event) => void): () => void {
    this.on(eventType, handler);
    return () => this.off(eventType, handler);
  }

  // Cleanup
  shutdown() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((client) => {
      client.ws.close(1001, 'Server shutting down');
    });

    this.wss?.close();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();

// Helper functions for common event types
export const publishAgentStatus = (companyId: string, agentId: string, status: string, details?: Record<string, unknown>) => {
  return eventBus.publish({
    type: 'agent:status',
    companyId,
    agentId,
    source: 'agent-runtime',
    payload: { status, ...details },
  });
};

export const publishAgentAction = (companyId: string, agentId: string, action: string, details?: Record<string, unknown>) => {
  return eventBus.publish({
    type: 'agent:action',
    companyId,
    agentId,
    source: 'agent-runtime',
    payload: { action, ...details },
  });
};

export const publishTaskUpdate = (companyId: string, taskId: string, status: string, details?: Record<string, unknown>) => {
  const eventType = status === 'completed' ? 'task:completed' :
                    status === 'failed' ? 'task:failed' :
                    status === 'created' ? 'task:created' : 'task:updated';
  return eventBus.publish({
    type: eventType,
    companyId,
    source: 'task-manager',
    payload: { taskId, status, ...details },
  });
};

export const publishConflictEvent = (companyId: string, conflictId: string, action: 'detected' | 'resolved' | 'escalated', details?: Record<string, unknown>) => {
  return eventBus.publish({
    type: `conflict:${action}` as EventType,
    companyId,
    source: 'conflict-resolver',
    payload: { conflictId, action, ...details },
  });
};

export const publishInboxEvent = (companyId: string, eventId: string, action: 'new' | 'decision', details?: Record<string, unknown>) => {
  return eventBus.publish({
    type: action === 'new' ? 'inbox:new' : 'inbox:decision',
    companyId,
    source: 'ceo-inbox',
    payload: { eventId, action, ...details },
  });
};

export const publishBudgetAlert = (companyId: string, alertType: string, details: Record<string, unknown>) => {
  return eventBus.publish({
    type: 'budget:alert',
    companyId,
    source: 'budget-monitor',
    payload: { alertType, ...details },
  });
};

export const publishNotification = (companyId: string, userId: string, notification: Record<string, unknown>) => {
  return eventBus.publish({
    type: 'notification:new',
    companyId,
    userId,
    source: 'notification-service',
    payload: notification,
  });
};
