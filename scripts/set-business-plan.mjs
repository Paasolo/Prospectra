#!/usr/bin/env node
/**
 * Local/admin helper: set a workspace subscription to the Business plan.
 * Uses the service-role key from the repo-root .env. This is not a payment.
 *
 * Usage:
 *   node scripts/set-business-plan.mjs --email you@example.com
 *   node scripts/set-business-plan.mjs --workspace-id <uuid>
 *   node scripts/set-business-plan.mjs --slug my-workspace
 *
 * Options:
 *   --plan business|starter|growth|enterprise|free   (default: business)
 *   --interval month|year                            (default: month)
 *   --grant-credits                                  grant the plan's included_credits (default)
 *   --no-credits                                     skip the credit grant
 *   --dry-run                                        print the target without writing
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) {
    return;
  }
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]?.trim()) continue;
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function fail(message) {
  console.error(JSON.stringify({ level: "error", message }));
  process.exit(1);
}

loadEnv();

const email = arg("--email")?.trim().toLowerCase();
const workspaceId = arg("--workspace-id")?.trim();
const slug = arg("--slug")?.trim().toLowerCase();
const planCode = (arg("--plan", "business") ?? "business").trim().toLowerCase();
const interval = (arg("--interval", "month") ?? "month").trim().toLowerCase();
const dryRun = hasFlag("--dry-run");
const grantCredits = !hasFlag("--no-credits");

if (!email && !workspaceId && !slug) {
  fail("Pass --email, --workspace-id, or --slug.");
}
if (!["free", "starter", "growth", "business", "enterprise"].includes(planCode)) {
  fail(`Unknown plan code: ${planCode}`);
}
if (!["month", "year"].includes(interval)) {
  fail("Interval must be month or year.");
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRole) {
  fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: plan, error: planError } = await admin
  .from("plans")
  .select("id, code, name, included_credits, currency")
  .eq("code", planCode)
  .maybeSingle();
if (planError) fail(planError.message);
if (!plan) fail(`Plan '${planCode}' was not found. Apply the billing migrations first.`);

let workspace = null;

if (workspaceId) {
  const { data, error } = await admin.from("workspaces").select("id, name, slug").eq("id", workspaceId).maybeSingle();
  if (error) fail(error.message);
  workspace = data;
} else if (slug) {
  const { data, error } = await admin.from("workspaces").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (error) fail(error.message);
  workspace = data;
} else {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (profileError) fail(profileError.message);
  if (!profile) fail(`No profile found for ${email}`);

  const { data: memberships, error: memberError } = await admin
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, slug)")
    .eq("user_id", profile.id)
    .order("role", { ascending: true });
  if (memberError) fail(memberError.message);
  if (!memberships?.length) fail(`No workspace membership found for ${email}`);

  const owner = memberships.find((row) => row.role === "OWNER");
  const chosen = owner ?? memberships[0];
  workspace = Array.isArray(chosen.workspaces) ? chosen.workspaces[0] : chosen.workspaces;
  if (!workspace) fail(`Could not resolve a workspace for ${email}`);
}

if (!workspace) {
  fail("Workspace was not found.");
}

const periodStart = new Date();
const periodEnd = new Date(periodStart);
if (interval === "year") {
  periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
} else {
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
}

const subscriptionPatch = {
  workspace_id: workspace.id,
  plan_id: plan.id,
  status: "active",
  provider: "manual",
  billing_interval: interval,
  currency: plan.currency ?? "USD",
  current_period_start: periodStart.toISOString(),
  current_period_end: periodEnd.toISOString(),
  cancel_at: null,
};

console.log(
  JSON.stringify({
    level: "info",
    message: dryRun ? "Dry run — no writes" : "Updating workspace subscription",
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    plan: { code: plan.code, name: plan.name, includedCredits: plan.included_credits },
    interval,
    grantCredits,
  }),
);

if (dryRun) {
  process.exit(0);
}

const { data: existing, error: existingError } = await admin
  .from("subscriptions")
  .select("id, status, plan_id")
  .eq("workspace_id", workspace.id)
  .maybeSingle();
if (existingError) fail(existingError.message);

let subscriptionId = existing?.id ?? null;
if (existing) {
  const { error } = await admin.from("subscriptions").update(subscriptionPatch).eq("id", existing.id);
  if (error) fail(error.message);
} else {
  const { data, error } = await admin.from("subscriptions").insert(subscriptionPatch).select("id").single();
  if (error) fail(error.message);
  subscriptionId = data.id;
}

let granted = 0;
if (grantCredits && plan.included_credits > 0) {
  const { data: balance, error: grantError } = await admin.rpc("grant_workspace_credits", {
    p_workspace_id: workspace.id,
    p_amount: plan.included_credits,
    p_reason: `${plan.code}_plan_grant`,
    p_reference_type: "subscription",
    p_reference_id: subscriptionId,
    p_actor: null,
  });
  if (grantError) fail(grantError.message);
  granted = Number(balance ?? plan.included_credits);
}

const { data: account } = await admin
  .from("credit_accounts")
  .select("balance")
  .eq("workspace_id", workspace.id)
  .maybeSingle();

console.log(
  JSON.stringify({
    level: "info",
    message: "Workspace plan updated",
    workspaceId: workspace.id,
    subscriptionId,
    plan: plan.code,
    status: "active",
    creditsGranted: grantCredits ? plan.included_credits : 0,
    creditBalance: account?.balance ?? granted,
    note: "Manual override. This is not a provider payment confirmation.",
  }),
);
