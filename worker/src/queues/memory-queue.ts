import { jobBackoffMs, nextJobDecision, type JobErrorCategory } from "@prospectra/shared";

export type MemoryJob = {
  id: string;
  jobType: string;
  status: "pending" | "running" | "succeeded" | "dead_letter";
  payload: unknown;
  idempotencyKey: string | null;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  lockedBy: string | null;
  heartbeatAt: number | null;
  lastError: string | null;
  errorCategory: JobErrorCategory | null;
};

export function createMemoryQueue(now: () => number = Date.now) {
  const jobs: MemoryJob[] = [];
  let stopped = false;
  let sequence = 0;

  return {
    stop() {
      stopped = true;
    },
    enqueue(input: { jobType: string; payload: unknown; idempotencyKey?: string; maxAttempts?: number; runAt?: number }) {
      if (input.idempotencyKey) {
        const existing = jobs.find((job) => job.idempotencyKey === input.idempotencyKey);
        if (existing) return { duplicate: true, id: existing.id };
      }
      sequence += 1;
      const job: MemoryJob = {
        id: `job-${sequence}`,
        jobType: input.jobType,
        status: "pending",
        payload: input.payload,
        idempotencyKey: input.idempotencyKey ?? null,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        runAt: input.runAt ?? now(),
        lockedBy: null,
        heartbeatAt: null,
        lastError: null,
        errorCategory: null,
      };
      jobs.push(job);
      return { duplicate: false, id: job.id };
    },
    claim(worker: string, limit: number) {
      if (stopped) return [];
      const due = jobs.filter((job) => {
        const stale = job.status === "running" && (job.heartbeatAt ?? 0) < now() - 120_000 && job.attempts < job.maxAttempts;
        const ready = job.status === "pending" && job.runAt <= now() && job.attempts < job.maxAttempts;
        return stale || ready;
      });
      return due.slice(0, limit).map((job) => {
        if (job.status === "running") job.attempts += 1;
        job.status = "running";
        job.lockedBy = worker;
        job.heartbeatAt = now();
        return { ...job };
      });
    },
    heartbeat(id: string, at = now()) {
      const job = jobs.find((item) => item.id === id);
      if (job && job.status === "running") job.heartbeatAt = at;
    },
    succeed(id: string) {
      const job = jobs.find((item) => item.id === id);
      if (!job) return;
      job.status = "succeeded";
      job.lockedBy = null;
    },
    fail(id: string, category: JobErrorCategory, message: string) {
      const job = jobs.find((item) => item.id === id);
      if (!job) return;
      job.attempts += 1;
      job.lastError = message;
      job.errorCategory = category;
      const decision = nextJobDecision({ attempts: job.attempts, maxAttempts: job.maxAttempts, category });
      if (decision.retry) {
        job.status = "pending";
        job.runAt = now() + jobBackoffMs(job.attempts);
        job.lockedBy = null;
        return;
      }
      job.status = "dead_letter";
      job.lockedBy = null;
    },
    get(id: string) {
      const job = jobs.find((item) => item.id === id);
      return job ? { ...job } : undefined;
    },
  };
}
