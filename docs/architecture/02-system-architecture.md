# System Architecture - AI Company OS

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Web App    │  │  Mobile App  │  │     CLI      │  │   Voice UI   │     │
│  │  (Next.js)   │  │   (React)    │  │  (Node.js)   │  │  (Whisper)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY (Hono)                              │
│  • Authentication (JWT/OAuth)  • Rate Limiting  • Request Routing           │
│  • API Versioning              • CORS          • Request Validation         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE SERVICES LAYER                                │
├──────────────────┬──────────────────┬──────────────────┬────────────────────┤
│ Natural Command  │   Company Brain  │ Agent Orchestrator│   Task Engine     │
│    Service       │    Service       │    Service        │    Service        │
├──────────────────┼──────────────────┼──────────────────┼────────────────────┤
│ • Intent Parse   │ • CEO Agent      │ • Agent Lifecycle │ • Task Graph      │
│ • NLU Pipeline   │ • Strategy Plan  │ • Message Router  │ • Dependencies    │
│ • Command Parse  │ • Budget Alloc   │ • Load Balancer   │ • Scheduling      │
│ • Context Build  │ • Dept Mgmt      │ • Health Monitor  │ • Execution       │
└──────────────────┴──────────────────┴──────────────────┴────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENT RUNTIME LAYER                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   CEO    │ │Marketing │ │ Content  │ │   Ads    │ │  Sales   │   ...    │
│  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    Agent Runtime Engine                             │     │
│  │  • Prompt Injection  • Tool Execution  • Memory Access  • Tracing  │     │
│  └────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION LAYER                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Meta Ads │ │Google Ads│ │ Mailchimp│ │ Stripe   │ │ Shopify  │   ...    │
│  │Connector │ │Connector │ │Connector │ │Connector │ │Connector │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTELLIGENCE LAYER                                   │
├──────────────────┬──────────────────┬──────────────────┬────────────────────┤
│  Memory System   │ Evaluation System│ Evolution System │ Simulation Engine  │
├──────────────────┼──────────────────┼──────────────────┼────────────────────┤
│ • Vector Store   │ • KPI Tracker    │ • Prompt Optim   │ • Scenario Test    │
│ • Knowledge Base │ • Scoring Engine │ • A/B Testing    │ • Risk Analysis    │
│ • Semantic Search│ • Benchmarking   │ • Genetic Algo   │ • Forecasting      │
└──────────────────┴──────────────────┴──────────────────┴────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
├──────────────────┬──────────────────┬──────────────────┬────────────────────┤
│   PostgreSQL     │     Redis        │    Qdrant        │   Object Storage   │
├──────────────────┼──────────────────┼──────────────────┼────────────────────┤
│ • Companies      │ • Session Cache  │ • Embeddings     │ • Documents        │
│ • Agents         │ • Task Queue     │ • Semantic Index │ • Media Files      │
│ • Tasks          │ • Real-time Data │ • Memory Vectors │ • Reports          │
│ • Audit Logs     │ • Pub/Sub        │ • Knowledge Base │ • Backups          │
└──────────────────┴──────────────────┴──────────────────┴────────────────────┘
```

---

## Tech Stack

### Backend
| Layer | Technology |
|-------|------------|
| Language | TypeScript (primary), Python (AI/ML) |
| Runtime | Node.js 20+, Python 3.12+ |
| Framework | Hono (API), FastAPI (AI services) |
| ORM | Drizzle ORM (TypeScript) |
| Validation | Zod, Pydantic v2 |

### AI & Agents
| Layer | Technology |
|-------|------------|
| Orchestration | Temporal.io |
| LLM | Claude (primary), GPT-4 (fallback) |
| Vector DB | Qdrant or pgvector |
| Embeddings | OpenAI Ada-002 |

### Data
| Layer | Technology |
|-------|------------|
| Primary DB | PostgreSQL 16+ |
| Cache | Redis 7+ |
| Message Queue | Redis Streams / BullMQ |
| Search | Meilisearch |

### Frontend
| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| UI | shadcn/ui + Radix |
| Styling | Tailwind CSS 4 |
| State | Zustand + React Query |
| Real-time | Socket.io |

---

## Component Details

### 1. Natural Command Service
Converts human language into structured goals.

```
User Input → Intent Classification → Entity Extraction → Task Graph
```

### 2. Company Brain Service
- Strategic planning and goal decomposition
- Budget allocation across departments
- Department and agent creation

### 3. Agent Orchestrator
- Agent lifecycle management
- Inter-agent message routing
- Health monitoring and recovery

### 4. Task Engine
- Task graph management
- Dependency resolution
- Parallel execution coordination

### 5. Memory System
```
┌───────────────┬───────────────┬───────────────┐
│  Short-term   │  Long-term    │  Semantic     │
│  (Redis)      │  (Postgres)   │  (Qdrant)     │
├───────────────┼───────────────┼───────────────┤
│ • Task ctx    │ • Agent hist  │ • Knowledge   │
│ • Session     │ • Documents   │ • Concepts    │
│ • Working mem │ • Learnings   │ • Embeddings  │
└───────────────┴───────────────┴───────────────┘
```

### 6. Evolution System
Genetic Algorithm for agent improvement:
- Create prompt variants
- Test against KPIs
- Select best performing
- Mutate and repeat

---

## Communication Patterns

### Event-Driven (Redis Streams)
```typescript
type EventType =
  | 'agent.spawned'
  | 'agent.started'
  | 'task.created'
  | 'task.completed'
  | 'budget.exceeded';
```

---

## Security Layers

1. **Edge Security**: WAF, DDoS Protection, Rate Limiting
2. **Authentication**: JWT, OAuth2/SSO
3. **Authorization**: RBAC, Resource-level permissions
4. **Data Security**: AES-256 at rest, TLS 1.3 in transit
5. **Audit**: Full audit trail, Anomaly detection

---

*Document Version: 1.0*
*Last Updated: 2025-03-13*
