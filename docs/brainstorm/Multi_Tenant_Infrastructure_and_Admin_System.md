# Multi Tenant Infrastructure and Admin System

## Purpose

Allow many companies to run on one platform while keeping data isolated.

------------------------------------------------------------------------

## Company Entity

company_id name owner_user_id plan created_at

------------------------------------------------------------------------

## User

user_id email company_id role

------------------------------------------------------------------------

## Agent

agent_id company_id role status

------------------------------------------------------------------------

## Task

task_id company_id agent_id description status

------------------------------------------------------------------------

## Database Strategy

PostgreSQL

Every table includes company_id.

Example:

tasks

task_id company_id agent_id status

------------------------------------------------------------------------

## Vector DB Isolation

Separate collection per company.

Example:

memory_company_123

------------------------------------------------------------------------

## Admin Panel

Admin can configure:

LLM providers API keys server configs agent limits budget limits

------------------------------------------------------------------------

## Infrastructure

API servers Agent workers Vector DB Queue system

Recommended queue:

Redis Streams or Kafka
