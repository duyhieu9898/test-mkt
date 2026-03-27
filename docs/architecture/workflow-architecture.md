# AI Company OS - Workflow Architecture

> Last Updated: 2025-03-13 | Version: 2.0.0

## Overview

This document describes the complete workflow architecture of the AI Company OS platform. The system transforms a single founder's objectives into autonomous AI agent execution through a unified workflow with **CEO Reasoning Loop** (plan → act → reflect).

## High-Level Flow

```
User/Founder → CEO Agent (Reasoning Loop) → Company State → Orchestrator → Task Graph → Agents → Execution → Metrics → Memory → Reflection
```

## CEO Reasoning Loop

The CEO Agent uses a multi-step reasoning process:

```
┌─────────────────────────────────────────────────────────────┐
│                 CEO REASONING LOOP                          │
│                                                             │
│   ┌─────────┐      ┌─────────┐      ┌─────────────┐        │
│   │  PLAN   │ ──►  │   ACT   │ ──►  │   REFLECT   │        │
│   └─────────┘      └─────────┘      └─────────────┘        │
│        │                                    │               │
│        │                                    │               │
│        ▼                                    ▼               │
│   • Situation Analysis (SWOT)         • Outcome Analysis   │
│   • Strategic Goals Definition        • Learning Extraction│
│   • Strategy Formulation              • Strategy Adjustment│
│   • Risk Assessment                   • Next Cycle Recs    │
│                                                             │
│   ◄───────────── Feedback Loop ────────────────────────────│
└─────────────────────────────────────────────────────────────┘
```

### Phase Details:

1. **PLAN Phase**
   - **Situation Analysis**: SWOT analysis of current company state
   - **Goal Definition**: Define 3-5 strategic goals based on situation
   - **Strategy Formulation**: Create initiatives with resource allocation
   - **Risk Assessment**: Identify risks and mitigation strategies

2. **ACT Phase**
   - **Execute Initiatives**: Delegate tasks to appropriate agents
   - **Risk Mitigation**: Send alerts for high-probability/high-impact risks
   - **Notify Stakeholders**: Alert users about urgent issues

3. **REFLECT Phase**
   - **Outcome Analysis**: Measure goal achievement against metrics
   - **Learning Extraction**: Identify patterns, lessons, insights
   - **Strategy Adjustment**: Recommend changes for improvement
   - **Next Cycle Recommendations**: Prepare for next reasoning cycle

## Complete Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER / FOUNDER                           │
│                    (Web UI / API / CLI)                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │ objective/command
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WORKFLOW RUNNER                            │
│              (workflow-runner.ts - Entry Point)                 │
│                                                                 │
│  • runFullWorkflow()      - Complete objective processing       │
│  • runStrategicWorkflow() - CEO-level strategic ops             │
│  • runOperationalWorkflow() - Day-to-day execution              │
│  • runMaintenanceWorkflow() - Agent improvement & cleanup       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│  CEO BRAIN      │ │ COMPANY     │ │ AGENT           │
│  (ceo-brain.ts) │ │ STATE       │ │ ORCHESTRATOR    │
│                 │ │ ENGINE      │ │ (orchestrator)  │
│ • CEO Brief     │◄┤             │►│                 │
│ • Strategy      │ │ • Health    │ │ • Assignment    │
│ • Decisions     │ │ • Budget    │ │ • Workload      │
│ • Priorities    │ │ • Metrics   │ │ • Coordination  │
└────────┬────────┘ │ • Alerts    │ └────────┬────────┘
         │          └─────────────┘          │
         │                                   │
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GOAL DECOMPOSITION                           │
│                  (goal-decomposition.ts)                        │
│                                                                 │
│  High-Level Objective → Subtasks with Dependencies              │
│  • LLM-powered decomposition                                    │
│  • Auto-dependency detection                                    │
│  • Agent capability matching                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TASK GRAPH ENGINE                            │
│                     (task-graph.ts)                             │
│                                                                 │
│  • Build DAG from tasks                                         │
│  • Cycle detection (Kahn's algorithm)                           │
│  • Parallel execution with concurrency control                  │
│  • Dependency resolution                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AGENTS                                   │
│                    (agent-runtime.ts)                           │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │   CEO   │  │Marketing│  │  Sales  │  │ Support │  ...       │
│  │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                  │
│       └────────────┴─────┬──────┴────────────┘                  │
│                          │                                      │
│            COMMUNICATION PROTOCOL                               │
│           (agent-communication.ts)                              │
│                                                                 │
│  Structured Messages: {sender, receiver, goal,                  │
│                        context, constraints, expectedOutput}    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTION LAYER                              │
│                    (agent-runtime.ts)                           │
│                                                                 │
│  • Task execution with LLM                                      │
│  • Budget checking                                              │
│  • Memory-enhanced prompts                                      │
│  • Action logging                                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│  MEMORY SYSTEM  │ │ EVALUATION  │ │ AGENT EVOLUTION │
│   (memory.ts)   │ │(evaluation) │ │(self-improvement)│
│                 │ │             │ │                 │
│ • pgvector      │ │ • KPIs      │ │ • Prompt A/B    │
│ • Embeddings    │ │ • ROI       │ │ • Skill updates │
│ • RAG search    │ │ • Metrics   │ │ • Auto-improve  │
│ • Learnings     │ │ • Scoring   │ │ • Retirement    │
└────────┬────────┘ └──────┬──────┘ └────────┬────────┘
         │                 │                 │
         └────────────────┬┴─────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AUTO-SPAWN                                 │
│                    (auto-spawn.ts)                              │
│                                                                 │
│  • Workload analysis                                            │
│  • Agent templates (marketer, sales, researcher, etc.)          │
│  • Dynamic agent creation                                       │
│  • Underperformer retirement                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   FEEDBACK LOOP       │
              │   (Back to CEO Agent) │
              └───────────────────────┘
```

## Layer Descriptions

### 1. User/Founder Layer
- Entry point for human interaction
- Web UI, API, or CLI interfaces
- Submits objectives, commands, and receives reports

### 2. Workflow Runner Layer
- **File**: `apps/worker/src/services/workflow-runner.ts`
- Main orchestration entry point
- Four workflow types:
  - `runFullWorkflow()` - Complete objective processing
  - `runStrategicWorkflow()` - CEO-level operations
  - `runOperationalWorkflow()` - Day-to-day execution
  - `runMaintenanceWorkflow()` - Agent improvement

### 3. Strategic Layer

#### CEO Brain
- **File**: `apps/worker/src/services/ceo-brain.ts`
- Strategic decision making
- Generates daily CEO briefs
- Sets company priorities
- Auto-executes approved decisions

#### Company State Engine
- **File**: `apps/worker/src/services/company-state-engine.ts`
- Real-time company state snapshot
- Health indicators (0-100)
- Budget tracking
- Performance metrics
- Alert management

### 4. Orchestration Layer

#### Agent Orchestrator
- **File**: `apps/worker/src/services/agent-orchestrator.ts`
- Coordinates all agent activities
- Task-to-agent assignment
- Workload balancing
- Execution monitoring

#### Goal Decomposition
- **File**: `apps/worker/src/services/goal-decomposition.ts`
- LLM-powered objective breakdown
- Auto-dependency detection
- Agent capability matching

### 5. Task Graph Layer
- **File**: `apps/worker/src/services/task-graph.ts`
- Directed Acyclic Graph (DAG) execution
- Cycle detection (Kahn's algorithm)
- Parallel execution with concurrency control
- Dependency resolution

### 6. Agent Layer

#### Agent Runtime
- **File**: `apps/worker/src/services/agent-runtime.ts`
- Individual task execution
- LLM integration
- Budget checking
- Memory-enhanced prompts

#### Communication Protocol
- **File**: `apps/worker/src/services/agent-communication.ts`
- Structured messaging between agents
- Message format:
  ```typescript
  {
    sender: string;
    receiver: string;
    goal: string;
    context: {...};
    constraints: {...};
    expectedOutput: {...};
    content: {
      summary: string;
      details: string;
      actions: [...];
      recommendations: [...];
    };
  }
  ```

### 7. Memory Layer
- **File**: `apps/worker/src/services/memory.ts`
- pgvector for semantic search
- OpenAI embeddings (ada-002)
- Memory types: task_result, strategy, failure_lesson, etc.
- Memory consolidation and decay

### 8. Evaluation Layer
- **File**: `apps/worker/src/services/evaluation.ts`
- Agent performance assessment
- KPI tracking
- ROI metrics
- Success rate analysis

### 9. Evolution Layer

#### Self-Improvement
- **File**: `apps/worker/src/services/self-improvement.ts`
- Automated prompt evolution
- A/B testing for prompts
- Capability updates
- Performance trend analysis

#### Auto-Spawn
- **File**: `apps/worker/src/services/auto-spawn.ts`
- Dynamic agent creation
- Workload-based spawning
- Agent templates
- Underperformer retirement

## Workflow Schedules

| Workflow | Interval | Purpose |
|----------|----------|---------|
| Operational | 5 minutes | Task execution, communication, rebalancing |
| Strategic | 1 hour | CEO brief, strategic decisions, priorities |
| Maintenance | 24 hours | Evolution, evaluation, cleanup |

## Database Schemas

### Core Schemas
- `users` - User accounts
- `companies` - Company configurations
- `agents` - AI agent definitions
- `tasks` - Task management
- `departments` - Organizational structure

### Memory Schemas
- `agent_memories` - Agent learnings with vector embeddings
- `knowledge_base` - Company-wide knowledge
- `memory_associations` - Related memories

### State Schemas
- `company_state` - Real-time company snapshot
- `company_state_history` - Historical trend data
- `strategic_objectives` - High-level goals

### Communication Schemas
- `agent_messages` - Structured agent communication
- `collaboration_sessions` - Multi-agent collaboration
- `agent_relationships` - Working relationship tracking

## Key Design Principles

1. **State-First Decision Making**: CEO Agent always reads Company State before decisions
2. **Structured Communication**: Agents use protocol, not free text
3. **Goal-Task Hierarchy**: Objectives → Task Graphs → Tasks
4. **Continuous Learning**: Memory system feeds back into agent prompts
5. **Autonomous Evolution**: Agents improve without human intervention

## File Structure

```
apps/worker/src/
├── services/
│   ├── index.ts                  # Service exports
│   ├── workflow-runner.ts        # Main entry point
│   ├── company-state-engine.ts   # State management
│   ├── ceo-brain.ts              # Strategic decisions
│   ├── ceo-reasoning-loop.ts     # Plan → Act → Reflect cycle
│   ├── agent-orchestrator.ts     # Agent coordination
│   ├── goal-decomposition.ts     # Objective breakdown
│   ├── task-graph.ts             # DAG execution
│   ├── agent-runtime.ts          # Task execution
│   ├── agent-communication.ts    # Structured messaging
│   ├── memory.ts                 # Vector memory
│   ├── evaluation.ts             # Performance assessment
│   ├── evolution.ts              # Agent evolution
│   ├── self-improvement.ts       # Autonomous improvement
│   ├── auto-spawn.ts             # Dynamic agent creation
│   └── collaboration.ts          # Multi-agent collaboration
├── lib/
│   ├── llm.ts                    # LLM integration
│   ├── embeddings.ts             # Vector embeddings
│   ├── queue.ts                  # Job queues
│   └── ...
└── jobs/
    ├── task-processor.ts
    ├── command-processor.ts
    └── evaluation-processor.ts

packages/core/src/db/schema/
├── index.ts
├── users.ts
├── companies.ts
├── agents.ts
├── tasks.ts
├── memory.ts
├── company-state.ts
├── agent-communication.ts
└── ...
```

## Usage Example

```typescript
import { runFullWorkflow, initializeWorkflowSystem } from './services/workflow-runner';

// Initialize for a new company
await initializeWorkflowSystem(companyId);

// Process an objective
const result = await runFullWorkflow(companyId, {
  type: 'objective',
  title: 'Launch Q2 Marketing Campaign',
  description: 'Create and execute a comprehensive marketing campaign for Q2',
  priority: 'high',
  deadline: new Date('2025-06-30'),
  initiator: 'user',
});

console.log(result);
// {
//   success: true,
//   stage: 'completed',
//   data: {
//     objectiveId: 'uuid',
//     taskGraphId: 'uuid',
//     assignments: 5,
//   },
//   errors: [],
//   duration: 12500,
// }
```

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project guidelines
- [API Documentation](../api/) - API endpoints
- [Database Schema](../database/) - Full schema documentation
