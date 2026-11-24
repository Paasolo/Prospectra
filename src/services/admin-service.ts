import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { postWorker } from "@/services/worker-client";

const count = z.array(z.object({ label: z.string(), count: z.number() }));

export const adminService = {
  async isAdmin(userId: string) {
    const client = getSupabaseClient();
    const { data, error } = await client.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  },
  overview() {
    return postWorker("/v1/admin/overview", {}, z.object({
      users: z.number(),
      workspaces: z.number(),
      registrations30d: z.number(),
      activeSubscriptions: z.number(),
      subscriptionDistribution: count,
      jobs: count,
      aiRequests: z.number(),
      subscriptionSampleLimited: z.boolean(),
    }));
  },
  users() {
    return postWorker("/v1/admin/users", {}, z.object({ users: z.array(z.object({ id: z.string(), email: z.string(), full_name: z.string().nullable(), created_at: z.string() })) }));
  },
  workspaces() {
    return postWorker("/v1/admin/workspaces", {}, z.object({ workspaces: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string(), created_at: z.string() })) }));
  },
  subscriptions() {
    return postWorker("/v1/admin/subscriptions", {}, z.object({ subscriptions: z.array(z.record(z.unknown())) }));
  },
  jobs() {
    return postWorker("/v1/admin/jobs", {}, z.object({ jobs: z.array(z.record(z.unknown())) }));
  },
  retry(jobId: string) {
    return postWorker("/v1/admin/jobs/retry", { jobId }, z.object({ queued: z.boolean() }));
  },
  webhooks() {
    return postWorker("/v1/admin/webhooks", {}, z.object({ events: z.array(z.record(z.unknown())) }));
  },
  audit() {
    return postWorker("/v1/admin/audit", {}, z.object({ entries: z.array(z.record(z.unknown())) }));
  },
  flags(body: { key?: string; enabled?: boolean } = {}) {
    return postWorker("/v1/admin/flags", body, z.object({ flags: z.array(z.object({ key: z.string(), description: z.string().nullable(), enabled: z.boolean() })) }));
  },
  settings(body: { key?: string; value?: Record<string, unknown> } = {}) {
    return postWorker("/v1/admin/settings", body, z.object({ settings: z.array(z.object({ key: z.string(), value: z.record(z.unknown()) })) }));
  },
  integrations() {
    return postWorker("/v1/admin/integrations", {}, z.object({ integrations: count }));
  },
  health() {
    return postWorker("/v1/admin/health", {}, z.object({
      workers: z.array(z.object({ worker_id: z.string(), seen_at: z.string(), queue_depth: z.number(), last_error: z.string().nullable() })),
      providers: z.array(z.object({ id: z.string(), role: z.string(), state: z.string(), detail: z.string() })),
    }));
  },
  credits(body: { workspaceId: string; amount: number; reason: string }) {
    return postWorker("/v1/admin/credits", body, z.object({ adjusted: z.boolean() }));
  },
  async plans() {
    const client = getSupabaseClient();
    const { data, error } = await client.from("plans").select("id, code, name, currency, monthly_price_cents, annual_price_cents, included_credits, team_member_limit, prospect_limit, campaign_limit, ai_allowance, enrichment_allowance, features");
    if (error) throw new Error(error.message);
    return { plans: data ?? [] };
  },
  updatePlan(body: { planId: string; currency?: string; monthlyPriceCents?: number; annualPriceCents?: number; includedCredits?: number }) {
    return postWorker("/v1/admin/plans", body, z.object({ updated: z.boolean() }));
  },
};
