
# Visual Editor Architecture

Purpose:
Allow users to edit AI-generated landing pages.

Editor capabilities:

- inline text editing
- drag reorder sections
- add/remove blocks
- image replacement
- style customization

Architecture:

Page JSON
↓
Editor UI
↓
Component Renderer
↓
State Management
↓
Save JSON changes
