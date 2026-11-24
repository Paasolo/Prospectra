# Security

Prospectra is a multi-tenant sales workspace. The browser uses the Supabase anon key. Privileged work runs on the worker with the service role after the caller's token and workspace membership are checked.

## Authentication model

- Email and password, plus optional Google OAuth, are handled by Supabase Auth.
- The browser persists the session and refreshes it through the Supabase client.
- Protected routes redirect to `/login` when Supabase is configured and there is no session. When Supabase is not configured, the shell stays visible and says so.
- Password reset does not tell the requester whether an email is registered. Rate-limit errors are the exception. The reset link returns to `/reset-password`, where a new password is saved only after Auth accepts it. New passwords in the product forms require 12 characters. Set the same minimum in the Supabase Auth password policy.
- Access-token lifetime and refresh-token rotation are Supabase project settings. Use a short access token, refresh rotation, and the production site URL in the Auth redirect allow-list.
- The worker calls `GET {SUPABASE_URL}/auth/v1/user` with the bearer token. A missing or rejected token is `401`. It does not trust a user id sent in the body.

## Authorization model

- Workspace roles are owner, admin, manager, and member. SQL helpers `is_workspace_member`, `has_workspace_role`, and `has_workspace_permission` are `security definer` so policies do not recurse.
- The worker repeats the membership check before any service-role read or write.
- Platform administration is a row in `platform_admins`. The `/admin` page checks that row. Admin APIs also check it on the worker. A workspace role does not grant platform access.
- Members can read billing records. They cannot insert payment events, credit ledger rows, or notifications.
- `consume_workspace_credits` and `grant_workspace_credits` are revoked from `public`, `anon`, and `authenticated`. The same revoke covers reserve, settle, release, expiry, enqueue, and claim. Only `service_role` can execute them.
- Authenticated users cannot insert a workspace row directly. Creation goes through `create_workspace_with_owner`, which also creates the owner membership, settings, credit account, and free subscription.
- Audit inserts require the actor to be the signed-in user. A workspace audit row also requires the owner or admin role. Members cannot plant audit events.
- Email message writes and subscription or credit-account writes from the `authenticated` database role are rejected. Meeting rows inserted by that role cannot be marked provider-confirmed.
- Child rows that reference a prospect, company, list, campaign, search, or ICP in another workspace raise `workspace mismatch`.

## Data isolation

- Tenant tables have `workspace_id` and row level security.
- `integration_secrets` has RLS and no member policies. The worker reads it with the service role.
- No storage buckets are created. Do not add a public bucket without a policy that checks workspace membership on the object path.
- Service role bypasses RLS. That key stays on the worker and Edge Functions. It is not a `VITE_` variable and is not imported from `src/`.
- Analytics queries are filtered by the membership-checked workspace id and capped at 5,000 rows.

## Secrets management

- `.env` is gitignored. `.env.example` lists names only.
- Use different Supabase, Stripe, Paystack, OAuth, and OpenAI credentials for local, staging, and production.
- OAuth refresh tokens are encrypted with `WORKER_CREDENTIAL_KEY` before they are stored.
- Webhook secrets are compared with a timing-safe check. Stripe uses HMAC-SHA256 over `timestamp.body` with a five-minute tolerance. Paystack uses HMAC-SHA512 of the raw body.
- If a real key was ever committed, rotate it in the provider dashboard. Removing it from the current file does not remove it from git history.

## Website crawler

`parsePublicHttpUrl` rejects non-http(s) schemes, embedded credentials, non-public ports, localhost, `.local` and `.internal` names, numeric and octal hosts, and metadata hostnames. `isBlockedIp` rejects loopback, private, link-local, CGNAT, documentation, multicast, and cloud metadata addresses, including IPv4-mapped IPv6. The crawler resolves DNS and blocks the request if any answer is in that set, then connects to the checked address. Redirects are parsed and resolved again. Bodies, page counts, and duration are capped.

## AI

Website text and provider payloads are passed as untrusted data. Structured outputs are validated with Zod before they are stored. Assistant and generation routes have their own limits in addition to the worker request limit. Credit consumption is the cost control: a failed generation refunds the debit, and an unconfigured model is reported instead of a fabricated answer. Prompts are built for one membership-checked workspace.

## Email and campaigns

Outreach jobs are claimed once. Duplicate provider message ids are skipped. Suppression and unsubscribe stop further sends. Bounce and complaint events suppress the address. Ambiguous provider responses stay unreconciled rather than being marked delivered. A browser action does not count as delivery.

## Payments

Invalid signatures are rejected. `payment_events` is unique on provider and provider event id, so a duplicate event is a no-op after it has been processed. Subscription and credit changes run only after the signature check and a server-side retrieve of the provider object. The checkout return URL is `pending_provider_confirmation`. Free and enterprise plans cannot start self-serve checkout. Ledger updates take a row lock and draw lots in one transaction.

## Threat model

| Threat | Control | Residual risk |
|--------|---------|----------------|
| Cross-workspace read or write | RLS, membership checks, parent-workspace triggers | Not executed against a live database in this checkout |
| Stolen service-role key | Key is server-only | A leaked key bypasses RLS until rotated |
| Forged payment success | Signature plus provider retrieve | Sandbox webhooks were not executed here |
| SSRF through the crawler | Parse, DNS, pin, redirect revalidation | A public host that later tunnels traffic is outside the pin |
| Prompt injection in crawled pages | Untrusted-data prompt and Zod output | A model can still follow bad instructions inside its allowed schema |
| Password reset enumeration | Generic client response | Provider mail logs still show the address |
| Credit inflation by a member | Grant and consume revoked from `authenticated` | Service-role compromise still writes the ledger |
| Replay of a campaign send | Idempotency key and provider message id | A provider that accepts two different ids can still double-send |

## Incident response

1. Disable the affected provider key or Supabase key in that provider's dashboard.
2. Deploy the replacement only on the worker or Edge Function environment. Do not put it in a `VITE_` variable.
3. Review `admin_audit_log`, `audit_logs`, `payment_events`, and `credit_transactions` for the affected workspace and time window.
4. If a service-role key leaked, rotate it, then inspect workspace data for writes that members could not have made.
5. Record the incident in the operations log. Do not put secret values in that record.

## Data retention

- Account and workspace data stays until the workspace owner deletes the workspace or a documented export-and-delete request is completed.
- Credit and payment rows are append-only and are kept for the billing record.
- OAuth tokens are deleted when the account is disconnected.
- Crawl text is stored on the website analysis row for that workspace.
- There is no automatic purge job in this repository. Add one before promising a retention period to customers.

## Backup and recovery

- Enable daily Supabase backups on the production project and test a restore before launch.
- The worker is stateless. Jobs and heartbeats live in Postgres. A new worker resumes by claiming due jobs.
- This repository does not run backups. Backup status has to be confirmed in the Supabase project.

## Reporting

Remaining risks are listed in `PROSPECTRA_PRODUCTION_READINESS.md` and `DEVELOPMENT_PROGRESS.md`.
