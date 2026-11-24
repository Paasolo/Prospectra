import type { SupabaseClient } from "@supabase/supabase-js";
import { jobBackoffMs, nextJobDecision } from "@prospectra/shared";
import { JobFailure, normalizeJobError } from "../processors/register.js";
import type { JobRunner } from "./job-runner.js";

let inflight = 0;

export function backgroundInflight(): number {
  return inflight;
}

export async function processBackgroundQueue(admin: SupabaseClient, runner: JobRunner): Promise<{ processed: number }> {
  if (runner.isStopped()) return { processed: 0 };
  const hour = new Date().toISOString().slice(0, 13);
  await admin.rpc("enqueue_background_job", {
    p_workspace_id: null,
    p_job_type: "billing_reconciliation",
    p_payload: {},
    p_idempotency_key: `billing:${hour}`,
    p_run_at: new Date().toISOString(),
    p_max_attempts: 5,
  });
  const limit = Math.min(25, Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2)));
  const { data, error } = await admin.rpc("claim_background_jobs", { p_worker: `worker-${process.pid}`, p_limit: limit });
  if (error) throw new Error(error.message);
  let processed = 0;
  for (const job of data ?? []) {
    if (runner.isStopped()) break;
    inflight += 1;
    try {
      await runClaimed(admin, runner, job);
      processed += 1;
    } finally {
      inflight -= 1;
    }
  }
  const { count } = await admin.from("background_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "running"]);
  await admin.from("worker_heartbeats").upsert({
    worker_id: `worker-${process.pid}`,
    seen_at: new Date().toISOString(),
    queue_depth: count ?? 0,
    last_error: null,
  });
  return { processed };
}

async function runClaimed(admin: SupabaseClient, runner: JobRunner, job: { id: string; job_type: string; payload: unknown; attempts: number; max_attempts: number }): Promise<void> {
  const handler = runner.getHandler(job.job_type);
  const timeoutMs = Math.max(1000, Number(process.env.WORKER_JOB_TIMEOUT_MS ?? 120_000));
  const heartbeat = setInterval(() => {
    void admin.from("background_jobs").update({ heartbeat_at: new Date().toISOString() }).eq("id", job.id);
  }, 15_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!handler) throw new JobFailure("permanent", `No processor is registered for ${job.job_type}.`);
    const payload = job.payload && typeof job.payload === "object" ? { ...job.payload, backgroundJobId: job.id } : job.payload;
    await Promise.race([
      handler(payload),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new JobFailure("temporary", "The job timed out.")), timeoutMs);
      }),
    ]);
    await admin.from("background_jobs").update({ status: "succeeded", last_error: null, error_category: null, locked_by: null }).eq("id", job.id);
  } catch (error) {
    const failure = normalizeJobError(error);
    const attempts = job.attempts + 1;
    const decision = nextJobDecision({ attempts, maxAttempts: job.max_attempts, category: failure.category });
    await admin.from("background_jobs").update({
      status: decision.status,
      attempts,
      run_at: new Date(Date.now() + jobBackoffMs(attempts)).toISOString(),
      last_error: failure.message,
      error_category: failure.category,
      locked_by: null,
      locked_at: null,
    }).eq("id", job.id);
    const reservationId = job.payload && typeof job.payload === "object" && "reservationId" in job.payload ? String(job.payload.reservationId ?? "") : "";
    if (decision.status === "dead_letter" && reservationId) {
      await admin.rpc("release_workspace_credits", { p_reservation_id: reservationId, p_actor: null });
    }
  } finally {
    if (timer) clearTimeout(timer);
    clearInterval(heartbeat);
  }
}
