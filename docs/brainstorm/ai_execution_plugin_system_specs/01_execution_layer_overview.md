
# AI Execution Layer Overview

Purpose:
Enable AI agents to perform real-world business actions such as:
- launching ads
- generating banners
- sending outreach
- scraping leads

Architecture:

CEO Agent
↓
Strategy Engine
↓
Task Graph
↓
Agents
↓
Execution Layer
↓
Plugin System
↓
External APIs

Key Concept:
Agents never call external APIs directly.
They use plugins via a Tool Registry.
