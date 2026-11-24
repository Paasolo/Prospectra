# Development progress

Living log of Prospectra implementation phases. Update this file after every phase.

## Current status

| Item | Value |
|------|--------|
| Last completed phase | **Phase 18**. Phase 19 is implemented and only partly verified |
| Next phase | **Phase 20** — hosted deploy and the sales workflow are still outstanding |
| Repository state | Phases 0–18 verified in earlier passes. Phase 19 failure states are tested. Live Auth and RLS are not |

---

## Phase 0 — Project setup (gap fill)

**Status:** Complete (extended 2026-11-23)

### Added beyond initial scaffold

- Zod-validated client env (`src/lib/env.ts`)
- Supabase client with honest `configured` / `unconfigured` states
- `AppError` + logger utilities
- React `ErrorBoundary`
- `/health` application health screen
- Shared TypeScript types and feature folder architecture

---

## Phase 1 — Brand identity and public website

**Status:** Complete

### Implemented

- Original Prospectra logo, favicon, app icon
- Design tokens (deep navy, electric blue, restrained violet)
- Light/dark themes via `next-themes`
- Typography: Sora (display) + Plus Jakarta Sans
- UI library: button, badge, card, input, label, textarea, dialog, dropdown, accordion, switch, separator
- Marketing header/footer, pricing cards, SEO helper
- Pages: `/`, `/features`, `/solutions`, `/pricing`, `/about`, `/contact`, `/blog`, `/privacy`, `/terms`, `/login`, `/register`
- No fabricated testimonials, logos, or statistics

---

## Phase 2 — Supabase database, authentication, security

**Status:** Complete (migrations + auth UI; apply migrations to a live Supabase project)

### Database migrations

- `20260323000001` … `000007` covering identity, billing/credits, prospecting, integrations, RLS helpers, workspace bootstrap RPC
- Helpers: `is_workspace_member`, `has_workspace_role`, `has_workspace_permission`
- Auth trigger creates `profiles` + registration audit log

### Authentication

- Register, login, logout, forgot password, Google OAuth entry
- Session restore via `useAuth`
- Protected routes (shell explorable when Supabase unconfigured)
- Auth service never invents success when unconfigured

### Tests

- Permission unit tests mirroring RLS intent
- Integration helper expectations documented (full Postgres RLS needs `supabase start`)

---

## Phase 3 — Workspace management and onboarding

**Status:** Complete

### Implemented

- Workspace list/switch context
- `create_workspace_with_owner` RPC (owner member, settings, credits, free plan subscription, audit)
- Team invite UI with roles
- Multi-step onboarding wizard with skip + local progress persistence
- Welcome screen with first-use guidance

---

## Phase 4 — Application shell and dashboard

**Status:** Complete

### Implemented

- Authenticated layout: collapsible mobile sidebar, top bar, workspace switcher, search, theme, account menu
- Full nav map per spec (later phases linked as honest placeholders)
- Dashboard metrics from real table counts when Supabase configured
- Empty / unconfigured states distinguished from fabricated data
- Activity snapshot chart (Recharts) driven by workspace counts

---

## Verification (Phases 0–4)

| Check | Result |
|-------|--------|
| `npm test` | Pass — 9 tests |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

---

## Outstanding dependencies

- Supabase project URL + anon key (and service role for worker later)
- Apply migrations: `supabase db reset` / linked remote migrate
- Google OAuth provider config in Supabase for optional social login
- OpenAI, EnrichLayer (LinkedIn discovery/enrichment), and Hunter credentials on the worker for live analysis, discovery, and enrichment

## Known limitations

- Full Postgres RLS integration tests not executed against a live database in this environment
- Invitation email delivery depends on Supabase Auth mail settings
- Feature routes beyond dashboard/team/onboarding are navigable placeholders until their phases
- Contact form validates locally; outbound mail not yet wired
- Legal pages are interim product summaries pending counsel review

## Phase 5 — Company website analysis and AI infrastructure

**Status:** Complete

### Implemented

- Website analysis UI with URL, optional company name, and optional instructions
- Shared public-destination policy: HTTP/HTTPS only, standard ports, blocked local, private, and metadata targets
- Worker crawler with DNS checks, redirect revalidation, content-type limits, page/depth/size/time limits, robots.txt, rate limiting, and crawled URL records
- Evidence extraction for company facts that are present on the page
- OpenAI structured output validated with Zod; crawled text stays untrusted evidence
- `website_analyses` stores the workspace, URL, domain, evidence, AI output, model, usage, cost, status, and errors
- Report view with summary, markets, buyer roles, insights, sources, confidence, export, and save company

## Phase 6 — ICP builder and AI recommendations

**Status:** Complete

### Implemented

- ICP list, create, edit, duplicate, delete, activate, archive, and compare
- Criteria for industry, geography, size, revenue, model, technologies, titles, departments, seniority, pain points, signals, and exclusions
- Generation from a description, website analysis, customers, successful prospects, or AI-assisted discovery
- Deterministic quality assessment and search filters reused by discovery

## Phase 7 — Company and prospect discovery integrations

**Status:** Complete

### Implemented

- Provider descriptors for EnrichLayer LinkedIn company/contact discovery (Apollo legacy) and Hunter email verification
- Search criteria, credit estimate, reserve/refund, normalization, dedupe, scoring, and saved provenance
- Results UI with filters, pagination controls, selection, save to prospects/lists, and export
- Unconfigured and provider-error states. No synthetic company or contact records

## Phase 8 — Prospect management and CRM

**Status:** Complete

### Implemented

- Prospect create, edit, view, search, filter, sort, pagination, assign, tag, bulk stage, and confirmed bulk delete
- Configurable pipeline stages within the existing stage set
- Prospect detail tabs, notes, and activity timeline
- Lists with counts, membership, search, and export
- CSV validation, mapping, preview, duplicate reporting, and failed-row summary
- Duplicate review and explicit merge with history. Uncertain matches are not merged automatically

## Phase 9 — Lead enrichment and scoring

**Status:** Complete

### Implemented

- Single and bulk enrichment jobs with retries, dead-letter, provider errors, and field-level source timestamps
- Email verification is stored as verified only when Hunter returns deliverable
- Deterministic 0–100 scoring with configurable admin weights, stored inputs, and a separate optional AI explanation

## Verification (Phases 5–9)

| Check | Result |
|-------|--------|
| `npm test` | Pass — 47 tests, including crawler security, output validation, ICP quality, discovery credits, enrichment retries, CRM import/duplicates, and scoring |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| Headless Chrome | Website analysis, ICP, company discovery, prospects, import, lists, and enrichment render the app shell. With no Supabase env, each page shows a configuration-required card and no analysis, discovery, or enrichment results |

## Known limitations added in Phases 5–9

- Crawl, AI, discovery, and enrichment run through the worker HTTP API. Durable queue processing remains Phase 18
- Installed discovery/enrichment adapters are EnrichLayer (preferred) and Apollo (legacy); email verification is Hunter. Other provider names are reported as misconfigured
- Live provider calls were not executed in this environment
- This workspace has no `.env`, so signed-in crawl, discovery, CRM, and enrichment flows were not exercised in the browser. The website URL form is covered by unit tests and is hidden until Supabase is configured
- A worker crash after a credit reserve and before the matching refund needs a manual credit adjustment

## Phase 10 — AI sales assistant

**Status:** Complete

### Implemented

- Worker OpenAI service with structured outputs, Zod validation, prompt templates, usage logs, cost estimates, rate limits, and credit reserve/refund
- Conversations with history, titles, context selection, copy, retry, delete, and streamed JSON deltas
- Sourced facts must be verbatim excerpts of authorised workspace records. Other statements are labelled inferences
- The OpenAI key stays on the worker

## Phase 11 — Email generation and account integrations

**Status:** Complete

### Implemented

- Email studio for the seven email types, with regenerate, edit, draft, preview, copy, test send, and templates
- Variables limited to first name, last name, company, job title, and website. Unknown variables and unsupported relationship claims are blocked before send
- Gmail, Microsoft 365, and Resend adapters. OAuth refresh tokens are encrypted in `integration_secrets`
- Delivery state stays `accepted` until a provider delivery or bounce event says otherwise

## Phase 12 — Campaign builder and automation

**Status:** Complete

### Implemented

- Campaign create, edit, duplicate, delete, pause, resume, schedule, and cancel
- Guided builder for audience, account, steps, delays, window, timezone, daily limit, suppression, preview, test, and activation
- Durable `outreach_jobs` claimed with row locks. Ambiguous sends are reconciled before another send
- Stop on reply, suppression, cancellation, and failed retries. Unsent credits are refunded on cancellation

## Phase 13 — Unified inbox

**Status:** Complete

### Implemented

- Inbox filters, conversation view, assignment, notes, archive, and sent mail
- Pull sync from Gmail and Microsoft with provider message ids. Duplicates are skipped
- Reply suggestions require an edited, approved send
- Microsoft webhooks are accepted only when `clientState` matches, and they do not create messages from the payload

## Phase 14 — Meetings and calendars

**Status:** Complete

### Implemented

- Google Calendar and Microsoft calendar OAuth, availability from provider free/busy, and working-hour slots
- Create, reschedule, and cancel through the provider
- A meeting is shown as booked only when the provider returned an event id and the status is confirmed

## Verification (Phases 10–14)

| Check | Result |
|-------|--------|
| `npm test` | Pass — 59 tests, including sourced-fact guarding, template variables, campaign reconcile, and calendar confirmation |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| Headless Chrome | Assistant, email studio, campaigns, inbox, meetings, and integrations render the shell. With no Supabase env, each page shows a configuration-required card |

- Microsoft token revocation is local. The disconnect response says provider revocation was not confirmed
- Gmail and Microsoft push subscriptions are not created. Inbox sync is pull-based
- Live OAuth, send, and calendar calls were not executed in this environment

## Phase 15 — Credit management and subscription billing

**Status:** Complete

### Implemented

- Append-only credit ledger with expiring lots, reservations, settlement, release, and expiry
- Account rows are locked with `FOR UPDATE` before a balance changes. Concurrent spends cannot both pass the same balance check
- A failed or expired reservation is released by `release_workspace_credits`. Settlement refunds only the unused portion
- Plans FREE, STARTER, GROWTH, BUSINESS, and ENTERPRISE store monthly and annual prices, currency, included credits, member, prospect, and campaign limits, AI and enrichment allowances, and feature availability
- Stripe and Paystack checkout, plan change, cancellation, invoices, refunds, and failed-payment handling
- Webhook signatures are verified. Events are stored once. Provider state is retrieved before the subscription is updated
- Billing screen shows the current plan, ledger balance, recent usage, invoices, refunds, billing profile, and cancellation. The checkout return URL stays pending until a webhook confirms it

## Phase 16 — Analytics and reporting

**Status:** Complete

### Implemented

- Metrics are aggregated on the worker from workspace records. Definitions and denominators are in `METRIC_DEFINITIONS`
- Prospect funnel, campaign activity, sales breakdowns, and financial totals
- Revenue is grouped by currency and only includes paid invoices. Positive replies are omitted because sentiment is not stored
- Line, bar, donut, funnel, comparison, and table views
- Filters for date, workspace, campaign, ICP, source, team member, industry, and geography
- CSV from the same summary and a server-generated PDF

## Phase 17 — Notifications and platform administration

**Status:** Complete

### Implemented

- Notification list, unread count, mark read, mark all read, delete, and per-type in-app or email preferences
- Realtime subscription when Supabase is configured, with a 30-second refresh otherwise
- Email notifications are sent only when the preference is enabled and Resend is configured
- Members cannot insert notifications. Platform administrators are checked in `platform_admins` on the worker
- Admin modules for users, workspaces, subscriptions, plans, credits, jobs, webhooks, audit, flags, settings, integration health, and worker health
- Admin responses omit message bodies and job payloads. Privileged changes are written to `admin_audit_log`

## Phase 18 — Background worker and platform reliability

**Status:** Complete

### Implemented

- Durable `background_jobs` queue claimed with `FOR UPDATE SKIP LOCKED`. Enqueue and claim are service-role only
- Processors for website analysis, discovery, enrichment, AI generation, campaign scheduling, email sending, mailbox sync, calendar sync, analytics aggregation, notifications, and billing reconciliation
- Idempotency keys, heartbeats, stale-lock reclaim, bounded retries, exponential backoff, dead letters, timeouts, and graceful shutdown
- Error categories: permanent, temporary, configuration, quota, and validation. Temporary failures retry. The others dead-letter
- A terminal failure releases a credit reservation referenced by the job
- Worker heartbeats record queue depth for the admin health view

## Verification (Phases 15–18)

| Check | Result |
|-------|--------|
| `npm test` | Pass — 68 tests, including ledger settlement, webhook signatures, duplicate jobs, retries, and shutdown |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| Headless Chrome | Billing, reports, performance, notifications, and admin render. With no Supabase env they show a configuration-required state |

## Known limitations added in Phases 15–18

- The migration is authored but not applied in this environment. There is no live Stripe, Paystack, or Supabase project here
- Checkout, webhook delivery, and admin data were not executed against provider sandboxes
- Analytics queries are capped at 5,000 rows per table and say so when the cap is hit
- Paystack is recorded from verified charges. Stripe subscription cancellation uses the provider response. A browser return never marks a payment successful

## Phase 19 — Security hardening, testing and production

**Status:** Partially verified. The failure and empty states below were exercised. Live Auth, a recovery email, and Postgres RLS were not.

### Functional audit

| Feature | What was exercised | Result |
|---------|--------------------|--------|
| Registration password rule | Short password on the register form | The form shows the 12-character error and does not say an account was created |
| Forgot password | Invalid email, then a valid email with Supabase unset | Validation is shown. The page does not say a reset link was sent |
| Reset password | Page load without a recovery link or a session | The save form is absent. The view function keeps an ordinary session on Settings and opens the form only for a recovery link |
| Settings password | Page load without a session | The update button is absent. A signed-in change still requires the current password in code, and that success path was not run |
| Worker requests | 120 calls, then one more, with no Supabase credentials | The first calls return the unconfigured message. The next call is rate limited |
| Credit grants, audit writes, workspace matching | Migration `20260323000011` reviewed | Not executed in Postgres, so this behaviour is not marked complete |

### Fixed

- `.env.example` no longer contains project URLs or provider keys
- Direct workspace inserts are removed. Membership inserts require an owner or admin. Audit inserts must belong to the actor's workspace
- Child records that point at another workspace's prospect, company, list, campaign, search, or ICP are rejected
- `consume_workspace_credits` and `grant_workspace_credits` are revoked from `authenticated`
- Authenticated roles cannot write email messages, subscriptions, or credit accounts, and cannot mark a meeting provider-confirmed
- Worker 500 responses with code `INTERNAL` no longer return database text. Configuration errors stay visible
- Worker requests are limited to 120 a minute per client address and per access token. A bearer value that is not a token does not get its own limit
- Password reset does not reveal whether an account exists. `/reset-password` saves a new password only after Auth accepts it
- New registration passwords require 12 characters
- Review follow-up: address-based rate limits cannot be bypassed with random bearer tokens, password-reset provider failures are shown as failures, a password change confirms the current password, and member-writable notes, scores, drafts, campaign steps, inbox rows, and campaign lists stay inside one workspace

### Verification

| Check | Result |
|-------|--------|
| Behaviour tests | Pass — 8 tests for registration, forgot password, reset, settings, recovery decisions, and the worker limit |
| `npm run typecheck` | Pass |
| Playwright | Pass — 2 tests. The reset page has no save button without a recovery link |
| Live registration, recovery email, password change, and Postgres RLS | Not run |

## Phase 20 — Deployment and final acceptance

**Status:** Not complete. Release checks and the worker image are in the repo. Nothing has been deployed, and the sales workflow has not been run.

### Implemented this pass

- `check:release` fails on destructive migration statements and on any public table that does not enable RLS
- CI and the manual deploy workflow run that check and still do not apply migrations
- `worker/Dockerfile` listens through the existing worker, with a `/health` check. `worker/compose.yml` restarts it unless stopped
- Local Auth config allows the reset and app redirects and sets the minimum password length to 12
- `supabase/seed.sql` stays free of tenant rows. Plans remain in the migrations
- `smoke` calls a deployed app and worker only when those URLs are provided

### Verification

| Check | Result |
|-------|--------|
| Release tests | Pass — 5 tests |
| `node scripts/check-migrations.mjs` | Pass — no destructive statements, RLS present on every public table |
| `node scripts/smoke.mjs` | Not run against a host. The script reported that live smoke was skipped |
| Worker image | Dockerfile is present. It was not built or started here |

### Not accepted

- No production Supabase project, Vercel project, or worker host was configured
- Registration, email verification, discovery, enrichment, campaign send, reply, meeting confirmation, and billing were not run
- The frontend production bundle is one 1.5 MB JavaScript file. That is a load-time cost, not a functional failure

---

## Outbound agent (first-party)

**Status:** Implemented in-repo (2026-11-24). Migration must be applied to the live Supabase project before runs succeed.

### Implemented

- Shared segment schemas, competitor acceptance only after a successful crawl, cost-per-lead null without replies, and approval that leaves campaigns in draft when no mailbox is connected
- Migration `20260323000012_outbound_agent.sql` for `agent_runs` and `agent_segments` with RLS and workspace-match triggers
- Worker job `outbound_agent`, `POST /v1/agent/runs`, and `POST /v1/agent/segments/approve`
- `/app/agent` and `/app/agent/:runId` with honest discovery and mailbox setup states
- LinkedIn discovery via EnrichLayer for the agent, UI discovery routes, and queue jobs. Prospects may be LinkedIn-first; drafts require a real email. Missing EnrichLayer credentials stay unconfigured and invent no people

### Verification

| Check | Result |
|-------|--------|
| Agent unit tests | Pass — 7 tests |
| Typecheck (app + worker) | Pass |
| `check:release` | Pass with the new migration |
| Live migration apply | Not applied — Supabase CLI has no access token in this environment |
| Live send / booked meeting | Not claimed |

## Next phase

Finish Phase 20 against a hosted Supabase project and provider sandboxes. Do not treat this checkout as production-ready. Apply `20260323000012_outbound_agent.sql` before using the outbound agent against the configured project.

---

## Phase checklist

| Phase | Name | Status |
|------:|------|--------|
| 0 | Project setup, architecture, tooling, Cursor rules | **Complete** |
| 1 | Brand identity, design system, public marketing website | **Complete** |
| 2 | Database schema, migrations, authentication, RLS | **Complete** |
| 3 | Workspace management and onboarding | **Complete** |
| 4 | Customer dashboard and application navigation | **Complete** |
| 5 | Company website analysis and AI infrastructure | **Complete** |
| 6 | ICP builder and AI recommendations | **Complete** |
| 7 | Company and prospect discovery integrations | **Complete** |
| 8 | Prospect management and CRM | **Complete** |
| 9 | Lead enrichment and scoring | **Complete** |
| 10 | AI sales assistant and email generation | **Complete** |
| 11 | Email integrations and templates | **Complete** |
| 12 | Campaign builder and automation engine | **Complete** |
| 13 | Unified inbox and conversations | **Complete** |
| 14 | Meeting scheduling and calendar integrations | **Complete** |
| 15 | Credit management, payments and subscriptions | **Complete** |
| 16 | Analytics and reporting | **Complete** |
| 17 | Notifications and administration portal | **Complete** |
| 18 | Background worker, reliability and monitoring | **Complete** |
| 19 | Security hardening, testing and deployment | **Partially verified** — live Auth and RLS not executed |
| 20 | End-to-end acceptance testing and production readiness | **Not complete** — release checks added; hosted workflow not run |
