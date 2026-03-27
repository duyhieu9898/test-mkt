# Event Driven Architecture

## Purpose

Allow system components to react to events.

## Example Events

task_completed agent_spawned budget_exceeded campaign_launched
health_score_drop

## Flow

Action → Emit Event → Event Bus → Subscribers React
