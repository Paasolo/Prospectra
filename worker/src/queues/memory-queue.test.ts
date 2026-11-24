import { describe, expect, it } from "vitest";
import { createMemoryQueue } from "./memory-queue.js";

describe("durable job queue rules", () => {
  it("does not enqueue or claim the same idempotency key twice", () => {
    const queue = createMemoryQueue(() => 1_000);
    const first = queue.enqueue({ jobType: "email_sending", payload: {}, idempotencyKey: "send-1" });
    const second = queue.enqueue({ jobType: "email_sending", payload: {}, idempotencyKey: "send-1" });
    expect(second).toEqual({ duplicate: true, id: first.id });
    const claimed = queue.claim("worker-a", 5);
    expect(claimed).toHaveLength(1);
    expect(queue.claim("worker-b", 5)).toHaveLength(0);
  });

  it("reclaims an interrupted job, retries temporary failures, and dead-letters the rest", () => {
    let clock = 10_000;
    const queue = createMemoryQueue(() => clock);
    const created = queue.enqueue({ jobType: "website_analysis", payload: {}, maxAttempts: 3 });
    expect(queue.claim("worker-a", 1)).toHaveLength(1);
    clock += 121_000;
    const reclaimed = queue.claim("worker-b", 1);
    expect(reclaimed[0]?.id).toBe(created.id);
    expect(reclaimed[0]?.attempts).toBe(1);
    queue.fail(created.id, "temporary", "provider timeout");
    expect(queue.claim("worker-b", 1)).toHaveLength(0);
    clock += 2_000;
    expect(queue.claim("worker-c", 1)).toHaveLength(1);
    queue.fail(created.id, "validation", "invalid payload");
    expect(queue.get(created.id)?.status).toBe("dead_letter");
  });

  it("stops claiming after shutdown and keeps a fresh heartbeat locked", () => {
    let clock = 50_000;
    const queue = createMemoryQueue(() => clock);
    const running = queue.enqueue({ jobType: "analytics_aggregation", payload: {} });
    queue.claim("worker-a", 1);
    queue.heartbeat(running.id, clock);
    clock += 1_000;
    expect(queue.claim("worker-b", 1)).toHaveLength(0);
    queue.stop();
    queue.enqueue({ jobType: "notification_dispatch", payload: {} });
    expect(queue.claim("worker-c", 5)).toHaveLength(0);
  });
});
