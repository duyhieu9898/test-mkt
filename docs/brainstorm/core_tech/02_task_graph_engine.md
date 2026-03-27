# Task Graph Engine

## Purpose

Convert high-level company goals into executable task graphs.

## Model

Directed Acyclic Graph (DAG)

Nodes = tasks Edges = dependencies

## Execution Flow

1.  Receive goal
2.  Decompose into tasks
3.  Build DAG
4.  Execute nodes when dependencies complete
