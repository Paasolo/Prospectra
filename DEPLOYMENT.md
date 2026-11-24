# Deployment

Prospectra has three deployable parts: the Vite frontend, the Supabase project, and a separate Node worker. Use different credentials for local, test, staging, and production. Never commit `.env`.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill only the services you are using.
3. `npm run build -w @prospectra/shared`
4. `npm run dev` for the frontend at `http://127.0.0.1:5173`.
5. `npm run dev:worker` for the worker at `http://127.0.0.1:8787/health`.
6. Apply migrations with the Supabase CLI against a local or hosted project: `supabase db push`. Do not point this command at production until the migration has been reviewed.

Empty Supabase variables are a valid local state. The UI says Supabase is not configured.

## Testing

- `npm test` runs unit and in-process integration tests. It does not need a database.
- `npm run test:e2e` starts Vite and checks public pages plus the unconfigured app shell.
- RLS behaviour in this repository is checked by reading the migration SQL and by TypeScript permission helpers. A full policy test needs `supabase start`, which was not available in the authoring environment.

## Staging

- Create a Supabase project that is not the production project.
- Set Auth site URL and redirect URLs to the staging origin, including `/reset-password` and `/app`.
- Put the anon key in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Put the service role, OpenAI, OAuth, Stripe or Paystack test keys, and `WORKER_CREDENTIAL_KEY` on the worker only.
- Set `WORKER_ALLOWED_ORIGINS` and `APP_URL` to the staging origin.
- Point Stripe and Paystack test webhooks at `https://<worker>/v1/billing/webhooks/stripe` and `/v1/billing/webhooks/paystack`.
- Apply the same migrations you intend to apply to production. Do not copy production customer data into staging.

## Production Supabase

- Create a new production project. Do not reuse development keys.
- Review `supabase/migrations` in order. Apply with `supabase db push` or the dashboard SQL editor. Do not run `supabase db reset` against production.
- Seed only reference data that the migrations already insert, such as plans and feature flags. Do not load demo prospects.
- Auth: enable email confirmation, set the minimum password length to 12, and add the production redirect URLs for email links, Google OAuth, and password reset.
- No storage buckets are created by the migrations. Add one only with a workspace-scoped policy.
- Edge Functions are not required for the current worker paths. If you deploy one, give it the service role through the function environment, not the frontend.
- Turn on daily backups and a point-in-time recovery window before accepting payments.

## Frontend on Vercel

`vercel.json` sets the build to `npm run build -w @prospectra/shared && npm run build`, publishes `dist`, and rewrites unknown paths to `index.html` so the SPA router works. Vercel serves existing files, including hashed assets, before that rewrite.

- Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_WORKER_URL`. Leave `VITE_DEMO_MODE` false in production.
- Domain and HTTPS are configured on the Vercel project. Redirect HTTP to HTTPS there.
- `index.html` carries the default title and description. Per-route titles come from the `Seo` component.
- Error monitoring is worker JSON logs and `worker_heartbeats`. A Sentry DSN is not read by the application.

## Worker

Run `npm run build -w @prospectra/worker` and start `node dist/index.js` from the `worker` package with the server environment variables.

- `WORKER_CONCURRENCY` defaults to 2 and is capped at 25.
- The process polls due outreach and background jobs unless it is stopping.
- `GET /health` does not require Supabase.
- Logs are JSON on stdout and stderr. Ship those to the host's log drain.
- `SIGINT` and `SIGTERM` stop new claims and wait up to 10 seconds for in-flight work, then close the HTTP server.
- The process listens on `0.0.0.0`. Restart the process on failure. A replacement worker claims jobs whose heartbeat is stale.
- `worker/Dockerfile` builds that process. `worker/compose.yml` sets `restart: unless-stopped` and publishes port 8787. Build with `docker build -f worker/Dockerfile .` from the repository root.
- Keep the worker off the public CDN. Allow only the application origin in `WORKER_ALLOWED_ORIGINS`.

## CI/CD

`.github/workflows/ci.yml` runs on pull requests and on `main`: install, shared build, migration check, lint, typecheck, unit tests, frontend build, worker build, and Playwright.

`.github/workflows/deploy.yml` is manual. It repeats those checks. It does not apply migrations. `node scripts/check-migrations.mjs` rejects `DROP TABLE`, `TRUNCATE`, and any public table without RLS. Apply reviewed migrations yourself before promoting the release. `node scripts/smoke.mjs` calls the deployed app and worker only when `SMOKE_APP_URL` and `SMOKE_WORKER_URL` are set.

## Smoke checks after a real deploy

1. Open the production origin and the login page.
2. Request `GET /health` on the worker.
3. Register a user, confirm the email, and create a workspace.
4. Confirm an unconfigured provider shows an unconfigured state.
5. Send a signed Stripe or Paystack test webhook and confirm a second delivery does not double-grant credits.
