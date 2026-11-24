# API documentation

**Status:** Stub — HTTP and Edge Function APIs are documented as they are introduced.

Planned surfaces include:

- Supabase client data access under RLS
- Edge Functions for privileged short operations (webhooks, OAuth callbacks)
- Worker `/health` endpoint (Phase 0: implemented)

### Worker health (Phase 0)

`GET /health` → JSON validated by `healthResponseSchema` in `@prospectra/shared`.

### Worker API (Phases 5–9)

Authenticated with the Supabase user access token. The worker checks workspace membership before using the service role. Responses that fail Zod validation are rejected by the client. Each client address, and each access token, is limited to 120 requests a minute. A random bearer value shares the address limit. Internal database errors are logged on the worker and returned as a generic message. Webhooks stay unauthenticated and are accepted only after signature verification.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/providers?workspaceId=` | Provider configuration states. No secrets |
| `POST` | `/v1/website-analyses` | SSRF-checked crawl and structured analysis |
| `POST` | `/v1/icp/generate` | Structured ICP recommendation |
| `POST` | `/v1/discovery/companies` | EnrichLayer LinkedIn company search when configured (`apollo` remains as a legacy adapter) |
| `POST` | `/v1/discovery/contacts` | EnrichLayer LinkedIn people search when configured (`apollo` remains as a legacy adapter) |
| `POST` | `/v1/enrichment` | Person enrichment via EnrichLayer (or legacy Apollo) and optional Hunter verification |
| `POST` | `/v1/scoring/explain` | Optional AI explanation of an existing deterministic score |
| `POST` | `/v1/agent/runs` | Starts a first-party outbound agent run. Reserves credits and enqueues `outbound_agent`. Nothing is sent |
| `POST` | `/v1/agent/segments/approve` | Approves one researched segment. Creates a campaign. Activates only when a mailbox is connected; otherwise leaves `DRAFT` |
| `POST` | `/v1/assistant/messages` | Structured sales assistant reply. `stream: true` returns server-sent events |
| `POST` | `/v1/email/generate` | Structured email draft with unsupported-claim warnings |
| `POST` | `/v1/email/oauth/start` | OAuth URL for Gmail or Microsoft. Tokens are not returned |
| `GET` | `/v1/email/oauth/callback` | Exchanges the code and stores encrypted credentials |
| `POST` | `/v1/email/disconnect` | Deletes stored credentials and reports whether provider revocation was confirmed |
| `POST` | `/v1/email/test` | Sends a test message. Acceptance is not delivery |
| `POST` | `/v1/email/resend` | Registers a Resend from-address when the worker key is configured |
| `POST` | `/v1/inbox/sync` | Pulls recent Gmail or Microsoft messages and skips duplicates |
| `POST` | `/v1/inbox/suggest` | Draft reply suggestion. It is not sent |
| `POST` | `/v1/inbox/reply` | Sends the user-approved reply |
| `POST` | `/v1/campaigns/activate` | Validates, enrolls eligible prospects, and reserves send credits |
| `POST` | `/v1/campaigns/status` | Pause, resume, or cancel. Cancellation refunds unsent credits |
| `POST` | `/v1/outreach/process` | Claims due outreach jobs for the workspace |
| `POST` | `/v1/calendar/availability` | Provider free/busy turned into bookable slots |
| `POST` | `/v1/calendar/meetings` | Creates a meeting and confirms it only after the provider returns an event id |
| `POST` | `/v1/calendar/meetings/reschedule` | Updates a confirmed provider event |
| `POST` | `/v1/calendar/meetings/cancel` | Cancels the provider event |
| `POST` | `/v1/email/webhooks/microsoft` | Accepts a notification only when `clientState` matches. It does not invent messages |
| `POST` | `/v1/billing/checkout` | Starts Stripe or Paystack checkout. The response is a redirect, not payment confirmation |
| `POST` | `/v1/billing/change` | Asks the provider to change plan. Local plan state waits for a verified webhook |
| `POST` | `/v1/billing/cancel` | Schedules cancellation with the provider when one is connected |
| `POST` | `/v1/billing/webhooks/stripe` | Verifies the Stripe signature, stores the event once, then retrieves the provider object before updating billing |
| `POST` | `/v1/billing/webhooks/paystack` | Verifies the Paystack signature and the transaction before updating billing |
| `POST` | `/v1/analytics/summary` | Membership-checked analytics for a date range and optional campaign, ICP, source, member, industry, and geography filters |
| `POST` | `/v1/analytics/pdf` | Same summary rendered as a server-side PDF |
| `POST` | `/v1/admin/*` | Platform administrator routes. The worker rejects callers who are not in `platform_admins` |

Metric definitions live in `METRIC_DEFINITIONS` in `@prospectra/shared`. Rates are null when the denominator is zero. Revenue is summed per currency from paid invoices. Positive replies are omitted because sentiment is not stored. A browser return from checkout does not mark a payment successful.

Workspace reads and CRM writes continue through Supabase under RLS. Assistant output, sends, and confirmed meetings are written by the worker. OAuth secrets live in `integration_secrets`, which has no member read policy.
