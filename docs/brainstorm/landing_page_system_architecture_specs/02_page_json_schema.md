
# Landing Page JSON Schema

All landing pages should be stored as structured JSON instead of raw HTML.

Example:

{
  "page_id": "uuid",
  "company_id": "uuid",
  "sections": [
    {
      "type": "hero",
      "headline": "Grow your YouTube channel with AI",
      "subheadline": "AI tools built for creators",
      "cta": "Start Free Trial"
    },
    {
      "type": "features",
      "items": [
        "AI thumbnails",
        "AI titles",
        "AI analytics"
      ]
    }
  ]
}

Benefits:
- easier editing
- version control
- A/B testing
- component rendering
