# Prospectra

**Find Better Prospects. Build Better Connections.**

Prospectra is an AI-powered B2B sales intelligence and engagement SaaS platform. It helps teams discover companies, identify decision-makers, enrich contact data through authorised providers, score prospects, run outreach campaigns, and manage conversations — with credits, billing, and workspace isolation built in.

This repository is developed in numbered phases. **Phase 0** establishes the monorepo, tooling, documentation, and Cursor rules. Product features begin in Phase 1.

## Runtime requirements

| Tool | Version |
|------|---------|
| Node.js | **22+** (CI uses Node 22; local Node 24 is supported) |
| npm | **10+** (workspaces) |

A `package-lock.json` is committed after install. Prefer `npm ci` in CI and reproducible environments.

## Repository layout

```
prospectra/
├── src/                 # React 19 + Vite frontend (feature-based)
├── packages/shared/     # Shared types, Zod schemas, error codes
├── worker/              # Dedicated Node.js background worker
├── supabase/            # Migrations, Edge Functions, seed, config
├── tests/               # Unit, integration, and e2e tests
├── docs/                # Additional documentation
└── .github/workflows/   # CI
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the Vite frontend |
| `npm run dev:worker` | Start the worker with hot reload |
| `npm run build` | Typecheck project references and build the frontend |
| `npm run build:worker` | Build the worker |
| `npm run typecheck` | Typecheck web, shared, and worker |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright public pages and unconfigured app routes |
| `npm run check:release` | Reject destructive migrations and tables without RLS |
| `npm run format` | Prettier write |

## Local setup

1. Copy `.env.example` to `.env` and fill values as integrations are configured.
2. `npm install`
3. `npm run build -w @prospectra/shared`
4. `npm run dev` — frontend at http://127.0.0.1:5173
5. `npm run dev:worker` — health check at http://127.0.0.1:8787/health

Supabase is required for a signed-in workspace. This checkout does not include a live project. Copy `.env.example` and add your own keys. Do not commit them.

## Architecture summary

- **UI** is presentational. Business logic lives in services, integrations, and the worker.
- **Frontend** uses only the Supabase anon key. Service role keys, OpenAI keys, and payment secrets stay on the worker and Edge Functions.
- **Multi-tenant** data is workspace-scoped with Row Level Security (Phase 2+).
- **Providers** (discovery, email, calendar, payments, AI) are interfaces. Missing credentials surface an honest unconfigured state.
- **Long-running work** (crawls, campaigns) runs in the worker, not short-lived Edge Functions.

See [ARCHITECTURE.md](./ARCHITECTURE.md), [SECURITY.md](./SECURITY.md), and [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md).

## Documentation map

| Document | Status |
|----------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Phase 0 — foundation |
| [SECURITY.md](./SECURITY.md) | Authentication, isolation, threat model |
| [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) | Living progress log |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Migrations and tenant model |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Worker routes |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Local, staging, and production |
| [INTEGRATION_SETUP.md](./INTEGRATION_SETUP.md) | Provider setup |
| [TESTING.md](./TESTING.md) | What the automated suites cover |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |
| [PROSPECTRA_PRODUCTION_READINESS.md](./PROSPECTRA_PRODUCTION_READINESS.md) | Current production assessment |

## Brand

Prospectra uses deep navy, electric blue, and a restrained violet AI accent. Do not copy third-party logos or proprietary assets. A full design system and marketing site ship in Phase 1.
