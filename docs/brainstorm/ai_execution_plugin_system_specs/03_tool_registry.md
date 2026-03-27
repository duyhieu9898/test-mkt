
# Tool Registry

Purpose:
Central catalog of tools available to AI agents.

Responsibilities:
- register tools
- version tools
- control permissions
- expose tool schemas to agents

Registry Example:

tools:
  - meta_ads.launch_campaign
  - google_ads.launch_campaign
  - banner_generator.generate_banner
  - email_outreach.send_sequence
  - lead_scraper.find_leads

Agents query the registry to discover capabilities.
