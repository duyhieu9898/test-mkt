# AI Company OS - Project Guidelines

## Project Vision
Building an AI Operating System for Companies - enabling a single human founder to run an entire company powered by autonomous AI agents.

---

## Core Principles

### 1. Architecture First
- **Microservices Architecture**: Each system component is independently deployable
- **Event-Driven Design**: All inter-service communication via events/messages
- **Domain-Driven Design (DDD)**: Clear bounded contexts for each business domain
- **CQRS Pattern**: Separate read/write operations for scalability

### 2. Code Quality Standards
- **No Hardcoding**: All configurations via environment variables or config files
- **Type Safety**: Full TypeScript strict mode, Pydantic models for Python
- **Interface-First**: Define contracts before implementations
- **Dependency Injection**: Loose coupling, easy testing and swapping

### 3. Extensibility Rules
- **Plugin Architecture**: New agents/tools added without core changes
- **Feature Flags**: Gradual rollout, A/B testing capabilities
- **Versioned APIs**: All APIs versioned (v1, v2...) for backward compatibility
- **Schema Migrations**: Database changes via migration files only

### 4. AI Agent Design
- **Agent as Microservice**: Each agent type is an independent service
- **Stateless Execution**: Agent state stored externally (DB/Redis)
- **Observable**: Full tracing, logging, metrics for all agent actions
- **Evolvable**: Agents can improve via prompt evolution system

### 5. Security & Governance
- **Zero Trust**: All services authenticate, no implicit trust
- **Budget Enforcement**: Hard limits on spending, automatic throttling
- **Audit Trail**: Every action logged with full context
- **Human-in-the-Loop**: Critical decisions require human approval

---

## Tech Stack (2024-2025)

### Backend
```
Language:        TypeScript (primary), Python (AI/ML)
Runtime:         Node.js 20+, Python 3.12+
Framework:       Hono (ultra-fast), FastAPI (Python AI services)
ORM:             Drizzle ORM (TypeScript), SQLAlchemy 2.0 (Python)
Validation:      Zod (TS), Pydantic v2 (Python)
```

### AI & Agents
```
Orchestration:   Temporal.io (workflow engine)
Agent Framework: Custom + LangGraph integration
LLM:             Claude (primary), GPT-4 (fallback), local models
Vector DB:       Qdrant (self-hosted) or Pinecone (managed)
Embeddings:      OpenAI Ada-002, Cohere, local models
```

### Data Layer
```
Primary DB:      PostgreSQL 16+ with pgvector
Cache:           Redis 7+ (Valkey compatible)
Message Queue:   Redis Streams / BullMQ
Search:          Meilisearch or Elasticsearch
Time Series:     TimescaleDB (for metrics)
```

### Frontend
```
Framework:       Next.js 14+ (App Router)
UI Library:      shadcn/ui + Radix primitives
Styling:         Tailwind CSS 4
State:           Zustand + React Query (TanStack)
Real-time:       Socket.io / Server-Sent Events
Voice:           Web Speech API + Whisper
```

### Infrastructure
```
Container:       Docker + Docker Compose (dev)
Orchestration:   Kubernetes (production)
IaC:             Pulumi (TypeScript) or Terraform
CI/CD:           GitHub Actions
Monitoring:      OpenTelemetry + Grafana stack
```

---

## Project Structure

```
1person/
├── apps/                    # Application packages
│   ├── api/                 # Main API gateway (Hono)
│   ├── web/                 # Frontend (Next.js)
│   ├── worker/              # Background job processor
│   └── cli/                 # CLI tools
│
├── packages/                # Shared libraries
│   ├── core/                # Core business logic
│   ├── agents/              # Agent definitions & runtime
│   ├── orchestrator/        # Task & workflow orchestration
│   ├── memory/              # Memory & knowledge systems
│   ├── integrations/        # External service connectors
│   ├── ui/                  # Shared UI components
│   └── config/              # Shared configs (tsconfig, etc.)
│
├── services/                # Microservices
│   ├── company-brain/       # CEO Agent & strategic planning
│   ├── agent-runtime/       # Agent execution environment
│   ├── evaluation/          # Performance evaluation system
│   ├── evolution/           # Agent improvement system
│   └── marketplace/         # Skills & agent marketplace
│
├── infrastructure/          # IaC & deployment
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
│
├── docs/                    # Documentation
│   ├── architecture/
│   ├── api/
│   └── guides/
│
└── tools/                   # Development tools & scripts
```

---

## Development Rules

### Git Workflow
- `main`: Production-ready code only
- `develop`: Integration branch
- Feature branches: `feature/TICKET-description`
- Hotfix branches: `hotfix/TICKET-description`

### Commit Convention
```
feat(scope): add new feature
fix(scope): fix bug
refactor(scope): code refactoring
docs(scope): documentation
test(scope): add/update tests
chore(scope): maintenance
```

### PR Requirements
- [ ] All tests pass
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Documentation updated
- [ ] Changelog updated (for features)

---

## Agent Development Guidelines

### Agent Structure
```typescript
interface AgentDefinition {
  id: string;
  role: AgentRole;
  department: Department;
  capabilities: Capability[];
  tools: Tool[];
  kpiTargets: KPITarget[];
  promptTemplate: PromptTemplate;
  memoryConfig: MemoryConfig;
  budgetLimits: BudgetLimits;
}
```

### Agent Lifecycle
1. **Spawn**: Create agent with initial config
2. **Initialize**: Load memory, connect tools
3. **Execute**: Process tasks in queue
4. **Evaluate**: Measure performance against KPIs
5. **Evolve**: Improve based on evaluation
6. **Terminate/Upgrade**: End or upgrade agent

### Communication Protocol
- All agent communication via structured messages
- Messages stored for audit trail
- Async by default, sync when necessary

---

## Performance Targets

| Metric | Target |
|--------|--------|
| API Response (p99) | < 200ms |
| Agent Task Start | < 5s |
| Dashboard Load | < 2s |
| Concurrent Agents | 1000+ per company |
| Message Throughput | 10k/sec |

---

## Remember

1. **Think Scale**: Design for 10x current requirements
2. **Fail Gracefully**: Every operation should have fallback
3. **Observe Everything**: If it's not measured, it doesn't exist
4. **Document Decisions**: ADRs for significant choices
5. **Security First**: Never trust input, always validate
6. **User Experience**: Non-technical users are primary audience

---

*Last Updated: 2025-03-13*
*Version: 0.1.0*
