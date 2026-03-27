import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import type { RealTimeEvent, EventType } from './api/hooks';

type EventHandler = (event: RealTimeEvent) => void;

interface WebSocketMessage {
  type: string;
  event?: RealTimeEvent;
  events?: RealTimeEvent[];
  clientId?: string;
  companyId?: string;
  timestamp?: string;
}

class EventBusClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private companyId: string = '';
  private token: string = '';
  private isConnecting = false;

  connect(companyId: string, token: string) {
    if (this.ws?.readyState === WebSocket.OPEN && this.companyId === companyId) {
      return; // Already connected to same company
    }

    this.companyId = companyId;
    this.token = token;
    this.isConnecting = true;

    // Close existing connection
    if (this.ws) {
      this.ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_WS_URL || window.location.host;
    const url = `${protocol}//${host}/ws?companyId=${companyId}&token=${token}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('EventBus connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPing();
        this.emit('connected', { type: 'connected', companyId } as any);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('EventBus disconnected:', event.code, event.reason);
        this.isConnecting = false;
        this.stopPing();
        this.emit('disconnected', { type: 'disconnected', code: event.code } as any);

        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++;
            this.connect(this.companyId, this.token);
          }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
        }
      };

      this.ws.onerror = (error) => {
        console.error('EventBus error:', error);
        this.isConnecting = false;
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      this.isConnecting = false;
    }
  }

  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.handlers.clear();
  }

  private handleMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'event':
        if (message.event) {
          this.emit(message.event.type, message.event);
          this.emit('*', message.event);
        }
        break;

      case 'history':
        if (message.events) {
          message.events.forEach((event) => {
            this.emit('history', event);
          });
        }
        break;

      case 'connected':
        console.log('EventBus connected with clientId:', message.clientId);
        break;

      case 'pong':
        // Ping acknowledged
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  subscribe(eventTypes: (EventType | '*')[], handler: EventHandler): () => void {
    eventTypes.forEach((eventType) => {
      if (!this.handlers.has(eventType)) {
        this.handlers.set(eventType, new Set());
      }
      this.handlers.get(eventType)!.add(handler);
    });

    // Send subscription message to server
    if (this.ws?.readyState === WebSocket.OPEN && !eventTypes.includes('*')) {
      this.ws.send(JSON.stringify({ type: 'subscribe', events: eventTypes }));
    }

    // Return unsubscribe function
    return () => {
      eventTypes.forEach((eventType) => {
        this.handlers.get(eventType)?.delete(handler);
      });
    };
  }

  private emit(eventType: string, event: RealTimeEvent) {
    this.handlers.get(eventType)?.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error('Event handler error:', e);
      }
    });
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get isReconnecting(): boolean {
    return this.isConnecting;
  }
}

// Singleton instance
const eventBusClient = new EventBusClient();

// React hooks
export function useEventBus(companyId: string) {
  const token = useAuthStore((state: { token: string | null }) => state.token);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!companyId || !token) return;

    eventBusClient.connect(companyId, token);

    const unsubscribe = eventBusClient.subscribe(['*'], (event) => {
      const eventType = event.type as string;
      if (eventType === 'connected') {
        setIsConnected(true);
      } else if (eventType === 'disconnected') {
        setIsConnected(false);
      }
    });

    setIsConnected(eventBusClient.isConnected);

    return () => {
      unsubscribe();
    };
  }, [companyId, token]);

  return { isConnected, client: eventBusClient };
}

export function useEventSubscription(
  eventTypes: (EventType | '*')[],
  handler: EventHandler,
  deps: unknown[] = []
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribe = eventBusClient.subscribe(eventTypes, (event) => {
      handlerRef.current(event);
    });

    return unsubscribe;
  }, [...deps, ...eventTypes]);
}

export function useAgentStatusEvents(companyId: string, agentId?: string) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEventSubscription(
    ['agent:status'],
    (event) => {
      if (event.companyId === companyId && (!agentId || event.agentId === agentId)) {
        setStatus(event.payload);
      }
    },
    [companyId, agentId]
  );

  return status;
}

export function useTaskEvents(companyId: string) {
  const [events, setEvents] = useState<RealTimeEvent[]>([]);

  useEventSubscription(
    ['task:created', 'task:updated', 'task:completed', 'task:failed'],
    (event) => {
      if (event.companyId === companyId) {
        setEvents((prev) => [...prev.slice(-49), event]);
      }
    },
    [companyId]
  );

  return events;
}

export function useConflictEvents(companyId: string) {
  const [events, setEvents] = useState<RealTimeEvent[]>([]);

  useEventSubscription(
    ['conflict:detected', 'conflict:resolved', 'conflict:escalated'],
    (event) => {
      if (event.companyId === companyId) {
        setEvents((prev) => [...prev.slice(-49), event]);
      }
    },
    [companyId]
  );

  return events;
}

export function useInboxEvents(companyId: string) {
  const [events, setEvents] = useState<RealTimeEvent[]>([]);

  useEventSubscription(
    ['inbox:new', 'inbox:decision'],
    (event) => {
      if (event.companyId === companyId) {
        setEvents((prev) => [...prev.slice(-49), event]);
      }
    },
    [companyId]
  );

  return events;
}

export function useBudgetAlerts(companyId: string) {
  const [alerts, setAlerts] = useState<RealTimeEvent[]>([]);

  useEventSubscription(
    ['budget:alert', 'budget:updated'],
    (event) => {
      if (event.companyId === companyId) {
        setAlerts((prev) => [...prev.slice(-19), event]);
      }
    },
    [companyId]
  );

  return alerts;
}

export function useNotifications(companyId: string, userId?: string) {
  const [notifications, setNotifications] = useState<RealTimeEvent[]>([]);

  useEventSubscription(
    ['notification:new', 'system:broadcast'],
    (event) => {
      if (event.companyId === companyId && (!userId || !event.userId || event.userId === userId)) {
        setNotifications((prev) => [...prev.slice(-49), event]);
      }
    },
    [companyId, userId]
  );

  const clearNotification = useCallback((eventId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== eventId));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, clearNotification, clearAll };
}

export { eventBusClient };
