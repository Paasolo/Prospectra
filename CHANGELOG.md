# Changelog

## 0.1.0

- Phases 0–18: marketing site, auth, workspaces, analysis, ICP, discovery, CRM, enrichment, assistant, email, campaigns, inbox, meetings, credits, billing, analytics, notifications, admin, and the background worker.
- Phase 19: removed live credentials from `.env.example`, closed direct workspace inserts and cross-workspace child links, revoked member credit grants, hid internal worker errors, and added a per-caller request limit.
- Phase 20: deployment notes, Vercel SPA config, and a manual deploy workflow that does not apply migrations.
- Outbound agent: first-party research loop that scores buyer segments, finds real prospects when LinkedIn discovery is configured, drafts emails, and waits for segment approval before any send.
- Discovery and enrichment: EnrichLayer LinkedIn search is the preferred company/contact/enrichment adapter for the agent, UI discovery routes, and queue jobs. Apollo remains as a legacy selectable adapter. Missing credentials stay unconfigured and invent no people.

Production is not claimed. Provider sandboxes and a hosted database were not exercised in this checkout. Apply `20260323000012_outbound_agent.sql` before using the agent against a live project.
