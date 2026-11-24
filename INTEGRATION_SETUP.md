# Integration setup

**Status:** OpenAI, EnrichLayer (LinkedIn discovery/enrichment), Apollo (legacy), Hunter, Gmail, Microsoft 365, and Resend adapters are installed. Payment adapters remain a later phase.

## Worker

Set `VITE_WORKER_URL` in the frontend and run `npm run dev:worker`. The browser never crawls or calls provider APIs directly.

Required for privileged work:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`, optional `OPENAI_MODEL` (default `gpt-4.1-mini`), and optional `OPENAI_ORG_ID`

`npm run dev:worker` reads the repo-root `.env`. Existing process environment variables are left unchanged. The service-role key and OpenAI key stay on the worker. The browser only receives `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `WORKER_ALLOWED_ORIGINS`
- `WORKER_PUBLIC_URL`, `APP_URL`, and `WORKER_CREDENTIAL_KEY` before OAuth connects

## OpenAI

Used for website analysis, ICP generation, the sales assistant, email drafts, inbox suggestions, and optional score explanations. Outputs are JSON schema plus Zod. Missing `OPENAI_API_KEY` is an unconfigured state. Workspace and provider text is sent as untrusted evidence. Assistant replies cost 2 credits and email generation costs 2. Failures refund the reservation. Identical assistant requests inside ten minutes reuse the stored reply.

## Discovery and enrichment

| Variable | Adapter |
|----------|---------|
| `COMPANY_DATA_PROVIDER=enrichlayer` and `COMPANY_DATA_PROVIDER_API_KEY` | EnrichLayer LinkedIn company search (preferred). `apollo` remains as a legacy option |
| `CONTACT_DATA_PROVIDER=enrichlayer` and `CONTACT_DATA_PROVIDER_API_KEY` | EnrichLayer LinkedIn people search (preferred). `apollo` remains as a legacy option |
| `ENRICHMENT_PROVIDER=enrichlayer` and `ENRICHMENT_PROVIDER_API_KEY` | EnrichLayer person profile enrichment. Falls back to the contact key when the enrichment provider matches the contact provider |
| `EMAIL_VERIFICATION_PROVIDER=hunter` and `EMAIL_VERIFICATION_PROVIDER_API_KEY` | Hunter email verification |

Any other provider name is reported as misconfigured. Missing credentials show an unconfigured state and invent no people. No internal company database is used.

Credits: website analysis 5 on success; 1 per company result; 2 per contact result; 3 per enriched prospect; 2 per company enrichment; 1 per bulk-operation record; 1 per verification result; 1 per campaign send. Estimates are reserved and unused credits are returned. The ledger is append-only. Reservations debit immediately, settlement refunds the unused portion, and a failed job releases the remaining hold.

## Email and calendar

| Variable | Use |
|----------|-----|
| `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` | Gmail send, read, and token refresh |
| `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` | Microsoft 365 mail |
| `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Calendar. Falls back to the Gmail OAuth client |
| `MICROSOFT_CALENDAR_CLIENT_ID` and `MICROSOFT_CALENDAR_CLIENT_SECRET` | Microsoft calendar. Falls back to the mail OAuth client |
| `EMAIL_PROVIDER_API_KEY` | Resend send API. The key stays on the worker |
| `WORKER_CREDENTIAL_KEY` | Encrypts refresh tokens in `integration_secrets` |
| `WORKER_WEBHOOK_SECRET` | Microsoft Graph `clientState`. Unsigned notifications are rejected |

Redirect URI: `{WORKER_PUBLIC_URL}/v1/email/oauth/callback`. A provider HTTP success is stored as accepted, not delivered. A meeting is booked only after the calendar API returns an event id.

## Payments

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` | Stripe checkout, subscription changes, and signed webhooks |
| `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` | Paystack checkout and signed webhooks |
| `APP_URL` | Checkout return and cancel URLs |

Missing keys produce an unconfigured response. Webhooks that fail signature verification are rejected. A duplicate provider event id does not update the subscription again. The billing screen does not treat the checkout return URL as payment success.

Until credentials are configured, the product must show an explicit unconfigured state. Demonstration mode is only available when explicitly enabled.
