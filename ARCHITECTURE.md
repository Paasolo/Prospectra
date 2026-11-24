# Architecture

Prospectra is a multi-tenant SaaS platform with a clear separation between the browser app, privileged backend surfaces, and durable background processing.

## System context

```
┌─────────────────┐     anon key + RLS      ┌──────────────────────┐
│  Vite React app │ ───────────────────────► │ Supabase             │
│  (Vercel)       │                          │ Postgres, Auth,      │
└────────┬────────┘                          │ Storage, Realtime,   │
         │                                   │ Edge Functions       │
         │ enqueue via Edge / RPC            └──────────┬───────────┘
         │                                              │
         │                                   service role / DB
         │                                              │
         ▼                                              ▼
┌─────────────────┐                          ┌──────────────────────┐
│ packages/shared │ ◄─────────────────────── │ worker (Node.js)     │
│ types & schemas │                          │ jobs, providers, AI  │
└─────────────────┘                          └──────────────────────┘
```

## Packages

| Package | Role |
|---------|------|
| Root `src/` | React UI, feature modules, thin hooks that call services |
| `@prospectra/shared` | Shared constants, Zod schemas, error codes, job/status types |
| `@prospectra/worker` | Durable job processing, provider adapters, privileged AI and billing work |
| `supabase/` | Migrations, RLS, Edge Functions for short request/response work |

## Layering rules

1. **UI components** render state and emit events. They do not contain business rules, credit math, scoring, or provider calls.
2. **Features** compose UI and call hooks/services.
3. **Services** (`src/services`) implement application use cases against typed repositories and client APIs.
4. **Integrations** (`src/integrations`, `worker/src/providers`) wrap external vendors behind interfaces.
5. **Data access** for privileged paths uses the service role only on the worker or Edge Functions.
6. **AI orchestration** validates structured outputs with Zod and never treats website or provider text as instructions.

## Authorization

- Every tenant-owned row is scoped by `workspace_id` (Phase 2+).
- PostgreSQL Row Level Security enforces membership. Frontend-supplied workspace IDs are verified against authenticated membership, never trusted alone.
- User-editable JWT/app metadata is not an authorization source.
- Platform administrators use a separate, server-enforced mechanism (Phase 17).

## Background jobs

- Source of truth: `background_jobs` (and related attempt tables) introduced with the schema.
- Optional: Supabase Queues (pgmq) when available; the table remains authoritative.
- Jobs are idempotent, retry-bounded, and may move to a dead-letter state.
- Website crawls and campaign sends **must not** run inside short-lived Edge Functions.

## Provider honesty

External systems (email, discovery, enrichment, calendar, Stripe, Paystack, OpenAI) are accessed through adapters.

| State | Meaning |
|-------|---------|
| `configured` | Credentials present and validated enough to attempt calls |
| `unconfigured` | No credentials — show setup UI |
| `misconfigured` | Credentials present but failing validation |
| `disabled` | Explicitly turned off |

Never invent emails, scores, payment success, or delivery confirmation. Provider **acceptance** is not **delivery**. Calendar meetings are confirmed only after the provider confirms the event.

## Secrets

| Secret | Allowed locations |
|--------|-------------------|
| `VITE_SUPABASE_ANON_KEY` | Frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker, Edge Functions |
| `OPENAI_API_KEY` | Worker, Edge Functions |
| Stripe / Paystack secrets | Worker, Edge Functions |
| OAuth client secrets | Worker, Edge Functions |

## Frontend stack

React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui toolchain, TanStack Query, React Router, React Hook Form, Zod, Recharts, Lucide, date-fns.

## Testing strategy

- **Unit**: validation, scoring, credits, permissions, utilities (Vitest).
- **Integration**: RLS, webhooks, job processing, adapters (later phases).
- **E2E**: critical user journeys (Playwright, later phases).

## Deployment targets (Phase 19)

- Frontend: Vercel
- Backend: Supabase
- Worker: separate Node deployment
- CI/CD: GitHub Actions
