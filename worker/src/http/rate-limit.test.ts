import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@prospectra/shared";
import { rateLimitKeys } from "./rate-limit.js";

describe("worker rate limit keys", () => {
  it("shares one address bucket across different bearer tokens", () => {
    const first = rateLimitKeys("203.0.113.8", "Bearer a.b.cccc");
    const second = rateLimitKeys("203.0.113.8", "Bearer d.e.ffff");
    expect(first[0]).toBe(second[0]);
    expect(first[1]).not.toBe(second[1]);

    const limiter = createRateLimiter(2, 60_000, () => 1_000);
    expect(limiter.check(first[0]).ok).toBe(true);
    expect(limiter.check(first[0]).ok).toBe(true);
    expect(limiter.check(second[0]).ok).toBe(false);
  });

  it("does not give a random authorization header its own bucket", () => {
    expect(rateLimitKeys("203.0.113.8", "Bearer not-a-jwt")).toEqual(["ip:203.0.113.8"]);
    expect(rateLimitKeys(undefined, undefined)).toEqual(["ip:unknown"]);
  });
});