'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Inbox,
  Bell,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  RefreshCw,
  CheckCheck,
  XCircle,
  ArrowRight,
  Sparkles,
  DollarSign,
  Shield,
  Bot,
  ListTodo,
  Target,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Types
interface InboxEvent {
  id: string;
  eventType: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: string;
  title: string;
  description?: string;
  details?: Record<string, unknown>;
  requiresDecision: number;
  decisionOptions?: Array<{
    id: string;
    label: string;
    description?: string;
    action: string;
    isRecommended?: boolean;
  }>;
  decisionDeadline?: string;
  createdAt: string;
  sourceAgent?: { id: string; name: string };
  relatedTask?: { id: string; title: string };
}

interface InboxStats {
  unread: number;
  pendingDecisions: number;
  critical: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

const eventTypeIcons: Record<string, React.ReactNode> = {
  decision_required: <CheckCircle2 className="h-5 w-5" />,
  system_alert: <AlertCircle className="h-5 w-5" />,
  success_event: <Sparkles className="h-5 w-5" />,
  budget_alert: <DollarSign className="h-5 w-5" />,
  risk_alert: <Shield className="h-5 w-5" />,
  agent_escalation: <Bot className="h-5 w-5" />,
  task_blocked: <ListTodo className="h-5 w-5" />,
  strategy_update: <Target className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
};

const severityColors: Record<string, { bg: string; text: string; badge: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', badge: 'bg-red-500' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', badge: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', badge: 'bg-yellow-500' },
  low: { bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500' },
  info: { bg: 'bg-gray-100', text: 'text-gray-700', badge: 'bg-gray-500' },
};

export default function InboxPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState<InboxEvent | null>(null);

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Fetch events
      const eventsRes = await fetch(
        `/api/v1/inbox/company/${companyId}?limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const eventsData = await eventsRes.json();
      setEvents(eventsData.data || []);

      // Fetch stats
      const statsRes = await fetch(
        `/api/v1/inbox/company/${companyId}/stats`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const statsData = await statsRes.json();
      setStats(statsData.data);
    } catch (error) {
      console.error('Failed to fetch inbox data:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (eventId: string) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/inbox/${eventId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/inbox/company/${companyId}/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
  };

  const makeDecision = async (eventId: string, decisionId: string) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/inbox/${eventId}/decide`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decisionId }),
    });
    setSelectedEvent(null);
    fetchData();
  };

  const dismissEvent = async (eventId: string) => {
    const token = localStorage.getItem('token');
    await fetch(`/api/v1/inbox/${eventId}/dismiss`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    setSelectedEvent(null);
    fetchData();
  };

  const filteredEvents = events.filter(event => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return event.status === 'unread';
    if (activeTab === 'decisions') return event.requiresDecision === 1 && event.status === 'unread';
    if (activeTab === 'critical') return event.severity === 'critical';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Inbox className="h-8 w-8" />
            CEO Inbox
          </h1>
          <p className="text-muted-foreground">
            Events, alerts, and decisions requiring your attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {stats && stats.unread > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unread</p>
                <p className="text-3xl font-bold">{stats?.unread || 0}</p>
              </div>
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Decisions</p>
                <p className="text-3xl font-bold">{stats?.pendingDecisions || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-3xl font-bold text-red-600">{stats?.critical || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-3xl font-bold">{events.length}</p>
              </div>
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unread" className="relative">
                    Unread
                    {stats && stats.unread > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                        {stats.unread}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="decisions" className="relative">
                    Decisions
                    {stats && stats.pendingDecisions > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-orange-500 text-white rounded-full">
                        {stats.pendingDecisions}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="critical">Critical</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {filteredEvents.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                    <h3 className="font-semibold">All caught up!</h3>
                    <p className="text-muted-foreground">No events to display</p>
                  </div>
                ) : (
                  filteredEvents.map(event => (
                    <EventRow
                      key={event.id}
                      event={event}
                      isSelected={selectedEvent?.id === event.id}
                      onClick={() => {
                        setSelectedEvent(event);
                        if (event.status === 'unread') {
                          markAsRead(event.id);
                        }
                      }}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Event Detail */}
        <div className="lg:col-span-1">
          {selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              onDecision={makeDecision}
              onDismiss={dismissEvent}
              onClose={() => setSelectedEvent(null)}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold">Select an event</h3>
                <p className="text-muted-foreground text-sm">
                  Click on an event to view details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Event Row Component
function EventRow({
  event,
  isSelected,
  onClick,
}: {
  event: InboxEvent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const colors = severityColors[event.severity];
  const icon = eventTypeIcons[event.eventType] || <Info className="h-5 w-5" />;

  return (
    <div
      className={cn(
        'p-4 cursor-pointer hover:bg-muted/50 transition-colors',
        isSelected && 'bg-muted',
        event.status === 'unread' && 'bg-blue-50/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg', colors.bg)}>
          <div className={colors.text}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn('font-medium truncate', event.status === 'unread' && 'font-semibold')}>
              {event.title}
            </h4>
            {event.requiresDecision === 1 && event.status === 'unread' && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Decision Required
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {event.description}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Badge className={cn(colors.badge, 'text-white text-xs')}>
              {event.severity}
            </Badge>
            <span>{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
            {event.sourceAgent && (
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" />
                {event.sourceAgent.name}
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>
    </div>
  );
}

// Event Detail Component
function EventDetail({
  event,
  onDecision,
  onDismiss,
  onClose,
}: {
  event: InboxEvent;
  onDecision: (eventId: string, decisionId: string) => void;
  onDismiss: (eventId: string) => void;
  onClose: () => void;
}) {
  const colors = severityColors[event.severity];
  const icon = eventTypeIcons[event.eventType] || <Info className="h-5 w-5" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-3 rounded-lg', colors.bg)}>
              <div className={cn('h-6 w-6', colors.text)}>{icon}</div>
            </div>
            <div>
              <Badge className={cn(colors.badge, 'text-white mb-1')}>
                {event.severity}
              </Badge>
              <CardTitle className="text-lg">{event.title}</CardTitle>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description */}
        {event.description && (
          <div>
            <h4 className="font-medium mb-2">Description</h4>
            <p className="text-sm text-muted-foreground">{event.description}</p>
          </div>
        )}

        {/* Details */}
        {event.details && Object.keys(event.details).length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Details</h4>
            <div className="bg-muted rounded-lg p-3 text-sm">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Source */}
        {event.sourceAgent && (
          <div>
            <h4 className="font-medium mb-2">Source</h4>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="text-sm">{event.sourceAgent.name}</span>
            </div>
          </div>
        )}

        {/* Related Task */}
        {event.relatedTask && (
          <div>
            <h4 className="font-medium mb-2">Related Task</h4>
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              <span className="text-sm">{event.relatedTask.title}</span>
            </div>
          </div>
        )}

        {/* Decision Options */}
        {event.requiresDecision === 1 && event.decisionOptions && event.status === 'unread' && (
          <div>
            <h4 className="font-medium mb-2">Actions Required</h4>
            {event.decisionDeadline && (
              <p className="text-sm text-orange-600 mb-3">
                <Clock className="h-4 w-4 inline mr-1" />
                Deadline: {new Date(event.decisionDeadline).toLocaleString()}
              </p>
            )}
            <div className="space-y-2">
              {event.decisionOptions.map(option => (
                <Button
                  key={option.id}
                  className="w-full justify-start"
                  variant={option.isRecommended ? 'default' : 'outline'}
                  onClick={() => onDecision(event.id, option.id)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {option.label}
                  {option.isRecommended && (
                    <Badge variant="secondary" className="ml-auto">
                      Recommended
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          {event.status !== 'dismissed' && event.status !== 'action_taken' && (
            <Button variant="outline" onClick={() => onDismiss(event.id)}>
              <XCircle className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
