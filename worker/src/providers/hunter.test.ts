import { describe, expect, it, vi } from "vitest";
import { createHunterClient, normalizeHunterVerification } from "./hunter.js";

describe("Hunter email verification", () => {
  it("marks only a deliverable result as verified", () => {
    expect(normalizeHunterVerification({ data: { status: "valid", result: "deliverable", score: 90 } }).verified).toBe(true);
    expect(normalizeHunterVerification({ data: { status: "accept_all", result: "risky", score: 40 } }).verified).toBe(false);
  });

  it("reports quota and invalid payloads", async () => {
    const quota = createHunterClient("key", vi.fn(async () => new Response("quota", { status: 402 })) as typeof fetch);
    await expect(quota.verify("ada@analytical.example")).rejects.toMatchObject({ code: "quota_exceeded" });

    const invalid = createHunterClient("key", vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch);
    await expect(invalid.verify("ada@analytical.example")).rejects.toMatchObject({ code: "invalid_response" });
  });
});
