# API Design - AI Company OS

## Overview

RESTful API with OpenAPI 3.1 specification.
**Base URL**: `https://api.1person.ai/v1`

---

## Authentication

```yaml
POST   /auth/register          # Register new user
POST   /auth/login             # Login
POST   /auth/logout            # Logout
POST   /auth/refresh           # Refresh token
GET    /auth/me                # Get current user
POST   /auth/oauth/{provider}  # OAuth login
```

---

## Companies API

```yaml
POST   /companies                    # Create company
GET    /companies                    # List companies
GET    /companies/:id                # Get company
PATCH  /companies/:id                # Update company
DELETE /companies/:id                # Archive company

POST   /companies/:id/generate-plan  # Generate business plan
GET    /companies/:id/org-chart      # Get org chart
POST   /companies/:id/launch         # Launch company
POST   /companies/:id/pause          # Pause operations

GET    /companies/:id/dashboard      # Dashboard data
GET    /companies/:id/metrics        # Metrics summary
GET    /companies/:id/reports        # List reports
```

---

## Agents API

```yaml
POST   /companies/:companyId/agents            # Create agent
GET    /companies/:companyId/agents            # List agents
GET    /companies/:companyId/agents/:id        # Get agent
PATCH  /companies/:companyId/agents/:id        # Update agent
DELETE /companies/:companyId/agents/:id        # Delete agent

POST   /companies/:companyId/agents/:id/start   # Start agent
POST   /companies/:companyId/agents/:id/pause   # Pause agent
POST   /companies/:companyId/agents/:id/stop    # Stop agent

POST   /companies/:companyId/agents/:id/command # Send command
GET    /companies/:companyId/agents/:id/tasks   # Agent's tasks
GET    /companies/:companyId/agents/:id/performance  # Performance
```

---

## Tasks API

```yaml
POST   /companies/:companyId/tasks            # Create task
GET    /companies/:companyId/tasks            # List tasks
GET    /companies/:companyId/tasks/:id        # Get task
PATCH  /companies/:companyId/tasks/:id        # Update task

POST   /companies/:companyId/tasks/:id/assign    # Assign to agent
POST   /companies/:companyId/tasks/:id/approve   # Approve
POST   /companies/:companyId/tasks/:id/cancel    # Cancel
GET    /companies/:companyId/tasks/:id/graph     # Task graph
```

---

## Commands API (Natural Language)

```yaml
POST   /companies/:companyId/commands          # Execute command
GET    /companies/:companyId/commands          # History
POST   /companies/:companyId/commands/voice    # Voice command
```

### Example
```json
// POST /companies/:companyId/commands
{
  "text": "Create an ad campaign for our new product targeting millennials"
}

// Response
{
  "id": "cmd_123",
  "status": "completed",
  "interpretation": {
    "intent": "create_ad_campaign",
    "entities": [
      {"type": "target_audience", "value": "millennials"}
    ],
    "confidence": 0.95
  },
  "result": {
    "type": "message",
    "content": "I've created a task for the Ads Agent..."
  },
  "suggestions": [
    "Set budget to $1000",
    "Add Instagram as channel"
  ]
}
```

---

## Messages API

```yaml
GET    /companies/:companyId/messages              # List messages
POST   /companies/:companyId/messages              # Send message
PATCH  /companies/:companyId/messages/:id/read     # Mark read
GET    /companies/:companyId/messages/threads      # Get threads
```

---

## WebSocket API

**Connection**: `wss://api.1person.ai/v1/ws?token={jwt}`

### Channels
- `company:{companyId}` - Company-wide events
- `company:{companyId}:agents` - Agent updates
- `company:{companyId}:tasks` - Task updates
- `agent:{agentId}` - Specific agent

### Event Types
```typescript
type EventType =
  | 'agent.status_changed'
  | 'agent.task_started'
  | 'agent.task_completed'
  | 'task.created'
  | 'task.updated'
  | 'metric.updated';
```

---

## Error Handling

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    requestId: string;
  };
}
```

### Error Codes
| Code | Description |
|------|-------------|
| AUTH_INVALID_TOKEN | Invalid or expired token |
| FORBIDDEN | No permission |
| BUDGET_EXCEEDED | Budget limit exceeded |
| VALIDATION_ERROR | Invalid input |
| AGENT_NOT_FOUND | Agent not found |
| INTERNAL_ERROR | Server error |

---

## Rate Limiting

| Plan | Requests/min | WebSocket | Agents |
|------|--------------|-----------|--------|
| Free | 100 | 1 | 5 |
| Starter | 500 | 5 | 20 |
| Pro | 2000 | 20 | 100 |
| Enterprise | 10000 | Unlimited | Unlimited |

---

## SDK Usage

### TypeScript
```typescript
import { AICompanyOS } from '@1person/sdk';

const client = new AICompanyOS({ apiKey: 'xxx' });

// Create company
const company = await client.companies.create({
  name: 'My AI Company',
  description: 'An AI-powered brand',
});

// Send command
const result = await client.commands.execute(company.id, {
  text: 'Create a marketing campaign',
});

// Subscribe to real-time
client.subscribe(`company:${company.id}`, (event) => {
  console.log('Event:', event);
});
```

---

*Document Version: 1.0*
*Last Updated: 2025-03-13*
