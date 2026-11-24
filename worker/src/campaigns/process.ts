import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CREDIT_COSTS, decideOutreach, isInsideSendingWindow, retryDelayMs, type SendDecision } from "@prospectra/shared";
import type { WorkerConfig } from "../config.js";
import { decryptJson, type StoredTokens } from "../credentials/crypto.js";
import { classifySendError, createMailbox, type MailAccepted } from "../email/mailbox.js";

export type ClaimedJob = {
  reconcile: boolean;
  attempts: number;
  maxAttempts: number;
  campaignStatus: string;
  enrollmentStatus: string;
  suppressed: boolean;
  insideWindow: boolean;
  sentToday: number;
  dailyLimit: number;
};

export type JobUpdate = {
  status: "pending" | "succeeded" | "failed" | "dead_letter" | "needs_reconciliation";
  reconcile?: boolean;
  attempts?: number;
  runAt?: string;
  lastError?: string;
  providerMessageId?: string | null;
  accepted?: MailAccepted;
};

export async function handleClaimedJob(
  job: ClaimedJob,
  deps: {
    now: Date;
    send: () => Promise<MailAccepted>;
    reconcile: () => Promise<MailAccepted | null>;
    update: (patch: JobUpdate) => Promise<void>;
  },
): Promise<SendDecision | { action: "accepted" }> {
  const decision = decideOutreach({
    campaignStatus: job.campaignStatus,
    enrollmentStatus: job.enrollmentStatus,
    suppressed: job.suppressed,
    ambiguousAttempt: job.reconcile,
    insideWindow: job.insideWindow,
    sentToday: job.sentToday,
    dailyLimit: job.dailyLimit,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
  });

  if (decision.action === "reconcile") {
    const found = await deps.reconcile();
    if (!found) {
      await deps.update({
        status: "needs_reconciliation",
        reconcile: true,
        lastError: decision.reason,
      });
      return decision;
    }
    await deps.update({ status: "succeeded", reconcile: false, accepted: found, providerMessageId: found.providerMessageId });
    return { action: "accepted" };
  }

  if (decision.action === "defer") {
    await deps.update({ status: "pending", runAt: new Date(deps.now.getTime() + 15 * 60_000).toISOString(), lastError: decision.reason });
    return decision;
  }
  if (decision.action === "stop" || decision.action === "dead_letter") {
    await deps.update({ status: decision.action === "stop" ? "failed" : "dead_letter", lastError: decision.reason });
    return decision;
  }

  try {
    const accepted = await deps.send();
    await deps.update({ status: "succeeded", reconcile: false, accepted, providerMessageId: accepted.providerMessageId });
    return { action: "accepted" };
  } catch (error) {
    const classified = classifySendError(error);
    if (classified.kind === "reconcile") {
      await deps.update({
        status: "needs_reconciliation",
        reconcile: true,
        providerMessageId: classified.providerMessageId,
        lastError: classified.message,
      });
      return { action: "reconcile", reason: classified.message };
    }
    const attempts = job.attempts + 1;
    if (classified.kind === "fail" || attempts >= job.maxAttempts) {
      await deps.update({ status: attempts >= job.maxAttempts && classified.kind !== "fail" ? "dead_letter" : "failed", attempts, lastError: classified.message });
      return { action: "dead_letter", reason: classified.message };
    }
    await deps.update({
      status: "pending",
      attempts,
      runAt: new Date(deps.now.getTime() + retryDelayMs(attempts)).toISOString(),
      lastError: classified.message,
    });
    return { action: "defer", reason: classified.message };
  }
}

type JobRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  enrollment_id: string;
  step_position: number;
  attempts: number;
  max_attempts: number;
  reconcile: boolean;
  provider_message_id: string | null;
};

function zonedDayStart(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const second = Number(parts.find((part) => part.type === "second")?.value ?? "0");
  return new Date(now.getTime() - ((hour * 60 + minute) * 60 + second) * 1000);
}

async function refundSend(admin: SupabaseClient, workspaceId: string, referenceId: string) {
  await admin.rpc("grant_workspace_credits", {
    p_workspace_id: workspaceId,
    p_amount: CREDIT_COSTS.emailSend,
    p_reason: "outreach_send_failed",
    p_reference_type: "outreach_job",
    p_reference_id: referenceId,
    p_actor: null,
  });
}

export async function processDueOutreach(admin: SupabaseClient, config: WorkerConfig, workerId = `worker-${process.pid}`): Promise<{ processed: number }> {
  const { data, error } = await admin.rpc("claim_outreach_jobs", { p_worker: workerId, p_limit: 5 });
  if (error) {
    throw new Error(error.message);
  }
  const jobs = (data ?? []) as JobRow[];
  for (const job of jobs) {
    await settleClaimedJob(admin, config, job);
  }
  return { processed: jobs.length };
}

async function settleClaimedJob(admin: SupabaseClient, config: WorkerConfig, job: JobRow) {
  const { data: campaign } = await admin.from("campaigns").select("*").eq("id", job.campaign_id).maybeSingle();
  const { data: enrollment } = await admin.from("campaign_enrollments").select("*").eq("id", job.enrollment_id).maybeSingle();
  const { data: prospect } = await admin.from("prospects").select("*").eq("id", enrollment?.prospect_id ?? "").maybeSingle();
  const { data: step } = await admin
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", job.campaign_id)
    .eq("position", job.step_position)
    .maybeSingle();
  const { data: account } = await admin.from("connected_accounts").select("*").eq("id", campaign?.sending_account_id ?? "").maybeSingle();
  const email = typeof prospect?.email === "string" ? prospect.email.trim().toLowerCase() : "";
  const { data: suppressed } = email
    ? await admin.from("suppressions").select("id").eq("workspace_id", job.workspace_id).eq("email", email).maybeSingle()
    : { data: null };
  const timezone = typeof campaign?.timezone === "string" ? campaign.timezone : "UTC";
  const now = new Date();
  let insideWindow = false;
  try {
    insideWindow = isInsideSendingWindow({
      now,
      timeZone: timezone,
      startMinutes: campaign?.send_window_start_minutes ?? 0,
      endMinutes: campaign?.send_window_end_minutes ?? 24 * 60,
      days: campaign?.send_days ?? [1, 2, 3, 4, 5],
    });
  } catch {
    insideWindow = false;
  }
  let dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  try {
    dayStart = zonedDayStart(now, timezone);
  } catch {
    dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
  }
  const { count } = await admin
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", job.workspace_id)
    .eq("sending_account_id", account?.id ?? "")
    .in("delivery_state", ["accepted", "delivered"])
    .gte("attempted_at", dayStart.toISOString());

  const mailbox = createMailbox();
  await handleClaimedJob(
    {
      reconcile: Boolean(job.reconcile),
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      campaignStatus: campaign?.status ?? "DRAFT",
      enrollmentStatus: enrollment?.status ?? "stopped",
      suppressed: Boolean(suppressed),
      insideWindow,
      sentToday: count ?? 0,
      dailyLimit: account?.daily_limit ?? campaign?.daily_limit ?? 1,
    },
    {
      now,
      send: async () => sendStep(config, admin, mailbox, account, step, prospect, job),
      reconcile: async () => reconcileStep(config, admin, mailbox, account, job),
      update: async (patch) => {
        await admin
          .from("outreach_jobs")
          .update({
            status: patch.status,
            reconcile: patch.reconcile ?? job.reconcile,
            attempts: patch.attempts ?? job.attempts,
            run_at: patch.runAt,
            last_error: patch.lastError ?? null,
            provider_message_id: patch.providerMessageId ?? job.provider_message_id,
            locked_at: null,
          })
          .eq("id", job.id);
        if (patch.accepted) {
          await recordAccepted(admin, job, step, prospect, account, patch.accepted);
        }
        if (patch.status === "failed" || patch.status === "dead_letter") {
          await admin.from("campaign_enrollments").update({ status: "stopped", stop_reason: patch.lastError ?? patch.status }).eq("id", job.enrollment_id);
          await refundSend(admin, job.workspace_id, job.id);
        }
      },
    },
  );
}

async function accountTokens(admin: SupabaseClient, config: WorkerConfig, accountId: string): Promise<StoredTokens | null> {
  if (!config.credentialKey) {
    return null;
  }
  const { data } = await admin.from("integration_secrets").select("ciphertext").eq("account_id", accountId).maybeSingle();
  if (!data?.ciphertext || typeof data.ciphertext !== "string") {
    return null;
  }
  const parsed = decryptJson(data.ciphertext, config.credentialKey);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return parsed as StoredTokens;
}

async function sendStep(
  config: WorkerConfig,
  admin: SupabaseClient,
  mailbox: ReturnType<typeof createMailbox>,
  account: { id?: string; provider?: string; email_address?: string | null; sending_identity?: string | null } | null,
  step: { subject?: string; body?: string } | null,
  prospect: { email?: string | null } | null,
  job: JobRow,
): Promise<MailAccepted> {
  if (!account?.id || !account.provider || !step || !prospect?.email) {
    throw new Error("The campaign step is missing a sender, message, or recipient.");
  }
  const from = account.sending_identity || account.email_address;
  if (!from) {
    throw new Error("The sending account has no identity.");
  }
  const message = { from, to: prospect.email, subject: step.subject ?? "", body: step.body ?? "" };
  if (account.provider === "resend") {
    if (!config.resendApiKey) {
      throw new Error("Resend is not configured.");
    }
    return mailbox.sendResend(config.resendApiKey, message);
  }
  const tokens = await accountTokens(admin, config, account.id);
  if (!tokens?.accessToken) {
    throw new Error("The sending account has no stored credentials.");
  }
  if (account.provider === "gmail") {
    return mailbox.sendGmail(tokens.accessToken, buildRfc822Safe(message, job.id));
  }
  return mailbox.sendMicrosoft(tokens.accessToken, message);
}

function buildRfc822Safe(input: { from: string; to: string; subject: string; body: string }, jobId: string): string {
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`,
    `Message-ID: <${jobId}@prospectra.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ].join("\r\n");
}

async function reconcileStep(
  config: WorkerConfig,
  admin: SupabaseClient,
  mailbox: ReturnType<typeof createMailbox>,
  account: { id?: string; provider?: string } | null,
  job: JobRow,
): Promise<MailAccepted | null> {
  if (!account?.id || account.provider !== "gmail") {
    return null;
  }
  const tokens = await accountTokens(admin, config, account.id);
  if (!tokens?.accessToken) {
    return null;
  }
  return mailbox.findGmailByMessageId(tokens.accessToken, `${job.id}@prospectra.local`);
}

async function recordAccepted(
  admin: SupabaseClient,
  job: JobRow,
  step: { subject?: string; body?: string; position?: number } | null,
  prospect: { id?: string; email?: string | null } | null,
  account: { id?: string; provider?: string } | null,
  accepted: MailAccepted,
) {
  await admin.from("email_messages").insert({
    workspace_id: job.workspace_id,
    campaign_id: job.campaign_id,
    prospect_id: prospect?.id ?? null,
    direction: "outbound",
    provider: account?.provider ?? null,
    provider_status: "accepted",
    delivery_state: "accepted",
    subject: step?.subject ?? null,
    body: step?.body ?? null,
    recipient: prospect?.email ?? null,
    sending_account_id: account?.id ?? null,
    provider_message_id: accepted.providerMessageId,
    provider_thread_id: accepted.providerThreadId,
    attempted_at: new Date().toISOString(),
    provider_response: accepted.providerResponse,
  });
  if (prospect?.id) {
    await admin.from("prospect_activities").insert({
      workspace_id: job.workspace_id,
      prospect_id: prospect.id,
      activity_type: "email_sent",
      summary: "Email accepted by the sending provider. Delivery is not confirmed.",
      metadata: { providerMessageId: accepted.providerMessageId, jobId: job.id },
    });
  }
  const { data: next } = await admin
    .from("campaign_steps")
    .select("position, delay_days")
    .eq("campaign_id", job.campaign_id)
    .eq("position", job.step_position + 1)
    .maybeSingle();
  if (!next) {
    await admin.from("campaign_enrollments").update({ status: "completed", current_step: job.step_position }).eq("id", job.enrollment_id);
    return;
  }
  const runAt = new Date(Date.now() + Number(next.delay_days ?? 0) * 86_400_000).toISOString();
  await admin.from("outreach_jobs").insert({
    workspace_id: job.workspace_id,
    campaign_id: job.campaign_id,
    enrollment_id: job.enrollment_id,
    step_position: next.position,
    run_at: runAt,
    idempotency_key: `${job.enrollment_id}:${next.position}`,
  });
  await admin.from("campaign_enrollments").update({ current_step: job.step_position }).eq("id", job.enrollment_id);
}

export function createOutreachAdmin(config: WorkerConfig): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return null;
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
