# Prospectra production readiness

**Verdict:** Not production-ready. The application builds, the automated tests that can run without credentials passed, and the reviewed security holes in the repository were fixed. Registration through a confirmed meeting was not executed, and the database migrations were not applied.

## 1. Implemented modules

Marketing site, authentication, workspaces, onboarding, dashboard, website analysis, ICP, company and contact discovery, prospect CRM, enrichment and scoring, AI assistant, email drafts and templates, campaigns, inbox, meetings, credits, Stripe and Paystack billing, analytics, notifications, platform admin, and the background worker.

Settings now changes the signed-in user's password. It does not manage workspace deletion or data export.

## 2. Completed development phases

Phases 0–19 have implementation in the repository and automated tests for their logic. Phase 20 is prepared and not accepted. See the table below.

## 3. Database architecture

Migrations `20260323000001` through `20260323000011` define the tenant schema, RLS, the credit ledger, and the job queue. Child rows must stay inside one workspace. Credit changes go through locked functions that are granted to `service_role` only. These files were not applied to a database in this checkout.

## 4. Authentication and security

The browser uses the anon key. The worker validates the Supabase access token and workspace membership before using the service role. Payment webhooks require a signature and a provider retrieve. The crawler blocks private, link-local, and metadata destinations and pins the resolved address. Internal worker errors are not returned to the client. Details are in `SECURITY.md`.

## 5. Configured integrations

None are configured in this checkout. Adapters exist for EnrichLayer, Apollo (legacy), Hunter, OpenAI, Gmail, Microsoft, Resend, Stripe, and Paystack. An empty credential shows an unconfigured state.

## 6. Outstanding credentials

Create separate values for staging and production:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- EnrichLayer (LinkedIn) and Hunter API keys
- Google and Microsoft OAuth client ids and secrets
- `EMAIL_PROVIDER_API_KEY` for Resend
- `WORKER_CREDENTIAL_KEY`, `WORKER_WEBHOOK_SECRET`, `WORKER_PUBLIC_URL`, `APP_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` or the Paystack equivalents

`.env.example` previously contained a live Supabase URL, a publishable key, a service-role key, and an OpenAI key. Those values were removed. Rotate all four at the provider. This change does not erase git history.

## 7. Test results

| Check | Result |
|-------|--------|
| Lint | Pass |
| Typecheck | Pass |
| Unit and integration tests | Pass — 35 files, 74 tests |
| Frontend production build | Pass |
| Worker build | Pass |
| Playwright | Pass — public pages, password recovery, and unconfigured billing, reports, notifications, settings, and admin |
| Live RLS | Not run |
| Payment sandbox | Not run |
| 29-step business workflow | Not run |

## 8. Known limitations

- Analytics reads stop at 5,000 rows per table and say when that happens
- Paystack is recorded from a verified charge, not a full subscription object
- A checkout return never marks a payment successful
- Positive reply sentiment is not stored, so that metric stays empty
- Sentry is not connected. Monitoring is JSON logs and worker heartbeats
- No storage buckets exist
- There is no automatic data-retention job

## 9. Performance observations

Hot workspace queries have indexes on `workspace_id` and `created_at`. Analytics work is aggregated on the worker rather than one query per prospect. The production frontend is a single 1.5 MB JavaScript file (about 409 KB gzipped). Splitting routes would reduce the first load. Worker concurrency defaults to 2 and is capped at 25.

## 10. Deployment status

`vercel.json`, `DEPLOYMENT.md`, and a manual GitHub Actions workflow are in the repo. Nothing was deployed. The deploy workflow does not apply migrations.

## 11. Remaining production risks

- Migrations and RLS have not been executed, so a policy mistake would only appear on a real project
- Service-role and OpenAI keys that were in `.env.example` must be rotated if this repository was pushed
- Campaign delivery, meeting confirmation, and credit grants depend on provider sandboxes that were not called
- A public DNS name that proxies to a private network after the pin is outside the crawler's control
- The large frontend bundle slows the first visit

## Phase evidence

| Phase | Implementation status | Test status | Outstanding issues | Evidence |
|------:|-----------------------|-------------|--------------------|----------|
| 0 | Tooling, CI, and docs | Lint, typecheck, and test scripts run | None in tooling | `package.json`, `.github/workflows/ci.yml` |
| 1 | Marketing pages | Playwright homepage pass | None found | `src/features/marketing` |
| 2 | Auth, migrations, RLS | Helper tests only | Live RLS not executed | `supabase/migrations/20260323000002`–`000007` |
| 3 | Workspace bootstrap and onboarding | Unit coverage of services | Live signup not run | `create_workspace_with_owner` |
| 4 | Dashboard and navigation | Unconfigured shell renders | No live workspace data | Playwright `/app` routes |
| 5 | Website analysis and crawler | SSRF and crawler unit tests | No live crawl | `packages/shared/src/ssrf.ts`, `worker/src/crawl` |
| 6 | ICP builder | ICP unit tests | No live model call | `packages/shared/src/icp.test.ts` |
| 7 | Discovery | Discovery unit tests | EnrichLayer not configured | `worker/src/providers/enrichlayer.ts` |
| 8 | Prospect CRM | Prospect unit tests | No live records | `src/features/prospects` |
| 9 | Enrichment and scoring | Enrichment and scoring tests | Hunter not configured | `packages/shared/src/scoring.test.ts` |
| 10 | Assistant and email generation | Assistant tests and Zod output | OpenAI not configured | `packages/shared/src/assistant.test.ts` |
| 11 | Templates and mailbox OAuth | Mailbox unit tests | OAuth not connected | `worker/src/email` |
| 12 | Campaigns | Window, suppression, and idempotency tests | No live send | `packages/shared/src/campaigns.test.ts` |
| 13 | Inbox | Duplicate-message tests | No live mailbox | `worker/src/email/mailbox.test.ts` |
| 14 | Meetings | Confirmation stays false until the provider writes it | No calendar sandbox | `meetings_confirmation_guard` |
| 15 | Credits and billing | Ledger and signature tests | Webhooks not delivered | `packages/shared/src/billing.test.ts`, `worker/src/payments/signatures.test.ts` |
| 16 | Analytics | Denominator tests | No live rows | `packages/shared/src/analytics.ts` |
| 17 | Notifications and admin | Preference and admin route render | No platform admin row | Playwright `/admin` |
| 18 | Background jobs | Queue retry, reclaim, and shutdown tests | Queue not run against Postgres | `worker/src/queues/memory-queue.test.ts` |
| 19 | Security fixes in this phase | 72 tests, lint, typecheck, builds, Playwright | Live RLS not executed | `20260323000011_security_hardening.sql` |
| 20 | Deployment documents and CI | Builds pass. Business workflow not run | No hosted project | `DEPLOYMENT.md`, `vercel.json` |
