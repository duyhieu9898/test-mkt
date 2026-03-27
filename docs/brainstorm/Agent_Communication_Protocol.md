# Agent Communication Protocol

## Purpose

Defines how AI agents communicate with each other in the AI Company OS.

------------------------------------------------------------------------

## Core Principles

1.  Structured messages
2.  All messages logged
3.  Context included
4.  Confirmation required

------------------------------------------------------------------------

## Message Schema

{ message_id: string company_id: string sender_agent_id: string
receiver_agent_id: string task_id: string goal: string context: string
constraints: string priority: low \| medium \| high deadline: timestamp
expected_output: string status: pending \| acknowledged \| completed \|
failed }

------------------------------------------------------------------------

## Message Types

TaskRequest TaskResult ClarificationRequest Escalation

------------------------------------------------------------------------

## Reliability

-   Acknowledgement required
-   Retry if no acknowledgement
-   Escalate after timeout

------------------------------------------------------------------------

## Logging

All messages stored in table:

messages

fields: message_id company_id sender receiver payload timestamp
