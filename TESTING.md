# Testing

## Unit and integration

`npm test` runs Vitest. Shared package tests cover billing settlement, webhook duplicate decisions, SSRF classification, analytics denominators, and job retries. Worker tests cover payment signatures, the in-memory queue, and sanitised 500 responses. App tests render the marketing page and forms.

`tests/unit/security-review.test.ts` fails if `.env.example` contains a live-looking key, and it checks that the Phase 19 migration revokes member credit grants and scopes audit inserts.

`tests/integration/rls-helpers.test.ts` checks the TypeScript permission helpers. It does not open a Postgres session. Cross-workspace RLS has not been executed here because `supabase start` is not available.

## End to end

`npm run test:e2e` uses Playwright against the Vite dev server. The specs cover the homepage, login keyboard order, password reset pages, and the configuration-required state on billing, reports, notifications, settings, and admin.

The 29-step sales workflow, from registration through a confirmed meeting, needs Supabase, email verification, OpenAI, a discovery provider, a mailbox, a calendar, and a payment sandbox. Those are not configured in this checkout, so that workflow is not marked as passed.

## Payments and crawler

Signature tests reject an altered or stale Stripe header and require the Paystack HMAC of the raw body. SSRF tests reject localhost, private and link-local addresses, cloud metadata, mapped IPv6, unsupported schemes, and malformed URLs. The crawler tests revalidate a redirect before the next request.

## Commands

`npm run check:release` reads the migrations after the shared package is built. It fails when a migration drops or truncates a table, or when a public table never enables RLS. That is a file check, not a live database session.

`npm run smoke` checks a deployed app and worker when `SMOKE_APP_URL` and `SMOKE_WORKER_URL` are set. Without those variables it does not claim the sales workflow passed.

The 29-step path from registration through a confirmed meeting needs Supabase, email verification, and the provider sandboxes. It is not an automated test.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run build:worker
npm run check:release
npm run test:e2e
```
