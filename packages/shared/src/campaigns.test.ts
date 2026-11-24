import { describe, expect, it } from "vitest";
import { activationBlockers, decideOutreach, isInsideSendingWindow, retryDelayMs } from "./campaigns.js";

const base = {
  campaignStatus: "ACTIVE",
  enrollmentStatus: "active",
  suppressed: false,
  ambiguousAttempt: false,
  insideWindow: true,
  sentToday: 0,
  dailyLimit: 20,
  attempts: 0,
  maxAttempts: 3,
};

describe("campaign sending", () => {
  it("reconciles an ambiguous send instead of sending again", () => {
    expect(decideOutreach({ ...base, ambiguousAttempt: true }).action).toBe("reconcile");
    expect(decideOutreach({ ...base, sentToday: 20 }).action).toBe("defer");
    expect(decideOutreach({ ...base, suppressed: true }).action).toBe("stop");
    expect(retryDelayMs(3)).toBe(240_000);
  });

  it("enforces the sending window and activation checks", () => {
    expect(
      isInsideSendingWindow({
        now: new Date("2026-01-05T15:00:00.000Z"),
        timeZone: "UTC",
        startMinutes: 9 * 60,
        endMinutes: 17 * 60,
        days: [1, 2, 3, 4, 5],
      }),
    ).toBe(true);
    expect(
      isInsideSendingWindow({
        now: new Date("2026-01-04T15:00:00.000Z"),
        timeZone: "UTC",
        startMinutes: 9 * 60,
        endMinutes: 17 * 60,
        days: [1, 2, 3, 4, 5],
      }),
    ).toBe(false);
    const blockers = activationBlockers({
      name: "Intro",
      objective: "Book a call",
      steps: [{ subject: "Hi {{first_name}}", body: "Hello from {{secret}}" }],
      accountConnected: true,
      audienceCount: 1,
      dailyLimit: 20,
      timeZone: "UTC",
    });
    expect(blockers.join(" ")).toMatch(/secret/);
    expect(blockers.join(" ")).toMatch(/unsubscribe/i);
  });
});
