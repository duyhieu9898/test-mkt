import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '@/stores/auth-store';

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  onboardingCompleted: boolean;
  /** User role for admin gating (e.g. 'admin' | 'user') */
  role?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  logo?: string | null;
  slug: string;
  industry: string;
  description?: string;
  status: 'setup' | 'active' | 'paused' | 'suspended';
  settings?: {
    monthlyBudget?: number;
    currency?: string;
    timezone?: string;
    language?: string;
    websiteUrl?: string;
    websiteOption?: 'has_website' | 'new_business' | 'skip';
  };
  websiteProfile?: {
    url: string | null;
    onboardingChoice: 'has_website' | 'new_business' | 'skip' | 'unknown';
    startingFresh: boolean;
  };
  businessPlan?: {
    vision?: string;
    mission?: string;
    targetAudience?: {
      demographics?: string[];
      painPoints?: string[];
    };
    valueProposition?: string;
    revenueModel?: string;
    offerings?: string[];
    growthPlanApprovedAt?: string;
  } | null;
  ownerId: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  role: string;
  title?: string;
  description?: string;
  status: 'created' | 'ready' | 'running' | 'paused' | 'waiting' | 'error' | 'terminated';
  avatarUrl?: string;
  color: string;
  capabilities?: Array<{ name: string; level: string; description: string }>;
  tools?: string[];
  performanceScore?: string;
  budgetSpent?: string;
  budgetLimit?: string;
  tasksCompleted: number;
  tasksFailed: number;
  lastActiveAt?: string;
  createdAt: string;
  department?: { id: string; name: string };
  supervisor?: { id: string; name: string };
}

export interface Task {
  id: string;
  companyId: string;
  assignedAgentId?: string;
  title: string;
  description?: string;
  type: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'waiting' | 'completed' | 'failed' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low';
  progress: number;
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  deadline?: string;
  assignedAgent?: Agent;
}

export interface Message {
  id: string;
  companyId: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokensUsed?: number;
  cost?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

// Helper to get token
const getToken = () => useAuthStore.getState().token;

// Auth Hooks
export const useLogin = () => {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      return api.post<AuthResponse>('/auth/login', data);
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
    },
  });
};

export const useRegister = () => {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      return api.post<AuthResponse>('/auth/register', data);
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
    },
  });
};

export const useLogout = () => {
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = getToken();
      if (token) {
        await api.post('/auth/logout', {}, { token });
      }
    },
    onSuccess: () => {
      logout();
      queryClient.clear();
    },
  });
};

export const useCurrentUser = () => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const result = await api.get<{ user: User }>('/auth/me', { token: token! });
      return result.user;
    },
    enabled: !!token,
  });
};

// Company Hooks
export const useCompanies = () => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const result = await api.get<{ data: Company[] }>('/companies', { token: token! });
      return result.data;
    },
    enabled: !!token,
  });
};

export const useCompany = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['company', companyId],
    queryFn: async () => {
      return api.get<Company>(`/companies/${companyId}`, { token: token! });
    },
    enabled: !!token && !!companyId,
  });
};

export const useCreateCompany = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; industry: string; description?: string }) => {
      return api.post<Company>('/companies', data, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
};

export interface CostStats {
  total: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  daily: Array<{ date: string; cost: number; tokens: number }>;
  byAgent: Array<{
    agentId: string;
    agentName: string;
    role: string;
    color: string;
    totalCost: number;
    totalTokens: number;
    taskCount: number;
    budgetLimit: number;
    budgetSpent: number;
  }>;
}

export interface DashboardStats {
  activeAgents: number;
  totalAgents: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksInProgress: number;
  tasksFailed: number;
  budgetUsed: number;
  budgetLimit: number;
  costs: CostStats;
}

export const useDashboardStats = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['dashboardStats', companyId],
    queryFn: async () => {
      return api.get<DashboardStats>(`/companies/${companyId}/stats`, { token: token! });
    },
    enabled: !!token && !!companyId,
  });
};

// Agent Hooks
export const useAgents = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agents', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: Agent[] }>(`/agents?companyId=${companyId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useAgent = (agentId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => {
      return api.get<Agent>(`/agents/${agentId}`, { token: token! });
    },
    enabled: !!token && !!agentId,
  });
};

export const useCreateAgent = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      companyId: string;
      name: string;
      role: string;
      description?: string;
      capabilities?: Array<{ name: string; level: string; description: string }>;
    }) => {
      return api.post<Agent>('/agents', data, { token: token! });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents', variables.companyId] });
    },
  });
};

export const useControlAgent = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, action }: { agentId: string; action: 'start' | 'pause' | 'stop' }) => {
      return api.post<{ success: boolean; status: string }>(`/agents/${agentId}/${action}`, {}, { token: token! });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};

// Agent Chat / Command Hooks
export const useAgentMessages = (agentId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agentMessages', agentId],
    queryFn: async () => {
      const result = await api.get<{ data: Message[]; hasMore: boolean }>(`/agents/${agentId}/messages`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!agentId,
    refetchInterval: 3000, // Poll every 3 seconds for new messages
  });
};

export const useSendAgentCommand = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, command }: { agentId: string; command: string }) => {
      return api.post<{ jobId: string; messageId: string; status: string }>(`/agents/${agentId}/command`, { command }, { token: token! });
    },
    onSuccess: (_, { agentId }) => {
      // Invalidate messages to refetch
      queryClient.invalidateQueries({ queryKey: ['agentMessages', agentId] });
    },
  });
};

export const useAgentTasks = (agentId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agentTasks', agentId],
    queryFn: async () => {
      const result = await api.get<{ data: Task[] }>(`/agents/${agentId}/tasks`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!agentId,
  });
};

// Task Hooks
export const useTasks = (companyId: string, filters?: { status?: string; priority?: string; agentId?: string }) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['tasks', companyId, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.priority) params.set('priority', filters.priority);
      if (filters?.agentId) params.set('agentId', filters.agentId);
      const result = await api.get<{ data: Task[]; counts: Record<string, number> }>(`/tasks?${params.toString()}`, { token: token! });
      return result;
    },
    enabled: !!token && !!companyId,
  });
};

export const useTask = (taskId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      return api.get<Task>(`/tasks/${taskId}`, { token: token! });
    },
    enabled: !!token && !!taskId,
  });
};

export const useCreateTask = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      companyId: string;
      title: string;
      description?: string;
      type?: string;
      assignedAgentId?: string;
      priority?: 'critical' | 'high' | 'medium' | 'low';
    }) => {
      return api.post<Task>('/tasks', data, { token: token! });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.companyId] });
    },
  });
};

export const useUpdateTask = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, ...data }: { taskId: string; status?: string; priority?: string; assignedAgentId?: string }) => {
      return api.patch<Task>(`/tasks/${taskId}`, data, { token: token! });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', result.id] });
    },
  });
};

export const useRetryTask = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      return api.post<{ success: boolean }>(`/tasks/${taskId}/retry`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

// Command Hook (global command to company)
export const useSendCommand = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useMutation({
    mutationFn: async (command: string) => {
      return api.post<{ response: string; intent: string; taskId?: string }>('/commands', { companyId, command }, { token: token! });
    },
  });
};

// ==================== BUDGET HOOKS ====================

export interface BudgetHierarchy {
  company: {
    id: string;
    name: string;
    totalBudget: number;
    monthlyBudget: number;
    totalSpent: number;
    utilizationPercent: number;
  };
  departments: Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    budgetAllocated: number;
    budgetSpent: number;
    utilizationPercent: number;
    agents: Array<{
      id: string;
      name: string;
      role: string;
      color: string;
      budgetLimit: number;
      budgetSpent: number;
      utilizationPercent: number;
    }>;
  }>;
  unassignedAgents: Array<{
    id: string;
    name: string;
    role: string;
    color: string;
    budgetLimit: number;
    budgetSpent: number;
    utilizationPercent: number;
  }>;
}

export interface BudgetTrend {
  date: string;
  cost: number;
  tokens: number;
  tasks: number;
}

export interface BudgetTrendsData {
  period: string;
  trends: BudgetTrend[];
  summary: {
    totalCost: number;
    totalTokens: number;
    avgDailyCost: number;
    trendPercent: number;
    trendDirection: 'up' | 'down' | 'stable';
  };
}

export interface BudgetBreakdownItem {
  id: string;
  name: string;
  cost: number;
  tokens: number;
  count: number;
  role?: string;
  color?: string;
}

export interface BudgetForecast {
  currentSpent: number;
  monthlyBudget: number;
  avgDailyCost: number;
  remainingDays: number;
  projectedMonthEnd: number;
  budgetStatus: 'on_track' | 'at_risk' | 'over_budget';
  utilizationPercent: number;
  dailyForecast: Array<{ date: string; projected: number; cumulative: number }>;
  recommendations: string[];
}

export const useBudgetHierarchy = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['budgetHierarchy', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: BudgetHierarchy }>(`/budget/company/${companyId}/hierarchy`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useBudgetTrends = (companyId: string, period: '7d' | '30d' | '90d' | '1y' = '30d') => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['budgetTrends', companyId, period],
    queryFn: async () => {
      const result = await api.get<{ data: BudgetTrendsData }>(`/budget/company/${companyId}/trends?period=${period}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useBudgetBreakdown = (companyId: string, groupBy: 'agent' | 'department' | 'model' = 'agent') => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['budgetBreakdown', companyId, groupBy],
    queryFn: async () => {
      const result = await api.get<{ data: { groupBy: string; breakdown: BudgetBreakdownItem[] } }>(`/budget/company/${companyId}/breakdown?groupBy=${groupBy}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useBudgetForecast = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['budgetForecast', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: BudgetForecast }>(`/budget/company/${companyId}/forecast`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useUpdateDepartmentBudget = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ departmentId, budgetAllocated }: { departmentId: string; budgetAllocated: number }) => {
      return api.patch<{ message: string }>(`/budget/department/${departmentId}/budget`, { budgetAllocated }, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetHierarchy'] });
    },
  });
};

export const useUpdateAgentBudget = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, budgetLimit }: { agentId: string; budgetLimit: number }) => {
      return api.patch<{ message: string }>(`/budget/agent/${agentId}/budget`, { budgetLimit }, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetHierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};

export const useUpdateCompanyBudget = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, totalBudget, monthlyBudget }: { companyId: string; totalBudget?: number; monthlyBudget?: number }) => {
      return api.patch<{ message: string }>(`/budget/company/${companyId}`, { totalBudget, monthlyBudget }, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetHierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['company'] });
    },
  });
};

export const useResetBudgets = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      return api.post<{ message: string }>(`/budget/company/${companyId}/reset`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetHierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['budgetTrends'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
};

// ==================== AUDIT LOG HOOKS ====================

export interface AuditLog {
  id: string;
  companyId: string;
  actorType: string;
  actorId: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  description?: string;
  changes?: { before?: unknown; after?: unknown };
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ActionLog {
  id: string;
  companyId: string;
  agentId: string;
  taskId?: string;
  toolName: string;
  action: string;
  input?: unknown;
  output?: unknown;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  cost?: string;
  latencyMs?: number;
  status: string;
  errorType?: string;
  errorMessage?: string;
  traceId?: string;
  spanId?: string;
  createdAt: string;
  agent?: Agent;
  task?: Task;
}

export interface AuditFilters {
  actorType?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface ActionFilters {
  agentId?: string;
  taskId?: string;
  toolName?: string;
  action?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export const useAuditLogs = (companyId: string, filters: AuditFilters = {}, limit = 50, offset = 0) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['auditLogs', companyId, filters, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      if (filters.actorType) params.set('actorType', filters.actorType);
      if (filters.action) params.set('action', filters.action);
      if (filters.resourceType) params.set('resourceType', filters.resourceType);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.search) params.set('search', filters.search);

      return api.get<{ data: AuditLog[]; total: number; limit: number; offset: number }>(
        `/audit/company/${companyId}/audit?${params.toString()}`,
        { token: token! }
      );
    },
    enabled: !!token && !!companyId,
  });
};

export const useAuditStats = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['auditStats', companyId],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          total: number;
          byAction: Array<{ action: string; count: number }>;
          byActorType: Array<{ type: string; count: number }>;
          byResourceType: Array<{ type: string; count: number }>;
          byDay: Array<{ date: string; count: number }>;
        };
      }>(`/audit/company/${companyId}/audit/stats`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useAuditFilters = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['auditFilters', companyId],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          actorTypes: string[];
          actions: string[];
          resourceTypes: string[];
        };
      }>(`/audit/company/${companyId}/audit/filters`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useActionLogs = (companyId: string, filters: ActionFilters = {}, limit = 50, offset = 0) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['actionLogs', companyId, filters, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      if (filters.agentId) params.set('agentId', filters.agentId);
      if (filters.taskId) params.set('taskId', filters.taskId);
      if (filters.toolName) params.set('toolName', filters.toolName);
      if (filters.action) params.set('action', filters.action);
      if (filters.status) params.set('status', filters.status);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      return api.get<{ data: ActionLog[]; total: number; limit: number; offset: number }>(
        `/audit/company/${companyId}/actions?${params.toString()}`,
        { token: token! }
      );
    },
    enabled: !!token && !!companyId,
  });
};

export const useActionStats = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['actionStats', companyId],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          total: number;
          totalCost: number;
          totalTokens: number;
          successRate: number;
          byTool: Array<{ tool: string; count: number; cost: number; tokens: number }>;
          byAgent: Array<{ agentId: string; name: string; count: number; cost: number; tokens: number }>;
          byStatus: Array<{ status: string; count: number }>;
          byDay: Array<{ date: string; count: number; cost: number }>;
        };
      }>(`/audit/company/${companyId}/actions/stats`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useActionFilters = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['actionFilters', companyId],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          agents: Array<{ id: string; name: string }>;
          toolNames: string[];
          actions: string[];
          statuses: string[];
        };
      }>(`/audit/company/${companyId}/actions/filters`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

// ==================== COMMUNICATION HOOKS ====================

export interface AgentMessage {
  id: string;
  companyId: string;
  senderAgentId?: string;
  receiverAgentId?: string;
  receiverDepartmentId?: string;
  messageType: string;
  priority: string;
  goal: string;
  context?: {
    taskId?: string;
    taskTitle?: string;
    objectiveId?: string;
    objectiveTitle?: string;
    previousMessages?: string[];
    relevantData?: Record<string, unknown>;
    situation?: string;
  };
  constraints?: {
    deadline?: string;
    budget?: number;
    requiredCapabilities?: string[];
    qualityStandards?: string[];
    dependencies?: string[];
    restrictions?: string[];
  };
  expectedOutput?: {
    format: string;
    description: string;
    schema?: Record<string, unknown>;
    deadline?: string;
  };
  content: {
    summary: string;
    details?: string;
    attachments?: Array<{
      type: string;
      title: string;
      content: string | Record<string, unknown>;
    }>;
    actions?: Array<{
      action: string;
      reason: string;
      status?: string;
    }>;
    questions?: string[];
    recommendations?: string[];
  };
  requiresResponse: number;
  responseDeadline?: string;
  responseMessageId?: string;
  threadId?: string;
  parentMessageId?: string;
  status: string;
  readAt?: string;
  metadata?: {
    processingTime?: number;
    llmTokensUsed?: number;
    confidenceScore?: number;
    tags?: string[];
  };
  createdAt: string;
  sender?: Agent;
  receiver?: Agent;
}

export interface CollaborationSession {
  id: string;
  companyId: string;
  title: string;
  purpose: string;
  initiatorAgentId?: string;
  participantAgentIds: string[];
  objectiveId?: string;
  taskIds?: string[];
  status: string;
  outcomes?: {
    decisions: Array<{ decision: string; madeBy: string; timestamp: string }>;
    actionItems: Array<{ action: string; assignee: string; deadline?: string; status: string }>;
    insights: string[];
    documentsCreated: string[];
  };
  messageIds?: string[];
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  initiator?: Agent;
  participants?: Array<{ id: string; name: string; role?: string; color?: string }>;
}

export interface CommunicationFilters {
  agentId?: string;
  messageType?: string;
  priority?: string;
  threadId?: string;
  status?: string;
}

export const useCompanyMessages = (companyId: string, filters: CommunicationFilters = {}, limit = 50, offset = 0) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['companyMessages', companyId, filters, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      if (filters.agentId) params.set('agentId', filters.agentId);
      if (filters.messageType) params.set('messageType', filters.messageType);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.threadId) params.set('threadId', filters.threadId);
      if (filters.status) params.set('status', filters.status);

      return api.get<{ data: AgentMessage[]; total: number; limit: number; offset: number }>(
        `/communications/company/${companyId}/messages?${params.toString()}`,
        { token: token! }
      );
    },
    enabled: !!token && !!companyId,
  });
};

export const useMessageTimeline = (companyId: string, days = 7) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['messageTimeline', companyId, days],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          timeline: Array<{ date: string; messages: AgentMessage[]; count: number }>;
          totalMessages: number;
        };
      }>(`/communications/company/${companyId}/timeline?days=${days}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useMessageThread = (threadId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['messageThread', threadId],
    queryFn: async () => {
      const result = await api.get<{ data: AgentMessage[] }>(`/communications/thread/${threadId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!threadId,
  });
};

export const useCommunicationStats = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['communicationStats', companyId],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          total: number;
          pendingResponses: number;
          activeThreads: number;
          byType: Array<{ type: string; count: number }>;
          byPriority: Array<{ priority: string; count: number }>;
          byAgent: Array<{ agentId: string; name: string; sent: number; received: number }>;
          byDay: Array<{ date: string; count: number }>;
        };
      }>(`/communications/company/${companyId}/stats`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useCollaborationSessions = (companyId: string, status?: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['collaborationSessions', companyId, status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : '';
      const result = await api.get<{ data: CollaborationSession[] }>(
        `/communications/company/${companyId}/collaborations${params}`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useCommunicationNetwork = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['communicationNetwork', companyId],
    queryFn: async () => {
      const result = await api.get<{
        data: {
          nodes: Array<{ id: string; name: string; role: string; color: string; department?: string }>;
          edges: Array<{ source: string; target: string; weight: number }>;
        };
      }>(`/communications/company/${companyId}/network`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

// ==================== STRATEGY TIMELINE HOOKS ====================

export interface StrategyObjective {
  id: string;
  title: string;
  description: string;
  keyResults: Array<{
    id: string;
    metric: string;
    target: number;
    current: number;
    unit: string;
  }>;
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
}

export interface StrategyPriority {
  rank: number;
  title: string;
  description: string;
  category: 'growth' | 'efficiency' | 'innovation' | 'risk' | 'quality';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

export interface StrategyHorizon {
  id: string;
  companyId: string;
  horizon: 'quarterly' | 'weekly' | 'daily';
  status: 'draft' | 'active' | 'completed' | 'revised' | 'cancelled';
  periodStart: string;
  periodEnd: string;
  vision?: string;
  mission?: string;
  theme?: string;
  objectives?: StrategyObjective[];
  priorities?: StrategyPriority[];
  resourceAllocation?: {
    budget?: { total: number; allocated: number; byCategory: Record<string, number> };
    agents?: { total: number; byDepartment: Record<string, number>; byRole: Record<string, number> };
    focus?: Record<string, number>;
  };
  constraints?: {
    budgetLimit?: number;
    maxAgents?: number;
    mustComplete?: string[];
    mustAvoid?: string[];
    dependencies?: string[];
  };
  successMetrics?: Array<{
    metric: string;
    baseline: number;
    target: number;
    current: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  overallProgress: number;
  healthScore: number;
  parentHorizonId?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyTimelineData {
  range: { start: string; end: string };
  quarterly: Array<{
    id: string;
    theme?: string;
    vision?: string;
    status: string;
    progress: number;
    healthScore: number;
    start: string;
    end: string;
    objectives?: StrategyObjective[];
  }>;
  weekly: Array<{
    id: string;
    theme?: string;
    status: string;
    progress: number;
    healthScore: number;
    start: string;
    end: string;
    parentHorizonId?: string;
    priorities?: StrategyPriority[];
  }>;
  daily: Array<{
    id: string;
    theme?: string;
    status: string;
    progress: number;
    healthScore: number;
    start: string;
    end: string;
    parentHorizonId?: string;
    priorities?: StrategyPriority[];
  }>;
}

export interface ActiveStrategies {
  quarterly?: StrategyHorizon;
  weekly?: StrategyHorizon;
  daily?: StrategyHorizon;
  alignment?: {
    score: number;
    quarterlyToWeekly: number;
    weeklyToDaily: number;
    issues: Array<{
      issue: string;
      severity: 'critical' | 'warning' | 'info';
      affectedHorizons: string[];
      recommendation: string;
    }>;
    computedAt: string;
  };
}

export const useActiveStrategies = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['activeStrategies', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: ActiveStrategies }>(`/strategy/company/${companyId}/active`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useStrategyTimeline = (companyId: string, start?: string, end?: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['strategyTimeline', companyId, start, end],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await api.get<{ data: StrategyTimelineData }>(`/strategy/company/${companyId}/timeline${query}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useStrategyDetails = (strategyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['strategyDetails', strategyId],
    queryFn: async () => {
      const result = await api.get<{ data: StrategyHorizon & { childHorizons: StrategyHorizon[] } }>(`/strategy/${strategyId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!strategyId,
  });
};

export const useAllStrategies = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['allStrategies', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: StrategyHorizon[] }>(`/strategy/company/${companyId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

// ==================== CONFLICT RESOLUTION HOOKS ====================

export interface ConflictAgent {
  id: string;
  name: string;
  role: string;
  color?: string;
  avatar?: string;
}

export interface ConflictEvent {
  id: string;
  conflictId: string;
  eventType: string;
  actorType: string;
  actorId?: string;
  description: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentConflict {
  id: string;
  companyId: string;
  conflictType: 'resource' | 'task' | 'budget' | 'priority' | 'data' | 'schedule' | 'dependency' | 'authority';
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'detected' | 'acknowledged' | 'investigating' | 'escalated' | 'awaiting_input' | 'resolved' | 'dismissed' | 'auto_resolved';
  title: string;
  description?: string;
  involvedAgentIds: string[];
  involvedAgents?: ConflictAgent[];
  resourceType?: string;
  resourceId?: string;
  taskIds?: string[];
  conflictDetails?: {
    requests: Array<{
      agentId: string;
      agentName: string;
      action: string;
      requestedAt: string;
      parameters?: Record<string, unknown>;
    }>;
    resourceState?: Record<string, unknown>;
    constraints?: string[];
    impact?: {
      blockedTasks: number;
      affectedAgents: string[];
      estimatedDelay?: string;
    };
  };
  resolutionStrategy?: string;
  resolvedBy?: string;
  resolution?: {
    action: string;
    winner?: string;
    details: string;
    compensations?: Array<{ agentId: string; action: string }>;
  };
  resolvedAt?: string;
  escalationLevel: number;
  escalatedAt?: string;
  escalationReason?: string;
  autoResolutionAttempts: number;
  detectedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  events?: ConflictEvent[];
}

export interface ConflictFilters {
  status?: string;
  severity?: string;
  type?: string;
}

export interface ConflictStats {
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  recentCount24h: number;
  avgResolutionMinutes: number | null;
  activeCount: number;
}

export interface ConflictResolutionRule {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  conflictTypes?: string[];
  severities?: string[];
  agentRoles?: string[];
  resourceTypes?: string[];
  strategy: string;
  autoResolve: boolean;
  escalateAfterMinutes?: number;
  escalateTo?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const useConflicts = (companyId: string, filters: ConflictFilters = {}, limit = 50, offset = 0) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['conflicts', companyId, filters, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      if (filters.status) params.set('status', filters.status);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.type) params.set('type', filters.type);

      return api.get<{ data: AgentConflict[]; total: number; limit: number; offset: number }>(
        `/conflicts/company/${companyId}?${params.toString()}`,
        { token: token! }
      );
    },
    enabled: !!token && !!companyId,
  });
};

export const useConflictStats = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['conflictStats', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: ConflictStats }>(`/conflicts/company/${companyId}/stats`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useConflictDetails = (conflictId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['conflictDetails', conflictId],
    queryFn: async () => {
      const result = await api.get<{ data: AgentConflict & { events: ConflictEvent[] } }>(`/conflicts/${conflictId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!conflictId,
  });
};

export const useConflictResolutionRules = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['conflictRules', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: ConflictResolutionRule[] }>(`/conflicts/company/${companyId}/rules`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useUpdateConflictStatus = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conflictId, status, comment }: { conflictId: string; status: string; comment?: string }) => {
      return api.patch<{ data: AgentConflict }>(`/conflicts/${conflictId}/status`, { status, comment }, { token: token! });
    },
    onSuccess: (_, { conflictId }) => {
      queryClient.invalidateQueries({ queryKey: ['conflictDetails', conflictId] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['conflictStats'] });
    },
  });
};

export const useResolveConflict = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conflictId,
      strategy,
      resolution,
    }: {
      conflictId: string;
      strategy: string;
      resolution: { action: string; winner?: string; details: string; compensations?: Array<{ agentId: string; action: string }> };
    }) => {
      return api.post<{ data: AgentConflict }>(`/conflicts/${conflictId}/resolve`, { strategy, resolution }, { token: token! });
    },
    onSuccess: (_, { conflictId }) => {
      queryClient.invalidateQueries({ queryKey: ['conflictDetails', conflictId] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['conflictStats'] });
    },
  });
};

export const useEscalateConflict = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conflictId, reason, escalateTo }: { conflictId: string; reason: string; escalateTo?: 'ceo' | 'human' }) => {
      return api.post<{ data: AgentConflict }>(`/conflicts/${conflictId}/escalate`, { reason, escalateTo }, { token: token! });
    },
    onSuccess: (_, { conflictId }) => {
      queryClient.invalidateQueries({ queryKey: ['conflictDetails', conflictId] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['conflictStats'] });
    },
  });
};

export const useAddConflictComment = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conflictId, comment }: { conflictId: string; comment: string }) => {
      return api.post<{ data: ConflictEvent }>(`/conflicts/${conflictId}/comments`, { comment }, { token: token! });
    },
    onSuccess: (_, { conflictId }) => {
      queryClient.invalidateQueries({ queryKey: ['conflictDetails', conflictId] });
    },
  });
};

export const useCreateDefaultRules = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      return api.post<{ data: ConflictResolutionRule[] }>(`/conflicts/company/${companyId}/rules/defaults`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflictRules'] });
    },
  });
};

export const useUpdateConflictRule = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: string; data: Partial<ConflictResolutionRule> }) => {
      return api.patch<{ data: ConflictResolutionRule }>(`/conflicts/rules/${ruleId}`, data, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflictRules'] });
    },
  });
};

export const useDeleteConflictRule = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      return api.delete(`/conflicts/rules/${ruleId}`, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflictRules'] });
    },
  });
};

// ==================== EVENT BUS HOOKS ====================

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

export interface RealTimeEvent {
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

export const useRecentEvents = (companyId: string, limit = 50) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['recentEvents', companyId, limit],
    queryFn: async () => {
      const result = await api.get<{ data: RealTimeEvent[]; meta: { connectedClients: number } }>(
        `/events/company/${companyId}?limit=${limit}`,
        { token: token! }
      );
      return result;
    },
    enabled: !!token && !!companyId,
    refetchInterval: 10000, // Refresh every 10 seconds as fallback
  });
};

export const usePublishEvent = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyId,
      type,
      payload,
      source,
      agentId,
    }: {
      companyId: string;
      type: string;
      payload: Record<string, unknown>;
      source?: string;
      agentId?: string;
    }) => {
      return api.post<{ data: RealTimeEvent }>(
        `/events/company/${companyId}/publish`,
        { type, payload, source, agentId },
        { token: token! }
      );
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['recentEvents', companyId] });
    },
  });
};

export const useBroadcast = () => {
  const token = useAuthStore((state) => state.token);

  return useMutation({
    mutationFn: async ({
      companyId,
      message,
      level,
      metadata,
    }: {
      companyId: string;
      message: string;
      level?: 'info' | 'warning' | 'error' | 'success';
      metadata?: Record<string, unknown>;
    }) => {
      return api.post<{ data: RealTimeEvent; recipients: number }>(
        `/events/company/${companyId}/broadcast`,
        { message, level, metadata },
        { token: token! }
      );
    },
  });
};

// ==================== ECONOMY HOOKS ====================

export interface AgentCredits {
  id: string;
  agentId: string;
  companyId: string;
  apiCallsBalance: number;
  apiCallsUsed: number;
  tokensBalance: number;
  tokensUsed: number;
  toolsBalance: number;
  toolsUsed: number;
  externalApiBalance: number;
  externalApiUsed: number;
  monthlyApiCallsLimit: number;
  monthlyTokensLimit: number;
  monthlyToolsLimit: number;
  monthlyExternalApiLimit: number;
  budgetAllocation: number;
  budgetSpent: number;
  performanceMultiplier: number;
  lastResetAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  agent?: {
    id: string;
    name: string;
    role: string;
    color?: string;
    avatar?: string;
  };
  utilizationPercent?: {
    apiCalls: number;
    tokens: number;
    tools: number;
    externalApi: number;
    budget: number;
  };
}

export interface CreditTransaction {
  id: string;
  companyId: string;
  agentId: string;
  transactionType: string;
  resourceType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  costUsd?: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  counterpartyAgentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  agent?: { id: string; name: string; color?: string };
}

export interface EconomyOverview {
  totals: {
    totalBudget: number;
    totalSpent: number;
    totalApiCalls: number;
    totalTokens: number;
    totalTools: number;
  };
  utilizationPercent: number;
  agentCount: number;
  recentTransactions: CreditTransaction[];
  topSpenders: Array<{
    agentId: string;
    agentName: string;
    agentColor?: string;
    budgetSpent: number;
    budgetAllocation: number;
  }>;
}

export const useAgentCredits = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agentCredits', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: AgentCredits[] }>(`/economy/company/${companyId}/credits`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useEconomyOverview = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['economyOverview', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: EconomyOverview }>(`/economy/company/${companyId}/overview`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useAgentTransactions = (agentId: string, limit = 50) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agentTransactions', agentId, limit],
    queryFn: async () => {
      const result = await api.get<{ data: CreditTransaction[]; total: number }>(
        `/economy/agent/${agentId}/transactions?limit=${limit}`,
        { token: token! }
      );
      return result;
    },
    enabled: !!token && !!agentId,
  });
};

export const useUpdateAgentLimits = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      limits,
    }: {
      agentId: string;
      limits: Partial<AgentCredits>;
    }) => {
      return api.patch<{ data: AgentCredits }>(`/economy/agent/${agentId}/limits`, limits, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentCredits'] });
      queryClient.invalidateQueries({ queryKey: ['economyOverview'] });
    },
  });
};

export const useResetMonthlyCredits = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      return api.post(`/economy/company/${companyId}/reset`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agentCredits'] });
      queryClient.invalidateQueries({ queryKey: ['economyOverview'] });
    },
  });
};

// ==================== MARKETPLACE HOOKS ====================

export interface Skill {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  version: string;
  authorId: string;
  companyId?: string;
  isPublic: boolean;
  status: string;
  pricing: {
    model: string;
    price?: number;
    currency?: string;
  };
  capabilities: string[];
  requirements?: {
    minAgentLevel?: string;
    requiredTools?: string[];
    dependencies?: string[];
  };
  configuration?: Record<string, unknown>;
  documentation?: string;
  exampleUsage?: string;
  averageRating: number;
  totalReviews: number;
  totalInstalls: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string };
}

export interface SkillReview {
  id: string;
  skillId: string;
  reviewerId: string;
  rating: number;
  title?: string;
  content?: string;
  helpfulCount: number;
  verifiedPurchase: boolean;
  createdAt: string;
  reviewer?: { id: string; name: string };
}

export interface AgentSkill {
  id: string;
  agentId: string;
  skillId: string;
  installedAt: string;
  status: string;
  configuration?: Record<string, unknown>;
  lastUsedAt?: string;
  usageCount: number;
  skill?: Skill;
}

export interface SkillFilters {
  category?: string;
  status?: string;
  minRating?: number;
  search?: string;
}

export const useMarketplaceSkills = (filters: SkillFilters = {}, limit = 20, offset = 0) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['marketplaceSkills', filters, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      if (filters.category) params.set('category', filters.category);
      if (filters.status) params.set('status', filters.status);
      if (filters.minRating) params.set('minRating', filters.minRating.toString());
      if (filters.search) params.set('search', filters.search);

      return api.get<{ data: Skill[]; total: number; limit: number; offset: number }>(
        `/marketplace/skills?${params.toString()}`,
        { token: token! }
      );
    },
    enabled: !!token,
  });
};

export const useSkillDetails = (skillId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['skillDetails', skillId],
    queryFn: async () => {
      const result = await api.get<{ data: Skill & { reviews: SkillReview[] } }>(`/marketplace/skills/${skillId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!skillId,
  });
};

export const useSkillCategories = () => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['skillCategories'],
    queryFn: async () => {
      const result = await api.get<{ data: Array<{ category: string; count: number }> }>('/marketplace/categories', { token: token! });
      return result.data;
    },
    enabled: !!token,
  });
};

export const useAgentSkills = (agentId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['agentSkills', agentId],
    queryFn: async () => {
      const result = await api.get<{ data: AgentSkill[] }>(`/marketplace/agent/${agentId}/skills`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!agentId,
  });
};

export const useInstallSkill = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, skillId, configuration }: { agentId: string; skillId: string; configuration?: Record<string, unknown> }) => {
      return api.post<{ data: AgentSkill }>(`/marketplace/agent/${agentId}/skills/${skillId}/install`, { configuration }, { token: token! });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agentSkills', agentId] });
      queryClient.invalidateQueries({ queryKey: ['marketplaceSkills'] });
    },
  });
};

export const useUninstallSkill = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, skillId }: { agentId: string; skillId: string }) => {
      return api.delete(`/marketplace/agent/${agentId}/skills/${skillId}`, { token: token! });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: ['agentSkills', agentId] });
    },
  });
};

export const useCreateSkill = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Skill>) => {
      return api.post<{ data: Skill }>('/marketplace/skills', data, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplaceSkills'] });
    },
  });
};

export const useSubmitReview = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ skillId, rating, title, content }: { skillId: string; rating: number; title?: string; content?: string }) => {
      return api.post<{ data: SkillReview }>(`/marketplace/skills/${skillId}/reviews`, { rating, title, content }, { token: token! });
    },
    onSuccess: (_, { skillId }) => {
      queryClient.invalidateQueries({ queryKey: ['skillDetails', skillId] });
    },
  });
};

// ==================== SIMULATION HOOKS ====================

export interface Simulation {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  type: 'scenario' | 'stress_test' | 'forecast' | 'optimization' | 'training';
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  config: {
    timeframe: {
      start?: string;
      end?: string;
      duration?: string;
      speedMultiplier: number;
    };
    scenario: {
      type: string;
      parameters: Record<string, unknown>;
    };
    agentConfig?: {
      includeAgents: string[] | 'all';
      budgetOverrides?: Record<string, number>;
      behaviorOverrides?: Record<string, unknown>;
    };
    marketConditions?: {
      growthRate: number;
      competitionLevel: number;
      marketVolatility: number;
    };
    events?: Array<{
      time: string;
      type: string;
      parameters: Record<string, unknown>;
    }>;
  };
  progress: number;
  currentStep?: string;
  estimatedCompletion?: string;
  results?: {
    summary?: string;
    metrics?: Record<string, number>;
    insights?: string[];
    recommendations?: string[];
    timeline?: Array<{ time: string; event: string; impact: string }>;
  };
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationSnapshot {
  id: string;
  simulationId: string;
  simulationTime: string;
  companyState?: Record<string, unknown>;
  agentStates?: Array<{
    agentId: string;
    status: string;
    metrics: Record<string, number>;
  }>;
  metrics?: Record<string, number>;
  events?: Array<{
    type: string;
    description: string;
    impact?: string;
  }>;
  createdAt: string;
}

export interface SimulationTemplate {
  id: string;
  companyId?: string;
  name: string;
  description?: string;
  type: 'scenario' | 'stress_test' | 'forecast' | 'optimization' | 'training';
  isSystem: boolean;
  config: Record<string, unknown>;
  usageCount: number;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export const useSimulations = (companyId: string, status?: string, limit = 20, offset = 0) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['simulations', companyId, status, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      params.set('offset', offset.toString());
      if (status) params.set('status', status);

      return api.get<{ data: Simulation[]; total: number; limit: number; offset: number }>(
        `/simulation/company/${companyId}?${params.toString()}`,
        { token: token! }
      );
    },
    enabled: !!token && !!companyId,
  });
};

export const useSimulationDetails = (simulationId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['simulationDetails', simulationId],
    queryFn: async () => {
      const result = await api.get<{ data: Simulation & { snapshots: SimulationSnapshot[] } }>(`/simulation/${simulationId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!simulationId,
  });
};

export const useSimulationTemplates = (companyId?: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['simulationTemplates', companyId],
    queryFn: async () => {
      const params = companyId ? `?companyId=${companyId}` : '';
      const result = await api.get<{ data: SimulationTemplate[] }>(`/simulation/templates/browse${params}`, { token: token! });
      return result.data;
    },
    enabled: !!token,
  });
};

export const useCreateSimulation = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, data }: { companyId: string; data: Partial<Simulation> }) => {
      return api.post<{ data: Simulation }>(`/simulation/company/${companyId}`, data, { token: token! });
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['simulations', companyId] });
    },
  });
};

export const useCreateSimulationFromTemplate = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      companyId,
      name,
      description,
      configOverrides,
    }: {
      templateId: string;
      companyId: string;
      name: string;
      description?: string;
      configOverrides?: Record<string, unknown>;
    }) => {
      return api.post<{ data: Simulation }>(
        `/simulation/templates/${templateId}/create`,
        { companyId, name, description, configOverrides },
        { token: token! }
      );
    },
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['simulations', companyId] });
    },
  });
};

export const useStartSimulation = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (simulationId: string) => {
      return api.post<{ data: Simulation }>(`/simulation/${simulationId}/start`, {}, { token: token! });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['simulationDetails', result.data.id] });
      queryClient.invalidateQueries({ queryKey: ['simulations'] });
    },
  });
};

export const usePauseSimulation = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (simulationId: string) => {
      return api.post<{ data: Simulation }>(`/simulation/${simulationId}/pause`, {}, { token: token! });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['simulationDetails', result.data.id] });
      queryClient.invalidateQueries({ queryKey: ['simulations'] });
    },
  });
};

export const useCancelSimulation = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (simulationId: string) => {
      return api.post<{ data: Simulation }>(`/simulation/${simulationId}/cancel`, {}, { token: token! });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['simulationDetails', result.data.id] });
      queryClient.invalidateQueries({ queryKey: ['simulations'] });
    },
  });
};

export const useCreateDefaultTemplates = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return api.post<{ data: SimulationTemplate[] }>('/simulation/templates/defaults', {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulationTemplates'] });
    },
  });
};

// ==================== GUIDANCE & PLAYBOOK HOOKS ====================

export interface GuidanceItem {
  id: string;
  companyId: string;
  type: 'setup_task' | 'milestone' | 'recommendation' | 'tutorial' | 'insight';
  title: string;
  description?: string;
  actionUrl?: string;
  actionLabel?: string;
  actionType?: string;
  icon?: string;
  color?: string;
  sequence: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'shown' | 'completed' | 'dismissed' | 'expired';
  stageId?: string;
  sourceType?: string;
  createdAt: string;
}

export interface OnboardingProgress {
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  status: string;
  currentStep: GuidanceItem | null;
}

export interface PlaybookProgress {
  id: string;
  companyId: string;
  playbookId: string;
  currentStage: 'idea' | 'mvp' | 'launch' | 'growth' | 'optimize';
  stageStartedAt: string;
  stageProgress: Record<string, {
    startedAt?: string;
    completedAt?: string;
    progress: number;
    tasksCompleted: number;
    tasksTotal: number;
    milestonesAchieved: string[];
  }>;
  overallProgress: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  playbook: {
    id: string;
    name: string;
    stages: Array<{
      stage: string;
      name: string;
      description: string;
      estimatedDays: number;
      milestones: Array<{ id: string; title: string; description?: string }>;
      tasks: Array<{ id: string; title: string; description: string; type: string; priority: string }>;
      exitCriteria: string[];
    }>;
  };
  currentStageDetails: {
    stage: string;
    name: string;
    description: string;
    estimatedDays: number;
    milestones: Array<{ id: string; title: string; description?: string }>;
    tasks: Array<{ id: string; title: string; description: string; type: string; priority: string }>;
    exitCriteria: string[];
  } | null;
}

export interface StageCompletion {
  isComplete: boolean;
  currentStage: string;
  completedTasks: number;
  totalTasks: number;
  pendingCriteria: string[];
  milestonesAchieved: string[];
  progress: number;
}

// Guidance Hooks
export const useGuidance = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['guidance', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: GuidanceItem[] }>(`/guidance/company/${companyId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useAllGuidance = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['allGuidance', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: GuidanceItem[] }>(`/guidance/company/${companyId}/all`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useOnboardingProgress = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['onboardingProgress', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: OnboardingProgress }>(`/guidance/company/${companyId}/progress`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useCompleteGuidance = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (guidanceId: string) => {
      return api.post<{ success: boolean }>(`/guidance/${guidanceId}/complete`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance'] });
      queryClient.invalidateQueries({ queryKey: ['allGuidance'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingProgress'] });
    },
  });
};

export const useDismissGuidance = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (guidanceId: string) => {
      return api.post<{ success: boolean }>(`/guidance/${guidanceId}/dismiss`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance'] });
      queryClient.invalidateQueries({ queryKey: ['allGuidance'] });
      queryClient.invalidateQueries({ queryKey: ['onboardingProgress'] });
    },
  });
};

export const useRefreshGuidance = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      return api.post<{ success: boolean; data: GuidanceItem[] }>(`/guidance/company/${companyId}/refresh`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guidance'] });
      queryClient.invalidateQueries({ queryKey: ['allGuidance'] });
    },
  });
};

// Playbook Hooks
export const usePlaybookProgress = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['playbookProgress', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: PlaybookProgress | null }>(`/playbooks/company/${companyId}`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useStageCompletion = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['stageCompletion', companyId],
    queryFn: async () => {
      const result = await api.get<{ data: StageCompletion }>(`/playbooks/company/${companyId}/completion`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useAdvanceStage = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: string) => {
      return api.post<{ success: boolean; data: { previousStage: string; newStage: string | null; isPlaybookComplete: boolean } }>(
        `/playbooks/company/${companyId}/advance`,
        {},
        { token: token! }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbookProgress'] });
      queryClient.invalidateQueries({ queryKey: ['stageCompletion'] });
      queryClient.invalidateQueries({ queryKey: ['guidance'] });
    },
  });
};

export const useGenerateStageTasks = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, stage }: { companyId: string; stage?: string }) => {
      return api.post<{ success: boolean; data: Task[]; count: number }>(
        `/playbooks/company/${companyId}/tasks`,
        { stage },
        { token: token! }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['playbookProgress'] });
    },
  });
};

export const useAchieveMilestone = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ companyId, milestoneId }: { companyId: string; milestoneId: string }) => {
      return api.post<{ success: boolean }>(`/playbooks/company/${companyId}/milestone/${milestoneId}`, {}, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbookProgress'] });
      queryClient.invalidateQueries({ queryKey: ['stageCompletion'] });
    },
  });
};

// ==================== LANDING PAGE HOOKS ====================

export interface LandingPage {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  description?: string;
  originalPrompt?: string;
  businessContext?: {
    businessName: string;
    industry: string;
    targetAudience: string;
    valueProposition: string;
    tone?: string;
  };
  style: 'minimal' | 'modern' | 'bold' | 'professional' | 'playful' | 'elegant';
  primaryColor: string;
  secondaryColor?: string | null;
  fontFamily: string;
  content?: {
    headline: string;
    subheadline: string;
    ctaText: string;
    ctaUrl?: string;
  };
  seo?: {
    title: string;
    description: string;
    keywords: string[];
    ogImage?: string;
  };
  status: 'draft' | 'generating' | 'ready' | 'published' | 'archived';
  publishedUrl?: string;
  deploymentProvider?: string;
  deploymentId?: string;
  subdomain?: string;
  wordpressReviewUrl?: string;
  customDomain?: string;
  totalVisitors: number;
  totalLeads: number;
  conversionRate: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  sections?: LandingPageSection[];
  assets?: LandingPageAsset[];
}

export interface LandingPageSection {
  id: string;
  pageId: string;
  type: 'hero' | 'problem' | 'solution' | 'features' | 'pricing' | 'testimonials' | 'faq' | 'cta' | 'image' | 'footer' | 'custom';
  name?: string;
  order: number;
  isVisible: number;
  content?: Record<string, unknown>;
  backgroundColor?: string;
  customStyles?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface LandingPageAsset {
  id: string;
  pageId: string;
  sectionId?: string;
  type: 'hero_image' | 'feature_icon' | 'banner' | 'logo' | 'background' | 'social_preview' | 'favicon';
  name: string;
  url: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  altText?: string;
  isAiGenerated: number;
  createdAt: string;
}

export interface LandingPageLead {
  id: string;
  pageId: string;
  companyId: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  message?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  createdAt: string;
  updatedAt: string;
  contactedAt?: string;
  convertedAt?: string;
}

export interface GeneratePageInput {
  companyId: string;
  prompt: string;
  style?: 'minimal' | 'modern' | 'bold' | 'professional' | 'playful' | 'elegant';
  primaryColor?: string;
  includeFeatures?: boolean;
  includePricing?: boolean;
  includeTestimonials?: boolean;
  includeFAQ?: boolean;
  language?: string;
  attachmentText?: string;
  images?: Array<{ url: string; role: string; alt: string }>;
}

export const useLandingPages = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['landingPages', companyId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: LandingPage[]; count: number }>(
        `/landing-pages?companyId=${companyId}`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useLandingPage = (pageId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['landingPage', pageId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: LandingPage }>(
        `/landing-pages/${pageId}`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!pageId,
  });
};

export const useGenerateLandingPage = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GeneratePageInput) => {
      return api.post<{ success: boolean; data: LandingPage; message: string }>(
        '/landing-pages/generate',
        data,
        { token: token! }
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['landingPages', variables.companyId] });
    },
  });
};

export const useUpdateLandingPageStatus = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId, status }: { pageId: string; status: string }) => {
      return api.patch<{ success: boolean; data: LandingPage }>(
        `/landing-pages/${pageId}/status`,
        { status },
        { token: token! }
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['landingPage', result.data.id] });
      queryClient.invalidateQueries({ queryKey: ['landingPages'] });
    },
  });
};

export const useDeleteLandingPage = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      return api.delete(`/landing-pages/${pageId}`, { token: token! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landingPages'] });
    },
  });
};

export const useUpdateLandingPageSections = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      sections,
      pageSettings,
    }: {
      pageId: string;
      sections: Array<{
        id?: string;
        type: string;
        content: Record<string, unknown>;
        order: number;
        isVisible?: number;
        backgroundColor?: string | null;
        customStyles?: Record<string, string> | null;
      }>;
      pageSettings: {
        primaryColor: string;
        secondaryColor?: string | null;
      };
    }) => {
      return api.put<{ success: boolean; data: LandingPage }>(
        `/landing-pages/${pageId}/editor`,
        { sections, pageSettings },
        { token: token! }
      );
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['landingPage', result.data.id] });
      queryClient.invalidateQueries({ queryKey: ['landingPages'] });
    },
  });
};

export const useLandingPageLeads = (pageId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['landingPageLeads', pageId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: LandingPageLead[]; count: number }>(
        `/landing-pages/${pageId}/leads`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!pageId,
  });
};

export const useUpdateLeadStatus = () => {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId, leadId, status, notes }: { pageId: string; leadId: string; status: string; notes?: string }) => {
      return api.patch<{ success: boolean; data: LandingPageLead }>(
        `/landing-pages/${pageId}/leads/${leadId}/status`,
        { status, notes },
        { token: token! }
      );
    },
    onSuccess: (_, { pageId }) => {
      queryClient.invalidateQueries({ queryKey: ['landingPageLeads', pageId] });
    },
  });
};

export const useLandingPageAnalytics = (pageId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['landingPageAnalytics', pageId],
    queryFn: async () => {
      const result = await api.get<{
        success: boolean;
        data: {
          pageId: string;
          totalVisitors: number;
          totalLeads: number;
          conversionRate: string;
        };
      }>(`/landing-pages/${pageId}/analytics`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!pageId,
  });
};

// ==================== AI GROWTH ENGINE DASHBOARD HOOKS ====================

export interface PipelineStatus {
  intelligence: {
    keywords: number;
    trends: number;
    competitors: number;
    painPoints: number;
    status: 'pending' | 'running' | 'done';
    lastRun?: string;
  };
  generation: {
    total: number;
    completed: number;
    inProgress: number;
    queued: number;
    status: 'idle' | 'active' | 'done';
  };
  deployment: {
    live: number;
    building: number;
    queued: number;
    failed: number;
  };
  liveMetrics: {
    avgRank: number;
    top10: number;
    top30: number;
    improving: number;
    declining: number;
    stable: number;
  };
  dataCollection: {
    impressions: number;
    clicks: number;
    ctr: number;
    lastSync?: string;
  };
  optimizationLoop: {
    active: boolean;
    pagesOptimizing: number;
    lastRun?: string;
  };
}

export interface GrowthAgentStatus {
  id: string;
  name: string;
  role: string;
  emoji: string;
  status: 'idle' | 'working' | 'analyzing' | 'waiting' | 'error';
  progress: number;
  currentTask?: string;
  tasksCompleted: number;
  tasksTotal: number;
}

export interface OptimizingPage {
  pageId: string;
  slug: string;
  keyword: string;
  issue: string;
  action: string;
  progress: number;
  eta?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: 'deploy' | 'optimize' | 'rank_change' | 'generate' | 'intel' | 'agent' | 'error';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ContentPipelinePage {
  id: string;
  slug: string;
  status: 'live' | 'building' | 'queued' | 'draft' | 'failed';
  keyword?: string;
  rank?: number;
  lastDeployed?: string;
}

export interface GrowthDashboardOverview {
  companyId: string;
  companyName: string;
  engineStatus: 'active' | 'paused' | 'error';
  lastSync: string;
  pipeline: PipelineStatus;
  agents: GrowthAgentStatus[];
  optimizationLoop: {
    currentlyOptimizing: OptimizingPage[];
    stats: {
      optimizedLast7Days: number;
      avgRankImprovement: number;
    };
  };
  activityLog: ActivityLogEntry[];
  contentPipeline: {
    pages: ContentPipelinePage[];
  };
  quickStats: {
    totalPages: number;
    pagesLive: number;
    avgRank: number;
    totalImpressions: number;
    totalClicks: number;
    activeAgents: number;
    tasksCompleted: number;
  };
}

export const useGrowthDashboard = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['growthDashboard', companyId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: GrowthDashboardOverview }>(
        `/dashboard/company/${companyId}/overview`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

export const useGrowthPipeline = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['growthPipeline', companyId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: PipelineStatus }>(
        `/dashboard/company/${companyId}/pipeline`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
    refetchInterval: 15000, // Refresh every 15 seconds
  });
};

export const useGrowthActivityLog = (companyId: string, limit = 20) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['growthActivityLog', companyId, limit],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: ActivityLogEntry[] }>(
        `/dashboard/company/${companyId}/activity?limit=${limit}`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
};

export const useGrowthOptimizationLoop = (companyId: string) => {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ['growthOptimizationLoop', companyId],
    queryFn: async () => {
      const result = await api.get<{
        success: boolean;
        data: {
          currentlyOptimizing: OptimizingPage[];
          stats: { optimizedLast7Days: number; avgRankImprovement: number };
        };
      }>(`/dashboard/company/${companyId}/optimization-loop`, { token: token! });
      return result.data;
    },
    enabled: !!token && !!companyId,
    refetchInterval: 20000,
  });
};

// ============================================
// GAMIFICATION — CEO Motivation Engine
// ============================================

export type ScoreTrend = 'up' | 'down' | 'stable';

export interface SubScore {
  score: number;
  breakdown: Record<string, number>;
  trend: ScoreTrend;
}

export interface GrowthScoreData {
  overall: number;
  subscores: {
    marketing: SubScore;
    seo: SubScore;
    automation: SubScore;
    revenue: SubScore;
  };
  previousOverall: number | null;
  level: number;
  computedAt: string;
}

export interface MissionItem {
  id: string;
  title: string;
  why: string;
  impact: string;
  category: 'growth' | 'automation' | 'content' | 'revenue' | 'optimization';
  link: string;
  status: 'pending' | 'completed' | 'skipped';
  completedAt: string | null;
}

export interface MissionsData {
  id: string;
  date: string;
  missions: MissionItem[];
  completedCount: number;
  totalCount: number;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  totalMissionsCompleted: number;
}

export const useGrowthScore = (companyId: string) => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['gamification', 'growth-score', companyId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: GrowthScoreData }>(
        `/gamification/${companyId}/growth-score`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useDailyMissions = (companyId: string) => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['gamification', 'missions', companyId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: MissionsData }>(
        `/gamification/${companyId}/missions`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useStreak = (companyId: string) => {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['gamification', 'streak', companyId],
    queryFn: async () => {
      const result = await api.get<{ success: boolean; data: StreakData }>(
        `/gamification/${companyId}/streak`,
        { token: token! }
      );
      return result.data;
    },
    enabled: !!token && !!companyId,
  });
};

export const useCompleteMission = (companyId: string) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (missionId: string) => {
      return api.post<{ success: boolean; data: { mission: MissionItem; streak: StreakData } }>(
        `/gamification/${companyId}/missions/${missionId}/complete`,
        undefined,
        { token: token! }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification', 'missions', companyId] });
      queryClient.invalidateQueries({ queryKey: ['gamification', 'streak', companyId] });
    },
  });
};

export const useSkipMission = (companyId: string) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (missionId: string) => {
      return api.post<{ success: boolean; data: { mission: MissionItem } }>(
        `/gamification/${companyId}/missions/${missionId}/skip`,
        undefined,
        { token: token! }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification', 'missions', companyId] });
    },
  });
};
