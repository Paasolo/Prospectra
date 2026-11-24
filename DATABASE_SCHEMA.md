# Database schema

**Status:** Phase 2 migrations authored. Apply with Supabase CLI against a local or remote project.

## Migration files

| File | Purpose |
|------|---------|
| `20260323000001_extensions_and_helpers.sql` | `pgcrypto`, `set_updated_at`, `current_user_id` |
| `20260323000002_identity_and_workspaces.sql` | profiles, workspaces, members, invitations, settings, audit_logs, auth trigger |
| `20260323000003_billing_and_credits.sql` | plans, subscriptions, credit_accounts, credit_transactions, usage_records |
| `20260323000004_companies_prospects_icp_discovery.sql` | companies, prospects, lists, ICPs, discovery |
| `20260323000005_integrations_notifications_campaigns.sql` | integrations, notifications, campaigns, email_messages, meetings |
| `20260323000006_membership_helpers_and_rls.sql` | `is_workspace_member`, `has_workspace_role`, `has_workspace_permission`, RLS |
| `20260323000007_workspace_bootstrap_rpc.sql` | `create_workspace_with_owner` atomic bootstrap |
| `20260323000008_analysis_icp_crm_enrichment.sql` | website analyses, ICP lifecycle, CRM activity, discovery provenance, enrichment, scoring, credit RPCs |
| `20260323000009_engagement.sql` | assistant, templates, drafts, connected accounts, encrypted secrets, campaign steps, outreach jobs, inbox, calendar fields |
| `20260323000010_billing_analytics_admin_jobs.sql` | credit lots and reservations, invoices, refunds, payment events, notification preferences, platform admins, background jobs |
| `20260323000011_security_hardening.sql` | workspace bootstrap-only inserts, audit isolation, cross-workspace triggers, credit function revokes, query indexes |
| `20260323000012_outbound_agent.sql` | `agent_runs`, `agent_segments`, RLS, and workspace-match triggers for the outbound agent |

## Core entities

- **Identity:** `profiles`, `workspaces`, `workspace_members`, `workspace_invitations`, `workspace_settings`, `audit_logs`
- **Billing:** `plans`, `subscriptions`, `credit_accounts`, `credit_lots`, `credit_transactions` (append-only), `credit_reservations`, `billing_profiles`, `invoices`, `refunds`, `payment_events`, `usage_records`
- **Prospecting:** `companies`, `prospects`, `prospect_lists`, `prospect_list_members`, `icp_profiles`, `discovery_searches`, `discovery_search_results`, `agent_runs`, `agent_segments`
- **Analysis and qualification:** `website_analyses`, `pipeline_stages`, `prospect_notes`, `prospect_activities`, `prospect_merges`, `enrichment_jobs`, `enrichment_field_values`, `scoring_configs`, `prospect_scores`
- **Engagement:** `campaigns`, `campaign_steps`, `campaign_enrollments`, `outreach_jobs`, `email_messages`, `email_templates`, `email_drafts`, `connected_accounts`, `integration_secrets`, `suppressions`, `inbox_conversations`, `inbox_notes`, `meetings`, `ai_conversations`, `ai_messages`, `ai_usage_log`, `integrations`, `notifications`, `notification_preferences`
- **Platform:** `platform_admins`, `admin_audit_log`, `feature_flags`, `platform_settings`, `background_jobs`, `worker_heartbeats`

Credit balances change only inside `FOR UPDATE` functions. A reservation debits the ledger immediately. Settlement refunds unused credits. Release returns the full hold after a terminal job failure or reservation expiry. Expired lots write a negative ledger row. Members can read billing records. They cannot insert payment events, ledger rows, or notifications. `consume_workspace_credits` and `grant_workspace_credits` are revoked from `authenticated`. Platform administrator rows are readable only by the signed-in administrator. Background job claim and enqueue functions are granted to `service_role` only. Child rows that point at a prospect, company, list, campaign, or search in another workspace are rejected by trigger. Direct workspace inserts are not allowed; creation goes through `create_workspace_with_owner`.

## Security model

- RLS enabled on tenant-owned tables.
- Membership checks use `security definer` helpers to avoid recursive policies.
- Frontend workspace IDs are never trusted alone — policies require authenticated membership.
- Workspace bootstrap is atomic via `create_workspace_with_owner`.

## Apply locally

```bash
supabase start
supabase db reset
```

Full Postgres RLS integration tests require a running stack; helper intent is covered by unit tests in `tests/integration/rls-helpers.test.ts` and `tests/unit/permissions.test.ts`.
