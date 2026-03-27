/**
 * AI Company OS - Service Layer
 *
 * Unified export of all services in the correct workflow order:
 *
 * 1. Company State Engine - Real-time company state for decision making
 * 2. CEO Brain - Strategic decision making and planning
 * 3. Agent Orchestrator - Coordinate agents and tasks
 * 4. Goal Decomposition - Break objectives into tasks
 * 5. Task Graph Engine - Build and execute DAG
 * 6. Agent Runtime - Execute individual tasks
 * 7. Agent Communication - Structured messaging between agents
 * 8. Memory System - Store and retrieve learnings
 * 9. Evaluation - Assess agent performance
 * 10. Evolution & Self-Improvement - Agent improvement
 * 11. Auto-Spawn - Dynamic agent creation
 * 12. Workflow Runner - Main orchestration entry point
 */

// Core State Management
export * from './company-state-engine';

// Strategic Layer
export * from './ceo-brain';
export * from './ceo-reasoning-loop';
export * from './strategy-horizon';
export * from './event-triggers';

// Orchestration Layer
export * from './agent-orchestrator';
export * from './goal-decomposition';
export * from './task-graph';

// Execution Layer
export * from './agent-runtime';
export * from './agent-communication';

// Learning & Memory Layer
export * from './memory';
export * from './evaluation';

// Evolution Layer
export * from './evolution';
export * from './self-improvement';
export * from './auto-spawn';

// Integration Layer
export * from './collaboration';
export * from './integrations';

// Main Workflow Entry Point
export * from './workflow-runner';
