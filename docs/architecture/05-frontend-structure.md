# Frontend Architecture - AI Company OS

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript 5.3+ |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui + Radix |
| State | Zustand + React Query |
| Forms | React Hook Form + Zod |
| Real-time | Socket.io-client |
| Charts | Recharts / Tremor |
| Voice | Web Speech API |

---

## Project Structure

```
apps/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── [companyId]/
│   │   │   │   ├── page.tsx          # Dashboard
│   │   │   │   ├── agents/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [agentId]/page.tsx
│   │   │   │   ├── tasks/
│   │   │   │   ├── reports/
│   │   │   │   ├── settings/
│   │   │   │   └── layout.tsx
│   │   │   │
│   │   │   ├── companies/
│   │   │   │   ├── page.tsx
│   │   │   │   └── new/page.tsx
│   │   │   │
│   │   │   └── layout.tsx
│   │   │
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── ...
│   │   │
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── mobile-nav.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── metrics-card.tsx
│   │   │   ├── activity-feed.tsx
│   │   │   └── kpi-chart.tsx
│   │   │
│   │   ├── agents/
│   │   │   ├── agent-card.tsx
│   │   │   ├── agent-list.tsx
│   │   │   ├── agent-status.tsx
│   │   │   └── agent-chat.tsx
│   │   │
│   │   ├── tasks/
│   │   │   ├── task-board.tsx
│   │   │   ├── task-card.tsx
│   │   │   └── task-graph.tsx
│   │   │
│   │   ├── command/
│   │   │   ├── command-input.tsx
│   │   │   ├── command-suggestions.tsx
│   │   │   └── voice-input.tsx
│   │   │
│   │   └── setup/
│   │       ├── setup-wizard.tsx
│   │       └── step-*.tsx
│   │
│   ├── hooks/
│   │   ├── use-company.ts
│   │   ├── use-agents.ts
│   │   ├── use-tasks.ts
│   │   ├── use-command.ts
│   │   ├── use-websocket.ts
│   │   └── use-voice.ts
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── companies.ts
│   │   │   ├── agents.ts
│   │   │   └── tasks.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── cn.ts
│   │   │   └── format.ts
│   │   │
│   │   └── websocket.ts
│   │
│   ├── stores/
│   │   ├── auth-store.ts
│   │   ├── company-store.ts
│   │   └── ui-store.ts
│   │
│   └── types/
│       ├── company.ts
│       ├── agent.ts
│       └── task.ts
│
├── public/
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## Key Components

### Command Input (Main Interface)
```tsx
// components/command/command-input.tsx
export function CommandInput({ companyId, onResult }) {
  const [input, setInput] = useState('');
  const { execute, isLoading, suggestions } = useCommand(companyId);
  const { isListening, startListening, transcript } = useVoice();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await execute(input);
    onResult?.(result);
    setInput('');
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          className="w-full px-4 py-3 rounded-lg border"
        />
        <VoiceButton isListening={isListening} onStart={startListening} />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
      {suggestions.length > 0 && (
        <CommandSuggestions suggestions={suggestions} onSelect={setInput} />
      )}
    </div>
  );
}
```

### Agent Card
```tsx
// components/agents/agent-card.tsx
export function AgentCard({ agent, onSelect }) {
  return (
    <div className="p-4 rounded-lg border hover:shadow-md cursor-pointer"
         onClick={() => onSelect?.(agent)}>
      <div className="flex items-start gap-4">
        <Avatar src={agent.avatarUrl} name={agent.name} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{agent.name}</h3>
            <AgentStatus status={agent.status} />
          </div>
          <Badge>{formatRole(agent.role)}</Badge>
          <div className="flex gap-4 mt-2 text-sm text-muted">
            <span>Score: {agent.performanceScore || '-'}</span>
            <span>Tasks: {agent.tasksCompleted}</span>
          </div>
        </div>
        <AgentActions agent={agent} />
      </div>
    </div>
  );
}
```

---

## State Management

### Zustand Store
```typescript
// stores/company-store.ts
export const useCompanyStore = create<CompanyState>()(
  devtools(
    persist(
      (set) => ({
        currentCompany: null,
        agents: [],
        tasks: [],

        setCompany: (company) => set({ currentCompany: company }),
        setAgents: (agents) => set({ agents }),
        addAgent: (agent) => set((state) => ({
          agents: [...state.agents, agent]
        })),
        updateAgent: (id, updates) => set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),
        reset: () => set(initialState),
      }),
      { name: 'company-store' }
    )
  )
);
```

### React Query Hooks
```typescript
// hooks/use-agents.ts
export function useAgents(companyId: string) {
  return useQuery({
    queryKey: ['agents', companyId],
    queryFn: () => api.agents.list(companyId),
    staleTime: 30_000,
  });
}

export function useCreateAgent(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.agents.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', companyId] });
    },
  });
}
```

---

## Real-time Updates

```typescript
// hooks/use-websocket.ts
export function useWebSocket(companyId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { channel: `company:${companyId}` }
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'event') {
        // Invalidate React Query cache
        handleRealtimeUpdate(message, queryClient);
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [companyId]);
}
```

---

## Voice Interface

```typescript
// hooks/use-voice.ts
export function useVoice(options = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = useCallback(() => {
    const SpeechRecognition = window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      if (event.results[0].isFinal) {
        options.onResult?.(text);
      }
    };

    recognition.start();
    setIsListening(true);
  }, []);

  return { isListening, transcript, startListening };
}
```

---

## Performance

1. **Server Components**: Data fetching on server
2. **Streaming**: Suspense for progressive loading
3. **React Query**: Caching and background updates
4. **Code Splitting**: Dynamic imports
5. **Image Optimization**: Next.js Image
6. **Prefetching**: Link prefetch

---

*Document Version: 1.0*
*Last Updated: 2025-03-13*
