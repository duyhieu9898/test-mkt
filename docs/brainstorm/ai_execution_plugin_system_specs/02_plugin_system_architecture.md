
# Plugin System Architecture

Purpose:
Allow AI agents to install and use tools dynamically.

Architecture:

Agent
↓
Tool Registry
↓
Plugin Adapter
↓
External API

Plugins must implement a standard interface.

Plugin Interface Example:

name: string
description: string
inputs: schema
outputs: schema
execute(): function

Example Plugins:

meta_ads_plugin
google_ads_plugin
banner_generator_plugin
email_outreach_plugin
lead_scraper_plugin
