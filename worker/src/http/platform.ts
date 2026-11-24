import type { IncomingMessage, ServerResponse } from "node:http";
import { analyticsToCsv } from "@prospectra/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { summarizeWorkspace } from "../analytics/summarize.js";
import { describeProviders, type WorkerConfig } from "../config.js";
import { cancelSubscription, changeSubscription, createCheckoutSession, handlePaystackWebhook, handleStripeWebhook } from "../payments/billing.js";
import { renderReportPdf } from "../reports/pdf.js";
import { clientSafeError, HttpError } from "./errors.js";

const uuid = z.string().uuid();

async function readRaw(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new HttpError(413, "VALIDATION_FAILED", "Request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function requireMember(admin: SupabaseClient, workspaceId: string, userId: string): Promise<void> {
  const { data, error } = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(500, "INTERNAL", error.message);
  if (!data) throw new HttpError(403, "FORBIDDEN", "You are not a member of this workspace.");
}

async function requireAdmin(admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new HttpError(500, "INTERNAL", error.message);
  if (!data) throw new HttpError(403, "FORBIDDEN", "Platform administrator access is required.");
}

async function audit(admin: SupabaseClient, actorId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
  await admin.from("admin_audit_log").insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, metadata });
}

export async function handlePublicBilling(input: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: WorkerConfig;
  admin: SupabaseClient | null;
  cors: Record<string, string>;
}): Promise<boolean> {
  const path = input.url.pathname;
  if (input.req.method !== "POST" || (path !== "/v1/billing/webhooks/stripe" && path !== "/v1/billing/webhooks/paystack")) return false;
  const send = (status: number, body: unknown) => {
    input.res.writeHead(status, { "content-type": "application/json", ...input.cors });
    input.res.end(JSON.stringify(body));
  };
  try {
    if (!input.admin) throw new HttpError(503, "PROVIDER_UNCONFIGURED", "Supabase is not configured on the worker.");
    const raw = await readRaw(input.req);
    const header = path.endsWith("stripe") ? input.req.headers["stripe-signature"] : input.req.headers["x-paystack-signature"];
    const signature = Array.isArray(header) ? header[0] : header;
    const result = path.endsWith("stripe")
      ? await handleStripeWebhook(input.admin, input.config, raw, signature)
      : await handlePaystackWebhook(input.admin, input.config, raw, signature);
    send(200, { received: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(400, { code: "VALIDATION_FAILED", message: "The payment event did not match the expected provider payload." });
    } else {
      const safe = clientSafeError(error);
      send(safe.statusCode, { code: safe.code, message: safe.message });
    }
  }
  return true;
}

const billingBody = z.object({
  workspaceId: uuid,
  planCode: z.string().trim().min(1).max(40),
  interval: z.enum(["month", "year"]),
  provider: z.enum(["stripe", "paystack"]),
});

const analyticsBody = z.object({
  workspaceId: uuid,
  from: z.string().datetime(),
  to: z.string().datetime(),
  campaignId: uuid.optional(),
  icpId: uuid.optional(),
  source: z.string().trim().max(80).optional(),
  ownerId: uuid.optional(),
  industry: z.string().trim().max(120).optional(),
  geography: z.string().trim().max(120).optional(),
});

export async function handleMemberPlatform(input: {
  url: URL;
  config: WorkerConfig;
  admin: SupabaseClient;
  userId: string;
  body: unknown;
  send: (status: number, body: unknown) => void;
  res: ServerResponse;
  cors: Record<string, string>;
}): Promise<boolean> {
  const path = input.url.pathname;
  if (!path.startsWith("/v1/billing/") && !path.startsWith("/v1/analytics/") && !path.startsWith("/v1/admin/")) return false;
  if (path.startsWith("/v1/admin/")) await requireAdmin(input.admin, input.userId);
  if (path === "/v1/billing/checkout" || path === "/v1/billing/change") {
    const body = billingBody.parse(input.body);
    await requireMember(input.admin, body.workspaceId, input.userId);
    const { data: flag } = await input.admin.from("feature_flags").select("enabled").eq("key", "billing_checkout").maybeSingle();
    if (flag && flag.enabled === false) throw new HttpError(403, "FORBIDDEN", "Checkout is disabled by a platform feature flag.");
    const { data: profile } = await input.admin.from("profiles").select("email").eq("id", input.userId).maybeSingle();
    if (!profile?.email) throw new HttpError(400, "VALIDATION_FAILED", "The signed-in profile has no email address.");
    const request = { admin: input.admin, config: input.config, workspaceId: body.workspaceId, planCode: body.planCode, interval: body.interval, provider: body.provider, email: profile.email };
    input.send(200, path.endsWith("change") ? await changeSubscription(request) : { status: "redirect", ...(await createCheckoutSession(request)), message: "Continue to the payment provider. This response is not a payment confirmation." });
    return true;
  }
  if (path === "/v1/billing/cancel") {
    const body = z.object({ workspaceId: uuid }).parse(input.body);
    await requireMember(input.admin, body.workspaceId, input.userId);
    input.send(200, await cancelSubscription({ admin: input.admin, config: input.config, workspaceId: body.workspaceId }));
    return true;
  }
  if (path === "/v1/analytics/summary" || path === "/v1/analytics/pdf") {
    const filters = analyticsBody.parse(input.body);
    await requireMember(input.admin, filters.workspaceId, input.userId);
    const summary = await summarizeWorkspace(input.admin, input.userId, filters);
    if (path.endsWith("pdf")) {
      const { data: flag } = await input.admin.from("feature_flags").select("enabled").eq("key", "analytics_pdf").maybeSingle();
      if (flag && flag.enabled === false) throw new HttpError(403, "FORBIDDEN", "PDF reports are disabled by a platform feature flag.");
      const lines = [
        "Prospectra analytics report",
        `Workspace ${filters.workspaceId}`,
        `${filters.from} to ${filters.to}`,
        `Discovered ${summary.prospects.discovered}`,
        `Qualified ${summary.prospects.qualified}`,
        `Contacted ${summary.prospects.contacted}`,
        `Engaged ${summary.prospects.engaged}`,
        `Meetings booked ${summary.prospects.meetingsBooked}`,
        `Customers ${summary.prospects.customersAcquired}`,
        `Conversion ${summary.rates.prospectConversion ?? "n/a"}`,
        `Messages attempted ${summary.campaigns.attempted}`,
        `Confirmed deliveries ${summary.campaigns.delivered}`,
        `Replies ${summary.campaigns.replies}`,
        ...summary.finance.revenueByCurrency.map((row) => `Revenue ${row.currency} ${row.amountCents}`),
        summary.finance.revenueByCurrency.length ? "" : "No paid invoices in this range",
      ];
      const pdf = renderReportPdf(lines.filter(Boolean));
      input.res.writeHead(200, { "content-type": "application/pdf", "content-disposition": "attachment; filename=prospectra-report.pdf", ...input.cors });
      input.res.end(Buffer.from(pdf));
      return true;
    }
    input.send(200, { ...summary, csv: analyticsToCsv(summary) });
    return true;
  }
  if (path === "/v1/admin/overview") {
    const [users, workspaces, subscriptions, jobs, ai] = await Promise.all([
      input.admin.from("profiles").select("id", { count: "exact", head: true }),
      input.admin.from("workspaces").select("id", { count: "exact", head: true }),
      input.admin.from("subscriptions").select("status").limit(1000),
      input.admin.from("background_jobs").select("status").limit(1000),
      input.admin.from("ai_usage_log").select("id", { count: "exact", head: true }),
    ]);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const registrations = await input.admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since);
    const distribution = countBy((subscriptions.data ?? []).map((row) => row.status));
    input.send(200, {
      users: users.count ?? 0,
      workspaces: workspaces.count ?? 0,
      registrations30d: registrations.count ?? 0,
      activeSubscriptions: (subscriptions.data ?? []).filter((row) => row.status === "active").length,
      subscriptionDistribution: distribution,
      jobs: countBy((jobs.data ?? []).map((row) => row.status)),
      aiRequests: ai.count ?? 0,
      subscriptionSampleLimited: (subscriptions.data?.length ?? 0) >= 1000,
    });
    return true;
  }
  if (path === "/v1/admin/users") {
    const { data, error } = await input.admin.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { users: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/workspaces") {
    const { data, error } = await input.admin.from("workspaces").select("id, name, slug, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { workspaces: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/subscriptions") {
    const { data, error } = await input.admin.from("subscriptions").select("id, workspace_id, status, provider, currency, billing_interval, current_period_end, cancel_at").limit(100);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { subscriptions: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/plans") {
    const body = z.object({
      planId: uuid,
      currency: z.string().trim().length(3).optional(),
      monthlyPriceCents: z.number().int().nonnegative().optional(),
      annualPriceCents: z.number().int().nonnegative().optional(),
      includedCredits: z.number().int().nonnegative().optional(),
      teamMemberLimit: z.number().int().positive().nullable().optional(),
      prospectLimit: z.number().int().nonnegative().nullable().optional(),
      campaignLimit: z.number().int().nonnegative().nullable().optional(),
      aiAllowance: z.number().int().nonnegative().nullable().optional(),
      enrichmentAllowance: z.number().int().nonnegative().nullable().optional(),
    }).parse(input.body);
    const patch = {
      currency: body.currency?.toUpperCase(),
      monthly_price_cents: body.monthlyPriceCents,
      annual_price_cents: body.annualPriceCents,
      included_credits: body.includedCredits,
      team_member_limit: body.teamMemberLimit,
      prospect_limit: body.prospectLimit,
      campaign_limit: body.campaignLimit,
      ai_allowance: body.aiAllowance,
      enrichment_allowance: body.enrichmentAllowance,
    };
    const defined = Object.fromEntries(Object.entries(patch).filter((entry) => entry[1] !== undefined));
    const { error } = await input.admin.from("plans").update(defined).eq("id", body.planId);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    await audit(input.admin, input.userId, "plan.update", "plan", body.planId, defined);
    input.send(200, { updated: true });
    return true;
  }
  if (path === "/v1/admin/credits") {
    const body = z.object({ workspaceId: uuid, amount: z.number().int(), reason: z.string().trim().min(3).max(200) }).parse(input.body);
    if (body.amount === 0) throw new HttpError(400, "VALIDATION_FAILED", "Credit adjustments cannot be zero.");
    const rpc = body.amount > 0 ? "grant_workspace_credits" : "consume_workspace_credits";
    const { error } = await input.admin.rpc(rpc, {
      p_workspace_id: body.workspaceId,
      p_amount: Math.abs(body.amount),
      p_reason: body.reason,
      p_reference_type: "admin_adjustment",
      p_reference_id: input.userId,
      p_actor: input.userId,
    });
    if (error) throw new HttpError(error.message.toLowerCase().includes("insufficient") ? 402 : 500, error.message.toLowerCase().includes("insufficient") ? "CREDIT_INSUFFICIENT" : "INTERNAL", error.message);
    await audit(input.admin, input.userId, "credits.adjust", "workspace", body.workspaceId, { amount: body.amount, reason: body.reason });
    input.send(200, { adjusted: true });
    return true;
  }
  if (path === "/v1/admin/jobs") {
    const { data, error } = await input.admin.from("background_jobs").select("id, workspace_id, job_type, status, attempts, max_attempts, last_error, error_category, run_at, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { jobs: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/jobs/retry") {
    const body = z.object({ jobId: uuid }).parse(input.body);
    const { error } = await input.admin.from("background_jobs").update({ status: "pending", run_at: new Date().toISOString(), locked_by: null, locked_at: null }).eq("id", body.jobId).in("status", ["dead_letter", "failed"]);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    await audit(input.admin, input.userId, "job.retry", "background_job", body.jobId, {});
    input.send(200, { queued: true });
    return true;
  }
  if (path === "/v1/admin/webhooks") {
    const { data, error } = await input.admin.from("payment_events").select("id, provider, event_type, workspace_id, processed_at, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { events: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/audit") {
    const { data, error } = await input.admin.from("admin_audit_log").select("id, actor_id, action, target_type, target_id, created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { entries: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/flags") {
    const body = z.object({ key: z.string().trim().min(1).max(80).optional(), enabled: z.boolean().optional() }).parse(input.body);
    if (body.key && body.enabled !== undefined) {
      const { error } = await input.admin.from("feature_flags").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("key", body.key);
      if (error) throw new HttpError(500, "INTERNAL", error.message);
      await audit(input.admin, input.userId, "flag.update", "feature_flag", body.key, { enabled: body.enabled });
    }
    const { data, error } = await input.admin.from("feature_flags").select("key, description, enabled").order("key");
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { flags: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/settings") {
    const body = z.object({ key: z.string().trim().min(1).max(80).optional(), value: z.record(z.unknown()).optional() }).parse(input.body);
    if (body.key && body.value) {
      const { error } = await input.admin.from("platform_settings").upsert({ key: body.key, value: body.value, updated_at: new Date().toISOString() });
      if (error) throw new HttpError(500, "INTERNAL", error.message);
      await audit(input.admin, input.userId, "settings.update", "platform_setting", body.key, {});
    }
    const { data, error } = await input.admin.from("platform_settings").select("key, value");
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { settings: data ?? [] });
    return true;
  }
  if (path === "/v1/admin/integrations") {
    const { data, error } = await input.admin.from("connected_accounts").select("provider, status").limit(1000);
    if (error) throw new HttpError(500, "INTERNAL", error.message);
    input.send(200, { integrations: countBy((data ?? []).map((row) => `${row.provider}:${row.status}`)) });
    return true;
  }
  if (path === "/v1/admin/health") {
    const { data } = await input.admin.from("worker_heartbeats").select("worker_id, seen_at, queue_depth, last_error");
    input.send(200, { workers: data ?? [], providers: describeProviders(input.config).map(({ id, role, state, detail }) => ({ id, role, state, detail })) });
    return true;
  }
  return false;
}

function countBy(values: string[]): Array<{ label: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const value of values) buckets.set(value, (buckets.get(value) ?? 0) + 1);
  return [...buckets.entries()].map(([label, count]) => ({ label, count }));
}
