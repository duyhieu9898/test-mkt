
# Ads Execution Engine

Purpose:
Allow agents to launch and manage advertising campaigns.

Supported Platforms:
- Meta Ads
- Google Ads
- LinkedIn Ads

Agent Request Example:

launch_ads_campaign:
  platform: meta
  budget: 200
  audience: creators
  creative: banner_id
  copy: ad_text

Execution Flow:

Marketing Agent
↓
Ads Execution Engine
↓
Plugin Adapter
↓
Ads API
↓
Campaign Created
